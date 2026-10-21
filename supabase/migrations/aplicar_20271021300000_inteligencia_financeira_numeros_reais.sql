-- ═══════════════════════════════════════════════════════════════════════════
-- Inteligência Financeira — números que batem com a realidade (Fase 1)
-- Plano: docs/planos/2026-10-21-inteligencia-financeira-numeros-reais.md
--
-- APLICAR À MÃO:  npx supabase db query --linked -f <este arquivo>
--                 (NUNCA `supabase db push` — ver CLAUDE.md)
--
-- O que estava errado (medido em 21/10/2026, RPCs rodadas no JWT do usuário):
--   D1 projeção começava em ZERO e ignorava todo título vencido
--      (R$ 3,1 mi a receber e R$ 2,1 mi a pagar fora da conta);
--   D2 nenhuma receita chegava à obra → margem 0% em todas as obras;
--   D3 scorecard media risco sem horizonte e o alerta em 90 dias — o mesmo
--      número saía −R$ 200 mil numa aba e −R$ 753 na outra;
--   D4 orçamento entrava como obra (REGRA #3);
--   D5 não havia alerta de contas a pagar vencidas;
--   D9 EXECUTE liberado para PUBLIC/anon (REGRA #7).
--
-- Como fica:
--   • fn_fi_ledger é o livro ÚNICO que todas as funções leem: cada lançamento
--     sai uma vez classificado (obra, venda/locação, empreendimento). Scorecard,
--     alertas e projeção não conseguem mais divergir entre si.
--   • A obra da receita é DEDUZIDA na leitura, nesta ordem:
--       lançamento.project_id → contrato.project_id → negociação.linked_project_id
--       → unidade.project_id → empreendimento (pai da unidade).project_id
--     Só vale projeto de classificação OBRA que não seja de sistema. Nenhum
--     lançamento é regravado (as sincronizações que regravam títulos ficam
--     intocadas) — o vínculo empreendimento→obra mora no cadastro do
--     empreendimento (commercial_properties.project_id).
--   • Nem todo empreendimento tem obra (ex.: 016 - Galeria Avenida 494): a
--     venda dele fica sem obra, por empreendimento, em fn_entries_without_project.
--   • Decisões do usuário (21/10/2026): venda conta na obra; LOCAÇÃO fica fora
--     da margem da obra (fn_rental_income); custo sem obra fica fora da margem
--     (fn_entries_without_project).
--   • A projeção parte do saldo bancário oficial (o mesmo de
--     fn_reconciliation_dashboard) e os vencidos saem à parte
--     (fn_cashflow_position) — não somados ao saldo.
--
-- Compatibilidade com a tela publicada: fn_financial_alerts e
-- fn_cashflow_projection mantêm as colunas de retorno; fn_project_scorecard só
-- GANHA colunas (por isso DROP + CREATE). Mesmos nomes de argumento — o
-- PostgREST casa a RPC pelo nome.
--
-- Todas as funções são SECURITY INVOKER: a RLS de internal_transactions,
-- projects etc. continua valendo para quem chama.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0a. Organizações-alvo (mesma regra das funções anteriores) ──────────────
CREATE OR REPLACE FUNCTION public.fn_fi_targets(p_organization_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org_ids uuid[];
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

  RETURN CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;
END;
$fn$;

-- ── 0b. Livro único ─────────────────────────────────────────────────────────
-- realizado = conciliado; em_aberto = pendente sem marcação de pago/recebido.
-- Cancelado e renegociado não entram em nada (COALESCE: business_status nulo
-- não pode sumir do NOT IN, como acontecia antes).
CREATE OR REPLACE FUNCTION public.fn_fi_ledger(p_targets uuid[])
RETURNS TABLE(
  id                  uuid,
  direction           text,
  amount              numeric,
  data_ref            date,
  realizado           boolean,
  em_aberto           boolean,
  categoria           text,
  obra_id             uuid,
  obra_nome           text,
  natureza            text,   -- 'VENDA' | 'LOCACAO' | NULL
  empreendimento_id   uuid,
  empreendimento_nome text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  WITH obras AS (
    -- Projeto de sistema: corte por nome E por flag (ver utils/systemProjects.ts).
    SELECT p.id, p.name
    FROM public.projects p
    WHERE p.settings->>'classification' = 'OBRA'
      AND COALESCE(p.settings->>'isSystemProject', 'false') <> 'true'
      AND p.name NOT IN ('Gestão Comercial')
  ),
  base AS (
    SELECT it.id, it.direction, it.amount, it.status, it.business_status,
           it.due_date, it.transaction_date, it.category, it.project_id,
           c.project_id AS contrato_obra,
           -- Parcela espelhada da negociação: reference_id 'tx-{dealId}-p{n}',
           -- 'tx-{dealId}-dp' ou 'tx-comm-{dealId}' (commercialFinanceService).
           COALESCE(
             c.deal_id,
             substring(it.reference_id FROM
               '^tx-(?:comm-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid
           ) AS deal_ref
    FROM public.internal_transactions it
    LEFT JOIN public.contracts c ON c.id = it.contract_id
    WHERE it.organization_id = ANY(p_targets)
      AND it.status <> 'CANCELLED'
      AND COALESCE(it.business_status, '') NOT IN ('CANCELADO', 'RENEGOCIADO')
  )
  SELECT
    b.id,
    b.direction,
    b.amount,
    COALESCE(b.due_date, b.transaction_date),
    b.status = 'CONCILIATED',
    b.status = 'PENDING' AND COALESCE(b.business_status, '') NOT IN ('RECEBIDO', 'PAGO'),
    COALESCE(NULLIF(trim(b.category), ''), 'Sem categoria'),
    o.id,
    o.name,
    CASE d.type WHEN 'SALE' THEN 'VENDA' WHEN 'RENTAL' THEN 'LOCACAO' END,
    COALESCE(pai.id, u.id),
    COALESCE(pai.name, u.name)
  FROM base b
  LEFT JOIN public.commercial_deals      d   ON d.id   = b.deal_ref
  LEFT JOIN public.commercial_properties u   ON u.id   = d.property_id
  LEFT JOIN public.commercial_properties pai ON pai.id = u.parent_id
  LEFT JOIN LATERAL (
    SELECT ob.id, ob.name
    FROM (VALUES (1, b.project_id), (2, b.contrato_obra), (3, d.linked_project_id),
                 (4, u.project_id), (5, pai.project_id)) AS cand(ordem, pid)
    JOIN obras ob ON ob.id = cand.pid
    ORDER BY cand.ordem
    LIMIT 1
  ) o ON true;
$fn$;

-- ── 1. Scorecard de obras ───────────────────────────────────────────────────
-- ar_pendente/ap_pendente/saldo_projetado agora são dos próximos 90 dias — o
-- MESMO horizonte do alerta de risco de caixa. Vencido sai em coluna própria.
DROP FUNCTION IF EXISTS public.fn_project_scorecard(uuid);

CREATE FUNCTION public.fn_project_scorecard(p_organization_id uuid)
RETURNS TABLE(
  project_id        uuid,
  project_name      text,
  receita_realizada numeric,
  custo_realizado   numeric,
  margem_pct        numeric,
  ar_pendente       numeric,
  ap_pendente       numeric,
  saldo_projetado   numeric,
  risco             text,
  ar_vencido        numeric,
  ap_vencido        numeric,
  tem_receita       boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  c_horizonte  CONSTANT int     := 90;
  c_risco_alto CONSTANT numeric := -50000;
BEGIN
  RETURN QUERY
  WITH agg AS (
    SELECT
      l.obra_id,
      l.obra_nome,
      COALESCE(SUM(l.amount) FILTER (WHERE l.direction = 'CREDIT' AND l.realizado), 0) AS rec,
      COALESCE(SUM(l.amount) FILTER (WHERE l.direction = 'DEBIT'  AND l.realizado), 0) AS cus,
      COALESCE(SUM(l.amount) FILTER (WHERE l.direction = 'CREDIT' AND l.em_aberto
                 AND l.data_ref BETWEEN CURRENT_DATE AND CURRENT_DATE + c_horizonte), 0) AS ar,
      COALESCE(SUM(l.amount) FILTER (WHERE l.direction = 'DEBIT'  AND l.em_aberto
                 AND l.data_ref BETWEEN CURRENT_DATE AND CURRENT_DATE + c_horizonte), 0) AS ap,
      COALESCE(SUM(l.amount) FILTER (WHERE l.direction = 'CREDIT' AND l.em_aberto
                 AND l.data_ref < CURRENT_DATE), 0) AS ar_venc,
      COALESCE(SUM(l.amount) FILTER (WHERE l.direction = 'DEBIT'  AND l.em_aberto
                 AND l.data_ref < CURRENT_DATE), 0) AS ap_venc
    FROM public.fn_fi_ledger(public.fn_fi_targets(p_organization_id)) l
    WHERE l.obra_id IS NOT NULL
      AND l.natureza IS DISTINCT FROM 'LOCACAO'
    GROUP BY l.obra_id, l.obra_nome
  )
  SELECT
    a.obra_id,
    a.obra_nome,
    a.rec,
    a.cus,
    CASE WHEN a.rec > 0 THEN ROUND(100.0 * (a.rec - a.cus) / a.rec, 1) ELSE 0 END,
    a.ar,
    a.ap,
    a.ar - a.ap,
    CASE WHEN a.ar - a.ap < c_risco_alto THEN 'HIGH'
         WHEN a.ar - a.ap < 0            THEN 'MEDIUM'
         ELSE 'OK' END,
    a.ar_venc,
    a.ap_venc,
    a.rec > 0
  FROM agg a
  ORDER BY a.rec DESC, a.cus DESC;
END;
$fn$;

-- ── 2. Alertas ──────────────────────────────────────────────────────────────
-- Risco de caixa e margem saem do scorecard (mesmo número nas duas abas).
-- Novo: PAYABLE_OVERDUE (contas a pagar vencidas).
CREATE OR REPLACE FUNCTION public.fn_financial_alerts(p_organization_id uuid)
RETURNS TABLE(
  alert_type   text,
  severity     text,
  title        text,
  description  text,
  amount       numeric,
  project_id   uuid,
  project_name text,
  ref_id       text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_targets            uuid[]  := public.fn_fi_targets(p_organization_id);
  c_receber_dias       CONSTANT int     := 30;
  c_valor_alto         CONSTANT numeric := 100000;
  c_valor_medio        CONSTANT numeric := 30000;
  c_risco_alto         CONSTANT numeric := -50000;
  c_margem_meta        CONSTANT numeric := 10;
  c_margem_receita_min CONSTANT numeric := 10000;
BEGIN
  RETURN QUERY
  WITH l AS (
    SELECT * FROM public.fn_fi_ledger(v_targets)
  ),
  receber AS (
    SELECT count(*) AS n, COALESCE(SUM(x.amount), 0) AS total
    FROM l x
    WHERE x.direction = 'CREDIT' AND x.em_aberto AND x.data_ref < CURRENT_DATE - c_receber_dias
  ),
  pagar AS (
    SELECT count(*) AS n, COALESCE(SUM(x.amount), 0) AS total
    FROM l x
    WHERE x.direction = 'DEBIT' AND x.em_aberto AND x.data_ref < CURRENT_DATE
  ),
  sc AS (
    SELECT * FROM public.fn_project_scorecard(p_organization_id)
  ),
  alertas AS (
    SELECT 'OVERDUE_HIGH'::text AS t,
           CASE WHEN r.total > c_valor_alto THEN 'HIGH' WHEN r.total > c_valor_medio THEN 'MEDIUM' ELSE 'LOW' END AS s,
           'Inadimplência: ' || r.n || ' título(s) vencido(s) há mais de ' || c_receber_dias || ' dias' AS ti,
           public.fn_brl(r.total) || ' a receber vencidos há mais de ' || c_receber_dias
             || ' dias. Confira se algum já foi recebido e só falta a baixa.' AS de,
           r.total AS v, NULL::uuid AS pid, NULL::text AS pn
    FROM receber r WHERE r.total > 0
    UNION ALL
    SELECT 'PAYABLE_OVERDUE',
           CASE WHEN p.total > c_valor_alto THEN 'HIGH' WHEN p.total > c_valor_medio THEN 'MEDIUM' ELSE 'LOW' END,
           'Contas a pagar vencidas: ' || p.n || ' título(s)',
           public.fn_brl(p.total) || ' com vencimento passado e sem baixa. Confira se já foram pagos'
             || ' e só falta a baixa ou a conciliação.',
           p.total, NULL::uuid, NULL::text
    FROM pagar p WHERE p.total > 0
    UNION ALL
    SELECT 'CASHFLOW_RISK',
           CASE WHEN sc.saldo_projetado < c_risco_alto THEN 'HIGH' ELSE 'MEDIUM' END,
           'Risco de caixa: ' || sc.project_name,
           'Saldo de ' || public.fn_brl(sc.saldo_projetado) || ' nos próximos 90 dias (a receber '
             || public.fn_brl(sc.ar_pendente) || ', a pagar ' || public.fn_brl(sc.ap_pendente) || ').',
           sc.saldo_projetado, sc.project_id, sc.project_name
    FROM sc WHERE sc.saldo_projetado < 0
    UNION ALL
    SELECT 'MARGIN_LOW',
           CASE WHEN sc.margem_pct < 0 THEN 'HIGH' WHEN sc.margem_pct < 5 THEN 'MEDIUM' ELSE 'LOW' END,
           'Margem baixa: ' || sc.project_name,
           'Margem de ' || replace(sc.margem_pct::text, '.', ',') || '% (meta: ' || c_margem_meta || '% ou mais).',
           sc.receita_realizada, sc.project_id, sc.project_name
    FROM sc WHERE sc.receita_realizada > c_margem_receita_min AND sc.margem_pct < c_margem_meta
  )
  SELECT a.t, a.s, a.ti, a.de, a.v, a.pid, a.pn, NULL::text
  FROM alertas a
  ORDER BY CASE a.s WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, abs(a.v) DESC;
END;
$fn$;

-- ── 3. Projeção de caixa ────────────────────────────────────────────────────
-- Parte do saldo bancário oficial (extrato) e soma o que vence de hoje em
-- diante. Vencidos NÃO entram aqui — saem em fn_cashflow_position.
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
  v_saldo   numeric := COALESCE(
    (public.fn_reconciliation_dashboard(p_organization_id) -> 'totals' ->> 'bank_balance')::numeric, 0);
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

-- ── 4. Posição de caixa: ponto de partida da projeção + o que está vencido ──
-- extrato_ate = o extrato MAIS ATRASADO entre as contas que têm extrato: é ele
-- que limita a confiança no saldo de partida.
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
    COALESCE((public.fn_reconciliation_dashboard(p_organization_id) -> 'totals' ->> 'bank_balance')::numeric, 0),
    (SELECT count(*)::int FROM contas_org),
    (SELECT count(*)::int FROM contas_org WHERE opening_balance_date IS NULL),
    (SELECT min(ultimo) FROM contas_org WHERE ultimo IS NOT NULL),
    v.rec, v.rec_n::int, v.pag, v.pag_n::int
  FROM venc v;
END;
$fn$;

-- ── 5. Renda de locação por empreendimento (fora da margem das obras) ───────
CREATE OR REPLACE FUNCTION public.fn_rental_income(p_organization_id uuid)
RETURNS TABLE(
  empreendimento_id   uuid,
  empreendimento_nome text,
  recebido            numeric,
  custo               numeric,
  a_receber_90d       numeric,
  vencido             numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT
    x.empreendimento_id,
    COALESCE(x.empreendimento_nome, 'Sem empreendimento'),
    COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'CREDIT' AND x.realizado), 0),
    COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'DEBIT'  AND x.realizado), 0),
    COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'CREDIT' AND x.em_aberto
               AND x.data_ref BETWEEN CURRENT_DATE AND CURRENT_DATE + 90), 0),
    COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'CREDIT' AND x.em_aberto
               AND x.data_ref < CURRENT_DATE), 0)
  FROM public.fn_fi_ledger(public.fn_fi_targets(p_organization_id)) x
  WHERE x.natureza = 'LOCACAO'
  GROUP BY x.empreendimento_id, x.empreendimento_nome
  ORDER BY 3 DESC;
