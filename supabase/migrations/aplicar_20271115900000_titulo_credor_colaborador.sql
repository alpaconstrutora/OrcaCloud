-- Credor colaborador no título a pagar (15/11/2026).
-- Plano: docs/planos/2026-11-15-credor-colaborador-no-financeiro.md (item 1).
--
-- Em Financeiro o credor de um título a pagar pode ser fornecedor OU colaborador.
-- `supplier_id` é FK de suppliers e `party_id` é FK só de clients
-- (internal_txs_party_id_fkey) — não havia onde guardar o colaborador, e o
-- Pagamento Avulso só oferecia fornecedor. Esta coluna é o vínculo; o nome
-- continua em party_name (é o que as listas mostram).
--
-- Sem backfill de propósito: os títulos da folha já resolvem o colaborador pelo
-- reference_id (utils/pixDestino.ts › colaboradorDoTituloDaFolha), e UPDATE em
-- título de mês fechado esbarraria nos gatilhos de período/alçada.
--
-- Sem policy nem função nova (REGRA #7 não se aplica): a RLS de
-- internal_transactions (por organização) continua valendo.
-- Aplicar com: npx supabase db query --linked -f <este arquivo>  (nunca db push)

ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS employee_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'internal_transactions_employee_id_fkey') THEN
        ALTER TABLE public.internal_transactions
            ADD CONSTRAINT internal_transactions_employee_id_fkey
            FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
    END IF;
    -- Um credor só: fornecedor OU colaborador.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'internal_transactions_credor_unico_chk') THEN
        ALTER TABLE public.internal_transactions
            ADD CONSTRAINT internal_transactions_credor_unico_chk
            CHECK (supplier_id IS NULL OR employee_id IS NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_internal_transactions_employee_id
    ON public.internal_transactions (employee_id)
    WHERE employee_id IS NOT NULL;

COMMENT ON COLUMN public.internal_transactions.employee_id IS
    'Credor colaborador do título a pagar (excludente com supplier_id). Folha resolve pelo reference_id.';
