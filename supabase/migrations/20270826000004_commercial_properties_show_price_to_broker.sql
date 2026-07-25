-- ==========================================================================
-- Coluna show_price_to_broker em commercial_properties + corte de PREÇO nas
-- RPCs do Portal do Corretor (Estoque, tabela de preços de Venda e Locação).
-- Date: 2026-07-25
-- ==========================================================================
-- CONTEXTO
-- A Tabela de Preços (PriceTableManager.tsx) já tem o switch "Visível p/
-- Corretor" (visible_to_broker, migration 20270822000018), que esconde a
-- UNIDADE inteira do portal. Agora ganha um segundo switch, "Exibir Preço":
-- a unidade continua aparecendo para o corretor, mas SEM o valor.
--
-- Os dois flags são independentes e vivem na PRÓPRIA unidade
-- (commercial_properties), não na versão da tabela de preços — mesma razão da
-- 20270822000018: o corte precisa valer nas duas telas do portal (Estoque e
-- Empreendimentos/tabela de preços), e uma unidade escondida numa versão
-- continuaria com preço à mostra no Estoque.
--
-- DEFAULT TRUE: unidades existentes continuam exibindo preço (comportamento
-- atual); só ficam sem valor quando alguém desliga o switch explicitamente.
--
-- O corte é no SERVIDOR (preço volta NULL), não só na UI — o portal do
-- corretor é link público e o payload da RPC é inspecionável.
--
-- Só CREATE OR REPLACE + ADD COLUMN IF NOT EXISTS — idempotente, pode ser
-- aplicada inteira de uma vez no SQL Editor. NUNCA `supabase db push`.
-- ==========================================================================

ALTER TABLE public.commercial_properties
    ADD COLUMN IF NOT EXISTS show_price_to_broker BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.commercial_properties.show_price_to_broker IS
    'Controla se o PREÇO da unidade aparece no Portal do Corretor (a unidade em si continua listada — quem esconde a unidade é visible_to_broker). Editado via switch "Exibir Preço" em PriceTableManager.tsx.';