END;
$fn$;

-- ── 6. Lançamentos sem obra (despesa da empresa, venda sem obra…) ───────────
-- Nem todo empreendimento tem obra (ex.: 016 - Galeria Avenida 494 — decisão
-- do usuário em 21/10/2026). natureza = 'VENDA' aqui é venda de empreendimento
-- SEM obra: caso legítimo, não cadastro incompleto. Por isso o empreendimento
-- vem junto — a tela mostra a venda pelo empreendimento, não por categoria.
CREATE OR REPLACE FUNCTION public.fn_entries_without_project(p_organization_id uuid)
RETURNS TABLE(
  direction           text,
  natureza            text,
  empreendimento_id   uuid,
  empreendimento_nome text,
  categoria           text,
  realizado           numeric,
  a_vencer_90d        numeric,
  vencido             numeric,
  qtd                 int
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT
    x.direction,
    x.natureza,
    x.empreendimento_id,
    x.empreendimento_nome,
    x.categoria,
    COALESCE(SUM(x.amount) FILTER (WHERE x.realizado), 0),
    COALESCE(SUM(x.amount) FILTER (WHERE x.em_aberto
               AND x.data_ref BETWEEN CURRENT_DATE AND CURRENT_DATE + 90), 0),
    COALESCE(SUM(x.amount) FILTER (WHERE x.em_aberto AND x.data_ref < CURRENT_DATE), 0),
    count(*)::int
  FROM public.fn_fi_ledger(public.fn_fi_targets(p_organization_id)) x
  WHERE x.obra_id IS NULL
    AND x.natureza IS DISTINCT FROM 'LOCACAO'
  GROUP BY x.direction, x.natureza, x.empreendimento_id, x.empreendimento_nome, x.categoria
  ORDER BY x.direction, 6 DESC;
END;
$fn$;

-- ── 7. Permissões (REGRA #7): fecha PUBLIC e anon NOMINALMENTE ──────────────
REVOKE ALL ON FUNCTION public.fn_fi_targets(uuid)                      FROM anon;
REVOKE ALL ON FUNCTION public.fn_fi_targets(uuid)                      FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fi_targets(uuid)                  TO authenticated;

REVOKE ALL ON FUNCTION public.fn_fi_ledger(uuid[])                     FROM anon;
REVOKE ALL ON FUNCTION public.fn_fi_ledger(uuid[])                     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fi_ledger(uuid[])                 TO authenticated;

REVOKE ALL ON FUNCTION public.fn_project_scorecard(uuid)               FROM anon;
REVOKE ALL ON FUNCTION public.fn_project_scorecard(uuid)               FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_project_scorecard(uuid)           TO authenticated;

REVOKE ALL ON FUNCTION public.fn_financial_alerts(uuid)                FROM anon;
REVOKE ALL ON FUNCTION public.fn_financial_alerts(uuid)                FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_financial_alerts(uuid)            TO authenticated;

REVOKE ALL ON FUNCTION public.fn_cashflow_projection(uuid, integer)    FROM anon;
REVOKE ALL ON FUNCTION public.fn_cashflow_projection(uuid, integer)    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cashflow_projection(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_cashflow_position(uuid)               FROM anon;
REVOKE ALL ON FUNCTION public.fn_cashflow_position(uuid)               FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cashflow_position(uuid)           TO authenticated;

REVOKE ALL ON FUNCTION public.fn_rental_income(uuid)                   FROM anon;
REVOKE ALL ON FUNCTION public.fn_rental_income(uuid)                   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_rental_income(uuid)               TO authenticated;

REVOKE ALL ON FUNCTION public.fn_entries_without_project(uuid)         FROM anon;
REVOKE ALL ON FUNCTION public.fn_entries_without_project(uuid)         FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_entries_without_project(uuid)     TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
