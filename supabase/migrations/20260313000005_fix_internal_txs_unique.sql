-- Add UNIQUE constraint to internal_transactions to enable safe upserts
-- Created on 2026-03-13

-- 1. Remove duplicate entries before applying constraint
-- Keep only the most recently updated record for each organization_id + reference_id combination
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER(
               PARTITION BY organization_id, reference_id 
               ORDER BY updated_at DESC, created_at DESC
           ) as rn
    FROM internal_transactions
    WHERE reference_id IS NOT NULL
)
DELETE FROM internal_transactions
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- 2. Add the unique constraint
ALTER TABLE internal_transactions
ADD CONSTRAINT internal_transactions_org_ref_key 
UNIQUE (organization_id, reference_id);
