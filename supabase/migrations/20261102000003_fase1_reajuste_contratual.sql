-- =============================================================================
-- Fase 1.3 — Reajuste contratual por índice
-- =============================================================================
-- Hoje reajuste_index existe mas é só exibição. Esta migration adiciona
-- as colunas de controle para o motor de reajuste:
--   reajuste_data_base  → data do índice de referência (base do cálculo)
--   reajuste_proximo    → quando o próximo reajuste é devido
-- O valor atual (current_value) é atualizado pelo service ao aplicar.
-- =============================================================================

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS reajuste_data_base DATE,
  ADD COLUMN IF NOT EXISTS reajuste_proximo   DATE;

COMMENT ON COLUMN public.contracts.reajuste_data_base IS
  'Data-base do índice de reajuste (ex: data de assinatura do contrato). Usada como denominador na fórmula: novo_valor = current_value × (índice_hoje / índice_base).';

COMMENT ON COLUMN public.contracts.reajuste_proximo IS
  'Data em que o próximo reajuste é devido. Pode ser verificada por scheduler mensal.';
