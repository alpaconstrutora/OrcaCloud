-- Re-aponta internal_transactions.cost_center_id da `cost_centers` antiga
-- para `cost_centers_v2`. A MAIS quente de todas as tabelas envolvidas nesta
-- rota (DRE por obra, OPURA analytics, todo lançamento financeiro) — por isso
-- aplicada por último, sozinha, depois de contracts/boletos/invoices/
-- fpa_budgets/bank_transactions já terem passado. lock_timeout curto: se
-- houver contenção, a migration falha rápido (55P03) e pode ser reexecutada
-- fora do horário de pico, em vez de arriscar deadlock.
SET lock_timeout = '4s';

UPDATE public.internal_transactions SET cost_center_id = NULL WHERE cost_center_id IS NOT NULL;

DO $$
DECLARE
    v_conname text;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.internal_transactions'::regclass
      AND contype = 'f'
      AND confrelid = 'public.cost_centers'::regclass
      AND conkey = (
          SELECT array_agg(attnum) FROM pg_attribute
          WHERE attrelid = 'public.internal_transactions'::regclass AND attname = 'cost_center_id'
      );
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.internal_transactions DROP CONSTRAINT %I', v_conname);
    END IF;
END $$;

ALTER TABLE public.internal_transactions
    ADD CONSTRAINT internal_transactions_cost_center_id_v2_fkey
    FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;

RESET lock_timeout;
