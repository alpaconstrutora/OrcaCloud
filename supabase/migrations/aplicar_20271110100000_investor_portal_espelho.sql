-- ============================================================
-- Portal do Investidor — o ESPELHO DE VENDAS das obras do investidor
-- Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md (F4)
-- Pedido (09/11/2026): a torre do empreendimento em 3D, cada unidade na cor do
-- status, também no Portal do Investidor.
--
-- DECISÃO DO USUÁRIO (09/11/2026) sobre o que o investidor vê: o STATUS de cada
-- unidade, o PREÇO DE TABELA dela e o VGV vendido / em estoque. NUNCA o nome do
-- comprador. Por isso nada de negociação sai daqui: nem id, nem cliente, nem o
-- valor de uma venda. O status já vem resolvido, e o valor vendido só somado.
--
-- TRÊS FUNÇÕES:
--   fn_espelho_de_vendas_das_obras(org, obras[])  o corpo — interna, ninguém a chama pela API
--   fn_investor_portal_get_espelho(token)         o portal por link (anon): autoriza pelo token
--   fn_investor_get_espelho(investidor)           o app logado: a equipe da organização do
--                                                  investidor, o superadmin, ou o próprio investidor
--
-- DE QUAIS OBRAS: as do investidor — participação (`investor_participations`),
-- vínculo antigo (`projects.investor_id`) ou sócio de SPE da obra — só as
-- classificadas como OBRA (REGRA #3) e fora dos projetos de sistema (REGRA #2).
-- Da obra chega-se às torres por COALESCE(torre.project_id, empreendimento.project_id):
-- empreendimento de torre única guarda a obra no empreendimento.
--
-- O STATUS é a regra única da venda (`saleUnitClassifier.statusOf`, em
-- lib/salesAnalysis.ts; `__tests__/espelhoDoInvestidor.test.ts` prende as duas):
--   vendida       negociação de VENDA em Contrato, Assinatura ou Concluído — ou cadastro vendido
--   permutada     cadastro permutado
--   em negociação qualquer outra negociação de venda não cancelada — ou cadastro reservado
--   disponível    cadastro disponível
-- O cadastro é o do imóvel do estoque quando a unidade tem um; senão o da unidade.
-- VGV vendido = soma do valor das negociações vendidas (cada uma uma vez), como
-- em Venda de Ativos › Análise.
-- ============================================================

SET lock_timeout = '5s';

-- ── 1. O corpo ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_espelho_de_vendas_das_obras(p_org_id UUID, p_project_ids UUID[])
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $X$
    WITH torres AS (
        SELECT tw.id, tw.name, tw.sort_order, tw.floors_count, tw.units_per_floor,
               tw.pe_direito_padrao_m, tw.elevacao_terreo_m, tw.ordem_das_unidades_na_planta,
               tw.blueprint_quadra_uid, e.distancias_entre_torres,
               COALESCE(tw.project_id, e.project_id) AS obra_id
        FROM public.empreendimento_towers tw
        JOIN public.empreendimentos e ON e.id = tw.empreendimento_id
        WHERE e.organization_id = p_org_id
          AND COALESCE(tw.project_id, e.project_id) = ANY (p_project_ids)
    ),
    negocios AS (
        -- Uma linha por (negociação de venda não cancelada, imóvel): a unidade principal e as da cesta.
        SELECT d.id, d.status, d.value, x.property_id
        FROM public.commercial_deals d
        CROSS JOIN LATERAL (
            SELECT d.property_id AS property_id WHERE d.property_id IS NOT NULL
            UNION
            SELECT du.property_id FROM public.commercial_deal_units du WHERE du.deal_id = d.id
        ) x
        WHERE d.type = 'SALE' AND d.status IS DISTINCT FROM 'CANCELLED'
    ),
    unidades AS (
        SELECT u.id, u.tower_id, t.obra_id, u.name, u.floor, u.floor_tipo, u.typology, u.private_area,
               u.bedrooms, u.bathrooms, u.parking_spaces, u.position_type, u.sun_orientation,
               u.sort_order, u.vaga_na_planta, u.is_vendavel, u.commercial_property_id,
               COALESCE(u.price, cp.current_price, cp.price) AS preco,
               upper(COALESCE(cp.status, u.status)) AS cadastro,
               EXISTS (SELECT 1 FROM negocios n WHERE n.property_id = u.commercial_property_id
                         AND n.status IN ('CONTRATO', 'ASSINATURA', 'COMPLETED')) AS tem_venda,
               EXISTS (SELECT 1 FROM negocios n WHERE n.property_id = u.commercial_property_id) AS tem_negocio
        FROM public.empreendimento_units u
        JOIN torres t ON t.id = u.tower_id
        LEFT JOIN public.commercial_properties cp ON cp.id = u.commercial_property_id
    )
    SELECT COALESCE(jsonb_agg(o.obra ORDER BY o.nome), '[]'::jsonb)
    FROM (
        SELECT pr.name AS nome,
               jsonb_build_object(
                   'project_id', pr.id,
                   'project_name', pr.name,
                   'vgv_vendido', (
                       SELECT COALESCE(sum(v.value), 0)
                       FROM (
                           SELECT DISTINCT n.id, n.value
                           FROM negocios n
                           JOIN unidades u ON u.commercial_property_id = n.property_id
                           WHERE u.obra_id = pr.id AND n.status IN ('CONTRATO', 'ASSINATURA', 'COMPLETED')
                       ) v
                   ),
                   'torres', (
                       SELECT COALESCE(jsonb_agg(
                           jsonb_build_object(
                               'id', t.id, 'name', t.name, 'sort_order', t.sort_order,
                               'floors_count', t.floors_count, 'units_per_floor', t.units_per_floor,
                               'pe_direito_padrao_m', t.pe_direito_padrao_m,
                               'elevacao_terreo_m', t.elevacao_terreo_m,
                               'ordem_das_unidades_na_planta', t.ordem_das_unidades_na_planta,
                               'blueprint_quadra_uid', t.blueprint_quadra_uid,
                               'distancias_entre_torres', t.distancias_entre_torres,
                               'floors', COALESCE((
                                   SELECT jsonb_agg(jsonb_build_object(
                                       'id', f.id, 'tower_id', f.tower_id, 'name', f.name, 'tipo', f.tipo,
                                       'floor_number', f.floor_number, 'repeat_count', f.repeat_count,
                                       'units_per_floor', f.units_per_floor, 'prefix', f.prefix,
                                       'pe_direito_m', f.pe_direito_m, 'elevacao_m', f.elevacao_m,
                                       'sort_order', f.sort_order
                                   ) ORDER BY f.sort_order, f.floor_number)
                                   FROM public.empreendimento_floors f WHERE f.tower_id = t.id
                               ), '[]'::jsonb),
                               'units', COALESCE((
                                   SELECT jsonb_agg(jsonb_build_object(
                                       'id', u.id, 'name', u.name, 'floor', u.floor, 'floor_tipo', u.floor_tipo,
                                       'typology', u.typology, 'private_area', u.private_area,
                                       'bedrooms', u.bedrooms, 'bathrooms', u.bathrooms,
                                       'parking_spaces', u.parking_spaces,
                                       'position_type', u.position_type, 'sun_orientation', u.sun_orientation,
                                       'sort_order', u.sort_order, 'vaga_na_planta', u.vaga_na_planta,
                                       'is_vendavel', u.is_vendavel,
                                       'price', u.preco,
                                       'status', CASE
                                           WHEN u.tem_venda OR u.cadastro IN ('SOLD', 'VENDIDO') THEN 'sold'
                                           WHEN u.cadastro IN ('EXCHANGED', 'PERMUTADO') THEN 'exchanged'
                                           WHEN u.tem_negocio OR u.cadastro IN ('RESERVED', 'RESERVADO') THEN 'reserved'
                                           WHEN u.cadastro IN ('AVAILABLE', 'DISPONIVEL', 'DISPONÍVEL') THEN 'available'
                                           ELSE 'other'
                                       END
                                   ) ORDER BY u.sort_order, u.name)
                                   FROM unidades u WHERE u.tower_id = t.id
                               ), '[]'::jsonb)
                           ) ORDER BY t.sort_order, t.name
                       ), '[]'::jsonb)
                       FROM torres t WHERE t.obra_id = pr.id
                   )
               ) AS obra
        FROM public.projects pr
        WHERE pr.id = ANY (p_project_ids)
          AND EXISTS (SELECT 1 FROM torres t WHERE t.obra_id = pr.id)
    ) o;
$X$;

COMMENT ON FUNCTION public.fn_espelho_de_vendas_das_obras(UUID, UUID[]) IS
    'INTERNA. Torres, unidades (geometria, status resolvido, preço de tabela) e VGV vendido das obras dadas. Sem dado de negociação nem de comprador. Só as funções do portal do investidor a chamam.';

-- Interna de verdade: sem EXECUTE para ninguém da API. Quem a chama são as duas
-- funções abaixo, SECURITY DEFINER, que rodam como o dono.
REVOKE ALL ON FUNCTION public.fn_espelho_de_vendas_das_obras(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_espelho_de_vendas_das_obras(UUID, UUID[]) FROM anon;
REVOKE ALL ON FUNCTION public.fn_espelho_de_vendas_das_obras(UUID, UUID[]) FROM authenticated;

-- ── 2. As obras de um investidor ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_obras_do_investidor(p_investor_id UUID, p_org_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SET search_path = public
AS $X$
    SELECT COALESCE(array_agg(DISTINCT pr.id), '{}'::uuid[])
    FROM public.projects pr
    WHERE pr.organization_id = p_org_id
      AND pr.settings->>'classification' = 'OBRA'
      AND pr.settings->>'isSystemProject' IS DISTINCT FROM 'true'
      AND (
          pr.investor_id = p_investor_id
          OR EXISTS (SELECT 1 FROM public.investor_participations ip
                     WHERE ip.project_id = pr.id AND ip.investor_id = p_investor_id AND ip.organization_id = p_org_id)
          OR EXISTS (SELECT 1 FROM public.spe_partners sp
                     JOIN public.spe_entities se ON se.id = sp.spe_entity_id
                     WHERE se.project_id = pr.id AND sp.investor_id = p_investor_id AND se.organization_id = p_org_id)
      );
$X$;

COMMENT ON FUNCTION public.fn_obras_do_investidor(UUID, UUID) IS
    'INTERNA. As obras (classificação OBRA) de um investidor: participação, vínculo antigo ou sócio de SPE.';

REVOKE ALL ON FUNCTION public.fn_obras_do_investidor(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_obras_do_investidor(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.fn_obras_do_investidor(UUID, UUID) FROM authenticated;

-- ── 3. O portal por link ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_espelho(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.investor_portal_tokens;
BEGIN
    -- A autorização é o token, conferido aqui dentro (REGRA #7).
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'obras', public.fn_espelho_de_vendas_das_obras(
            v_tok.org_id, public.fn_obras_do_investidor(v_tok.investor_id, v_tok.org_id))
    );
END;
$X$;

COMMENT ON FUNCTION public.fn_investor_portal_get_espelho(TEXT) IS
    'Portal do Investidor (link): espelho de vendas das obras do investidor do token — status, preço de tabela e VGV vendido. Sem comprador.';

-- `anon` PRECISA executar: o portal é acesso por link, sem sessão.
REVOKE ALL ON FUNCTION public.fn_investor_portal_get_espelho(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_investor_portal_get_espelho(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_espelho(TEXT) TO anon, authenticated;

-- ── 4. O app logado ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_investor_get_espelho(p_investor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_inv public.investors;
BEGIN
    SELECT * INTO v_inv FROM public.investors WHERE id = p_investor_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    -- Quem pode: a equipe da organização do investidor, o superadmin, ou o próprio
    -- investidor (login por e-mail). `GRANT` é privilégio de chamada, não regra — a
    -- regra é esta. Cada perna do OR diz COM QUEM o dado é dividido (REGRA #7).
    IF NOT (
        public.is_org_member(v_inv.organization_id)
        OR public.is_superadmin()
        OR (NULLIF(trim(v_inv.email), '') IS NOT NULL
            AND lower(trim(v_inv.email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', ''))))
    ) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'obras', public.fn_espelho_de_vendas_das_obras(
            v_inv.organization_id, public.fn_obras_do_investidor(v_inv.id, v_inv.organization_id))
    );
END;
$X$;

COMMENT ON FUNCTION public.fn_investor_get_espelho(UUID) IS
    'App logado: espelho de vendas das obras de um investidor, para a equipe da organização dele, o superadmin ou o próprio investidor.';

-- Só com sessão: `anon` não chama.
REVOKE ALL ON FUNCTION public.fn_investor_get_espelho(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_investor_get_espelho(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_investor_get_espelho(UUID) TO authenticated;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_fn TEXT;
BEGIN
    IF NOT has_function_privilege('anon', 'public.fn_investor_portal_get_espelho(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_investor_portal_get_espelho deveria ser chamavel por anon (portal por link)';
    END IF;
    IF has_function_privilege('anon', 'public.fn_investor_get_espelho(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_investor_get_espelho NAO deveria ser chamavel por anon';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.fn_investor_get_espelho(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_investor_get_espelho deveria ser chamavel por authenticated';
    END IF;
    -- As internas: nem anon nem authenticated.
    FOREACH v_fn IN ARRAY ARRAY['public.fn_espelho_de_vendas_das_obras(uuid, uuid[])', 'public.fn_obras_do_investidor(uuid, uuid)'] LOOP
        IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION '% e interna e nao deveria ser chamavel pela API', v_fn;
        END IF;
    END LOOP;
    -- Nenhuma das quatro com EXECUTE para PUBLIC.
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.oid IN (
            'public.fn_investor_portal_get_espelho(text)'::regprocedure,
            'public.fn_investor_get_espelho(uuid)'::regprocedure,
            'public.fn_espelho_de_vendas_das_obras(uuid, uuid[])'::regprocedure,
            'public.fn_obras_do_investidor(uuid, uuid)'::regprocedure)
          AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    ) THEN
        RAISE EXCEPTION 'funcao do espelho do investidor ainda tem EXECUTE para PUBLIC';
    END IF;
    IF (public.fn_investor_portal_get_espelho('token-que-nao-existe') ->> 'valid')::boolean IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'fn_investor_portal_get_espelho deveria devolver valid=false para token inexistente';
    END IF;
END;
$$;