-- --------------------------------------------------------------------------
-- fn_broker_portal_get_units — mesmo corpo de 20270822000018, + preço zerado
-- (NULL) quando show_price_to_broker = FALSE. Cobre price (venda) e
-- rental_price (locação), que é o que o Estoque do portal lê.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_units(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.broker_portal_tokens;
    v_bp  public.broker_profiles;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'units', COALESCE(
            (SELECT jsonb_agg(
                CASE WHEN p.show_price_to_broker THEN to_jsonb(p)
                     ELSE to_jsonb(p) || jsonb_build_object('price', NULL, 'rental_price', NULL)
                END)
             FROM public.commercial_properties p
             WHERE p.visible_to_broker = TRUE
               AND (
                 (p.organization_id = v_tok.org_id AND p.parent_id IS NULL AND p.type <> 'BUILDING')
                 OR EXISTS (
                     SELECT 1
                     FROM public.broker_property_access a
                     JOIN public.broker_profiles bp2 ON bp2.id = a.broker_id
                     WHERE lower(bp2.email) = lower(v_bp.email)
                       AND a.enabled = TRUE
                       AND a.property_id = COALESCE(p.parent_id, p.id)
                 )
               )),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_units(TEXT) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- fn_broker_portal_get_price_table (VENDA) — mesmo corpo de 20270822000018,
-- + price/current_price NULL quando show_price_to_broker = FALSE.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_price_table(p_token TEXT, p_building_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok   public.broker_portal_tokens;
    v_bldg  public.commercial_properties;
    v_table public.commercial_price_tables;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    -- Cerca de organização: o prédio pedido precisa pertencer à org do token.
    SELECT * INTO v_bldg
    FROM public.commercial_properties
    WHERE id = p_building_id AND organization_id = v_tok.org_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_table
    FROM public.commercial_price_tables
    WHERE building_id = p_building_id
      AND organization_id = v_tok.org_id
      AND status = 'active'
    LIMIT 1;

    -- Sem tabela ativa: retorno válido com table=null — o front cai no
    -- fallback (unidades filhas com o preço vigente de commercial_properties).
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', TRUE, 'table', NULL, 'items', '[]'::jsonb);
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'table', jsonb_build_object(
            'id', v_table.id,
            'version_label', v_table.version_label,
            'effective_date', v_table.effective_date,
            'status', v_table.status,
            'activated_at', v_table.activated_at
        ),
        'items', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', it.id,
                'price_table_id', it.price_table_id,
                'property_id', it.property_id,
                -- Corte de preço no servidor: NULL quando o switch "Exibir Preço"
                -- está desligado na unidade.
                'price', CASE WHEN p.show_price_to_broker THEN it.price ELSE NULL END,
                'property_name', p.name,
                'current_price', CASE WHEN p.show_price_to_broker THEN p.price ELSE NULL END,
                'property_status', p.status,
                'private_area', p.private_area,
                -- Mesmo fallback de commercialPriceTableService.getTableItems: o publish/push
                -- grava dormitórios/vagas/andar em specs, não na coluna top-level (que fica 0),
                -- então a coluna só vence quando é != 0; senão cai no valor de specs.
                'bedrooms', COALESCE(NULLIF(p.bedrooms, 0), NULLIF((p.specs->>'bedrooms')::int, 0)),
                'bathrooms', COALESCE(NULLIF(p.bathrooms, 0), NULLIF((p.specs->>'bathrooms')::int, 0)),
                'parking_spaces', COALESCE(NULLIF(p.parking_spaces, 0), NULLIF((p.specs->>'parkingSpaces')::int, 0)),
                'floor', COALESCE(NULLIF(p.floor, 0), NULLIF((p.specs->>'floor')::int, 0)),
                'position_type', p.position_type,
                'visible_to_broker', p.visible_to_broker,
                'show_price_to_broker', p.show_price_to_broker
             ))
             FROM public.commercial_price_table_items it
             JOIN public.commercial_properties p ON p.id = it.property_id
             WHERE it.price_table_id = v_table.id
               AND p.organization_id = v_tok.org_id
               AND p.visible_to_broker = TRUE),
            '[]'::jsonb
        )
    );
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_price_table(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_price_table(TEXT, UUID) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- fn_broker_portal_get_rental_price_table (LOCAÇÃO) — mesmo corpo de
-- 20270825000010, + o mesmo corte de preço.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_rental_price_table(p_token TEXT, p_building_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok   public.broker_portal_tokens;
    v_bldg  public.commercial_properties;
    v_table public.rental_price_tables;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bldg
    FROM public.commercial_properties
    WHERE id = p_building_id AND organization_id = v_tok.org_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_table
    FROM public.rental_price_tables
    WHERE building_id = p_building_id
      AND organization_id = v_tok.org_id
      AND status = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', TRUE, 'table', NULL, 'items', '[]'::jsonb);
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'table', jsonb_build_object(
            'id', v_table.id,
            'version_label', v_table.version_label,
            'effective_date', v_table.effective_date,
            'status', v_table.status,
            'activated_at', v_table.activated_at
        ),
        'items', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', it.id,
                'price_table_id', it.price_table_id,
                'property_id', it.property_id,
                'price', CASE WHEN p.show_price_to_broker THEN it.price ELSE NULL END,
                'property_name', p.name,
                'current_price', CASE WHEN p.show_price_to_broker THEN p.rental_price ELSE NULL END,
                'property_status', p.status,
                'private_area', p.private_area,
                'bedrooms', COALESCE(NULLIF(p.bedrooms, 0), NULLIF((p.specs->>'bedrooms')::int, 0)),
                'bathrooms', COALESCE(NULLIF(p.bathrooms, 0), NULLIF((p.specs->>'bathrooms')::int, 0)),
                'parking_spaces', COALESCE(NULLIF(p.parking_spaces, 0), NULLIF((p.specs->>'parkingSpaces')::int, 0)),
                'floor', COALESCE(NULLIF(p.floor, 0), NULLIF((p.specs->>'floor')::int, 0)),
                'position_type', p.position_type,
                'visible_to_broker', p.visible_to_broker,
                'show_price_to_broker', p.show_price_to_broker
             ))
             FROM public.rental_price_table_items it
             JOIN public.commercial_properties p ON p.id = it.property_id
             WHERE it.price_table_id = v_table.id
               AND p.organization_id = v_tok.org_id
               AND p.visible_to_broker = TRUE),
            '[]'::jsonb
        )
    );
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_rental_price_table(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_rental_price_table(TEXT, UUID) TO anon, authenticated;
