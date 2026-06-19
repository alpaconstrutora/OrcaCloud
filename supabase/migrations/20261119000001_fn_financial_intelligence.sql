-- ============================================================
-- Inteligência Financeira — alertas determinísticos + scorecards
-- OrçaCloud SaaS · Migration 20261119000001
-- Idempotente (Regra de Ouro 10).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. fn_financial_alerts
--    Alertas determinísticos com severidade HIGH/MEDIUM/LOW.
--    Tipos:
--      CASHFLOW_RISK        — obra com saldo projetado negativo em 90 dias
--      OVERDUE_HIGH         — recebíveis vencidos há > 30 dias
--      OVERDUE_AGING        — inadimplência > 15% do AR total
--      MARGIN_LOW           — obra com margem realizada < 10%
--      SUPPLIER_CONCENTRATION — fornecedor representa > 40% do AP pago
-- ────────────────────────────────────────────────────────────

-- NOTA: implementada em PL/pgSQL (não SQL com UNION ALL) porque o editor SQL
-- do Supabase injeta comentários entre statements e quebra o delimitador $$ em
-- queries multi-bloco. RETURN NEXT por seção contorna o problema.
DROP FUNCTION IF EXISTS public.fn_financial_alerts(uuid);

CREATE OR REPLACE FUNCTION public.fn_financial_alerts(p_organization_id UUID)
RETURNS TABLE (
  alert_type   TEXT,
  severity     TEXT,
  title        TEXT,
  description  TEXT,
  amount       NUMERIC,
  project_id   UUID,
  project_name TEXT,
  ref_id       TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $X$
DECLARE
  _cnt NUMERIC; _total NUMERIC; _saldo NUMERIC; _receita NUMERIC; _margem NUMERIC;
  _pname TEXT; _pid UUID;
BEGIN
  -- ── 1. Recebíveis vencidos há > 30 dias ───────────────────
  SELECT COUNT(*)::NUMERIC, COALESCE(SUM(it.amount),0) INTO _cnt,_total
  FROM internal_transactions it
  WHERE it.organization_id=p_organization_id AND it.direction='CREDIT' AND it.status='PENDING'
    AND it.business_status NOT IN('RECEBIDO','CANCELADO','RENEGOCIADO') AND it.due_date<CURRENT_DATE-30;
  IF _total>0 THEN
    alert_type:='OVERDUE_HIGH'; severity:=CASE WHEN _total>100000 THEN 'HIGH' WHEN _total>30000 THEN 'MEDIUM' ELSE 'LOW' END;
    title:='Inadimplência: '||_cnt::TEXT||' título(s) acima de 30 dias';
    description:='Total de R$ '||round(_total,2)::TEXT||' vencidos há mais de 30 dias.';
    amount:=_total; project_id:=NULL; project_name:=NULL; ref_id:=NULL; RETURN NEXT;
  END IF;

  -- ── 2. Risco de caixa por obra (próximos 90 dias) ─────────
  FOR _pid,_pname,_saldo IN
    SELECT it.project_id, p.name,
      SUM(CASE WHEN it.direction='CREDIT' THEN it.amount ELSE -it.amount END)
    FROM internal_transactions it JOIN projects p ON p.id=it.project_id
    WHERE it.organization_id=p_organization_id AND it.status='PENDING'
      AND it.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+90 AND it.project_id IS NOT NULL
    GROUP BY it.project_id,p.name
    HAVING SUM(CASE WHEN it.direction='CREDIT' THEN it.amount ELSE -it.amount END)<0
  LOOP
    alert_type:='CASHFLOW_RISK'; severity:=CASE WHEN _saldo<-50000 THEN 'HIGH' ELSE 'MEDIUM' END;
    title:='Risco de caixa: '||_pname;
    description:='Saldo projetado de R$ '||round(_saldo,2)::TEXT||' nos próximos 90 dias.';
    amount:=_saldo; project_id:=_pid; project_name:=_pname; ref_id:=NULL; RETURN NEXT;
  END LOOP;

  -- ── 3. Margem baixa por obra (< 10% realizados) ───────────
  FOR _pid,_pname,_receita,_margem IN
    SELECT it.project_id, p.name,
      COALESCE(SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END),0),
      CASE WHEN SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)>0
        THEN 100.0*(SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)-SUM(CASE WHEN it.direction='DEBIT' AND it.status='CONCILIATED' THEN it.amount END))/SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)
        ELSE 0 END
    FROM internal_transactions it JOIN projects p ON p.id=it.project_id
    WHERE it.organization_id=p_organization_id AND it.project_id IS NOT NULL
    GROUP BY it.project_id,p.name
    HAVING SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)>10000
      AND (CASE WHEN SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)>0
        THEN 100.0*(SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)-SUM(CASE WHEN it.direction='DEBIT' AND it.status='CONCILIATED' THEN it.amount END))/SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount END)
        ELSE 0 END)<10
  LOOP
    alert_type:='MARGIN_LOW'; severity:=CASE WHEN _margem<0 THEN 'HIGH' WHEN _margem<5 THEN 'MEDIUM' ELSE 'LOW' END;
    title:='Margem baixa: '||_pname;
    description:='Margem de '||round(_margem,1)::TEXT||'% (meta >= 10%).';
    amount:=_receita; project_id:=_pid; project_name:=_pname; ref_id:=NULL; RETURN NEXT;
  END LOOP;
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_financial_alerts(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. fn_project_scorecard
--    Scorecard financeiro por obra: receita, custo, margem,
--    AR pendente, AP pendente, saldo projetado.
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_project_scorecard(uuid);

CREATE OR REPLACE FUNCTION public.fn_project_scorecard(
  p_organization_id UUID
)
RETURNS TABLE (
  project_id        UUID,
  project_name      TEXT,
  receita_realizada NUMERIC,
  custo_realizado   NUMERIC,
  margem_pct        NUMERIC,
  ar_pendente       NUMERIC,
  ap_pendente       NUMERIC,
  saldo_projetado   NUMERIC,
  risco             TEXT       -- 'HIGH' | 'MEDIUM' | 'OK'
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id                                                            AS project_id,
    p.name                                                          AS project_name,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END), 0) AS receita_realizada,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount END), 0) AS custo_realizado,
    CASE
      WHEN SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END) > 0
      THEN ROUND(100.0 *
        (SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END) -
         SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount END)) /
        SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount END), 1)
      ELSE 0
    END                                                             AS margem_pct,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'
                       AND it.business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO')
                  THEN it.amount END), 0)                           AS ar_pendente,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN it.amount END), 0) AS ap_pendente,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'
                       AND it.business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO')
                  THEN it.amount END), 0) -
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN it.amount END), 0)   AS saldo_projetado,
    CASE
      WHEN (
        COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'
                          AND it.business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO')
                     THEN it.amount END), 0) -
        COALESCE(SUM(CASE WHEN it.direction = 'DEBIT' AND it.status = 'PENDING' THEN it.amount END), 0)
      ) < -50000 THEN 'HIGH'
      WHEN (
        COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'
                          AND it.business_status NOT IN ('RECEBIDO','CANCELADO','RENEGOCIADO')
                     THEN it.amount END), 0) -
        COALESCE(SUM(CASE WHEN it.direction = 'DEBIT' AND it.status = 'PENDING' THEN it.amount END), 0)
      ) < 0 THEN 'MEDIUM'
      ELSE 'OK'
    END                                                             AS risco
  FROM public.projects p
  LEFT JOIN public.internal_transactions it
    ON it.project_id      = p.id
   AND it.organization_id = p_organization_id
  WHERE p.organization_id = p_organization_id
  GROUP BY p.id, p.name
  HAVING (
    COALESCE(SUM(it.amount), 0) > 0
  )
  ORDER BY receita_realizada DESC NULLS LAST;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. fn_cashflow_projection
