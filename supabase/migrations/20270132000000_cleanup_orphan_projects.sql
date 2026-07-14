-- ============================================================
-- Limpeza dos projetos órfãos remanescentes (organization_id NULL)
-- OrçaCloud SaaS · Migration 20270132000000
--
-- Contexto: migration 20270131000000 fechou a RLS aberta de `projects` e
-- corrigiu o único órfão que já apontava para uma organização válida
-- (Galeria - Expansão). Restaram 11 projetos, todos do mesmo usuário
-- (altair.rosa@alpaconstrutora.com.br), órfãos porque a organização
-- original deles (e8688ca8-...) foi excluída.
--
-- Revisão manual pelo dono dos dados identificou 2 duplicatas (o projeto
-- "atual" já existe, recriado na organização de destino depois que a org
-- antiga sumiu) — essas ficam de fora do backfill, permanecem órfãs
-- (já inacessíveis e sem risco sob a RLS corrigida):
--   • "Galeria: Manutenção" → duplicata de "Galeria - Manutenção" (code 0131,
--     já em Alpa Construtora e Incoporadora)
--   • "Obra: Coronel Lambert" (DIÁRIO) → duplicata/obsoleto vs. os 3
--     "Coronel Lambert*" já existentes na mesma organização
--
-- Os 7 restantes são reatribuídos:
--
--   Garden Cambuhy SPE (a2c4b292-48a1-42db-9e8a-a8defbec48a0):
--     Obra: Garden, Plan: Garden
--
--   Alpa Construtora e Incoporadora (926cf626-ba49-4ee4-9f35-472822fb90e6):
--     Casa de Formação (OBRA), Casa de Formação (ORÇAMENTO, 126 itens),
--     Casa de Oração, Chácara, Plan: Casa de Formação (13 itens)
--
-- `code` (numeração interna da obra) é zerado nos projetos reatribuídos:
-- eles carregavam códigos ("001"/"002") herdados da organização antiga,
-- que colidem com códigos já em uso nas organizações de destino
-- (idx_projects_org_orcamento_code é único por organização). `code` é só
-- rótulo de numeração, não dado financeiro — o dono pode renumerar pela
-- UI depois, sem perda de conteúdo (orçamento/planejamento intactos).
--
--   Exclusão — 2 vaults "Gestão Comercial" fantasma, 100% vazios
--   (installments: [], transactions: [], totalValue: 0), duplicados,
--   presos à mesma organização excluída. São recriados automaticamente
--   por getOrCreateCommercialProject na primeira sincronização de cada
--   organização real — não há motivo para preservá-los.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Garden Cambuhy SPE
-- ────────────────────────────────────────────────────────────
UPDATE public.projects
SET organization_id = 'a2c4b292-48a1-42db-9e8a-a8defbec48a0',
    settings = jsonb_set(settings, '{organizationId}', '"a2c4b292-48a1-42db-9e8a-a8defbec48a0"'),
    code = NULL
WHERE id IN (
  '71919484-7569-4ac3-b6c4-626c0ae717a1', -- Obra: Garden
  'dba65beb-a31a-4531-9820-ccfef0191649'  -- Plan: Garden (code "001" colidia com "Gestão Comercial" 001)
);

-- ────────────────────────────────────────────────────────────
-- 2. Alpa Construtora e Incoporadora
--    (exclui "Galeria: Manutenção" e "Obra: Coronel Lambert" — duplicatas,
--    permanecem órfãs por decisão do dono dos dados)
-- ────────────────────────────────────────────────────────────
UPDATE public.projects
SET organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6',
    settings = jsonb_set(settings, '{organizationId}', '"926cf626-ba49-4ee4-9f35-472822fb90e6"'),
    code = NULL
WHERE id IN (
  'c2ff1481-0684-4fd9-804d-0a1a1a9283e3', -- Casa de Formação (OBRA) — code "002" colidia
  '173486f8-6755-41e3-a629-a0bb1a6096eb', -- Casa de Formação (ORÇAMENTO, 126 itens) — code "002" colidia
  'a8821a07-51a6-4630-8fb1-0fa7d4771efd', -- Casa de Oração — code "001" já usado 2x na org
  '23633fb0-1648-4c3d-af66-409251a930b1', -- Chácara (code já era NULL)
  '7fb05bcc-35f0-4c4a-abb1-f9c54a69668f'  -- Plan: Casa de Formação (13 itens) — code "002" colidia
);

-- ────────────────────────────────────────────────────────────
-- 3. Vaults "Gestão Comercial" fantasma — exclusão
--    Confirmado antes de aplicar: 0 parcelas, 0 transações, 0
--    lançamentos internos vinculados (n_internal_tx = 0 para ambos).
-- ────────────────────────────────────────────────────────────
DELETE FROM public.projects
WHERE id IN (
  '07beeb81-d224-4ae7-8dba-79c1541c2867',
  'e47f46d1-4656-4ea1-8854-b51e09ce3993'
)
AND organization_id IS NULL
AND name = 'Gestão Comercial'
AND coalesce(jsonb_array_length(settings->'financialInfo'->'installments'), 0) = 0
AND coalesce(jsonb_array_length(settings->'financialInfo'->'transactions'), 0) = 0;

-- ────────────────────────────────────────────────────────────
-- FIM: 20270132000000_cleanup_orphan_projects.sql
-- ────────────────────────────────────────────────────────────
