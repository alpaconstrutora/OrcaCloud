-- ============================================================
-- ÒPURA Financial Analytics — Fase 2: Central de Clientes (KPIs)
-- OrçaCloud SaaS · Migration 20261221000006
-- Idempotente (Regra de Ouro 10).
--
-- fn_opura_cliente_kpis: consolida, para UM cliente num período,
-- os indicadores da Categoria 8 do PRD.
--   • Contratado: contratos com client_id = X (exclui Rascunho/Cancelado)
--   • Faturado/Recebido/A receber/Vencido: razão filtrado por
--     party_id = X (CREDIT = recebíveis do cliente)
-- "Faturado" = total de títulos CREDIT lançados (recebido + a_receber);
-- derivado no front. Saldo devedor = a_receber em aberto.
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_opura_cliente_kpis(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_opura_cliente_kpis(
  p_organization_id UUID,
  p_client_id       UUID,
  p_date_from       DATE DEFAULT NULL,
  p_date_to         DATE DEFAULT NULL
)
RETURNS TABLE (
  contratado       NUMERIC,
  recebido         NUMERIC,
  a_receber        NUMERIC,
  vencido          NUMERIC,
  devolvido        NUMERIC,   -- DEBIT ao cliente (estornos/devoluções)
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
      AND client_id = p_client_id
      AND status NOT IN ('Rascunho', 'Cancelado')
  ),
  led AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'CONCILIATED'), 0) AS recebido,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT' AND status = 'PENDING'),     0) AS a_receber,
      COALESCE(SUM(amount) FILTER (
        WHERE direction = 'CREDIT' AND status = 'PENDING' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      ), 0) AS vencido,
      COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT' AND status = 'CONCILIATED'), 0) AS devolvido,
      COUNT(*) AS qtd
    FROM public.internal_transactions
    WHERE organization_id = p_organization_id
      AND party_id = p_client_id
      AND status <> 'CANCELLED'
      AND (p_date_from IS NULL OR transaction_date >= p_date_from)
      AND (p_date_to   IS NULL OR transaction_date <= p_date_to)
  )
  SELECT
    contr.contratado,
    led.recebido, led.a_receber, led.vencido, led.devolvido,
    contr.qtd, led.qtd
  FROM contr, led;
$$;

COMMENT ON FUNCTION public.fn_opura_cliente_kpis IS
  'ÒPURA: KPIs financeiros de um cliente (contratado via contracts.client_id + recebido/a_receber via razão party_id). Fase 2.';

-- ────────────────────────────────────────────────────────────
-- FIM: 20261221000006_opura_fase2_cliente_kpis.sql
-- ────────────────────────────────────────────────────────────
