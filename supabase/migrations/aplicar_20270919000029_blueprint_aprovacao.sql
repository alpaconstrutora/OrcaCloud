-- ==========================================================================
-- Planta Inteligente: APROVACAO DA REVISAO PUBLICADA (Etapa 5 do roadmap BIM).
--
-- --- Por que NAO nasce um fluxo novo ---------------------------------------
--
-- `services/approvalService.ts` se declara "primitiva UNICA de aprovacao" e ja
-- serve transacao, contrato, compra e passo de processo por um registro em
-- `ENTITY_META`. Um segundo fluxo daria duas filas de acao, dois vocabularios
-- de status e duas telas -- e a segunda seria a pior. A planta entra na
-- primitiva: bastam as tres colunas que ela le.
--
-- --- Por que a aprovacao e do SNAPSHOT, e nao do ESTUDO ---------------------
--
-- O plano desta etapa dizia que o estudo ganharia `EM_REVISAO` entre
-- `EM_EDICAO` e `PUBLICADO`. Errado: o estudo e um continente que continua
-- sendo editado, e por um estado nele a revisao 7 sob analise congelaria o
-- desenho inteiro. O snapshot e que e imutavel -- ele e o que se aprova, e o
-- hash e que carimba O QUE foi aprovado. O estudo fica como esta.
--
-- --- Aprovacao aqui e CARIMBO, nao tranca ----------------------------------
--
-- Nada e bloqueado: publicar continua livre, e a revisao seguinte tambem. O
-- que a aprovacao acrescenta e o registro de quem aprovou, quando e SOBRE QUAL
-- HASH -- e esse carimbo sai no IFC e no PDF, que e onde ele vale.
-- ==========================================================================

SET lock_timeout = '5s';

ALTER TABLE blueprint_snapshots
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS approval_chain JSONB,
  ADD COLUMN IF NOT EXISTS approval_required_levels INT;

COMMENT ON COLUMN blueprint_snapshots.approval_status IS
  'RASCUNHO | PENDENTE | APROVADO | REJEITADO -- o mesmo vocabulario de internal_transactions e contracts, lido por approvalService.';
COMMENT ON COLUMN blueprint_snapshots.approval_chain IS
  'Array de ApprovalStep: quem aprovou cada nivel, quando e com que observacao.';

-- A fila le por organizacao e status; sem isto ela varre todos os snapshots.
CREATE INDEX IF NOT EXISTS idx_blueprint_snapshots_aprovacao
  ON blueprint_snapshots (organization_id, approval_status)
  WHERE approval_status IS NOT NULL;

-- ==========================================================================
-- A fila de acao passa a mostrar a planta junto do resto.
--
-- A funcao vai INTEIRA (CREATE OR REPLACE substitui tudo): as tres primeiras
-- ramificacoes sao identicas as de 20270129000003, copiadas sem uma letra de
-- diferenca, e a quarta e a nova.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.fn_approval_action_queue(
  p_organization_id UUID
)
RETURNS TABLE (
  entity                   TEXT,
  id                       UUID,
  title                    TEXT,
  party_name               TEXT,
  project_name             TEXT,
  amount                   NUMERIC,
  due_date                 DATE,
  approval_status          TEXT,
  approval_chain           JSONB,
  approval_required_levels INT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
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
    COALESCE(t.approval_required_levels, 1)
  FROM public.internal_transactions t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.organization_id = ANY(v_targets)
    AND t.direction = 'DEBIT'
    AND COALESCE(t.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = t.organization_id AND c.is_active
        AND t.amount >= c.faixa_min AND (c.faixa_max IS NULL OR t.amount < c.faixa_max)
    )

  UNION ALL

  -- CONTRATOS
  SELECT
    'contract'::text,
    k.id,
    COALESCE(NULLIF(k.title, ''), 'Contrato ' || COALESCE(k.number, '')),
    COALESCE(s.name, cl.name),
    p.name,
    k.current_value,
    NULL::date,
    COALESCE(k.approval_status, 'RASCUNHO'),
    COALESCE(k.approval_chain, '[]'::jsonb),
    COALESCE(k.approval_required_levels, 1)
  FROM public.contracts k
  LEFT JOIN public.projects  p  ON p.id  = k.project_id
  LEFT JOIN public.suppliers s  ON s.id  = k.supplier_id
  LEFT JOIN public.clients   cl ON cl.id = k.client_id
  WHERE k.organization_id = ANY(v_targets)
    AND COALESCE(k.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = k.organization_id AND c.is_active
        AND k.current_value >= c.faixa_min AND (c.faixa_max IS NULL OR k.current_value < c.faixa_max)
    )

  UNION ALL

  -- COMPRAS (purchase_orders) — valor = Σ items[].total; escopo via empresa→org
  SELECT
    'purchase_order'::text,
    po.id,
    'Pedido ' || COALESCE(po.number, ''),
    s.name,
    p.name,
    po_total.v,
    NULL::date,
    COALESCE(po.approval_status, 'RASCUNHO'),
    COALESCE(po.approval_chain, '[]'::jsonb),
    COALESCE(po.approval_required_levels, 1)
  FROM public.purchase_orders po
  JOIN public.companies cmp ON cmp.id = po.empresa_id
  LEFT JOIN public.projects  p ON p.id = po.project_id
  LEFT JOIN public.suppliers s ON s.id = po.supplier_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM((it->>'total')::numeric), 0) AS v
    FROM jsonb_array_elements(COALESCE(po.items, '[]'::jsonb)) it
  ) po_total
  WHERE cmp.org_id = ANY(v_targets)
    AND COALESCE(po.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = cmp.org_id AND c.is_active
        AND po_total.v >= c.faixa_min AND (c.faixa_max IS NULL OR po_total.v < c.faixa_max)
    )

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
    COALESCE(bs.approval_required_levels, 1)
  FROM public.blueprint_snapshots bs
  JOIN public.blueprint_studies st ON st.id = bs.study_id
  LEFT JOIN public.projects p ON p.id = st.project_id
  WHERE bs.organization_id = ANY(v_targets)
    AND bs.approval_status = 'PENDENTE'

  -- ⚠️ O ORDER BY e do CONJUNTO, e por isso vem depois do ultimo ramo. Ele
  -- estava no fim do terceiro ramo, e emendar o quarto abaixo dele o deixaria
  -- ordenando so uma parte -- que o Postgres recusa, e com razao.
  ORDER BY due_date NULLS LAST, amount DESC;

END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) TO authenticated;
