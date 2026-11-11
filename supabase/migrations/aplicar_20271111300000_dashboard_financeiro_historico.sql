-- ═══════════════════════════════════════════════════════════════════════════
-- Dashboard financeiro — histórico mês a mês da faixa "Hoje"
-- Plano: docs/planos/2026-11-10-kpi-card-tendencia-e-historico.md (item 1)
--
-- APLICAR À MÃO:  npx supabase db query --linked -f <este arquivo>
--                 (NUNCA `supabase db push` — ver CLAUDE.md)
--
-- Para quê: o KpiCard de destaque ganhou sparkline e tendência ("+8,7% vs. fim de
-- out/26"). A faixa "Hoje" só sabia o valor de hoje; esta função devolve o mesmo
-- número no fim de cada mês FECHADO. O ponto de hoje continua vindo de
-- fn_financial_dashboard_today — o front o acrescenta no fim da série, então a linha
-- termina sempre no número escrito no card.
--
-- Como se reconstrói o passado:
--   • Vencido no fim do mês M = título do livro único (fn_fi_ledger) com data_ref antes
--     do corte (1º dia de M+1) e ainda não baixado no corte. Baixado em = payment_date;
--     sem ela, data_ref (a mesma régua do data_pgto de fn_financial_dashboard_period).
--     Em 11/11/2026: 276 de 523 débitos pagos sem payment_date, só 14 vencendo nos
--     últimos 12 meses. O erro é para MENOS: pago sem data conta como pago no vencimento.
--   • Sem corte por created_at: é "o que estava devido naquela data segundo os registros
--     de hoje". Cortar por created_at desenharia a implantação do sistema, não a dívida.
--   • Saldo = o saldo que o BANCO informou dentro do mês (digitado, OFX ou Asaas — a
--     mesma fonte do card), o mais recente de cada conta, somado. Mês sem nenhum = null
--     (não medido, não zero). NÃO o saldo calculado pelo extrato: na Alpa a Sicredi não
--     tem saldo inicial e o calculado fica ~R$ 28 mil abaixo do OFX em todo mês (jul–set/26,
--     medido em 11/11) — a forma da linha estaria certa, o percentual da tendência não.
--   • Aguardando aprovação NÃO tem série: a fila mudou de definição em 26/10 e 09/11.
--
-- Só leitura, SECURITY INVOKER: a RLS das tabelas vale, e fn_fi_targets recusa
-- organização de que o usuário não é membro.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_financial_dashboard_history(
  p_organization_id uuid,
  p_meses           integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_targets uuid[] := public.fn_fi_targets(p_organization_id);
  v_hoje    date   := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_result  jsonb;
BEGIN
  IF p_meses IS NULL OR p_meses < 1 OR p_meses > 36 THEN
    RAISE EXCEPTION 'Quantidade de meses inválida (1 a 36)';
  END IF;

  WITH meses AS (
    -- Só meses fechados: o mês corrente é o "hoje" da outra função.
    SELECT m::date AS mes, (m + interval '1 month')::date AS corte
    FROM generate_series(
           date_trunc('month', v_hoje) - make_interval(months => p_meses),
           date_trunc('month', v_hoje) - interval '1 month',
           interval '1 month') m
  ),
  livro AS (
    SELECT x.direction, x.amount, x.data_ref,
           CASE WHEN x.em_aberto THEN NULL ELSE COALESCE(it.payment_date, x.data_ref) END AS baixado_em
    FROM public.fn_fi_ledger(v_targets) x
    JOIN public.internal_transactions it ON it.id = x.id
  ),
  vencido AS (
    SELECT me.mes,
           COALESCE(SUM(l.amount) FILTER (WHERE l.direction = 'CREDIT'), 0) AS receber,
           COALESCE(SUM(l.amount) FILTER (WHERE l.direction = 'DEBIT'),  0) AS pagar
    FROM meses me
    LEFT JOIN livro l
      ON l.data_ref < me.corte
     AND (l.baixado_em IS NULL OR l.baixado_em >= me.corte)
    GROUP BY me.mes
  ),
  contas AS (
    -- Mesmo recorte de contas do card (fn_financial_dashboard_today: só ATIVAS).
    SELECT pa.id
    FROM public.payment_accounts pa
    WHERE pa.organization_id = ANY(v_targets)
      AND pa.is_active
  ),
  informado AS (
    -- As mesmas três origens de fn_reconciliation_dashboard.informado.
    SELECT si.payment_account_id AS conta, si.saldo, si.data, 0 AS prioridade
    FROM public.payment_account_saldo_informado si JOIN contas c ON c.id = si.payment_account_id
    UNION ALL
    SELECT i.bank_account_id, i.ledger_balance, i.ledger_balance_date, 1
    FROM public.bank_statement_imports i JOIN contas c ON c.id = i.bank_account_id
    WHERE i.ledger_balance IS NOT NULL AND i.ledger_balance_date IS NOT NULL
    UNION ALL
    SELECT g.payment_account_id, g.saldo, (g.saldo_em AT TIME ZONE 'America/Sao_Paulo')::date, 2
    FROM public.payment_account_gateway g JOIN contas c ON c.id = g.payment_account_id
    WHERE g.saldo IS NOT NULL AND g.saldo_em IS NOT NULL
  ),
  ultimo_do_mes AS (
    -- O saldo informado mais recente DENTRO do mês, por conta. Saldo de um mês
    -- anterior não é carregado adiante: desenharia uma linha reta que ninguém mediu.
    SELECT DISTINCT ON (me.mes, inf.conta) me.mes, inf.conta, inf.saldo
    FROM meses me
    JOIN informado inf ON inf.data >= me.mes AND inf.data < me.corte
    ORDER BY me.mes, inf.conta, inf.data DESC, inf.prioridade
  ),
  saldo AS (
    -- NULL = nenhuma conta informou saldo no mês: não medido, não zero.
    SELECT me.mes, SUM(u.saldo) AS informado
    FROM meses me
    LEFT JOIN ultimo_do_mes u ON u.mes = me.mes
    GROUP BY me.mes
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'mes',             v.mes,
           'vencido_receber', v.receber,
           'vencido_pagar',   v.pagar,
           'saldo_banco',     s.informado
         ) ORDER BY v.mes), '[]'::jsonb)
  INTO v_result
  FROM vencido v
  JOIN saldo s ON s.mes = v.mes;

  RETURN v_result;
END;
$fn$;

-- ── Quem executa (REGRA #7) ─────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_financial_dashboard_history(uuid, integer)     FROM anon;
REVOKE ALL ON FUNCTION public.fn_financial_dashboard_history(uuid, integer)     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_financial_dashboard_history(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
