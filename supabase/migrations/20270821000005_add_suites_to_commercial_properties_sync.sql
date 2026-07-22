-- ==========================================================================
-- Adiciona 'suites' à propagação física empreendimento_units → commercial_properties
-- Date: 2026-07-21
-- ==========================================================================
-- CONTEXTO
-- fn_propagate_unit_to_commercial (20270815000007) documentava suites como campo
-- "sem destino no comercial" — decisão da fase anterior. Agora a aba "Dados da
-- Unidade" (Venda de Ativos) passou a exibir Suítes, então o campo passa a ter
-- destino: specs.suites, no mesmo padrão de bedrooms/bathrooms/parkingSpaces.
--
-- Só a FUNÇÃO muda (CREATE OR REPLACE) — o trigger em si continua o mesmo,
-- então isto NÃO precisa da dança de lock_timeout / duas etapas do arquivo
-- original: CREATE OR REPLACE FUNCTION não pede AccessExclusiveLock na tabela
-- quente, só substitui o corpo que o trigger já aponta para.
--
-- Aplicar MANUALMENTE (mesma regra do arquivo original). NUNCA `supabase db push`.
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
        'suites',        NEW.suites,
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
        NEW.suites          IS DISTINCT FROM OLD.suites          OR
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
