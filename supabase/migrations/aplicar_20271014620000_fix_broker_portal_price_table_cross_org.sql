-- Portal do Corretor (link público) > Empreendimentos: tabela de preços
-- "sumia" (mensagem "ainda não tem uma tabela de preços ativa") para um
-- empreendimento numa SPE diferente da org do token do corretor, mesmo com
-- uma versão ativa de verdade cadastrada.
--
-- Causa: fn_broker_portal_get_price_table e fn_broker_portal_get_rental_price_table
-- exigiam commercial_properties.organization_id = v_tok.org_id (a org de ONDE O
-- TOKEN FOI EMITIDO). fn_broker_portal_get_units, a RPC irmã que lista as
-- unidades do mesmo portal, já resolve esse caso corretamente desde a criação
-- (comentário em components/BrokerPortal.tsx: "o empreendimento habilitado pode
-- estar numa SPE diferente da org onde o corretor foi cadastrado") — autoriza
-- via broker_property_access casado por E-MAIL entre QUALQUER perfil do
-- corretor, não por organização. As duas RPCs de tabela de preços nunca
-- replicaram essa regra: a unidade aparecia na lista do empreendimento
-- (RPC correta), mas abrir o empreendimento pedia a tabela de preços pela
-- RPC com a cerca de organização errada — sempre "não encontrada".
--
-- Correção: mesma autorização de fn_broker_portal_get_units (org do token OU
-- broker_property_access habilitado para o prédio, por e-mail), e a tabela/
-- itens passam a ser buscados pela organização REAL do prédio encontrado
-- (v_bldg.organization_id), não mais pela organização do token.
--
-- REGRA #7 — Pergunta 2 (quem mais pode executar): sem mudança de GRANT, só
-- do corpo das funções; ACL atual já é anon+authenticated (sem PUBLIC) nas duas.

SET lock_timeout = '3s';

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
               AND p.visible_to_broker = TRUE),
            '[]'::jsonb
        )
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_broker_portal_get_price_table(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_price_table(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_rental_price_table(p_token text, p_building_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok   public.broker_portal_tokens;
    v_bp    public.broker_profiles;
    v_bldg  public.commercial_properties;
    v_table public.rental_price_tables;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

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
    FROM public.rental_price_tables
    WHERE building_id = p_building_id
      AND organization_id = v_bldg.organization_id
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
                'floor', COALESCE(p.floor, NULLIF((p.specs->>'floor')::int, 0)),
                'position_type', p.position_type,
                'photo_url', p.images[1],
                'visible_to_broker', p.visible_to_broker,
                'show_price_to_broker', p.show_price_to_broker
             ))
             FROM public.rental_price_table_items it
             JOIN public.commercial_properties p ON p.id = it.property_id
             WHERE it.price_table_id = v_table.id
               AND p.organization_id = v_bldg.organization_id
               AND p.visible_to_broker = TRUE),
            '[]'::jsonb
        )
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_broker_portal_get_rental_price_table(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_rental_price_table(TEXT, UUID) TO anon, authenticated;