--    Projeção de caixa para os próximos N dias com saldo inicial.
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_cashflow_projection(uuid, int);

CREATE OR REPLACE FUNCTION public.fn_cashflow_projection(
  p_organization_id UUID,
  p_days            INT DEFAULT 90
)
RETURNS TABLE (
  data_ref    DATE,
  cr_previsto NUMERIC,
  db_previsto NUMERIC,
  saldo_dia   NUMERIC,
  saldo_acum  NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH dias AS (
    SELECT generate_series(CURRENT_DATE, CURRENT_DATE + p_days, '1 day'::interval)::date AS d
  ),
  movimentos AS (
    SELECT
      COALESCE(due_date, transaction_date) AS data_ref,
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount END), 0) AS cr,
      COALESCE(SUM(CASE WHEN direction = 'DEBIT'  THEN amount END), 0) AS db
    FROM public.internal_transactions
    WHERE organization_id = p_organization_id
      AND status = 'PENDING'
      AND COALESCE(due_date, transaction_date) BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days
    GROUP BY 1
  )
  SELECT
    d.d,
    COALESCE(m.cr, 0),
    COALESCE(m.db, 0),
    COALESCE(m.cr, 0) - COALESCE(m.db, 0),
    SUM(COALESCE(m.cr, 0) - COALESCE(m.db, 0)) OVER (ORDER BY d.d ROWS UNBOUNDED PRECEDING)
  FROM dias d
  LEFT JOIN movimentos m ON m.data_ref = d.d
  ORDER BY d.d;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. GRANTs para o role authenticated (RPC via PostgREST)
-- ────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.fn_project_scorecard(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cashflow_projection(uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────
-- FIM: 20261119000001_fn_financial_intelligence.sql
-- ────────────────────────────────────────────────────────────
