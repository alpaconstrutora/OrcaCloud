-- Conciliação: conta DESATIVADA sai de toda a Conciliação; empresa da conta
-- Plano: docs/planos/2026-10-29-conciliacao-conta-desativada-e-empresa-da-conta.md
--
-- 1. A "Asaas Sandbox" foi desativada em 17/10/2026 (payment_accounts.is_active = false), mas
--    nenhuma função da Conciliação olhava o interruptor: ela seguia no Dashboard ("não bate":
--    banco R$ 56,03 × app R$ 0,00), no "Por empresa" e com os 6 movimentos do sandbox em
--    Divergências, Anomalias e Fechamento. Decisão do usuário (29/10): conta desativada sai de
--    TODA a Conciliação. Nada é apagado — reativar a conta traz tudo de volta.
--    Filtro de extrato: `NOT EXISTS (conta desativada)`, que também aceita extrato sem conta.
-- 2. "Por empresa": conta de organização SEM empresa cadastrada (pessoa física — o Itaú do
--    Altair) aparece com o nome da organização + "(pessoa física)"; "Sem empresa" fica só para
--    conta de PJ ainda não ligada, e vem marcada (`sem_empresa`) para a tela oferecer o link.
-- 3. Backfill: conta ATIVA sem empresa, numa organização com UMA empresa só (a matriz), recebe
--    essa empresa — em 29/10, só a "Asaas" (→ matriz da Alpa). Decisão do usuário.

