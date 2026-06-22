-- ============================================================
-- ÒPURA Financial Analytics — Fase 2: Central de Fornecedores (KPIs)
-- OrçaCloud SaaS · Migration 20261221000007
-- Idempotente (Regra de Ouro 10).
--
-- fn_opura_fornecedor_kpis: consolida, para UM fornecedor num
-- período, os indicadores da Categoria 7 do PRD.
--   • Contratado: contratos com supplier_id = X (exclui Rascunho/Cancelado)
--   • Pago/A pagar/Vencido: razão filtrado por supplier_id = X
--     (DEBIT = pagáveis ao fornecedor)
-- Saldo aberto = a_pagar. NOTA: supplier_id no razão é esparso nesta
-- base (LABOR/PROJECT/comissões não carregam FK p/ suppliers) — a
-- função está correta; faltam dados de origem.
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_opura_fornecedor_kpis(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_opura_fornecedor_kpis(
  p_organization_id UUID,
  p_supplier_id     UUID,
  p_date_from       DATE DEFAULT NULL,
  p_date_to         DATE DEFAULT NULL
)
RETURNS TABLE (
  contratado       NUMERIC,
  pago             NUMERIC,
  a_pagar          NUMERIC,
  vencido          NUMERIC,
  estornado        NUMERIC,   -- CREDIT do fornecedor (estornos/créditos)
  qtd_contratos    BIGINT,
  qtd_lancamentos  BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH contr AS (
    SELECT
      COALESCE(SUM(current_value), 0) AS contratado,
      COUNT(*) AS qtd
    FROM public.contracts
    WHERE organization_id = p_organization_id
      AND supplier_id = p_supplier_id
      AND status NOT IN ('Rascunho', 'Cancelado')
  ),
  led AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'CONCILIATED'), 0) AS pago,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'PENDING'),     0) AS a_pagar,
      COALESCE(SUM(amount) FILTER (
        WHERE direction = 'DEBIT' AND status = 'PENDING' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      ), 0) AS vencido,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'CONCILIATED'), 0) AS estornado,
      COUNT(*) AS qtd
    FROM public.internal_transactions
    WHERE organization_id = p_organization_id
      AND supplier_id = p_supplier_id
      AND status <> 'CANCELLED'
      AND (p_date_from IS NULL OR transaction_date >= p_date_from)
      AND (p_date_to   IS NULL OR transaction_date <= p_date_to)
  )
  SELECT
    contr.contratado,
    led.pago, led.a_pagar, led.vencido, led.estornado,
    contr.qtd, led.qtd
  FROM contr, led;
$$;

COMMENT ON FUNCTION public.fn_opura_fornecedor_kpis IS
  'ÒPURA: KPIs financeiros de um fornecedor (contratado via contracts.supplier_id + pago/a_pagar via razão supplier_id). Fase 2.';

-- ────────────────────────────────────────────────────────────
-- FIM: 20261221000007_opura_fase2_fornecedor_kpis.sql
-- ────────────────────────────────────────────────────────────
