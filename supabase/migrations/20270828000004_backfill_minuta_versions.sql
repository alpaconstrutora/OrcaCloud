-- ============================================================
-- Backfill: contracts.minuta_versions (JSONB) -> contract_document_versions.
--
-- A coluna JSONB NÃO é removida: ela vira projeção read-only, reconstruída por
-- contractDocumentVersionService._syncMinutaMirror a cada escrita. O Portal do
-- Cliente lê dela (components/ClientArea.tsx:1110, filtrando
-- `v.emitted !== false`), e essa leitura continua valendo sem alteração.
--
-- Semântica legada preservada: versão SEM o campo `emitted` conta como
-- EMITIDA (era o comportamento de MinutaVersionsPanel, onde
-- `isEmitted = ver.emitted !== false`).
--
-- Idempotente: ON CONFLICT no índice (owner_type, owner_id, v).
-- ============================================================

INSERT INTO public.contract_document_versions
    (organization_id, contract_id, owner_type, owner_id, v, kind,
     name, notes, url, emitted, emitted_at, created_at)
SELECT c.organization_id,
       c.id,
       'CONTRACT',
       c.id,
       (e.value->>'v')::int,
       'MINUTA',
       NULLIF(e.value->>'name', ''),
       COALESCE(e.value->>'notes', ''),
       e.value->>'url',
       COALESCE((e.value->>'emitted')::boolean, true),
       NULLIF(e.value->>'emitted_at', '')::timestamptz,
       COALESCE(NULLIF(e.value->>'created_at', '')::timestamptz, timezone('utc', now()))
  FROM public.contracts c,
       LATERAL jsonb_array_elements(c.minuta_versions) e
 WHERE jsonb_typeof(c.minuta_versions) = 'array'
   AND e.value->>'url' IS NOT NULL
   AND (e.value->>'v') ~ '^\d+$'
ON CONFLICT (owner_type, owner_id, v) DO NOTHING;
