-- ============================================================
-- ÒPURA · Central de Clientes — "Contratado" de contrato RECORRENTE
-- OrçaCloud SaaS · Migration 20271028900000
-- Idempotente: CREATE OR REPLACE na MESMA assinatura de
-- aplicar_20270921000020 (uuid, uuid, date, date, uuid[]) — sem sobrecarga.
--
-- Pedido do usuário (2026-10-28, Central de Clientes):
--   "O contrato do Reginaldo está com R$ 1.000, mas tem R$ 12.000 faturados" — corrigir.
--
-- Diagnóstico (leitura no banco, 28/10/2026): o dado está certo. CTL-010-0001 é
-- locação mensal, 36 parcelas de R$ 1.000 (36 títulos, R$ 36.000). Em contrato
-- recorrente `current_value` é a PARCELA (memória project_locacao_valor_parcela_vs_total;
-- `syncRecurringToFinance` grava esse número em cada lançamento), e o KPI somava
-- `current_value` como se fosse o total — o locatário aparecia com "Contratado
-- R$ 1.000" e "Faturado R$ 12.000".
--
-- Correção: recorrente conta parcela × nº de parcelas (`payment_installments`);
-- sem parcelas informadas fica a parcela (comportamento anterior). Conferido nos
-- 8 recorrentes que a Central soma: bate com a soma dos títulos em 5, diferença
-- pequena em 2 (Dynamis 54.000 × 52.000; Ivana 26.400 × 25.800). A Defensoria
-- (CTL-010-0002) tem ciclo "Anual" com 1 parcela e 60 títulos mensais de R$ 3.000 —
-- o CADASTRO é incoerente; fica R$ 3.000 até o cadastro ser corrigido.
--
-- Fonte da verdade copiada de aplicar_20270921000020 (não transcrita do banco:
-- a definição lida de lá vem com acentos corrompidos). Diferença = só `contratado`.
--
-- REGRA #7: REVOKE PUBLIC/anon + GRANT authenticated; SECURITY INVOKER.
--
-- ⚠️ APLICAR COM `npx supabase db query --linked -f` — NUNCA `db push`.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_opura_cliente_kpis(
  p_organization_id UUID,
  p_client_id       UUID DEFAULT NULL,
  p_date_from       DATE DEFAULT NULL,
  p_date_to         DATE DEFAULT NULL,
  p_client_ids      UUID[] DEFAULT NULL
)
RETURNS TABLE (
  contratado       NUMERIC,
  recebido         NUMERIC,
  a_receber        NUMERIC,
  vencido          NUMERIC,
  devolvido        NUMERIC,
  qtd_contratos    BIGINT,
  qtd_lancamentos  BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH contr AS (
    SELECT
      -- Recorrente: current_value é a PARCELA → total = parcela × nº de parcelas.
      COALESCE(SUM(
        CASE WHEN is_recurring
             THEN current_value * GREATEST(COALESCE(payment_installments, 1), 1)
             ELSE current_value
        END
      ), 0) AS contratado,
      COUNT(*) AS qtd
    FROM public.contracts
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND (p_client_id  IS NULL OR client_id = p_client_id)
      AND (p_client_ids IS NULL OR client_id = ANY(p_client_ids))
      -- sem cliente informado NÃO devolve a organização inteira por acidente
      AND (p_client_id IS NOT NULL OR p_client_ids IS NOT NULL)
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
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND (p_client_id  IS NULL OR party_id = p_client_id)
      AND (p_client_ids IS NULL OR party_id = ANY(p_client_ids))
      AND (p_client_id IS NOT NULL OR p_client_ids IS NOT NULL)
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

REVOKE EXECUTE ON FUNCTION public.fn_opura_cliente_kpis(uuid, uuid, date, date, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_opura_cliente_kpis(uuid, uuid, date, date, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- FIM: aplicar_20271028900000_opura_cliente_kpis_contratado_recorrente.sql
