-- ============================================================
-- Backfill (correção): nome da contraparte dos títulos de contrato
-- OrçaCloud SaaS · Migration 20261220000010
-- Idempotente (re-executável).
--
-- A 20261220000009 corrigiu a direção, mas resolvia party_name via JOIN
-- em party_id (que é NULL p/ fornecedor por causa da FK → clients), então
-- party_name ficou nulo. Aqui o nome é resolvido DIRETO de client_id/
-- supplier_id do contrato. Rótulo segue a direção (INCOMING=CLIENT).
-- party_id continua só p/ cliente real (FK internal_txs_party_id_fkey).
-- ============================================================

WITH party AS (
  SELECT
    c.id              AS contract_id,
    c.organization_id,
    c.client_id,
    c.supplier_id,
    CASE WHEN c.direction = 'INCOMING' THEN 'CREDIT' ELSE 'DEBIT' END  AS dir,
    CASE WHEN c.direction = 'INCOMING' THEN 'CLIENT' ELSE 'SUPPLIER' END AS party_type,
    -- party_id: só cliente real (INCOMING + client_id); senão NULL (FK)
    CASE WHEN c.direction = 'INCOMING' AND c.client_id IS NOT NULL THEN c.client_id ELSE NULL END AS party_id
  FROM public.contracts c
),
party_named AS (
  SELECT p.*,
    COALESCE(cl.name, s.name) AS party_name   -- nome de QUALQUER id que exista
  FROM party p
  LEFT JOIN public.clients   cl ON cl.id = p.client_id
  LEFT JOIN public.suppliers s  ON s.id  = p.supplier_id
)
UPDATE public.internal_transactions it
SET
  direction   = pn.dir,
  party_type  = pn.party_type,
  party_id    = COALESCE(pn.party_id, it.party_id),
  party_name  = COALESCE(pn.party_name, it.party_name),
  entity_name = COALESCE(pn.party_name, it.entity_name),
  updated_at  = now()
FROM party_named pn
WHERE it.source_system IN ('CONTRACT_PARCELADO', 'CONTRACT_RECURRING', 'CONTRACT_AVISTA')
  AND it.organization_id = pn.organization_id
  AND it.reference_id LIKE pn.contract_id::text || '%'
  AND (
        it.direction   IS DISTINCT FROM pn.dir
     OR it.party_type  IS DISTINCT FROM pn.party_type
     OR (pn.party_name IS NOT NULL AND it.party_name IS DISTINCT FROM pn.party_name)
     OR (pn.party_id   IS NOT NULL AND it.party_id   IS DISTINCT FROM pn.party_id)
  );

-- FIM: 20261220000010_backfill_contract_party_name.sql
