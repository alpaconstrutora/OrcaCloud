-- ─────────────────────────────────────────────────────────────────────────────
-- Locação: campos diretos do contrato de aluguel na tabela `contracts`
-- ─────────────────────────────────────────────────────────────────────────────
-- Vigência (start_date/end_date), reajuste (reajuste_index/data_base/proximo),
-- ciclo/vencimento (billing_cycle/due_day) JÁ existem — não recriar.
-- Caução/fiança/seguro-garantia formais ficam em `contract_guarantees`
-- (kinds CAUCAO/FIANCA/SEGURO_GARANTIA). Aqui só o que falta:
--   • guarantor_name  — fiador pessoa física (contract_guarantees.insurer não cobre PF)
--   • rescission_penalty_months — multa rescisória em nº de aluguéis
--
-- RLS herdada de `contracts` (nenhuma policy nova).
-- Aplicar MANUALMENTE no Supabase (nunca `supabase db push`). Idempotente.

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS guarantor_name TEXT;

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS rescission_penalty_months NUMERIC;
