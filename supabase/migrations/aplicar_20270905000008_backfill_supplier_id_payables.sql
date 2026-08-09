-- ==========================================================================
-- Backfill de supplier_id em internal_transactions (Contas a Pagar — Credor)
-- ==========================================================================
-- CONTEXTO
-- vw_payables passou a expor `supplier_id` (aplicar_20270905000007) e o
-- client (ContasPagarParcelas.tsx) passou a resolver o Credor pelo cadastro
-- vivo de Meus Fornecedores quando essa coluna está preenchida. Os produtores
-- (contractService.ts, financialService.ts) foram corrigidos para gravar
-- `supplier_id` em lançamentos NOVOS — mas o levantamento mostrou 626
-- lançamentos DEBIT já existentes com `supplier_id` nulo:
--
--   COMMERCIAL           536   (JSONB do vault "Gestão Comercial")
--   PROJECT                37  (JSONB do projeto — aba Despesas)
--   CONTRACT_PARCELADO     37  (contracts.supplier_id via reference_id)
--   CONTRACT_AVISTA         11  (idem)
--   NFE                      3  (fora de escopo — não tem produtor mapeado)
--   MANUAL                   1  (idem)
--   PROLABORE                1  (idem)
--
-- Este script cobre os 4 primeiros grupos, que têm caminho de dado confiável
-- de volta ao fornecedor:
--   BLOCO 2 — CONTRACT_PARCELADO / CONTRACT_RECURRING / CONTRACT_AVISTA:
--     reference_id embute o id do contrato (`{contrato}`, `{contrato}:pN` ou
--     `{contrato}-p{data}`) — junta com `contracts.supplier_id`.
--   BLOCO 3 — PROJECT: reference_id = id da transação dentro do JSONB
--     `projects.settings.financialInfo.transactions[]` — lê `supplierId` de lá.
--   BLOCO 4 — COMMERCIAL: mesma forma, mas o JSONB vive no projeto-vault
--     "Gestão Comercial" da organização (o lançamento não carimba project_id).
--
-- NFE/MANUAL/PROLABORE (5 linhas) ficam de fora — volume pequeno e sem
-- produtor de supplier_id mapeado; não compensa o risco de um join errado.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR, UM BLOCO POR VEZ — NUNCA `supabase db
-- push` (ver CLAUDE.md). Rode o BLOCO 1 (preview) antes de cada UPDATE.
-- ==========================================================================

-- ═══ BLOCO 1 — preview (rode antes de cada UPDATE abaixo) ═══════════════════
SELECT 'contratos (parcelado/recorrente/avista)' AS grupo, count(*) AS candidatos
FROM public.internal_transactions it
JOIN public.contracts c
  ON c.supplier_id IS NOT NULL
 AND (
   it.reference_id = c.id::text
   OR it.reference_id LIKE c.id::text || ':%'
   OR it.reference_id LIKE c.id::text || '-%'
 )
WHERE it.direction = 'DEBIT'
  AND it.supplier_id IS NULL
  AND it.source_system IN ('CONTRACT_PARCELADO', 'CONTRACT_RECURRING', 'CONTRACT_AVISTA')

UNION ALL

SELECT 'obra (PROJECT, via JSONB da aba Despesas)', count(*)
FROM public.internal_transactions it
JOIN public.projects p ON p.id = it.project_id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.settings->'financialInfo'->'transactions', '[]'::jsonb)) AS elem
WHERE it.direction = 'DEBIT'
  AND it.supplier_id IS NULL
  AND it.source_system = 'PROJECT'
  AND elem->>'id' = it.reference_id
  AND elem->>'supplierId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

UNION ALL

SELECT 'comercial (COMMERCIAL, via JSONB do vault)', count(*)
FROM public.internal_transactions it
JOIN public.projects p
  ON p.name = 'Gestão Comercial'
 AND (p.settings->>'organizationId')::uuid = it.organization_id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.settings->'financialInfo'->'transactions', '[]'::jsonb)) AS elem
WHERE it.direction = 'DEBIT'
  AND it.supplier_id IS NULL
  AND it.source_system = 'COMMERCIAL'
  AND elem->>'id' = it.reference_id
  AND elem->>'supplierId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- ═══ BLOCO 2 — contratos (parcelado/recorrente/avista) ══════════════════════
SET lock_timeout = '5s';

UPDATE public.internal_transactions it
   SET supplier_id = c.supplier_id
FROM public.contracts c
WHERE c.supplier_id IS NOT NULL
  AND (
    it.reference_id = c.id::text
    OR it.reference_id LIKE c.id::text || ':%'
    OR it.reference_id LIKE c.id::text || '-%'
  )
  AND it.direction = 'DEBIT'
  AND it.supplier_id IS NULL
  AND it.source_system IN ('CONTRACT_PARCELADO', 'CONTRACT_RECURRING', 'CONTRACT_AVISTA');

-- ═══ BLOCO 3 — obra (PROJECT) ════════════════════════════════════════════════
SET lock_timeout = '5s';

UPDATE public.internal_transactions it
   SET supplier_id = (elem->>'supplierId')::uuid
FROM public.projects p,
     LATERAL jsonb_array_elements(COALESCE(p.settings->'financialInfo'->'transactions', '[]'::jsonb)) AS elem
WHERE p.id = it.project_id
  AND it.direction = 'DEBIT'
  AND it.supplier_id IS NULL
  AND it.source_system = 'PROJECT'
  AND elem->>'id' = it.reference_id
  AND elem->>'supplierId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- ═══ BLOCO 4 — comercial (COMMERCIAL, vault "Gestão Comercial") ═════════════
SET lock_timeout = '5s';

UPDATE public.internal_transactions it
   SET supplier_id = (elem->>'supplierId')::uuid
FROM public.projects p,
     LATERAL jsonb_array_elements(COALESCE(p.settings->'financialInfo'->'transactions', '[]'::jsonb)) AS elem
WHERE p.name = 'Gestão Comercial'
  AND (p.settings->>'organizationId')::uuid = it.organization_id
  AND it.direction = 'DEBIT'
  AND it.supplier_id IS NULL
  AND it.source_system = 'COMMERCIAL'
  AND elem->>'id' = it.reference_id
  AND elem->>'supplierId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- ==========================================================================
-- FIM: aplicar_20270905000008_backfill_supplier_id_payables.sql
-- ==========================================================================
