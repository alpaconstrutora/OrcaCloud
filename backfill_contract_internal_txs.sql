INSERT INTO internal_transactions (organization_id, source_system, reference_id, transaction_date, amount, direction, description, category, entity_name, status)
SELECT
    c.organization_id,
    'CONTRACT_PARCELADO' AS source_system,
    c.id || ':p' || arr.idx AS reference_id,
    (arr.inst->>'date')::date AS transaction_date,
    (arr.inst->>'value')::numeric AS amount,
    'DEBIT' AS direction,
    'Contrato: ' || c.title || ' - Parcela ' || arr.idx || '/' || jsonb_array_length(c.payment_schedule) AS description,
    'Mão de Obra / Serviço' AS category,
    COALESCE(s.name, 'Fornecedor') AS entity_name,
    'PENDING' AS status
FROM contracts c
CROSS JOIN LATERAL jsonb_array_elements(c.payment_schedule) WITH ORDINALITY AS arr(inst, idx)
LEFT JOIN suppliers s ON s.id = c.supplier_id
WHERE c.payment_term_type = 'Parcelado'
  AND (c.is_recurring IS NULL OR c.is_recurring = false)
  AND c.payment_schedule IS NOT NULL
  AND jsonb_array_length(c.payment_schedule) > 0
  AND c.organization_id IS NOT NULL
ON CONFLICT (organization_id, reference_id) DO UPDATE
  SET transaction_date = EXCLUDED.transaction_date,
      amount = EXCLUDED.amount,
      description = EXCLUDED.description,
      entity_name = EXCLUDED.entity_name;
