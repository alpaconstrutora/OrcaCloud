-- Remove TUDO que o teste de 09/09/2026 criou (aba Financeiro do Portal de Parceiros).
-- Alvos, todos nomeados explicitamente:
--   medição 6bacbb6d-27a4-4f1b-8496-a8056012a75d (nº 999, contrato Nº 010)
--   as 24 internal_transactions que a aprovação gerou
--   as 24 entradas espelhadas em projects.settings.financialInfo.transactions
BEGIN;

DELETE FROM internal_transactions
WHERE description LIKE '%Medição #999%'
  AND project_id = 'a004fa6d-bf50-4424-b9d4-d6ed3f68c392';

UPDATE projects p
SET settings = jsonb_set(
        p.settings,
        '{financialInfo,transactions}',
        COALESCE((
            SELECT jsonb_agg(e)
            FROM jsonb_array_elements(p.settings->'financialInfo'->'transactions') e
            WHERE COALESCE(e->>'measurementId', '') <> '6bacbb6d-27a4-4f1b-8496-a8056012a75d'
        ), '[]'::jsonb)
    )
WHERE p.id = 'a004fa6d-bf50-4424-b9d4-d6ed3f68c392';

DELETE FROM contract_measurements
WHERE id = '6bacbb6d-27a4-4f1b-8496-a8056012a75d';

COMMIT;
