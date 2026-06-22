-- ============================================================
-- ÒPURA Financial Analytics — Fase 2: Obra — série mensal
-- OrçaCloud SaaS · Migration 20261221000008
-- Idempotente (Regra de Ouro 10).
--
-- fn_opura_obra_mensal: série mensal de entradas/saídas (realizado e
-- previsto) de UMA obra. Alimenta "Resultado Mensal da Obra" e
-- "Fluxo de Caixa da Obra" (Categoria 6 do PRD).
-- Agrupa por mês de transaction_date; só meses com movimento.
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_opura_obra_mensal(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_opura_obra_mensal(
  p_organization_id UUID,
  p_project_id      UUID,
  p_date_from       DATE DEFAULT NULL,
  p_date_to         DATE DEFAULT NULL
)
RETURNS TABLE (
  mes            TEXT,    -- 'YYYY-MM'
  entradas       NUMERIC, -- CREDIT conciliado
  saidas         NUMERIC, -- DEBIT  conciliado
  entradas_prev  NUMERIC, -- CREDIT pendente
  saidas_prev    NUMERIC, -- DEBIT  pendente
  resultado      NUMERIC  -- entradas − saidas (realizado)
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    to_char(date_trunc('month', transaction_date), 'YYYY-MM') AS mes,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'CONCILIATED'), 0) AS entradas,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'CONCILIATED'), 0) AS saidas,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'PENDING'),     0) AS entradas_prev,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'  AND status = 'PENDING'),     0) AS saidas_prev,
    COALESCE(SUM(CASE WHEN status = 'CONCILIATED' AND direction = 'CREDIT' THEN  amount
                      WHEN status = 'CONCILIATED' AND direction = 'DEBIT'  THEN -amount ELSE 0 END), 0) AS resultado
  FROM public.internal_transactions
  WHERE organization_id = p_organization_id
    AND project_id = p_project_id
    AND status <> 'CANCELLED'
    AND (p_date_from IS NULL OR transaction_date >= p_date_from)
    AND (p_date_to   IS NULL OR transaction_date <= p_date_to)
  GROUP BY date_trunc('month', transaction_date)
  ORDER BY date_trunc('month', transaction_date);
$$;

COMMENT ON FUNCTION public.fn_opura_obra_mensal IS
  'ÒPURA: série mensal de entradas/saídas (realizado+previsto) de uma obra. Resultado Mensal / Fluxo de Caixa. Fase 2.';

-- ────────────────────────────────────────────────────────────
-- FIM: 20261221000008_opura_fase2_obra_mensal.sql
-- ────────────────────────────────────────────────────────────
