-- Re-aponta boletos.cost_center_id e boletos.sugestao_cc_id (2 colunas) da
-- `cost_centers` antiga para `cost_centers_v2`. Mesma decisão: recomeçar do
-- zero, sem migrar dados — vínculos antigos nulados.
SET lock_timeout = '5s';

UPDATE public.boletos SET cost_center_id = NULL WHERE cost_center_id IS NOT NULL;
UPDATE public.boletos SET sugestao_cc_id = NULL WHERE sugestao_cc_id IS NOT NULL;

DO $$
DECLARE
    v_conname text;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.boletos'::regclass
      AND contype = 'f'
      AND confrelid = 'public.cost_centers'::regclass
      AND conkey = (
          SELECT array_agg(attnum) FROM pg_attribute
          WHERE attrelid = 'public.boletos'::regclass AND attname = 'cost_center_id'
      );
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.boletos DROP CONSTRAINT %I', v_conname);
    END IF;

    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.boletos'::regclass
      AND contype = 'f'
      AND confrelid = 'public.cost_centers'::regclass
      AND conkey = (
          SELECT array_agg(attnum) FROM pg_attribute
          WHERE attrelid = 'public.boletos'::regclass AND attname = 'sugestao_cc_id'
      );
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.boletos DROP CONSTRAINT %I', v_conname);
    END IF;
END $$;

ALTER TABLE public.boletos
    ADD CONSTRAINT boletos_cost_center_id_v2_fkey
    FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;

ALTER TABLE public.boletos
    ADD CONSTRAINT boletos_sugestao_cc_id_v2_fkey
    FOREIGN KEY (sugestao_cc_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;

RESET lock_timeout;