-- ── 1a. Dashboard (por conta) ───────────────────────────────────────────────────────────────────────────────────────────────
-- Igual a aplicar_20271028800000_conciliacao_saldo_do_banco.sql, exceto: só conta ATIVA (accts).
CREATE OR REPLACE FUNCTION public.fn_reconciliation_dashboard(
  p_organization_id uuid,
  p_as_of           date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
  v_result  JSONB;
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

  WITH accts AS (
    SELECT pa.id, pa.name, pa.bank,
           COALESCE(pa.opening_balance, 0)                      AS opening_balance,
           pa.opening_balance_date                              AS opening_balance_date,
           COALESCE(pa.opening_balance_date, DATE '1900-01-01') AS opening_date
    FROM public.payment_accounts pa
    WHERE pa.organization_id = ANY(v_targets)
      AND pa.is_active IS NOT FALSE   -- conta desativada sai da Conciliação (29/10)
  ),
  tx AS (
    SELECT bt.bank_account_id, bt.status, bt.category, bt.direction, bt.amount, bt.description_normalized,
           bt.transaction_date,
           CASE WHEN bt.direction = 'CREDIT' THEN bt.amount ELSE -bt.amount END AS signed
    FROM public.bank_transactions bt
    JOIN accts a ON a.id = bt.bank_account_id
    WHERE bt.transaction_date <= p_as_of
      AND bt.transaction_date >= a.opening_date
      AND bt.status <> 'IGNORED'
  ),
  informado AS (
    -- O saldo do banco mais recente até a data pedida, de qualquer origem.
    SELECT DISTINCT ON (s.conta) s.conta, s.saldo, s.data, s.origem
    FROM (
      SELECT si.payment_account_id AS conta, si.saldo, si.data, 'MANUAL' AS origem, 0 AS prioridade
      FROM public.payment_account_saldo_informado si
      JOIN accts a ON a.id = si.payment_account_id
      WHERE si.data <= p_as_of
      UNION ALL
      SELECT i.bank_account_id, i.ledger_balance, i.ledger_balance_date, 'OFX', 1
      FROM public.bank_statement_imports i
      JOIN accts a ON a.id = i.bank_account_id
      WHERE i.ledger_balance IS NOT NULL AND i.ledger_balance_date IS NOT NULL
        AND i.ledger_balance_date <= p_as_of
      UNION ALL
      SELECT g.payment_account_id, g.saldo, (g.saldo_em AT TIME ZONE 'America/Sao_Paulo')::date, 'ASAAS', 2
      FROM public.payment_account_gateway g
      JOIN accts a ON a.id = g.payment_account_id
      WHERE g.saldo IS NOT NULL AND g.saldo_em IS NOT NULL
        AND (g.saldo_em AT TIME ZONE 'America/Sao_Paulo')::date <= p_as_of
    ) s
    ORDER BY s.conta, s.data DESC, s.prioridade
  ),
  per_account AS (
    SELECT a.id, a.name, a.bank, a.opening_balance, a.opening_balance_date,
           a.opening_balance + COALESCE(SUM(t.signed), 0)                                             AS bank_balance,
           a.opening_balance
             + COALESCE(SUM(t.signed) FILTER (WHERE public.fn_bank_tx_conciliado(t.status)), 0)       AS reconciled_balance,
           COALESCE(SUM(t.amount)  FILTER (WHERE public.fn_bank_tx_pendente(t.status)), 0)            AS pending_value,
           COALESCE(COUNT(*)       FILTER (WHERE public.fn_bank_tx_pendente(t.status)), 0)            AS pending_count,
           COALESCE(COUNT(*)       FILTER (WHERE public.fn_bank_tx_pendente(t.status)
                                                AND t.category IS NULL), 0)                           AS unclassified_count,
           COALESCE(COUNT(*)       FILTER (WHERE t.status = 'TRANSFER'), 0)                           AS transfer_count,
           inf.saldo  AS saldo_banco,
           inf.data   AS saldo_banco_data,
           inf.origem AS saldo_banco_origem,
           CASE WHEN inf.data IS NULL THEN NULL
                ELSE a.opening_balance + COALESCE(SUM(t.signed) FILTER (WHERE t.transaction_date <= inf.data), 0)
           END                                                                                        AS calculado_na_data_banco,
           CASE WHEN inf.data IS NULL THEN NULL
                ELSE COALESCE(COUNT(*) FILTER (WHERE public.fn_bank_tx_pendente(t.status)
                                                 AND t.transaction_date > inf.data), 0)
           END                                                                                        AS pendentes_apos_data_banco
    FROM accts a
    LEFT JOIN tx t ON t.bank_account_id = a.id
    LEFT JOIN informado inf ON inf.conta = a.id
    GROUP BY a.id, a.name, a.bank, a.opening_balance, a.opening_balance_date, inf.saldo, inf.data, inf.origem
  ),
  ledger AS (
    -- DOIS números, não um. `baixado` é qualquer origem (webhook, boleto, sync);
    -- `conferido` é só o que passou pelo extrato. Comparar o extrato com o primeiro
    -- era comparar coisas diferentes, e a diferença nunca fechava.
    SELECT COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END)
                    FILTER (WHERE it.status = 'CONCILIATED'), 0)                        AS baixado_net,
           COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END)
                    FILTER (WHERE it.bank_reconciled_at IS NOT NULL), 0)                AS conferido_net,
           COUNT(*) FILTER (WHERE it.status = 'CONCILIATED')                            AS baixado_count,
           COUNT(*) FILTER (WHERE it.bank_reconciled_at IS NOT NULL)                    AS conferido_count
    FROM public.internal_transactions it
    WHERE it.organization_id = ANY(v_targets) AND it.transaction_date <= p_as_of
  ),
  fees AS (
    SELECT COALESCE(SUM(t.amount), 0) AS fees_value, COUNT(*) AS fees_count
    FROM tx t
    WHERE public.fn_bank_tx_pendente(t.status)
      AND t.category IS NULL AND t.direction = 'DEBIT'
      AND t.description_normalized ~ '(TARIFA|TAXA|CESTA|MANUTENCAO|PACOTE|IOF|ANUIDADE)'
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'accounts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'account_id', pa.id, 'account_name', pa.name, 'bank_name', pa.bank,
            'opening_balance', pa.opening_balance, 'opening_balance_date', pa.opening_balance_date,
            'bank_balance', pa.bank_balance,
            'reconciled_balance', pa.reconciled_balance,
            'difference', pa.bank_balance - pa.reconciled_balance,
            'pending_value', pa.pending_value, 'pending_count', pa.pending_count,
            'unclassified_count', pa.unclassified_count, 'transfer_count', pa.transfer_count,
            'saldo_banco', pa.saldo_banco, 'saldo_banco_data', pa.saldo_banco_data,
            'saldo_banco_origem', pa.saldo_banco_origem,
            'calculado_na_data_banco', pa.calculado_na_data_banco,
            'pendentes_apos_data_banco', pa.pendentes_apos_data_banco
          ) ORDER BY pa.name)
        FROM per_account pa), '[]'::jsonb),
    'totals', (
        SELECT jsonb_build_object(
            'opening_balance',    COALESCE(SUM(opening_balance), 0),
            'bank_balance',       COALESCE(SUM(bank_balance), 0),
            'reconciled_balance', COALESCE(SUM(reconciled_balance), 0),
            'difference',         COALESCE(SUM(bank_balance - reconciled_balance), 0),
            'pending_value',      COALESCE(SUM(pending_value), 0),
            'pending_count',      COALESCE(SUM(pending_count), 0),
            'unclassified_count', COALESCE(SUM(unclassified_count), 0),
            'transfer_count',     COALESCE(SUM(transfer_count), 0)
          )
        FROM per_account),
    'system_balance', (
        SELECT (SELECT COALESCE(SUM(opening_balance), 0) FROM per_account) + l.baixado_net FROM ledger l),
    'ledger', (
        SELECT jsonb_build_object(
            'baixado_net',      l.baixado_net,
            'baixado_count',    l.baixado_count,
            'conferido_net',    l.conferido_net,
            'conferido_count',  l.conferido_count,
            'so_baixado_count', l.baixado_count - l.conferido_count
          ) FROM ledger l),
    'fees', (SELECT jsonb_build_object('value', fees_value, 'count', fees_count) FROM fees)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) TO authenticated;

