-- Financeiro › Aprovações só com o que é PAGO (pedido de 26/10/2026, 2º da sessão):
-- *"o que deve ir para financeiro > aprovações e financeiro > contas a pagar, se
-- encontra em contratos > financeiro > parcelas. são as parcelas que são
-- efetivamente pagas e não o valor total do contrato"*. Decisão do usuário: sai o
-- contrato E o pedido de compra.
-- Plano: docs/planos/2026-10-26-todo-titulo-a-pagar-passa-pela-aprovacao.md (item M7).
--
-- Mesma assinatura e retorno de aplicar_20271026400000 (CREATE OR REPLACE, sem DROP);
-- fn_approval_pending_summary lê esta função e acompanha sozinha.
-- REGRA #7: ACL inalterada (reafirmada abaixo).

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_approval_action_queue(p_organization_id uuid)
 RETURNS TABLE(entity text, id uuid, title text, party_name text, project_name text, amount numeric, due_date date, approval_status text, approval_chain jsonb, approval_required_levels integer, origem text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;
  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;
  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;
  RETURN QUERY
  -- TRANSAÇÕES (saídas)
  --
  -- 26/10/2026 (2º pedido): CONTRATO e PEDIDO DE COMPRA saíram desta fila. O que
  -- se paga são as PARCELAS (títulos em Contas a Pagar), e elas já nascem
  -- PENDENTES; o contrato/pedido entrava pelo valor TOTAL (CTS-042-0001: R$ 2.850
  -- na fila, enquanto o pago são as parcelas). A aprovação de contrato/pedido
  -- nunca tinha sido usada (0 de 43 contratos, 0 de 21 pedidos).
  --
  -- Desde 26/10/2026 todo título a pagar nasce PENDENTE (gatilho
  -- fn_titulo_nasce_na_alcada), de qualquer valor: PENDENTE entra SEM exigir
  -- faixa — exigir deixaria o título abaixo do piso travado e fora da fila.
  -- RASCUNHO (a submeter) continua só na faixa e só em aberto. Membro de DARF
  -- fica fora: o DARF entra como um item só (ramo abaixo).
  SELECT
    'transaction'::text,
    t.id,
    COALESCE(NULLIF(t.description, ''), '(sem descrição)'),
    t.party_name,
    p.name,
    t.amount,
    t.due_date::date,
    COALESCE(t.approval_status, 'RASCUNHO'),
    COALESCE(t.approval_chain, '[]'::jsonb),
    COALESCE(t.approval_required_levels, 1),
    CASE WHEN t.party_type = 'TAX' THEN 'TRIBUTO' ELSE t.source_system END
  FROM public.internal_transactions t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.organization_id = ANY(v_targets)
    AND t.direction = 'DEBIT'
    AND t.darf_id IS NULL
    AND t.status <> 'CANCELLED'
    AND COALESCE(t.business_status, '') <> 'RETIDO'
    AND (
      t.approval_status = 'PENDENTE'
      OR (COALESCE(t.approval_status, 'RASCUNHO') = 'RASCUNHO'
          AND t.status = 'PENDING'
          AND EXISTS (
            SELECT 1 FROM public.financial_approval_config c
            WHERE c.organization_id = t.organization_id AND c.is_active
              AND t.amount >= c.faixa_min AND (c.faixa_max IS NULL OR t.amount < c.faixa_max)
          ))
    )

  UNION ALL
  -- DARF (26/10/2026): um item por guia, com o total; pendente quando algum membro pende.
  SELECT
    'darf'::text,
    vd.id,
    'DARF ' || to_char(vd.competencia, 'MM/YYYY') || COALESCE(' — ' || vd.tributos_nomes, ''),
    'Receita Federal (DARF)'::text,
    NULL::text,
    vd.total,
    vd.due_date,
    vd.aprovacao,
    COALESCE(vd.aprovacao_cadeia, '[]'::jsonb),
    (SELECT n.niveis FROM public.fn_darf_niveis(vd.id) n),
    'DARF'::text
  FROM public.vw_darfs vd
  WHERE vd.organization_id = ANY(v_targets)
    AND vd.aprovacao = 'PENDENTE'

  UNION ALL
  -- PLANTA PUBLICADA (blueprint_snapshots)
  --
  -- ⚠️ A condicao aqui e DIFERENTE das tres acima, de proposito. Elas exigem que
  -- o item caia numa faixa de `financial_approval_config` -- porque sao sobre
  -- DINHEIRO, e a faixa e que diz se aquele valor precisa de aprovacao. Uma
  -- revisao de planta nao tem valor: `submit` e chamado com `amount: 0`, como o
  -- proprio approvalService manda fazer para entidade nao monetaria.
  --
  -- Entao o criterio e outro: esta na fila o que ALGUEM ENVIOU. Copiar a
  -- condicao de faixa traria toda revisao publicada para a fila (ou nenhuma,
  -- conforme a organizacao tenha ou nao uma faixa comecando em zero) -- e uma
  -- fila que enche sozinha e uma fila que ninguem olha.
  SELECT
    'blueprint_snapshot'::text,
    bs.id,
    COALESCE(NULLIF(st.name, ''), '(planta sem nome)') || ' - revisao ' || bs.revision::text,
    NULL::text,
    p.name,
    0::numeric,
    NULL::date,
    COALESCE(bs.approval_status, 'RASCUNHO'),
    COALESCE(bs.approval_chain, '[]'::jsonb),
    COALESCE(bs.approval_required_levels, 1),
    'PLANTA'::text
  FROM public.blueprint_snapshots bs
  JOIN public.blueprint_studies st ON st.id = bs.study_id
  LEFT JOIN public.projects p ON p.id = st.project_id
  WHERE bs.organization_id = ANY(v_targets)
    AND bs.approval_status = 'PENDENTE'

  UNION ALL
  -- SOLICITAÇÕES DE COMPRA (purchase_requests)
  --
  -- ⚠️ Critério igual ao da planta, NÃO ao das compras: está na fila o que
  -- ALGUÉM ENVIOU. A SC é submetida com `semFaixa: 'exigir1'` — toda SC pede
  -- ao menos o nível 1, inclusive a que ainda não tem preço (valor 0). Exigir
  -- que o valor caia numa faixa deixaria essa SC PENDENTE e fora da fila, ou
  -- seja, esperando uma aprovação que ninguém vê.
  SELECT
    'purchase_request'::text,
    pr.id,
    -- Sem a palavra "Solicitação": a Central já mostra a etiqueta da entidade
    -- ao lado, e a linha lia "Solicitação Solicitação SC-…" (teste de 26/09).
    COALESCE(pr.number || ' — ', '') || pr.title,
    pr.requested_by_name,
    p.name,
    pr.estimated_total,
    pr.need_date,
    pr.approval_status,
    pr.approval_chain,
    pr.approval_required_levels,
    'SOLICITACAO_COMPRA'::text
  FROM public.purchase_requests pr
  LEFT JOIN public.projects p ON p.id = pr.project_id
  WHERE pr.organization_id = ANY(v_targets)
    AND pr.approval_status = 'PENDENTE'
    AND pr.cancelled_at IS NULL

  UNION ALL
  -- OFÍCIOS (doc_gen_documentos) — 10/10/2026, Documentos › Ofícios F4.
  --
  -- ⚠️ Critério da planta e da SC: está na fila o que ALGUÉM ENVIOU. Ofício não
  -- tem valor (amount 0, `semFaixa: 'exigir1'`). Só rascunho: emitido não
  -- volta para a fila.
  SELECT
    'doc_gen_documento'::text,
    d.id,
    COALESCE(NULLIF(btrim(d.assunto), ''), '(ofício sem assunto)'),
    d.destinatario_snapshot ->> 'razao_social',
    p.name,
    0::numeric,
    d.resposta_esperada_ate,
    d.approval_status,
    d.approval_chain,
    d.approval_required_levels,
    'OFICIO'::text
  FROM public.doc_gen_documentos d
  LEFT JOIN public.projects p ON p.id = d.project_id
  WHERE d.organization_id = ANY(v_targets)
    AND d.approval_status = 'PENDENTE'
    AND d.status = 'RASCUNHO'

  -- ⚠️ O ORDER BY e do CONJUNTO, e por isso vem depois do ultimo ramo. Ele
  -- estava no fim do terceiro ramo, e emendar o quarto abaixo dele o deixaria
  -- ordenando so uma parte -- que o Postgres recusa, e com razao.
  ORDER BY due_date NULLS LAST, amount DESC;

END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) TO authenticated, service_role;

COMMIT;
