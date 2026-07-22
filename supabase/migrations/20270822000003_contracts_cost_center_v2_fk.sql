-- Re-aponta contracts.cost_center_id da `cost_centers` antiga para a nova
-- `cost_centers_v2` (módulo dedicado "Centro de Custo"). Decisão com o
-- usuário: recomeçar do zero, sem migrar dados — os vínculos antigos são
-- nulados aqui (refeitos manualmente pelo usuário na tela nova).
--
-- lock_timeout curto: se colidir com uma transação em andamento, falha rápido
-- (55P03) em vez de segurar lock e arriscar deadlock — mesmo padrão de
-- 20270716000004_opura_tts_regime.sql. Repita a migration se falhar.
SET lock_timeout = '5s';

UPDATE public.contracts SET cost_center_id = NULL WHERE cost_center_id IS NOT NULL;

DO $$
DECLARE
    v_conname text;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.contracts'::regclass
      AND contype = 'f'
      AND confrelid = 'public.cost_centers'::regclass
      AND conkey = (
          SELECT array_agg(attnum) FROM pg_attribute
          WHERE attrelid = 'public.contracts'::regclass AND attname = 'cost_center_id'
      );
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.contracts DROP CONSTRAINT %I', v_conname);
    END IF;
END $$;

ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_cost_center_id_v2_fkey
    FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;

RESET lock_timeout;
