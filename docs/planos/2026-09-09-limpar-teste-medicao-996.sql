-- Remove o teste do defeito 2 (medição 996, 09/09/2026).
-- Repare que agora dá para apagar pelo `reference_id` — antes o único caminho
-- era casar a DESCRIÇÃO, porque o espelho não carregava vínculo nenhum. É a
-- própria correção sendo usada.
BEGIN;

DELETE FROM internal_transactions
WHERE source_system = 'CONTRACT_MEASUREMENT'
  AND reference_id LIKE '%:m8b7d5bd8-73fb-4316-a4b4-246cac639781:p%';

UPDATE projects p
SET settings = jsonb_set(
        p.settings,
        '{financialInfo,transactions}',
        COALESCE((
            SELECT jsonb_agg(e)
            FROM jsonb_array_elements(p.settings->'financialInfo'->'transactions') e
            WHERE COALESCE(e->>'measurementId', '') <> '8b7d5bd8-73fb-4316-a4b4-246cac639781'
        ), '[]'::jsonb)
    )
WHERE p.id = 'a004fa6d-bf50-4424-b9d4-d6ed3f68c392';

DELETE FROM contract_measurements
WHERE id = '8b7d5bd8-73fb-4316-a4b4-246cac639781';

COMMIT;
