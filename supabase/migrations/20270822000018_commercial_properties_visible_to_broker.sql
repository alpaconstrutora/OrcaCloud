-- ==========================================================================
-- Coluna visible_to_broker em commercial_properties + corte nas RPCs do
-- Portal do Corretor (Estoque e Empreendimentos/tabela de preços).
-- Date: 2026-07-22
-- ==========================================================================
-- CONTEXTO
-- Tela de Tabela de Preços (PriceTableManager.tsx) ganha um switch por
-- unidade, "Visível para Corretor". O flag vive na PRÓPRIA unidade
-- (commercial_properties), não numa versão específica da tabela de preços
-- (commercial_price_table_items), porque precisa cortar as DUAS telas do
-- portal: Estoque (fn_broker_portal_get_units, lista plana) e Empreendimentos
-- (fn_broker_portal_get_price_table, drill-down por prédio) — se o flag
-- vivesse por item de versão, uma unidade escondida na tabela de preços
-- continuaria aparecendo normalmente no Estoque.
--
-- DEFAULT TRUE: unidades existentes continuam visíveis (comportamento atual),
-- só passam a ficar ocultas quando alguém desliga o switch explicitamente.
--
-- ADD COLUMN ... DEFAULT TRUE NOT NULL é metadata-only em PG moderno (>=11)
-- para default constante — sem necessidade de lock_timeout especial aqui
-- (diferente de DDL com FK/view em tabela quente, que já tem histórico de
-- deadlock neste projeto).
--
-- Só CREATE OR REPLACE + ADD COLUMN IF NOT EXISTS — idempotente, pode ser
-- aplicada inteira de uma vez no SQL Editor. NUNCA `supabase db push`.
-- ==========================================================================

ALTER TABLE public.commercial_properties
    ADD COLUMN IF NOT EXISTS visible_to_broker BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.commercial_properties.visible_to_broker IS
    'Controla se a unidade aparece no Portal do Corretor (Estoque e Empreendimentos/tabela de preços). Editado via switch em PriceTableManager.tsx.';

-- --------------------------------------------------------------------------
-- fn_broker_portal_get_units — mesmo corpo de 20270822000014, + filtro
-- visible_to_broker aplicado a toda unidade retornada (avulsa ou via
-- broker_property_access).
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
            (SELECT jsonb_agg(row_to_json(p))
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
-- fn_broker_portal_get_price_table — mesmo corpo de 20270819000007, + filtro
-- visible_to_broker no join que monta os itens da tabela de preços ativa.
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
                'price', it.price,
                'property_name', p.name,
                'current_price', p.price,
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
                'visible_to_broker', p.visible_to_broker
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