-- ── 1b. Consolidado (por empresa e por obra) ──────────────────────────────────────────────────────────────────
-- Igual a aplicar_20271028300000_conciliacao_status_unico.sql, exceto: só conta ATIVA, e a conta
-- sem empresa é agrupada pela organização — "(pessoa física)" quando a organização não tem
-- empresa nenhuma; "Sem empresa" (com `sem_empresa = true`) quando tem e a conta não foi ligada.
CREATE OR REPLACE FUNCTION public.fn_reconciliation_consolidated(
  p_organization_id uuid,
  p_as_of           date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
  v_result  JSONB;
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

  WITH accts AS (
    SELECT pa.id,
           pa.empresa_id,
           pa.organization_id,
           COALESCE(pa.opening_balance, 0)                      AS opening_balance,
           COALESCE(pa.opening_balance_date, DATE '1900-01-01') AS opening_date
    FROM public.payment_accounts pa
    WHERE pa.organization_id = ANY(v_targets)
      AND pa.is_active IS NOT FALSE   -- conta desativada sai da Conciliação (29/10)
  ),
  tx AS (
    SELECT bt.bank_account_id,
           bt.status,
           bt.amount,
           CASE WHEN bt.direction = 'CREDIT' THEN bt.amount ELSE -bt.amount END AS signed
    FROM public.bank_transactions bt
    JOIN accts a ON a.id = bt.bank_account_id
    WHERE bt.transaction_date <= p_as_of
      AND bt.transaction_date >= a.opening_date
      AND bt.status <> 'IGNORED'
  ),
  per_account AS (
    SELECT a.id,
           a.empresa_id,
           a.organization_id,
           a.opening_balance + COALESCE(SUM(t.signed), 0)                                                  AS bank_balance,
           a.opening_balance + COALESCE(SUM(t.signed) FILTER (WHERE public.fn_bank_tx_conciliado(t.status)), 0) AS reconciled_balance,
           COALESCE(SUM(t.amount) FILTER (WHERE public.fn_bank_tx_pendente(t.status)), 0)                  AS pending_value,
           COALESCE(COUNT(*)      FILTER (WHERE public.fn_bank_tx_pendente(t.status)), 0)                  AS pending_count
    FROM accts a
    LEFT JOIN tx t ON t.bank_account_id = a.id
    GROUP BY a.id, a.empresa_id, a.organization_id, a.opening_balance
  ),
  by_emp AS (
    -- Conta com empresa: agrupa pela empresa. Sem empresa: pela organização dela — não junta
    -- a pessoa física (que não tem empresa) com a conta de PJ que só não foi ligada ainda.
    SELECT pa.empresa_id,
           CASE WHEN pa.empresa_id IS NULL THEN pa.organization_id END AS organization_id,
           c.nome_fantasia,
           c.razao_social,
           COUNT(*)                    AS account_count,
           SUM(pa.bank_balance)        AS bank_balance,
           SUM(pa.reconciled_balance)  AS reconciled_balance,
           SUM(pa.pending_value)       AS pending_value,
           SUM(pa.pending_count)       AS pending_count
    FROM per_account pa
    LEFT JOIN public.companies c ON c.id = pa.empresa_id
    GROUP BY pa.empresa_id, CASE WHEN pa.empresa_id IS NULL THEN pa.organization_id END, c.nome_fantasia, c.razao_social
  ),
  by_emp_nome AS (
    SELECT e.*,
           o.name AS org_name,
           EXISTS (SELECT 1 FROM public.companies c2 WHERE c2.org_id = e.organization_id) AS org_tem_empresa
    FROM by_emp e
    LEFT JOIN public.organizations o ON o.id = e.organization_id
  ),
  by_proj AS (
    SELECT it.project_id,
           p.name AS project_name,
           COALESCE(SUM(it.amount) FILTER (WHERE it.direction = 'CREDIT'), 0) AS credit,
           COALESCE(SUM(it.amount) FILTER (WHERE it.direction = 'DEBIT'), 0)  AS debit,
           COUNT(*) AS n
    FROM public.internal_transactions it
    LEFT JOIN public.projects p ON p.id = it.project_id
    WHERE it.organization_id = ANY(v_targets)
      AND it.status = 'CONCILIATED'
      AND it.project_id IS NOT NULL
      AND it.transaction_date <= p_as_of
    GROUP BY it.project_id, p.name
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'totals', (
        SELECT jsonb_build_object(
            'bank_balance',       COALESCE(SUM(bank_balance), 0),
            'reconciled_balance', COALESCE(SUM(reconciled_balance), 0),
            'pending_value',      COALESCE(SUM(pending_value), 0),
            'account_count',      COUNT(*),
            'empresa_count',      COUNT(DISTINCT empresa_id)
          )
        FROM per_account),
    'by_empresa', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'empresa_id',         empresa_id,
            'organization_id',    organization_id,
            'empresa_name',       COALESCE(
                                    NULLIF(nome_fantasia, ''), NULLIF(razao_social, ''),
                                    CASE WHEN empresa_id IS NULL AND NOT org_tem_empresa AND org_name IS NOT NULL
                                         THEN org_name || ' (pessoa física)' END,
                                    'Sem empresa'),
            -- Só a conta de PJ ainda não ligada à empresa é pendência (a tela oferece o link).
            'sem_empresa',        empresa_id IS NULL AND org_tem_empresa,
            'account_count',      account_count,
            'bank_balance',       bank_balance,
            'reconciled_balance', reconciled_balance,
            'difference',         bank_balance - reconciled_balance,
            'pending_value',      pending_value,
            'pending_count',      pending_count
          ) ORDER BY bank_balance DESC)
        FROM by_emp_nome), '[]'::jsonb),
    'by_project', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'project_id',   project_id,
            'project_name', COALESCE(project_name, 'Sem obra'),
            'credit',       credit,
            'debit',        debit,
            'net',          credit - debit,
            'n',            n
          ) ORDER BY (credit - debit) DESC)
        FROM by_proj), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_consolidated(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_consolidated(uuid, date) TO authenticated;

-- ── 1c. Divergências ──────────────────────────────────────────────────────────
-- Igual a aplicar_20271011007000_conciliacao_conta_atende_orgs.sql, exceto: extrato de conta
-- desativada não é divergência. Lançamentos internos não mudam (são do negócio, não da conta).
CREATE OR REPLACE FUNCTION public.fn_reconciliation_divergences(
    p_organization_id uuid,
    p_as_of           date    DEFAULT CURRENT_DATE,
    p_aging_days      integer DEFAULT 5,
    p_value_tolerance numeric DEFAULT 50,
    p_limit           integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
WITH
-- Categorias que cada organização tirou da conciliação (painel Regras da Central),
-- já normalizadas: sem acento, sem caixa, sem espaço nas pontas.
excluded AS (
  SELECT rs.organization_id, lower(public.unaccent(btrim(c))) AS cat
  FROM public.reconciliation_settings rs
  CROSS JOIN LATERAL unnest(rs.excluded_categories) AS c
),
-- Organizações que desligaram "Incluir lançamentos do extrato sem credor/cliente definido".
sem_contraparte_fora AS (
  SELECT rs.organization_id FROM public.reconciliation_settings rs
  WHERE NOT rs.include_without_counterparty
),
bank_pending AS (
  SELECT bt.id, bt.organization_id, bt.bank_account_id, bt.transaction_date, bt.amount, bt.direction,
         COALESCE(bt.description_normalized, bt.description_raw) AS description,
         bt.category, pa.name AS account_name
  FROM public.bank_transactions bt
  JOIN public.payment_accounts pa ON pa.id = bt.bank_account_id
  WHERE (p_organization_id IS NULL OR bt.organization_id = p_organization_id)
    AND bt.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
    AND bt.transaction_date <= p_as_of
    AND pa.is_active IS NOT FALSE   -- conta desativada sai da Conciliação (29/10)
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.bank_transaction_id = bt.id)
    -- Extrato de categoria excluída não é divergência. Sem categoria nunca é excluído.
    AND NOT EXISTS (SELECT 1 FROM excluded e
                    WHERE e.organization_id = bt.organization_id
                      AND e.cat = lower(public.unaccent(btrim(bt.category))))
    -- Extrato sem credor/cliente, quando a organização desligou a inclusão.
    AND NOT (NULLIF(btrim(bt.counterparty_name), '') IS NULL
             AND EXISTS (SELECT 1 FROM sem_contraparte_fora s WHERE s.organization_id = bt.organization_id))
),
internal_pending AS (
  SELECT it.id, it.organization_id, it.transaction_date, it.due_date, it.amount, it.direction,
         it.description, it.category, it.party_name, it.business_status, it.project_id
  FROM public.internal_transactions it
  WHERE (p_organization_id IS NULL OR it.organization_id = p_organization_id)
    AND it.status = 'PENDING'
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)
),
-- Candidatos do par divergente: qualquer título pendente que a pessoa enxerga. Quem
-- decide se ele vale para um extrato é a CONTA do extrato (bank_orgs, abaixo).
internal_candidates AS (
  SELECT it.id, it.organization_id, it.transaction_date, it.amount, it.direction, it.description
  FROM public.internal_transactions it
  WHERE it.status = 'PENDING'
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)
),
-- Organizações que cada conta do extrato atende (dona + lista + "todas").
conta_orgs AS (
  SELECT c.bank_account_id, o AS organization_id
  FROM (SELECT DISTINCT bank_account_id FROM bank_pending) c
  CROSS JOIN LATERAL public.fn_orgs_atendidas_pela_conta(c.bank_account_id) AS o
),
-- Cada extrato × as orgs cujos títulos ele pode casar: a dele, e as da conta.
bank_orgs AS (
  SELECT b.id AS bank_id, b.organization_id FROM bank_pending b
  UNION
  SELECT b.id, co.organization_id FROM bank_pending b JOIN conta_orgs co ON co.bank_account_id = b.bank_account_id
),
-- Cada extrato vira 7 linhas (uma por dia da janela ±3) por org: o join abaixo é por
-- IGUALDADE de (org, direção, data), que o hash join resolve sem varrer todos os pares.
bank_window AS (
  SELECT b.*, bo.organization_id AS match_org, b.transaction_date + k AS match_date
  FROM bank_pending b
  JOIN bank_orgs bo ON bo.bank_id = b.id
  CROSS JOIN generate_series(-3, 3) AS k
),
mismatch AS (
  SELECT DISTINCT ON (b.id)
         b.id AS bank_id, i.id AS internal_id, b.amount AS bank_amount, i.amount AS internal_amount,
         b.amount - i.amount AS difference, b.transaction_date AS bank_date, i.transaction_date AS internal_date,
         b.description AS bank_description, i.description AS internal_description, b.direction, b.account_name
  FROM bank_window b
  JOIN internal_candidates i
    ON i.organization_id = b.match_org   -- org do extrato, ou org que a conta atende
   AND i.direction = b.direction
   AND i.transaction_date = b.match_date
   AND abs(b.amount - i.amount) > 0
   AND abs(b.amount - i.amount) <= p_value_tolerance
  -- `i.id` desempata (+50 × −50 do mesmo extrato): antes a escolha era arbitrária e
  -- mudava de uma chamada para outra.
  ORDER BY b.id, abs(b.amount - i.amount) ASC, i.id
)
SELECT jsonb_build_object(
  'as_of', p_as_of,
  'counts', jsonb_build_object(
      'bank_without_internal', (SELECT COUNT(*) FROM bank_pending b WHERE NOT EXISTS (SELECT 1 FROM mismatch x WHERE x.bank_id = b.id)),
      'internal_without_bank', (SELECT COUNT(*) FROM internal_pending i WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days),
      'value_mismatch',        (SELECT COUNT(*) FROM mismatch)
  ),
  'bank_without_internal', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.transaction_date DESC) FROM (
        SELECT b.id, b.bank_account_id, b.account_name, b.transaction_date, b.amount, b.direction, b.description, b.category
        FROM bank_pending b WHERE NOT EXISTS (SELECT 1 FROM mismatch x WHERE x.bank_id = b.id)
        ORDER BY b.transaction_date DESC LIMIT p_limit) t), '[]'::jsonb),
  'internal_without_bank', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.ref_date ASC) FROM (
        SELECT i.id, i.transaction_date, i.due_date, COALESCE(i.due_date, i.transaction_date) AS ref_date,
               (p_as_of - COALESCE(i.due_date, i.transaction_date)) AS days_overdue,
               i.amount, i.direction, i.description, i.category, i.party_name, i.business_status, i.project_id
        FROM internal_pending i WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days
        ORDER BY ref_date ASC LIMIT p_limit) t), '[]'::jsonb),
  'value_mismatch', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY abs(t.difference) DESC) FROM (
        SELECT * FROM mismatch ORDER BY abs(difference) DESC LIMIT p_limit) t), '[]'::jsonb)
);
$function$;

