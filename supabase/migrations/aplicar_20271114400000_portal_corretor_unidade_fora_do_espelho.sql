-- Portal do Corretor: unidade que saiu do Espelho de Vendas não é oferta.
-- Plano: docs/planos/2026-11-14-venda-de-ativos-unidades-analise-contrato-tabela.md (item 4).
--
-- Medido em 14/11/2026 (produção): no Garden Cambuhy, 24 imóveis filhos do
-- edifício do empreendimento não são apontados por nenhuma unidade do espelho
-- (12 desvinculados com "Desvincular", 12 de unidades apagadas do espelho). 20
-- deles estavam na tabela de preços ATIVA com visible_to_broker = true, e o
-- corretor os via como disponíveis pelo link.
--
-- A regra é derivada (nenhum flag a manter): filha de um edifício que é o
-- commercial_building_id de algum empreendimento só conta se alguma unidade do
-- espelho aponta para ela (commercial_property_id ou rental_property_id).
-- Espelho em TS: lib/espelhoDeVendas.ts. Se mudar lá, mude aqui.
--
-- As duas RPCs abaixo partem da definição VIGENTE no banco em 14/11/2026
-- (pg_get_functiondef), não de arquivo antigo; a única mudança é o corte novo.
--
-- REGRA #7 — Pergunta 1: nenhuma policy nova.
-- Pergunta 2: a função auxiliar é SECURITY INVOKER e não fica executável por
-- ninguém de fora (REVOKE de PUBLIC, anon, authenticated): só as RPCs, que são
-- SECURITY DEFINER e rodam como o dono, a chamam. As duas RPCs mantêm o GRANT
-- de antes (anon, authenticated), repetido aqui com o REVOKE de PUBLIC.

CREATE OR REPLACE FUNCTION public.fn_unidade_fora_do_espelho_de_vendas(p_property_id uuid, p_parent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT p_parent_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.empreendimentos e WHERE e.commercial_building_id = p_parent_id)
       AND NOT EXISTS (
           SELECT 1 FROM public.empreendimento_units u
           WHERE u.commercial_property_id = p_property_id OR u.rental_property_id = p_property_id
       );
$$;

REVOKE ALL ON FUNCTION public.fn_unidade_fora_do_espelho_de_vendas(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_units(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
               -- 14/11/2026: unidade que saiu do Espelho de Vendas não é oferta.
               AND NOT public.fn_unidade_fora_do_espelho_de_vendas(p.id, p.parent_id)
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_price_table(p_token text, p_building_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok   public.broker_portal_tokens;
    v_bp    public.broker_profiles;
    v_bldg  public.commercial_properties;
    v_table public.commercial_price_tables;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    -- Cerca de autorização: prédio da org do token, OU prédio com acesso
    -- habilitado ao corretor (por e-mail) numa org diferente — mesma regra de
    -- fn_broker_portal_get_units.
    SELECT * INTO v_bldg
    FROM public.commercial_properties p
    WHERE p.id = p_building_id
      AND (
        p.organization_id = v_tok.org_id
        OR EXISTS (
            SELECT 1
            FROM public.broker_property_access a
            JOIN public.broker_profiles bp2 ON bp2.id = a.broker_id
            WHERE lower(bp2.email) = lower(v_bp.email)
              AND a.enabled = TRUE
              AND a.property_id = p.id
        )
      );
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_table
    FROM public.commercial_price_tables
    WHERE building_id = p_building_id
      AND organization_id = v_bldg.organization_id
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
                -- Foto de capa da unidade (bucket público) — espelha o photo_url
                -- de commercialPriceTableService.getTableItems.
                'photo_url', p.images[1],
                'visible_to_broker', p.visible_to_broker,
                'show_price_to_broker', p.show_price_to_broker
             ))
             FROM public.commercial_price_table_items it
             JOIN public.commercial_properties p ON p.id = it.property_id
             WHERE it.price_table_id = v_table.id
               AND p.organization_id = v_bldg.organization_id
               AND p.visible_to_broker = TRUE
               -- 14/11/2026: unidade ocultada no Espelho de Vendas, ou que saiu
               -- dele, não é oferta — mesmo corte de commercialPriceTableService.getTableItems.
               AND p.visible_in_sales IS NOT FALSE
               AND NOT public.fn_unidade_fora_do_espelho_de_vendas(p.id, p.parent_id)),
            '[]'::jsonb
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_units(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_units(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_price_table(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_price_table(text, uuid) TO anon, authenticated;
