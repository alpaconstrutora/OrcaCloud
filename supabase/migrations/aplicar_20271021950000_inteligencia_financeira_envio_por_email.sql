-- ═══════════════════════════════════════════════════════════════════════════
-- Inteligência Financeira — Fase 3: o relatório por e-mail consegue ler os dados
-- Plano: docs/planos/2026-10-21-inteligencia-financeira-numeros-reais.md (Fase 3)
--
-- APLICAR À MÃO:  npx supabase db query --linked -f <este arquivo>
--                 (NUNCA `supabase db push` — ver CLAUDE.md)
--
-- Por quê: a Edge `financial-report-notifier` não tem usuário (roda como
-- service_role, pelo cron ou depois de conferir quem clicou "Enviar agora"). As
-- RPCs descobrem a organização por auth.uid(); sem usuário a lista sai vazia e
-- fn_fi_targets responde "Acesso negado" — o e-mail saía sem dados (provado em
-- 21/10/2026 com JWT de service_role).
--
-- O que muda:
--   1. fn_fi_targets aceita service_role QUANDO a organização vem informada.
--      Não abre nada: service_role já ignora toda a RLS. Sem org, a lista de orgs
--      do "usuário" sai vazia e as RPCs devolvem vazio (provado no ensaio) —
--      nunca "todas as organizações do SaaS".
--   2. fn_fi_saldo_bancario(orgs): o saldo dos bancos com a MESMA fórmula de
--      fn_reconciliation_dashboard (abertura + extrato desde a data de abertura,
--      sem IGNORED, até hoje). Projeção e posição chamavam o dashboard, que tem a
--      sua própria checagem por auth.uid() e também recusaria o e-mail. O
--      dashboard não muda — é a tela de Conciliação.
--   3. fn_cashflow_projection e fn_cashflow_position passam a usar o (2).
--      Assinaturas e retornos iguais aos de aplicar_20271021800000.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Organizações-alvo ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fi_targets(p_organization_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org_ids uuid[];
BEGIN
  -- Chamada interna (Edge do relatório): a função já conferiu quem pediu, e
  -- service_role ignora a RLS de qualquer forma. Só com organização explícita.
  IF p_organization_id IS NOT NULL AND current_user = 'service_role' THEN
    RETURN ARRAY[p_organization_id];
  END IF;

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

  RETURN CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;
END;
$fn$;

-- ── 2. Saldo dos bancos (fórmula de fn_reconciliation_dashboard.bank_balance) ─
CREATE OR REPLACE FUNCTION public.fn_fi_saldo_bancario(p_targets uuid[])
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(SUM(
           COALESCE(pa.opening_balance, 0)
           + COALESCE((
               SELECT SUM(CASE WHEN bt.direction = 'CREDIT' THEN bt.amount ELSE -bt.amount END)
               FROM public.bank_transactions bt
               WHERE bt.bank_account_id = pa.id
                 AND bt.transaction_date <= CURRENT_DATE
                 AND bt.transaction_date >= COALESCE(pa.opening_balance_date, DATE '1900-01-01')
                 AND bt.status <> 'IGNORED'
             ), 0)
         ), 0)
  FROM public.payment_accounts pa
  WHERE pa.organization_id = ANY(p_targets);
$fn$;

-- ── 3a. Projeção ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cashflow_projection(p_organization_id uuid, p_days integer DEFAULT 90)
RETURNS TABLE(
  data_ref    date,
  cr_previsto numeric,
  db_previsto numeric,
  saldo_dia   numeric,
  saldo_acum  numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_targets uuid[]  := public.fn_fi_targets(p_organization_id);
  v_saldo   numeric := public.fn_fi_saldo_bancario(v_targets);
BEGIN
  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(CURRENT_DATE, CURRENT_DATE + p_days, interval '1 day')::date AS d
  ),
  mov AS (
    SELECT x.data_ref AS dr,
           COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'CREDIT'), 0) AS cr,
           COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'DEBIT'),  0) AS db
    FROM public.fn_fi_ledger(v_targets) x
    WHERE x.em_aberto AND x.data_ref BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days
    GROUP BY x.data_ref
  )
  SELECT d.d,
         COALESCE(m.cr, 0),
         COALESCE(m.db, 0),
         COALESCE(m.cr, 0) - COALESCE(m.db, 0),
         v_saldo + SUM(COALESCE(m.cr, 0) - COALESCE(m.db, 0)) OVER (ORDER BY d.d ROWS UNBOUNDED PRECEDING)
  FROM dias d
  LEFT JOIN mov m ON m.dr = d.d
  ORDER BY d.d;
END;
$fn$;

-- ── 3b. Posição de caixa ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cashflow_position(p_organization_id uuid)
RETURNS TABLE(
  saldo_bancario           numeric,
  contas                   int,
  contas_sem_saldo_inicial int,
  extrato_ate              date,
  vencido_receber          numeric,
  vencido_receber_qtd      int,
  vencido_pagar            numeric,
  vencido_pagar_qtd        int
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_targets uuid[] := public.fn_fi_targets(p_organization_id);
BEGIN
  RETURN QUERY
  WITH contas_org AS (
    SELECT pa.id, pa.opening_balance_date,
           (SELECT max(bt.transaction_date) FROM public.bank_transactions bt
             WHERE bt.bank_account_id = pa.id AND bt.status <> 'IGNORED') AS ultimo
    FROM public.payment_accounts pa
    WHERE pa.organization_id = ANY(v_targets)
  ),
  venc AS (
    SELECT
      COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'CREDIT'), 0) AS rec,
      count(*)              FILTER (WHERE x.direction = 'CREDIT')      AS rec_n,
      COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'DEBIT'),  0) AS pag,
      count(*)              FILTER (WHERE x.direction = 'DEBIT')       AS pag_n
    FROM public.fn_fi_ledger(v_targets) x
    WHERE x.em_aberto AND x.data_ref < CURRENT_DATE
  )
  SELECT
    public.fn_fi_saldo_bancario(v_targets),
    (SELECT count(*)::int FROM contas_org),
    (SELECT count(*)::int FROM contas_org WHERE opening_balance_date IS NULL),
    (SELECT min(ultimo) FROM contas_org WHERE ultimo IS NOT NULL),
    v.rec, v.rec_n::int, v.pag, v.pag_n::int
  FROM venc v;
END;
$fn$;

-- ── 4. Permissões (REGRA #7): fecha PUBLIC e anon NOMINALMENTE ──────────────
-- CREATE OR REPLACE preserva a ACL das já existentes; só a nova precisa disto.
REVOKE ALL ON FUNCTION public.fn_fi_saldo_bancario(uuid[])     FROM anon;
REVOKE ALL ON FUNCTION public.fn_fi_saldo_bancario(uuid[])     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fi_saldo_bancario(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