-- REGRA #7: mesma ACL de aplicar_20270919000015 (sem PUBLIC, sem anon).
REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) TO authenticated;

-- ── 1d. Anomalias ─────────────────────────────────────────────────────────────
-- Igual a 20270129000001_reconciliation_anomalies_todas_organizacoes.sql (+ ACL de
-- aplicar_20270919000015), exceto: extrato de conta desativada fora das duplicidades.
CREATE OR REPLACE FUNCTION public.fn_reconciliation_anomalies(
  p_organization_id uuid,
  p_as_of           date    DEFAULT current_date,
  p_lookback_days   integer DEFAULT 180,
  p_dup_window_days integer DEFAULT 7,
  p_min_amount      numeric DEFAULT 100,
  p_z_threshold     numeric DEFAULT 3,
  p_limit           integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
  v_result  JSONB;
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

  WITH tx AS (
    SELECT bt.id,
           bt.transaction_date AS dt,
           bt.amount,
           bt.direction,
           UPPER(COALESCE(NULLIF(bt.counterparty_name, ''), bt.description_normalized, bt.description_raw)) AS party,
           'BANK'::text AS source
    FROM public.bank_transactions bt
    WHERE bt.organization_id = ANY(v_targets)
      AND bt.transaction_date BETWEEN p_as_of - p_lookback_days AND p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.payment_accounts pa
                      WHERE pa.id = bt.bank_account_id AND pa.is_active = false)   -- conta desativada (29/10)
    UNION ALL
    SELECT it.id,
           it.transaction_date,
           it.amount,
           it.direction,
           UPPER(COALESCE(NULLIF(it.entity_name, ''), NULLIF(it.party_name, ''), it.description)) AS party,
           'INTERNAL'::text
    FROM public.internal_transactions it
    WHERE it.organization_id = ANY(v_targets)
      AND it.status <> 'CANCELLED'
      AND it.transaction_date BETWEEN p_as_of - p_lookback_days AND p_as_of
  ),
  dup AS (
    SELECT t1.source,
           t1.direction,
           t1.amount,
           t1.party,
           t1.id   AS id_a,
           t2.id   AS id_b,
           t1.dt   AS date_a,
           t2.dt   AS date_b,
           abs(t1.dt - t2.dt) AS days_apart
    FROM tx t1
    JOIN tx t2
      ON t1.source    = t2.source
     AND t1.amount    = t2.amount
     AND t1.direction = t2.direction
     AND t1.party     = t2.party
     AND t1.party IS NOT NULL
     AND t1.id < t2.id
     AND abs(t1.dt - t2.dt) <= p_dup_window_days
    WHERE t1.amount >= p_min_amount
  ),
  base AS (
    SELECT it.id, it.transaction_date AS dt, it.amount,
           it.category,
           UPPER(COALESCE(NULLIF(it.entity_name, ''), NULLIF(it.party_name, ''))) AS party
    FROM public.internal_transactions it
    WHERE it.organization_id = ANY(v_targets)
      AND it.status <> 'CANCELLED'
      AND it.direction = 'DEBIT'
      AND it.transaction_date BETWEEN p_as_of - p_lookback_days AND p_as_of
      AND COALESCE(NULLIF(it.entity_name, ''), NULLIF(it.party_name, '')) IS NOT NULL
  ),
  stats AS (
    SELECT party, avg(amount) AS avg_a, stddev_pop(amount) AS sd, count(*) AS n
    FROM base
    GROUP BY party
    HAVING count(*) >= 5
  ),
  outliers AS (
    SELECT b.id, b.dt, b.amount, b.party, b.category,
           s.avg_a, s.n,
           round(((b.amount - s.avg_a) / NULLIF(s.sd, 0))::numeric, 2) AS z
    FROM base b
    JOIN stats s ON s.party = b.party
    WHERE s.sd > 0
      AND b.amount > s.avg_a + p_z_threshold * s.sd
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'counts', jsonb_build_object(
        'duplicates',     (SELECT COUNT(*) FROM dup),
        'value_outliers', (SELECT COUNT(*) FROM outliers)
    ),
    'duplicates', COALESCE((
        SELECT jsonb_agg(row_to_json(d) ORDER BY d.amount DESC) FROM (
          SELECT * FROM dup ORDER BY amount DESC LIMIT p_limit
        ) d), '[]'::jsonb),
    'value_outliers', COALESCE((
        SELECT jsonb_agg(row_to_json(o) ORDER BY o.z DESC) FROM (
          SELECT * FROM outliers ORDER BY z DESC LIMIT p_limit
        ) o), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_anomalies(uuid, date, integer, integer, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_anomalies(uuid, date, integer, integer, numeric, numeric, integer) TO authenticated;

-- ── 1e. Fechamento — pendências do mês ──────────────────────────────────────────
-- Igual a 20261220000003_financial_period_close.sql (+ ACL de aplicar_20270919000015), exceto:
-- extrato de conta desativada não conta como pendência do mês.
CREATE OR REPLACE FUNCTION public.fn_financial_close_checklist(
  p_organization_id uuid,
  p_year            int,
  p_month           int
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $fn$
WITH bounds AS (
  SELECT make_date(p_year, p_month, 1)                       AS d_from,
         (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::date AS d_to
),
bank AS (
  SELECT bt.status, bt.category, bt.direction, bt.amount, bt.description_normalized
  FROM public.bank_transactions bt, bounds b
  WHERE bt.organization_id = p_organization_id
    AND bt.transaction_date BETWEEN b.d_from AND b.d_to
    AND NOT EXISTS (SELECT 1 FROM public.payment_accounts pa
                    WHERE pa.id = bt.bank_account_id AND pa.is_active = false)   -- conta desativada (29/10)
),
internal_pending AS (
  SELECT it.id
  FROM public.internal_transactions it, bounds b
  WHERE it.organization_id = p_organization_id
    AND it.status = 'PENDING'
    AND COALESCE(it.due_date, it.transaction_date) BETWEEN b.d_from AND b.d_to
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)
)
SELECT jsonb_build_object(
  'year',  p_year,
  'month', p_month,
  'pending_bank_count',     (SELECT COUNT(*) FROM bank WHERE status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')),
  'unclassified_count',     (SELECT COUNT(*) FROM bank WHERE status IN ('IMPORTED','NORMALIZED','RULE_APPLIED') AND category IS NULL),
  'fees_uncategorized_count', (SELECT COUNT(*) FROM bank
                                WHERE status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
                                  AND category IS NULL AND direction = 'DEBIT'
                                  AND description_normalized ~ '(TARIFA|TAXA|CESTA|MANUTENCAO|PACOTE|IOF|ANUIDADE)'),
  'internal_pending_count', (SELECT COUNT(*) FROM internal_pending),
  'total_entradas',         (SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT'), 0) FROM bank),
  'total_saidas',           (SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'), 0) FROM bank),
  'is_closed',              public.fn_period_is_closed(p_organization_id, (SELECT d_from FROM bounds))
);
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_financial_close_checklist(uuid, int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_financial_close_checklist(uuid, int, int) TO authenticated;

-- ── 2. Empresa da conta: a que o app já sabe ────────────────────────────────────
-- Conta ATIVA sem empresa, numa organização com exatamente UMA empresa (a matriz — toda PJ
-- tem uma, a pessoa física nenhuma): recebe essa empresa. Em 29/10/2026: só a "Asaas" (Alpa).
-- Organização com mais de uma empresa não é tocada: aí a escolha é de quem cadastra.
UPDATE public.payment_accounts pa
   SET empresa_id = (SELECT c.id FROM public.companies c WHERE c.org_id = pa.organization_id)
 WHERE pa.empresa_id IS NULL
   AND pa.is_active IS NOT FALSE
   AND (SELECT count(*) FROM public.companies c WHERE c.org_id = pa.organization_id) = 1;
