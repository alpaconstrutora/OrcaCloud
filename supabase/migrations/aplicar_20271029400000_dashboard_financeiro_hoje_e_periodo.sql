-- ═══════════════════════════════════════════════════════════════════════════
-- Dashboard financeiro — "Hoje" e "Resultado do período"
-- Plano: docs/planos/2026-10-28-dashboard-financeiro-hoje-e-periodo.md (item 1)
--
-- APLICAR À MÃO:  npx supabase db query --linked -f <este arquivo>
--                 (NUNCA `supabase db push` — ver CLAUDE.md)
--
-- O que estava errado (medido em 28/10/2026):
--   • fn_financial_kpis filtrava por transaction_date dentro do período: outubro saía com
--     R$ 11 mil a receber e R$ 362 pagos, e os 95 títulos a receber vencidos (R$ 3,13 mi)
--     e os 780 a pagar vencidos da Alpa (R$ 1,83 mi) não apareciam em lugar nenhum;
--   • o "pago" do período não olhava a data do pagamento;
--   • "Top fornecedores" lia só a tabela boletos — o resto dos títulos a pagar ficava fora.
--
-- Como fica:
--   • As duas funções leem o livro ÚNICO fn_fi_ledger (o da Inteligência Financeira):
--     vencido aqui e vencido na Projeção de caixa são o mesmo número.
--   • O saldo dos bancos NÃO é recalculado aqui: vem de fn_reconciliation_dashboard
--     (aplicar_20271028800000), que decide o "saldo que o banco informa" por conta
--     (digitado, OFX ou Asaas). Só contas ATIVAS — a Asaas Sandbox desligada não pode
--     deixar o card em atenção para sempre.
--   • "Hoje" é a data de São Paulo, não a do servidor (UTC): das 21h à meia-noite o
--     CURRENT_DATE do banco já é amanhã. (fn_cashflow_position usa CURRENT_DATE; nesse
--     intervalo o vencido das duas telas pode diferir pelos títulos que vencem hoje.)
--   • Realizado no período = status CONCILIATED (o mesmo `realizado` do livro), na data
--     do PAGAMENTO; sem payment_date (276 de 520 débitos pagos), o vencimento; sem ele,
--     a data do lançamento — é o data_ref do livro.
--   • Credor = supplier_id ANTES de party_name (o nome digitado/lido por OCR). Título sem
--     nenhum dos dois NÃO entra no ranking de credores (era o 1º, com 71% do total, em
--     jul–set da Alpa): sai à parte em sem_fornecedor_valor/_qtd, para a tela pedir o cadastro.
--
-- Só leitura, SECURITY INVOKER: a RLS das tabelas vale, e fn_fi_targets recusa
-- organização de que o usuário não é membro.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Hoje ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_financial_dashboard_today(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_targets uuid[] := public.fn_fi_targets(p_organization_id);
  v_hoje    date   := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_titulos jsonb;
  v_contas  jsonb;
BEGIN
  SELECT jsonb_build_object(
    'vencido_receber',          COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'CREDIT' AND x.data_ref < v_hoje), 0),
    'vencido_receber_qtd',      COUNT(*)               FILTER (WHERE x.direction = 'CREDIT' AND x.data_ref < v_hoje),
    'vencido_receber_desde',    MIN(x.data_ref) FILTER (WHERE x.direction = 'CREDIT' AND x.data_ref < v_hoje),
    'vencido_pagar',            COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'DEBIT'  AND x.data_ref < v_hoje), 0),
    'vencido_pagar_qtd',        COUNT(*)               FILTER (WHERE x.direction = 'DEBIT'  AND x.data_ref < v_hoje),
    'vencido_pagar_desde',      MIN(x.data_ref) FILTER (WHERE x.direction = 'DEBIT'  AND x.data_ref < v_hoje),
    -- "Nos próximos N dias" = de hoje até hoje + N − 1, inclusive. 30 dias contém os 7.
    'receber_7',      COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'CREDIT' AND x.data_ref >= v_hoje AND x.data_ref < v_hoje + 7), 0),
    'receber_7_qtd',  COUNT(*)               FILTER (WHERE x.direction = 'CREDIT' AND x.data_ref >= v_hoje AND x.data_ref < v_hoje + 7),
    'pagar_7',        COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'DEBIT'  AND x.data_ref >= v_hoje AND x.data_ref < v_hoje + 7), 0),
    'pagar_7_qtd',    COUNT(*)               FILTER (WHERE x.direction = 'DEBIT'  AND x.data_ref >= v_hoje AND x.data_ref < v_hoje + 7),
    'receber_30',     COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'CREDIT' AND x.data_ref >= v_hoje AND x.data_ref < v_hoje + 30), 0),
    'receber_30_qtd', COUNT(*)               FILTER (WHERE x.direction = 'CREDIT' AND x.data_ref >= v_hoje AND x.data_ref < v_hoje + 30),
    'pagar_30',       COALESCE(SUM(x.amount) FILTER (WHERE x.direction = 'DEBIT'  AND x.data_ref >= v_hoje AND x.data_ref < v_hoje + 30), 0),
    'pagar_30_qtd',   COUNT(*)               FILTER (WHERE x.direction = 'DEBIT'  AND x.data_ref >= v_hoje AND x.data_ref < v_hoje + 30)
  )
  INTO v_titulos
  FROM public.fn_fi_ledger(v_targets) x
  WHERE x.em_aberto;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'conta_id',           a->>'account_id',
           'conta',              a->>'account_name',
           'banco',              a->>'bank_name',
           'saldo_banco',        (a->>'saldo_banco')::numeric,
           'saldo_banco_data',   a->>'saldo_banco_data',
           'saldo_banco_origem', a->>'saldo_banco_origem',
           'saldo_calculado',    (a->>'bank_balance')::numeric
         ) ORDER BY a->>'account_name'), '[]'::jsonb)
  INTO v_contas
  FROM jsonb_array_elements(public.fn_reconciliation_dashboard(p_organization_id, v_hoje)->'accounts') a
  JOIN public.payment_accounts pa ON pa.id = (a->>'account_id')::uuid
  WHERE pa.is_active;

  RETURN v_titulos || jsonb_build_object('hoje', v_hoje, 'contas', v_contas);
