-- ============================================================
-- Backfill: contraparte + direção dos títulos de contrato existentes
-- OrçaCloud SaaS · Migration 20261220000009
-- Idempotente (re-executável; só corrige o que está divergente).
--
-- Corrige internal_transactions geradas por contrato (parcelado/recorrente/
-- à vista) que foram criadas com direction='DEBIT' fixo e sem party_id:
--   • direction      ← INCOMING=CREDIT, senão DEBIT
--   • party_id/type/name ← cliente (INCOMING) ou fornecedor do contrato
-- Casa pelo reference_id, que começa com o contract.id.
-- ============================================================

WITH party AS (
  SELECT
    c.id              AS contract_id,
    c.organization_id,
    CASE WHEN c.direction = 'INCOMING' THEN 'CREDIT' ELSE 'DEBIT' END AS dir,
    CASE
      WHEN c.direction = 'INCOMING' AND c.client_id IS NOT NULL THEN 'CLIENT'
      WHEN c.supplier_id IS NOT NULL                             THEN 'SUPPLIER'
      WHEN c.client_id   IS NOT NULL                             THEN 'CLIENT'
      ELSE NULL
    END AS party_type,
    CASE
      WHEN c.direction = 'INCOMING' AND c.client_id IS NOT NULL THEN c.client_id
      WHEN c.supplier_id IS NOT NULL                             THEN c.supplier_id
      ELSE c.client_id
    END AS party_id
  FROM public.contracts c
),
party_named AS (
  SELECT p.*,
    CASE
      WHEN p.party_type = 'SUPPLIER' THEN s.name
      WHEN p.party_type = 'CLIENT'   THEN cl.name
    END AS party_name
  FROM party p
  LEFT JOIN public.suppliers s ON p.party_type = 'SUPPLIER' AND s.id  = p.party_id
  LEFT JOIN public.clients   cl ON p.party_type = 'CLIENT'   AND cl.id = p.party_id
)
UPDATE public.internal_transactions it
SET
  direction   = pn.dir,
  party_id    = COALESCE(pn.party_id,   it.party_id),
  party_type  = COALESCE(pn.party_type, it.party_type),
  party_name  = COALESCE(pn.party_name, it.party_name),
  entity_name = COALESCE(pn.party_name, it.entity_name),
  updated_at  = now()
FROM party_named pn
WHERE it.source_system IN ('CONTRACT_PARCELADO', 'CONTRACT_RECURRING', 'CONTRACT_AVISTA')
  AND it.organization_id = pn.organization_id
  AND it.reference_id LIKE pn.contract_id::text || '%'
  AND (
        it.direction IS DISTINCT FROM pn.dir
     OR (pn.party_id IS NOT NULL AND it.party_id IS DISTINCT FROM pn.party_id)
  );

-- FIM: 20261220000009_backfill_contract_party_direction.sql
