-- ============================================================
-- ÒPURA Financial Analytics — Fase 2: Central de Obras (KPIs)
-- OrçaCloud SaaS · Migration 20261221000005
-- Idempotente (Regra de Ouro 10).
--
-- fn_opura_obra_kpis: consolida, para UMA obra (project_id) num
-- período, os indicadores da Categoria 6 do PRD que vêm de
-- CONTRATOS e do RAZÃO. O "Orçado" NÃO entra aqui — vive no
-- projects.budget (JSONB) e é somado no front com a fórmula
-- canônica Σ(qty·preço·(1+bdi/100)).
--
-- Contratado: contratos da obra (exclui Rascunho/Cancelado),
--   classificados em custo (OUTGOING / fornecedor) vs receita.
-- Pago/Recebido/Previsto/Vencido: razão (internal_transactions).
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_opura_obra_kpis(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_opura_obra_kpis(
  p_organization_id UUID,
  p_project_id      UUID,
  p_date_from       DATE DEFAULT NULL,
  p_date_to         DATE DEFAULT NULL
)
RETURNS TABLE (
  contratado_receita NUMERIC,
  contratado_custo   NUMERIC,
  recebido           NUMERIC,
  pago               NUMERIC,
  a_receber          NUMERIC,
  a_pagar            NUMERIC,
  vencido_receber    NUMERIC,
  vencido_pagar      NUMERIC,
  qtd_contratos      BIGINT,
  qtd_lancamentos    BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH contr AS (
    SELECT
      -- custo = saída p/ fornecedor; receita = o restante
      COALESCE(SUM(current_value) FILTER (
        WHERE direction = 'OUTGOING' OR (direction IS NULL AND supplier_id IS NOT NULL)
      ), 0) AS custo,
      COALESCE(SUM(current_value) FILTER (
        WHERE NOT (direction = 'OUTGOING' OR (direction IS NULL AND supplier_id IS NOT NULL))
      ), 0) AS receita,
      COUNT(*) AS qtd
    FROM public.contracts
    WHERE organization_id = p_organization_id
      AND project_id = p_project_id
      AND status NOT IN ('Rascunho', 'Cancelado')
  ),
  led AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'CONCILIATED'), 0) AS recebido,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'CONCILIATED'), 0) AS pago,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'PENDING'),     0) AS a_receber,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'PENDING'),     0) AS a_pagar,
      COALESCE(SUM(amount) FILTER (
        WHERE direction = 'CREDIT' AND status = 'PENDING' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      ), 0) AS venc_receber,
      COALESCE(SUM(amount) FILTER (
        WHERE direction = 'DEBIT'  AND status = 'PENDING' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      ), 0) AS venc_pagar,
      COUNT(*) AS qtd
    FROM public.internal_transactions
    WHERE organization_id = p_organization_id
      AND project_id = p_project_id
      AND status <> 'CANCELLED'
      AND (p_date_from IS NULL OR transaction_date >= p_date_from)
      AND (p_date_to   IS NULL OR transaction_date <= p_date_to)
  )
  SELECT
    contr.receita, contr.custo,
    led.recebido, led.pago, led.a_receber, led.a_pagar,
    led.venc_receber, led.venc_pagar,
    contr.qtd, led.qtd
  FROM contr, led;
$$;

COMMENT ON FUNCTION public.fn_opura_obra_kpis IS
  'ÒPURA: KPIs financeiros de uma obra (contratado via contracts + pago/recebido via razão). Orçado é somado no front a partir de projects.budget. Fase 2.';

-- ────────────────────────────────────────────────────────────
-- FIM: 20261221000005_opura_fase2_obra_kpis.sql
-- ────────────────────────────────────────────────────────────
