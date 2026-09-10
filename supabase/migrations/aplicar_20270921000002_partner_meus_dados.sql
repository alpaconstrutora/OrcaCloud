-- ============================================================================
-- PORTAL DO PARCEIRO — "MEUS DADOS"
-- ============================================================================
-- Plano: docs/planos/2026-09-09-portal-parceiro-meus-dados.md
--
-- O painel é o MESMO componente que o Portal do Fornecedor ganhou hoje
-- (`components/supplier/portal/PortalMyData.tsx`), reusado — ele só precisa de
-- um `Supplier` e das contas bancárias. O que falta é a porta de dados do lado
-- do parceiro: `partner_workspaces` guarda só o `supplier_id`, e a RLS de
-- `suppliers` é `is_org_member(organization_id)`, que não alcança a sessão anon
-- do link nem é o caminho certo para o portal.
--
-- Núcleo + duas cascas, o padrão de 20270863000000. UM corpo, e as cascas só
-- diferem em COMO autorizam. Não copiar corpo entre elas: foi assim que a
-- leitura de Documentos regrediu em 20270913 (ver 20270919000026).
--
-- ─── REGRA #7, as duas perguntas ────────────────────────────────────────────
--
-- 1. "Esta perna do OR sozinha basta para liberar a linha?"
--    Não há OR em lugar nenhum. O núcleo filtra por `s.id = v_supplier`, e
--    `v_supplier` sai de `partner_workspaces` a partir do workspace que a CASCA
--    autorizou — não de parâmetro. Nenhuma das duas cascas aceita id de
--    fornecedor na assinatura, então não há como pedir o cadastro de outro:
--    pelo link o workspace vem do token, e no app vem de
--    `partner_can_access_workspace`.
--
-- 2. "Quem mais pode executar esta função?"
--    O PostgreSQL concede EXECUTE a PUBLIC por padrão e GRANT não revoga esse
--    default — por isso os REVOKE vêm literais, antes dos GRANT.
--    O núcleo não recebe grant nenhum: só as cascas o alcançam, e é dentro
--    delas que a autorização mora. `anon` entra SÓ na casca do link, porque o
--    portal do parceiro é acesso sem login e a requisição chega com a chave
--    anon — mesmo desenho das outras RPCs `partner_portal_*`.
--
-- ─── O que o parceiro passa a ver ───────────────────────────────────────────
--
-- O cadastro DELE por inteiro, incluindo conta bancária e chave PIX sem
-- máscara — decidido pelo usuário em 09/09/2026, e é a mesma decisão que o
-- Portal do Fornecedor tomou hoje (20270921000001), para os dois portais não
-- dizerem coisas diferentes sobre o mesmo cadastro.
-- Conta `status = 'inativo'` fica de fora: não é a que a construtora usa para
-- pagar, e mostrá-la só atrapalha a conferência.
-- ============================================================================

-- ─── NÚCLEO ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_ws_supplier_profile(p_ws uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_supplier UUID;
BEGIN
    SELECT supplier_id INTO v_supplier FROM public.partner_workspaces WHERE id = p_ws;
    IF v_supplier IS NULL THEN RETURN NULL; END IF;

    RETURN jsonb_build_object(
        -- A linha inteira: o painel espelha o cadastro de Meus Fornecedores, e
        -- recortar campo a campo aqui faria a tela e o cadastro divergirem toda
        -- vez que a tabela ganhasse coluna.
        'supplier', (SELECT row_to_json(s) FROM public.suppliers s WHERE s.id = v_supplier),
        'bank_accounts', COALESCE((
            SELECT jsonb_agg(
                row_to_json(b)
                -- A principal primeiro, depois a mais nova: é a ordem em que o
                -- parceiro procura ("qual conta vocês usam para me pagar?").
                ORDER BY b.is_primary DESC, b.created_at DESC
            )
            FROM public.supplier_bank_accounts b
            WHERE b.supplier_id = v_supplier
              AND COALESCE(b.status, 'ativo') <> 'inativo'
        ), '[]'::jsonb)
    );
END;
$X$;

-- ─── CASCA DO APP ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_get_supplier_profile(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE v_payload JSONB;
BEGIN
    IF NOT public.partner_can_access_workspace(p_workspace_id) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;
    v_payload := public.partner_ws_supplier_profile(p_workspace_id);
    IF v_payload IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || v_payload;
END;
$X$;

-- ─── CASCA DO LINK PÚBLICO ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_portal_get_supplier_profile(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_payload JSONB;
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    v_payload := public.partner_ws_supplier_profile(v_ws);
    IF v_payload IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || v_payload;
END;
$X$;

-- ─── Privilégios (REGRA #7) ─────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.partner_ws_supplier_profile(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.partner_get_supplier_profile(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.partner_get_supplier_profile(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.partner_portal_get_supplier_profile(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.partner_portal_get_supplier_profile(text) TO anon, authenticated;
