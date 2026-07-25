-- PARTE 1 de 2 — RPC de venda (ver 20270826000005_broker_portal_floor_terreo.sql)
SET lock_timeout = '3s';

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
                'floor', COALESCE(p.floor, NULLIF((p.specs->>'floor')::int, 0)),
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
