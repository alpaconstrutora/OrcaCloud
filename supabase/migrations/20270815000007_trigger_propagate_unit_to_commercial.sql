-- ==========================================================================
-- Trigger: empreendimento_units → commercial_properties (físico, 2 canais)
-- Date: 2026-07-19
-- ==========================================================================
-- CONTEXTO
-- A propagação do físico da unidade para as cópias comerciais (Venda de Ativos e
-- Locações) vivia só em empreendimentoService.updateUnit (TS). Isso cobre o editor
-- de unidades, mas FURA em qualquer caminho que grave em empreendimento_units sem
-- passar por lá:
--   • services/sync/applier.ts — sync Imovib/Planta IA + aceite de proposta curada
--   • qualquer SQL/serviço futuro
-- Além disso o push TS é best-effort (.catch silencioso): falha transitória deixa
-- divergência sem aviso.
--
-- Este trigger é a fonte ÚNICA e à prova de bypass: dispara em QUALQUER UPDATE de
-- empreendimento_units, não importa quem gravou.
--
-- REGRAS (alinhadas à decisão de produto):
--   • FÍSICO (nome, áreas, tipologia, andar, posição/vista/orientação, specs:
--     dormitórios/banheiros/vagas/tipo de pav.) → empreendimento é a verdade
--     única: sempre sobrescreve a cópia.
--   • PREÇO → só empurra quando o próprio preço mudou (Vendas usa price/VGV;
--     Locações usa rental_price/aluguel-alvo). Evita atropelar um preço que o
--     módulo comercial tenha ajustado sozinho.
--   • ESTADO (status de venda / ocupação de locação) → NUNCA propaga. Independência
--     do módulo (venda vem das negociações; ocupação vem do "Sync de Locações").
--   • suites/is_vendavel/fração ideal/área real → não têm destino no comercial.
--
-- SECURITY DEFINER (dono = postgres): a escrita na cópia NÃO depende do RLS de
-- quem editou — fecha o buraco da "falha silenciosa de RLS". Sem risco de loop:
-- escreve em commercial_properties, que não tem trigger de volta para units.
--
-- Aplicar MANUALMENTE. NUNCA `supabase db push`.
-- ==========================================================================
-- ⚠️ COMO APLICAR — empreendimento_units é tabela QUENTE (PostgREST lê o tempo
-- todo). Rodar o arquivo inteiro de uma vez DEADLOCKA (40P01): o CREATE TRIGGER
-- pede AccessExclusiveLock enquanto o PostgREST segura AccessShareLock.
--
-- Rode as DUAS ETAPAS separadamente, cada uma na sua execução:
--   ETAPA 1 (CREATE FUNCTION) — não trava a tabela, roda limpo.
--   ETAPA 2 (DROP+CREATE TRIGGER) — trava a tabela por um instante. O
--     lock_timeout faz falhar rápido (55P03) em vez de deadlockar; se der
--     timeout, apenas REPITA a ETAPA 2 até pegar uma janela livre. Idempotente.
-- ==========================================================================


-- ==========================================================================
-- ETAPA 1 — Função (sem lock na tabela quente)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_propagate_unit_to_commercial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pos  TEXT := CASE NEW.position_type
        WHEN 'FRENTE' THEN 'FRONT' WHEN 'LATERAL' THEN 'LATERAL' WHEN 'FUNDOS' THEN 'BACK' ELSE NULL END;
    v_view TEXT := CASE NEW.view_type
        WHEN 'SEM_VISTA' THEN 'NONE' WHEN 'PARCIAL' THEN 'PARTIAL' WHEN 'PLENA' THEN 'FULL' ELSE NULL END;
    v_sun  TEXT := CASE NEW.sun_orientation
        WHEN 'NORTE' THEN 'NORTH' WHEN 'SUL' THEN 'SOUTH' WHEN 'LESTE' THEN 'EAST' WHEN 'OESTE' THEN 'WEST' ELSE NULL END;
    -- specs físicos da unidade (merge, não substitui o objeto inteiro)
    v_specs JSONB := jsonb_build_object(
        'bedrooms',      NEW.bedrooms,
        'bathrooms',     NEW.bathrooms,
        'parkingSpaces', NEW.parking_spaces,
        'floorTipo',     NEW.floor_tipo
    );
