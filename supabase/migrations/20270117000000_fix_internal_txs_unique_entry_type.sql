-- Fix: internal_transactions_org_ref_key impede a partida dobrada (F4)
-- A constraint UNIQUE(organization_id, reference_id), criada em 20260313000005
-- (quando reference_id era 1:1 com o lançamento), passou a colidir depois que
-- 20260628000004_f4_partida_dobrada.sql começou a gravar 2 linhas por
-- reference_id (entry_type PRINCIPAL + CONTRA) para o mesmo journal_entry_id.
-- Solução: a unicidade passa a ser por (organization_id, reference_id, entry_type).

-- 1. Dedupe defensivo (mesmo critério da migration original, agora por entry_type também)
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER(
               PARTITION BY organization_id, reference_id, entry_type
               ORDER BY updated_at DESC, created_at DESC
           ) as rn
    FROM internal_transactions
    WHERE reference_id IS NOT NULL
)
DELETE FROM internal_transactions
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- 2. Trocar a constraint
ALTER TABLE internal_transactions
DROP CONSTRAINT IF EXISTS internal_transactions_org_ref_key;

ALTER TABLE internal_transactions
ADD CONSTRAINT internal_transactions_org_ref_key
UNIQUE (organization_id, reference_id, entry_type);
