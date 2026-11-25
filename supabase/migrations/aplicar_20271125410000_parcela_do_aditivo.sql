-- =============================================================================
-- Parcela gerada por aditivo de prorrogação sabe de qual aditivo veio.
-- Plano: docs/planos/2026-11-25-renovacao-continua-a-serie.md
--
-- Pedido (25/11/2026, CTL-006-012-0001): a renovação por aditivo gerou parcelas
-- em datas erradas e o "Desfazer aditivo" apagava por DATA (>= início do período
-- novo) — levava junto a última parcela legítima do contrato original
-- (10/04/2019, que cobra o mês até 22/03/2019). Com a marca, desfazer apaga só as
-- do aditivo, e a aba Parcelas mostra "Aditivo AD-001" na coluna Origem.
--
-- Aditiva: 1 coluna nullable (sem reescrita da tabela), FK com SET NULL, índice
-- parcial. Nenhuma policy nem função nova.
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS contract_addendum_id uuid;

DO $$ BEGIN
    ALTER TABLE public.internal_transactions
        ADD CONSTRAINT internal_transactions_contract_addendum_fk
        FOREIGN KEY (contract_addendum_id) REFERENCES public.contract_addendums(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.internal_transactions.contract_addendum_id IS
    'Aditivo de prorrogação que gerou esta parcela (Locação › renovação por aditivo). Desfazer o aditivo apaga só as dele.';

CREATE INDEX IF NOT EXISTS idx_internal_transactions_contract_addendum
    ON public.internal_transactions (contract_addendum_id)
    WHERE contract_addendum_id IS NOT NULL;

COMMIT;

-- Fora da transação: valida a FK (a coluna nasce vazia — é instantâneo).
ALTER TABLE public.internal_transactions VALIDATE CONSTRAINT internal_transactions_contract_addendum_fk;
