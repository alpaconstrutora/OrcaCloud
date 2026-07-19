-- ==========================================================================
-- Trigger INVERSO: commercial_properties.status → empreendimento_units (estado)
-- Date: 2026-07-19
-- ==========================================================================
-- CONTEXTO
-- O sentido de IDA (empreendimento → comercial) ja' e' automatico pelo trigger
-- trg_propagate_unit_to_commercial (migration 20270815000007), que propaga o
-- FISICO. Faltava o sentido de VOLTA: quando o ESTADO muda no modulo comercial
-- (registrar negociacao -> SOLD/RESERVED; contrato de locacao -> RENTED; etc.),
-- o empreendimento so' refletia via botao manual "Sync do Comercial"/"Sync de
-- Locacoes". Este trigger torna isso automatico, simetrico ao de ida.
--
-- DIVISAO DE DONO (a mesma do resto do modulo):
--   • FISICO  → dono e' o empreendimento (trigger de ida empurra p/ o comercial).
--   • ESTADO  → dono e' o modulo comercial (venda vem das negociacoes; ocupacao
--     vem dos contratos). Este trigger traz o estado de volta.
--
-- Os dois triggers NAO brigam: o de ida mexe so' no fisico, o de volta so' no
-- status. Campos disjuntos → sem loop:
--   • volta atualiza empreendimento_units.status → dispara o trigger de ida, que
--     checa se algum campo FISICO mudou; status nao e' fisico → retorna cedo.
--   • ida atualiza commercial_properties (fisico, nunca status) → dispara este
--     trigger, que so' age se o STATUS mudou → retorna cedo.
--
-- Mapeamento EN→PT (espelha mapCommercialToEmpr / mapRentalToEmpr do TS):
--   VENDA:   AVAILABLE→DISPONIVEL RESERVED→RESERVADO SOLD→VENDIDO EXCHANGED→PERMUTADO
--            (RENTED/MAINTENANCE → sem equivalente, NAO sobrescreve)
--   LOCACAO: AVAILABLE→DISPONIVEL RESERVED→RESERVADO RENTED→LOCADO MAINTENANCE→MANUTENCAO
--            (SOLD/EXCHANGED → sem equivalente, NAO sobrescreve)
--
-- SECURITY DEFINER: a escrita no empreendimento nao depende do RLS de quem mexeu
-- no comercial. Aplicar MANUALMENTE. NUNCA `supabase db push`.
-- ==========================================================================
-- ⚠️ COMO APLICAR — commercial_properties e' QUENTE. Rodar tudo junto DEADLOCKA.
-- Rode as DUAS ETAPAS separadamente:
--   ETAPA 1 (CREATE FUNCTION) — nao trava a tabela.
--   ETAPA 2 (DROP+CREATE TRIGGER) — trava por um instante; lock_timeout faz
--     falhar rapido (55P03) em vez de deadlockar. Se der timeout, REPITA a ETAPA 2.
-- ==========================================================================


-- ==========================================================================
-- ETAPA 1 — Função (sem lock na tabela quente)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_propagate_commercial_status_to_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale   TEXT := CASE NEW.status
        WHEN 'AVAILABLE' THEN 'DISPONIVEL' WHEN 'RESERVED' THEN 'RESERVADO'
        WHEN 'SOLD' THEN 'VENDIDO' WHEN 'EXCHANGED' THEN 'PERMUTADO' ELSE NULL END;
    v_rental TEXT := CASE NEW.status
        WHEN 'AVAILABLE' THEN 'DISPONIVEL' WHEN 'RESERVED' THEN 'RESERVADO'
        WHEN 'RENTED' THEN 'LOCADO' WHEN 'MAINTENANCE' THEN 'MANUTENCAO' ELSE NULL END;
BEGIN
    -- Só age quando o STATUS mudou (evita agir no update de físico vindo do
    -- trigger de ida, que nunca toca status).
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    -- Canal de VENDA: a unidade cujo commercial_property_id aponta para esta property.
    IF v_sale IS NOT NULL THEN
        UPDATE public.empreendimento_units
           SET status = v_sale
         WHERE commercial_property_id = NEW.id
           AND status IS DISTINCT FROM v_sale;
    END IF;

    -- Canal de LOCAÇÃO: a unidade cujo rental_property_id aponta para esta property.
    IF v_rental IS NOT NULL THEN
        UPDATE public.empreendimento_units
           SET rental_status = v_rental
         WHERE rental_property_id = NEW.id
           AND rental_status IS DISTINCT FROM v_rental;
    END IF;

    RETURN NEW;
END;
$$;


-- ==========================================================================
-- ETAPA 2 — Trigger (trava commercial_properties por um instante).
--   Rodar SEPARADO. Se der 55P03 (lock_timeout), repetir só esta.
-- ==========================================================================
SET lock_timeout = '3s';

DROP TRIGGER IF EXISTS trg_propagate_commercial_status_to_unit ON public.commercial_properties;
CREATE TRIGGER trg_propagate_commercial_status_to_unit
    AFTER UPDATE ON public.commercial_properties
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_propagate_commercial_status_to_unit();
