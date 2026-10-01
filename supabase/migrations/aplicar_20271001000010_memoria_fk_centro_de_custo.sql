-- ════════════════════════════════════════════════════════════════════════════
-- Memória de classificação: chave estrangeira para centro de custo.
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA db push.
--
-- Por que existe (01/10/2026): o Reprocessar da Central falhou com
--   "insert or update on table bank_transactions violates foreign key constraint
--    bank_transactions_cost_center_id_v2_fkey (23503)".
-- `reconciliation_classification_memory.cost_center_id` não tinha FK. Um centro de
-- custo foi excluído DEPOIS de a memória aprendê-lo; a memória seguiu apontando para
-- ele, e ao aplicar, o UPDATE em bank_transactions (que TEM a FK) derrubou o lote.
-- Medido antes: 16 linhas, todas da org "Altair Pereira da Rosa", todas com o mesmo
-- id excluído 3f0bd781-f6cd-459e-8106-62530f35db86.
--
-- O código já se protege (services/reconciliationMemoryService.ts › semReferenciasMortas,
-- commit 9dc47e21). Esta migration fecha a origem: limpa o que está morto e cria a FK
-- com o MESMO comportamento de bank_transactions (ON DELETE SET NULL), igual à que a
-- memória já tem para project_id.
-- ════════════════════════════════════════════════════════════════════════════

SET lock_timeout = '10s';

DO $$
DECLARE n int;
BEGIN
    UPDATE public.reconciliation_classification_memory m
       SET cost_center_id = NULL
     WHERE m.cost_center_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.cost_centers_v2 c WHERE c.id = m.cost_center_id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Memória: % centro(s) de custo excluído(s) zerado(s)', n;
END $$;

ALTER TABLE public.reconciliation_classification_memory
    ADD CONSTRAINT reconciliation_classification_memory_cost_center_id_fkey
    FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;
