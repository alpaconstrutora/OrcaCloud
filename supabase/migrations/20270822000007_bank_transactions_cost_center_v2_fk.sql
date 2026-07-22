-- Re-aponta bank_transactions.cost_center_id da `cost_centers` antiga para
-- `cost_centers_v2`. Tabela quente (memória do projeto: "DDL em tabela
-- quente = lock_timeout < deadlock_timeout") — migration isolada, só esta
-- coluna, lock_timeout curto para falhar rápido em vez de arriscar deadlock
-- com transações concorrentes (conciliação bancária).
SET lock_timeout = '4s';

UPDATE public.bank_transactions SET cost_center_id = NULL WHERE cost_center_id IS NOT NULL;

DO $$
DECLARE
    v_conname text;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.bank_transactions'::regclass
      AND contype = 'f'
      AND confrelid = 'public.cost_centers'::regclass
      AND conkey = (
          SELECT array_agg(attnum) FROM pg_attribute
          WHERE attrelid = 'public.bank_transactions'::regclass AND attname = 'cost_center_id'
      );
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.bank_transactions DROP CONSTRAINT %I', v_conname);
    END IF;
END $$;

ALTER TABLE public.bank_transactions
    ADD CONSTRAINT bank_transactions_cost_center_id_v2_fkey
    FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;

RESET lock_timeout;
