-- ════════════════════════════════════════════════════════════════════════════
-- Portal do Corretor — colunas do LOTE (10/11/2026)
--
-- Pedido: "implementar no Portal do Corretor também" — a troca que a Tabela de
-- Preços (#298/#305) e os Espelhos do Empreendimento (#308) já fazem: no
-- empreendimento cujo tipo tem estrutura LOTE, a tabela esconde Dormitórios,
-- Vagas, Banheiros, Pavimento e Posição e mostra Quadra e Nº do lote.
--
-- O link do corretor só lê por RPC (leitura direta de tabela no portal volta []
-- em silêncio). Esta função devolve, para UM prédio do Comercial (venda ou
-- locação), a estrutura do tipo do empreendimento e a quadra/lote de cada imóvel.
-- Só leitura. Plano: docs/planos/2026-11-10-tabela-precos-colunas-do-lote.md.
--
-- Regra #7:
--   P1/P2 — sem policy.
--   P3 — SECURITY DEFINER com a MESMA cerca de fn_broker_portal_get_price_table
--        (token ativo + prédio da org do token OU liberado ao corretor por
--        broker_property_access). REVOKE de PUBLIC e anon, GRANT a anon e
--        authenticated porque o link do portal é anônimo — igual às demais RPCs
--        fn_broker_portal_*. Quadra/lote não são dado sensível, e a cerca é a
--        mesma que já entrega nome, área e preço do mesmo imóvel.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_broker_portal_lote_do_predio(p_token TEXT, p_building_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_tok        public.broker_portal_tokens;
    v_bp         public.broker_profiles;
    v_emp        RECORD;
    v_estrutura  TEXT;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    -- Cerca: a mesma de fn_broker_portal_get_price_table.
    PERFORM 1
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

    -- Prédio → empreendimento (venda ou locação). Prédio cadastrado direto no
    -- Comercial não tem empreendimento: TORRES, a tabela de sempre.
    SELECT e.id, e.organization_id, e.tipo,
           (e.commercial_rental_building_id = p_building_id
             AND e.commercial_building_id IS DISTINCT FROM p_building_id) AS de_locacao
    INTO v_emp
    FROM public.empreendimentos e
    WHERE e.commercial_building_id = p_building_id
       OR e.commercial_rental_building_id = p_building_id
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', TRUE, 'estrutura', 'TORRES', 'quadra_lote', '{}'::jsonb);
    END IF;

    -- Tipo pela org do PRÓPRIO empreendimento, senão o de sistema — a mesma
    -- escolha de estruturaDoTipo()/tiposUnicosPorSlug no front.
    SELECT t.estrutura INTO v_estrutura
    FROM public.empreendimento_types t
    WHERE t.slug = v_emp.tipo
      AND t.active = TRUE
      AND (t.organization_id = v_emp.organization_id OR t.organization_id IS NULL)
    ORDER BY (t.organization_id IS NULL)   -- a da org vem antes da de sistema
    LIMIT 1;
    v_estrutura := COALESCE(v_estrutura, 'TORRES');

    IF v_estrutura <> 'LOTE' THEN
        RETURN jsonb_build_object('valid', TRUE, 'estrutura', v_estrutura, 'quadra_lote', '{}'::jsonb);
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'estrutura', v_estrutura,
        'quadra_lote', COALESCE((
            SELECT jsonb_object_agg(x.property_id, jsonb_build_object('quadra', x.quadra, 'lote', x.lote))
            FROM (
                SELECT CASE WHEN v_emp.de_locacao THEN u.rental_property_id ELSE u.commercial_property_id END AS property_id,
                       u.quadra, u.lote
                FROM public.empreendimento_units u
                JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
                WHERE tw.empreendimento_id = v_emp.id
            ) x
            WHERE x.property_id IS NOT NULL
        ), '{}'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_lote_do_predio(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_broker_portal_lote_do_predio(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_lote_do_predio(TEXT, UUID) TO anon, authenticated;
