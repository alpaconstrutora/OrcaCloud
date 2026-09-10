-- ============================================================================
-- PORTAL DO PARCEIRO — DETALHE DO CONTRATO: NÚCLEO + DUAS CASCAS
-- ============================================================================
-- Plano: docs/planos/2026-09-10-portal-parceiro-abas-do-contrato.md
--
-- O detalhe do contrato no portal ganha três abas (Execução & Entrega,
-- Retenção de Garantia, Penalidades), e com elas o payload cresce de 3 para 8
-- coleções. Aproveita-se para fundir as gêmeas: até aqui o modo LINK lia
-- `partner_portal_get_contract_detail` (corpo próprio) e o modo APP lia
-- `contractService` direto, tabela a tabela — dois caminhos para o mesmo dado,
-- que é o padrão que quebrou Documentos (20270919000026) e Financeiro
-- (20270863000000). Daqui em diante: UM corpo, e cascas que só diferem em COMO
-- autorizam.
--
-- ─── REGRA #7, as duas perguntas ────────────────────────────────────────────
--
-- 1. "Esta perna do OR sozinha basta para liberar a linha?"
--    Não há OR. O núcleo confirma `c.supplier_id = v_supplier`, e `v_supplier`
--    vem do WORKSPACE que a casca autorizou — pelo token (link) ou por
--    `partner_can_access_workspace` (app). O `p_contract_id` que o cliente manda
--    só serve para escolher ENTRE os contratos do próprio fornecedor: contrato
--    de outro fornecedor devolve NULL, não dado.
--
-- 2. "Quem mais pode executar esta função?"
--    O PostgreSQL concede EXECUTE a PUBLIC por padrão; os REVOKE vêm literais.
--    O núcleo não recebe grant nenhum. `anon` só na casca do link.
--
-- ─── O que NÃO vai aqui, de propósito ───────────────────────────────────────
--
-- Nada de `contract_risk_assessments`, questionário trabalhista ou divergências
-- de orçamento: "Riscos & Conformidade" é a avaliação INTERNA que a construtora
-- faz do parceiro, e o usuário decidiu (10/09/2026) que ela não sai pelo portal.
-- Se um dia sair, é decisão nova, não um campo a mais neste payload.
-- ============================================================================

-- ─── NÚCLEO ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_ws_contract_detail(p_ws uuid, p_contract_id uuid)
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

    -- O contrato pedido tem de ser DESTE fornecedor.
    IF NOT EXISTS (
        SELECT 1 FROM public.contracts c WHERE c.id = p_contract_id AND c.supplier_id = v_supplier
    ) THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'items', COALESCE((
            SELECT jsonb_agg(row_to_json(i) ORDER BY i.created_at ASC)
            FROM public.contract_items i WHERE i.contract_id = p_contract_id
        ), '[]'::jsonb),
        'addendums', COALESCE((
            SELECT jsonb_agg(row_to_json(a) ORDER BY a.created_at DESC)
            FROM public.contract_addendums a WHERE a.contract_id = p_contract_id
        ), '[]'::jsonb),
        'measurements', COALESCE((
            SELECT jsonb_agg(row_to_json(m) ORDER BY m.number DESC)
            FROM public.contract_measurements m WHERE m.contract_id = p_contract_id
        ), '[]'::jsonb),
        -- Execução & Entrega ───────────────────────────────────────────────
        'precedent_conditions', COALESCE((
            SELECT jsonb_agg(row_to_json(pc) ORDER BY pc.sort_order ASC, pc.created_at ASC)
            FROM public.contract_precedent_conditions pc WHERE pc.contract_id = p_contract_id
        ), '[]'::jsonb),
        'document_requirements', COALESCE((
            SELECT jsonb_agg(row_to_json(dr) ORDER BY dr.phase ASC, dr.created_at ASC)
            FROM public.contract_document_requirements dr
            WHERE dr.contract_id = p_contract_id AND COALESCE(dr.applicable, TRUE)
        ), '[]'::jsonb),
        'acceptances', COALESCE((
            SELECT jsonb_agg(row_to_json(ac) ORDER BY ac.issued_at ASC)
            FROM public.contract_acceptances ac WHERE ac.contract_id = p_contract_id
        ), '[]'::jsonb),
        -- Retenção de Garantia — o ledger é a MESMA função que valida a
        -- liberação do lado interno (`releaseRetention`), então o número que o
        -- parceiro vê é o número contra o qual a construtora libera.
        'retention', (
            SELECT jsonb_build_object(
                'total_retained', l.total_retained,
                'total_released', l.total_released,
                'balance', l.balance,
                'releases', COALESCE((
                    SELECT jsonb_agg(row_to_json(r) ORDER BY r.released_at DESC, r.created_at DESC)
                    FROM public.contract_retention_releases r WHERE r.contract_id = p_contract_id
                ), '[]'::jsonb)
            )
            FROM public.fn_contract_retention_ledger(p_contract_id) l
        ),
        -- Penalidades — inclusive canceladas: a tela mostra o status, e sumir
        -- com uma penalidade cancelada esconderia que ela existiu.
        'penalties', COALESCE((
            SELECT jsonb_agg(row_to_json(p) ORDER BY p.created_at DESC)
            FROM public.contract_penalties p WHERE p.contract_id = p_contract_id
        ), '[]'::jsonb)
    );
END;
$X$;

-- ─── CASCA DO APP ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_get_contract_detail(p_workspace_id uuid, p_contract_id uuid)
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
    v_payload := public.partner_ws_contract_detail(p_workspace_id, p_contract_id);
    IF v_payload IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || v_payload;
END;
$X$;

-- ─── CASCA DO LINK PÚBLICO (reescrita como casca; era corpo próprio) ────────
CREATE OR REPLACE FUNCTION public.partner_portal_get_contract_detail(p_token text, p_contract_id uuid)
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
    v_payload := public.partner_ws_contract_detail(v_ws, p_contract_id);
    IF v_payload IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || v_payload;
END;
$X$;

-- ─── Privilégios (REGRA #7) ─────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.partner_ws_contract_detail(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.partner_get_contract_detail(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.partner_get_contract_detail(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.partner_portal_get_contract_detail(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.partner_portal_get_contract_detail(text, uuid) TO anon, authenticated;