BEGIN
    -- Só age se ALGUM campo físico (ou o preço do canal) mudou. Evita reescrever a
    -- cópia num UPDATE que só mexeu em status/ocupação/vínculo.
    IF NOT (
        NEW.name            IS DISTINCT FROM OLD.name            OR
        NEW.price           IS DISTINCT FROM OLD.price           OR
        NEW.rental_price    IS DISTINCT FROM OLD.rental_price    OR
        NEW.private_area    IS DISTINCT FROM OLD.private_area    OR
        NEW.common_area     IS DISTINCT FROM OLD.common_area     OR
        NEW.total_area      IS DISTINCT FROM OLD.total_area      OR
        NEW.typology        IS DISTINCT FROM OLD.typology        OR
        NEW.floor           IS DISTINCT FROM OLD.floor           OR
        NEW.position_type   IS DISTINCT FROM OLD.position_type   OR
        NEW.view_type       IS DISTINCT FROM OLD.view_type       OR
        NEW.sun_orientation IS DISTINCT FROM OLD.sun_orientation OR
        NEW.bedrooms        IS DISTINCT FROM OLD.bedrooms        OR
        NEW.bathrooms       IS DISTINCT FROM OLD.bathrooms       OR
        NEW.parking_spaces  IS DISTINCT FROM OLD.parking_spaces  OR
        NEW.floor_tipo      IS DISTINCT FROM OLD.floor_tipo
    ) THEN
        RETURN NEW;
    END IF;

    -- Canal de VENDA (preço = price/VGV, só quando o price mudou)
    IF NEW.commercial_property_id IS NOT NULL THEN
        UPDATE public.commercial_properties SET
            name            = NEW.name,
            private_area    = NEW.private_area,
            common_area     = NEW.common_area,
            total_area      = NEW.total_area,
            typology        = NEW.typology,
            floor           = NEW.floor,
            position_type   = v_pos,
            view_type       = v_view,
            sun_orientation = v_sun,
            specs           = COALESCE(specs, '{}'::jsonb) || v_specs,
            price           = CASE WHEN NEW.price IS DISTINCT FROM OLD.price
                                   THEN COALESCE(NEW.price, 0) ELSE price END
        WHERE id = NEW.commercial_property_id;
    END IF;

    -- Canal de LOCAÇÃO (preço = rental_price/aluguel-alvo, só quando mudou)
    IF NEW.rental_property_id IS NOT NULL THEN
        UPDATE public.commercial_properties SET
            name            = NEW.name,
            private_area    = NEW.private_area,
            common_area     = NEW.common_area,
            total_area      = NEW.total_area,
            typology        = NEW.typology,
            floor           = NEW.floor,
            position_type   = v_pos,
            view_type       = v_view,
            sun_orientation = v_sun,
            specs           = COALESCE(specs, '{}'::jsonb) || v_specs,
            price           = CASE WHEN NEW.rental_price IS DISTINCT FROM OLD.rental_price
                                   THEN COALESCE(NEW.rental_price, 0) ELSE price END
        WHERE id = NEW.rental_property_id;
    END IF;

    RETURN NEW;
END;
$$;


-- ==========================================================================
-- ETAPA 2 — Trigger (trava empreendimento_units por um instante).
--   Rodar SEPARADO da ETAPA 1. Se der 55P03 (lock_timeout), repetir só esta.
-- ==========================================================================
SET lock_timeout = '3s';

DROP TRIGGER IF EXISTS trg_propagate_unit_to_commercial ON public.empreendimento_units;
CREATE TRIGGER trg_propagate_unit_to_commercial
    AFTER UPDATE ON public.empreendimento_units
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_propagate_unit_to_commercial();
