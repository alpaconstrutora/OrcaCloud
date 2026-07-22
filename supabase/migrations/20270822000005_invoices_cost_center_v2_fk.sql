-- Re-aponta invoices.cost_center_id da `cost_centers` antiga para `cost_centers_v2`.
SET lock_timeout = '5s';

UPDATE public.invoices SET cost_center_id = NULL WHERE cost_center_id IS NOT NULL;

DO $$
DECLARE
    v_conname text;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.invoices'::regclass
      AND contype = 'f'
      AND confrelid = 'public.cost_centers'::regclass
      AND conkey = (
          SELECT array_agg(attnum) FROM pg_attribute
          WHERE attrelid = 'public.invoices'::regclass AND attname = 'cost_center_id'
      );
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', v_conname);
    END IF;
END $$;

ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_cost_center_id_v2_fkey
    FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;

RESET lock_timeout;