END;
$fn$;

-- ── 2. Período ──────────────────────────────────────────────────────────────
-- p_months_from: primeiro dia do primeiro mês do gráfico (o front decide quantos meses
-- mostrar; a série vai dele até o mês de p_date_to, todos os meses presentes, vazio = 0).
CREATE OR REPLACE FUNCTION public.fn_financial_dashboard_period(
  p_organization_id uuid,
  p_date_from       date,
  p_date_to         date,
  p_months_from     date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_targets uuid[] := public.fn_fi_targets(p_organization_id);
  v_result  jsonb;
BEGIN
  IF p_date_from IS NULL OR p_date_to IS NULL OR p_months_from IS NULL
     OR p_date_from > p_date_to OR p_months_from > p_date_to THEN
    RAISE EXCEPTION 'Período inválido';
  END IF;

  WITH livro AS (
    SELECT x.direction, x.amount, x.data_ref, x.realizado,
           COALESCE(it.payment_date, x.data_ref) AS data_pgto,
           -- NULL = sem fornecedor: é falta de cadastro, não um credor — sai do ranking
           -- e volta como linha própria (sem_fornecedor_*).
           COALESCE(NULLIF(trim(s.name), ''), NULLIF(trim(it.party_name), '')) AS credor
    FROM public.fn_fi_ledger(v_targets) x
    JOIN public.internal_transactions it ON it.id = x.id
    LEFT JOIN public.suppliers s ON s.id = it.supplier_id
  ),
  meses AS (
    SELECT m::date AS mes
    FROM generate_series(date_trunc('month', p_months_from), date_trunc('month', p_date_to), interval '1 month') m
  ),
  serie AS (
    SELECT me.mes,
           COALESCE(SUM(l.amount) FILTER (WHERE l.direction = 'CREDIT'), 0) AS recebido,
           COALESCE(SUM(l.amount) FILTER (WHERE l.direction = 'DEBIT'),  0) AS pago
    FROM meses me
    LEFT JOIN livro l
      ON l.realizado AND date_trunc('month', l.data_pgto)::date = me.mes
    GROUP BY me.mes
  ),
  a_pagar AS (
    SELECT l.credor, l.amount
    FROM livro l
    WHERE l.direction = 'DEBIT' AND l.data_ref BETWEEN p_date_from AND p_date_to
  ),
  credores AS (
    SELECT credor, SUM(amount) AS valor, COUNT(*) AS qtd
    FROM a_pagar
    WHERE credor IS NOT NULL
    GROUP BY credor
  )
  SELECT jsonb_build_object(
    'recebido',     (SELECT COALESCE(SUM(amount), 0) FROM livro WHERE realizado AND direction = 'CREDIT' AND data_pgto BETWEEN p_date_from AND p_date_to),
    'recebido_qtd', (SELECT COUNT(*)                 FROM livro WHERE realizado AND direction = 'CREDIT' AND data_pgto BETWEEN p_date_from AND p_date_to),
    'pago',         (SELECT COALESCE(SUM(amount), 0) FROM livro WHERE realizado AND direction = 'DEBIT'  AND data_pgto BETWEEN p_date_from AND p_date_to),
    'pago_qtd',     (SELECT COUNT(*)                 FROM livro WHERE realizado AND direction = 'DEBIT'  AND data_pgto BETWEEN p_date_from AND p_date_to),
    'meses',        (SELECT COALESCE(jsonb_agg(jsonb_build_object('mes', mes, 'recebido', recebido, 'pago', pago) ORDER BY mes), '[]'::jsonb) FROM serie),
    'credores',     (SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', credor, 'valor', valor, 'qtd', qtd) ORDER BY valor DESC), '[]'::jsonb)
                       FROM (SELECT * FROM credores ORDER BY valor DESC LIMIT 6) t),
    'credores_qtd',   (SELECT COUNT(*) FROM credores),
    -- Total a pagar do período, COM os títulos sem fornecedor.
    'a_pagar_total',  (SELECT COALESCE(SUM(amount), 0) FROM a_pagar),
    'sem_fornecedor_valor', (SELECT COALESCE(SUM(amount), 0) FROM a_pagar WHERE credor IS NULL),
    'sem_fornecedor_qtd',   (SELECT COUNT(*)                 FROM a_pagar WHERE credor IS NULL)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

-- ── 3. Quem executa (REGRA #7) ──────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_financial_dashboard_today(uuid)                    FROM anon;
REVOKE ALL ON FUNCTION public.fn_financial_dashboard_today(uuid)                    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_financial_dashboard_today(uuid)                TO authenticated;

REVOKE ALL ON FUNCTION public.fn_financial_dashboard_period(uuid, date, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.fn_financial_dashboard_period(uuid, date, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_financial_dashboard_period(uuid, date, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
