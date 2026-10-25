-- Contrato: mover para outra organização, levando tudo (pedido de 25/10/2026).
-- Plano: docs/planos/2026-10-25-contrato-mover-organizacao.md — as decisões
-- numeradas abaixo (D1…D10) são as de lá.
--
-- Duas RPCs:
--   previa_mover_contrato_organizacao(contrato, destino) → jsonb com o que vai junto
--     e o que impede (para o diálogo mostrar ANTES de confirmar);
--   mover_contrato_organizacao(contrato, destino, centro de custo, plano de contas)
--     → move tudo numa transação só (D1).
--
-- REGRA #7: as duas são SECURITY DEFINER (precisam atravessar a RLS das ~20
-- tabelas filhas), então a autorização mora DENTRO delas: gestor das DUAS
-- organizações (D2). EXECUTE revogado de PUBLIC/anon.

BEGIN;

-- ── Auditoria (D9) ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contract_organization_moves (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id   uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    from_org_id   uuid NOT NULL REFERENCES public.organizations(id),
    to_org_id     uuid NOT NULL REFERENCES public.organizations(id),
    moved_by      text,
    moved_at      timestamptz NOT NULL DEFAULT now(),
    resumo        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS contract_organization_moves_contract_idx
    ON public.contract_organization_moves (contract_id);

ALTER TABLE public.contract_organization_moves ENABLE ROW LEVEL SECURITY;

-- Pergunta 1 da REGRA #7: cada perna do OR exige ser membro de UMA das duas
-- organizações envolvidas — nenhuma libera a linha para quem não é de nenhuma.
DROP POLICY IF EXISTS contract_organization_moves_select ON public.contract_organization_moves;
CREATE POLICY contract_organization_moves_select ON public.contract_organization_moves
    FOR SELECT TO authenticated
    USING (public.is_org_member(from_org_id) OR public.is_org_member(to_org_id));
-- Sem policy de escrita: só a RPC (SECURITY DEFINER) grava.

-- ── Prévia ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.previa_mover_contrato_organizacao(
    p_contract_id uuid,
    p_org_destino uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_c          public.contracts;
    v_impede     text[] := ARRAY[]::text[];
    v_comp       text;
BEGIN
    SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.is_org_member(v_c.organization_id) THEN
        RAISE EXCEPTION 'Sem acesso a este contrato.' USING ERRCODE = '42501';
    END IF;

    IF p_org_destino IS NULL OR p_org_destino = v_c.organization_id THEN
        v_impede := v_impede || 'Escolha uma organização diferente da atual.';
    ELSE
        IF NOT public.is_org_manager(v_c.organization_id) THEN
            v_impede := v_impede || 'Só o proprietário ou um administrador da organização atual move o contrato.';
        END IF;
        IF NOT public.is_org_manager(p_org_destino) THEN
            v_impede := v_impede || 'Você precisa ser proprietário ou administrador da organização de destino.';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.contracts o
             WHERE o.organization_id = p_org_destino
               AND o.number = v_c.number
               AND o.id <> v_c.id
               AND COALESCE(o.direction, 'INCOMING') = COALESCE(v_c.direction, 'INCOMING')
        ) THEN
            v_impede := v_impede || format('A organização de destino já tem um contrato com o número %s.', v_c.number);
        END IF;
    END IF;

    -- D8: competência fechada em Contas a Pagar, na origem ou no destino.
    SELECT string_agg(DISTINCT to_char(cc.competencia, 'MM/YYYY'), ', ' ORDER BY to_char(cc.competencia, 'MM/YYYY'))
      INTO v_comp
      FROM public.internal_transactions t
      JOIN public.cost_center_closings cc
        ON cc.competencia = date_trunc('month', COALESCE(t.due_date, t.transaction_date))::date
       AND cc.status = 'FECHADO'
       AND cc.organization_id IN (t.organization_id, p_org_destino)
     WHERE t.contract_id = p_contract_id;
    IF v_comp IS NOT NULL THEN
        v_impede := v_impede || format('Competência fechada em Contas a Pagar: %s. Reabra o fechamento antes de mover.', v_comp);
    END IF;

    RETURN jsonb_build_object(
        'numero',               v_c.number,
        'organizacao_atual',    v_c.organization_id,
        'titulos',              (SELECT count(*) FROM public.internal_transactions WHERE contract_id = p_contract_id),
        'titulos_conciliados',  (SELECT count(*) FROM public.internal_transactions WHERE contract_id = p_contract_id AND bank_reconciled_at IS NOT NULL),
        'titulos_pagos',        (SELECT count(*) FROM public.internal_transactions WHERE contract_id = p_contract_id AND (payment_date IS NOT NULL OR bank_reconciled_at IS NOT NULL)),
        'recibos_ficam',        (SELECT count(*) FROM public.financial_receipts r
                                   JOIN public.internal_transactions t ON t.id = r.transaction_id
                                  WHERE t.contract_id = p_contract_id AND r.cancelled_at IS NULL),
        'processos',            (SELECT count(*) FROM public.process_instances p
                                  WHERE p.contract_id = p_contract_id
                                     OR p.internal_transaction_id IN (SELECT id FROM public.internal_transactions WHERE contract_id = p_contract_id)),
        'documentos',           (SELECT count(*) FROM public.contract_document_versions WHERE contract_id = p_contract_id)
                              + (SELECT count(*) FROM public.doc_gen_documentos WHERE contract_id = p_contract_id)
                              + (SELECT count(*) FROM public.opura_documents WHERE contract_id = p_contract_id),
        'impedimentos',         to_jsonb(v_impede)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.previa_mover_contrato_organizacao(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.previa_mover_contrato_organizacao(uuid, uuid) TO authenticated;

-- ── Mover ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mover_contrato_organizacao(
    p_contract_id        uuid,
    p_org_destino        uuid,
    p_cost_center_id     uuid DEFAULT NULL,
    p_plano_de_contas_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_c        public.contracts;
    v_origem   uuid;
    v_cc_nome  text;
    v_previa   jsonb;
    v_n_tit    int;
    v_n_filhos int := 0;
    v_n        int;
    v_tab      text;
    v_resumo   jsonb;
BEGIN
    SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = 'P0002';
    END IF;
    v_origem := v_c.organization_id;

    -- A prévia é a regra; mover não decide nada diferente dela.
    v_previa := public.previa_mover_contrato_organizacao(p_contract_id, p_org_destino);
    IF jsonb_array_length(v_previa -> 'impedimentos') > 0 THEN
        RAISE EXCEPTION '%', v_previa -> 'impedimentos' ->> 0 USING ERRCODE = '42501';
    END IF;

    IF p_cost_center_id IS NOT NULL THEN
        SELECT name INTO v_cc_nome FROM public.cost_centers_v2
         WHERE id = p_cost_center_id AND organization_id = p_org_destino;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'O centro de custo escolhido não é da organização de destino.' USING ERRCODE = '22023';
        END IF;
    END IF;
    IF p_plano_de_contas_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.plano_de_contas
         WHERE id = p_plano_de_contas_id AND (organization_id = p_org_destino OR organization_id IS NULL)
    ) THEN
        RAISE EXCEPTION 'O plano de contas escolhido não é da organização de destino.' USING ERRCODE = '22023';
    END IF;

    -- D5: fornecedor e cliente continuam — compartilhados com o destino quando
    -- não são dele. Vale para o do contrato e para os dos títulos.
    INSERT INTO public.supplier_org_shares (supplier_id, target_org_id)
    SELECT DISTINCT s.id, p_org_destino
      FROM public.suppliers s
     WHERE s.id IN (SELECT v_c.supplier_id
                    UNION SELECT supplier_id FROM public.internal_transactions WHERE contract_id = p_contract_id)
       AND s.organization_id IS DISTINCT FROM p_org_destino
       AND NOT EXISTS (SELECT 1 FROM public.supplier_org_shares x WHERE x.supplier_id = s.id AND x.target_org_id = p_org_destino);

    INSERT INTO public.client_org_shares (client_id, target_org_id)
    SELECT DISTINCT cl.id, p_org_destino
      FROM public.clients cl
     WHERE cl.id IN (SELECT v_c.client_id
                     UNION SELECT party_id FROM public.internal_transactions WHERE contract_id = p_contract_id)
       AND cl.organization_id IS DISTINCT FROM p_org_destino
       AND NOT EXISTS (SELECT 1 FROM public.client_org_shares x WHERE x.client_id = cl.id AND x.target_org_id = p_org_destino);

    -- O contrato. D4: cadastros da org antiga saem; CC e plano vêm do diálogo.
    UPDATE public.contracts c SET
        organization_id    = p_org_destino,
        cost_center_id     = p_cost_center_id,
        plano_de_contas_id = p_plano_de_contas_id,
        category_id        = CASE WHEN EXISTS (SELECT 1 FROM public.financial_categories f
                                                WHERE f.id = c.category_id AND f.organization_id IS NOT NULL
                                                  AND f.organization_id <> p_org_destino)
                                  THEN NULL ELSE c.category_id END,
        project_id         = NULL,
        budget_id          = NULL,
        empresa_id         = NULL,
        empreendimento_id  = NULL,
        payment_account_id = NULL,  -- D6: a conta do destino é escolhida depois
        updated_at         = now()
     WHERE c.id = p_contract_id;

    -- Os títulos (D3 + D4 + D6).
    UPDATE public.internal_transactions t SET
        organization_id    = p_org_destino,
        cost_center_id     = p_cost_center_id,
        cost_center        = v_cc_nome,
        plano_de_contas_id = p_plano_de_contas_id,
        category_id        = CASE WHEN EXISTS (SELECT 1 FROM public.financial_categories f
                                                WHERE f.id = t.category_id AND f.organization_id IS NOT NULL
                                                  AND f.organization_id <> p_org_destino)
                                  THEN NULL ELSE t.category_id END,
        project_id         = NULL,
        property_id        = NULL,
        payment_account_id = CASE WHEN t.payment_date IS NOT NULL OR t.bank_reconciled_at IS NOT NULL
                                  THEN t.payment_account_id ELSE NULL END,
        updated_at         = now()
     WHERE t.contract_id = p_contract_id;
    GET DIAGNOSTICS v_n_tit = ROW_COUNT;

    -- Processos de aprovação do contrato e dos títulos.
    UPDATE public.process_instances p SET organization_id = p_org_destino
     WHERE p.organization_id <> p_org_destino
       AND (p.contract_id = p_contract_id
            OR p.internal_transaction_id IN (SELECT id FROM public.internal_transactions WHERE contract_id = p_contract_id));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_n_filhos := v_n_filhos + v_n;

    -- Tabelas filhas com organization_id (D3). Itens, medições e contas de
    -- consumo não têm a coluna: seguem pela FK. Recibos ficam (D7).
    FOREACH v_tab IN ARRAY ARRAY[
        'client_service_orders', 'contract_acceptances', 'contract_addendums',
        'contract_document_requirements', 'contract_document_versions',
        'contract_evaluations', 'contract_guarantees', 'contract_interfaces',
        'contract_labor_questionnaires', 'contract_number_history',
        'contract_penalties', 'contract_precedent_conditions',
        'contract_retention_releases', 'contract_risk_assessments',
        'contract_supply_matrix', 'contract_technical_responsibilities',
        'doc_gen_documentos', 'opura_documents'
    ] LOOP
        EXECUTE format(
            'UPDATE public.%I SET organization_id = $1 WHERE contract_id = $2 AND organization_id IS DISTINCT FROM $1',
            v_tab) USING p_org_destino, p_contract_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_n_filhos := v_n_filhos + v_n;
    END LOOP;

    v_resumo := v_previa - 'impedimentos' || jsonb_build_object(
        'titulos_movidos',     v_n_tit,
        'filhos_movidos',      v_n_filhos,
        'cost_center_id',      p_cost_center_id,
        'plano_de_contas_id',  p_plano_de_contas_id
    );

    INSERT INTO public.contract_organization_moves (contract_id, from_org_id, to_org_id, moved_by, resumo)
    VALUES (p_contract_id, v_origem, p_org_destino, lower(auth.jwt() ->> 'email'), v_resumo);

    RETURN v_resumo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mover_contrato_organizacao(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mover_contrato_organizacao(uuid, uuid, uuid, uuid) TO authenticated;

COMMIT;
