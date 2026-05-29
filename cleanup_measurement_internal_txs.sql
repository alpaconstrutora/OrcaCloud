-- Remove internal_transactions mirror entries (source_system=PROJECT) for
-- measurement transactions that belong to parcelado contracts with payment_schedule.
-- These are identified by cross-referencing the JSONB transaction IDs.

WITH parcelado_contracts AS (
    SELECT id, organization_id
    FROM contracts
    WHERE payment_term_type = 'Parcelado'
      AND payment_schedule IS NOT NULL
      AND organization_id IS NOT NULL
),
project_measurement_tx_ids AS (
    SELECT tx->>'id' AS tx_id
    FROM projects p
    JOIN parcelado_contracts c ON (p.settings->>'organizationId') = c.organization_id::text
    CROSS JOIN LATERAL jsonb_array_elements(p.settings->'financialInfo'->'transactions') AS tx
    WHERE tx->>'measurementId' IS NOT NULL
)
DELETE FROM internal_transactions
WHERE source_system = 'PROJECT'
  AND reference_id IN (SELECT tx_id FROM project_measurement_tx_ids WHERE tx_id IS NOT NULL);
