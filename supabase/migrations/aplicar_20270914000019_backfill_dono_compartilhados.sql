-- ==========================================================================
-- Fase 2 — dar DONO às linhas compartilhadas
-- ==========================================================================
-- Plano: docs/planos/2026-08-28-organization-id-dono-explicito-e-compartilhamento.md
-- Depende da Fase 1 (`aplicar_20270914000018`), que marcou `is_shared = true`
-- em toda linha sem organização.
--
-- O QUE MUDA E O QUE NÃO MUDA
-- Muda: as 127 linhas passam a ter dono (`organization_id`).
-- NÃO muda: elas seguem `is_shared = true`, então continuam visíveis para todas
-- as organizações. Ninguém perde acesso a nada nesta fase — a visibilidade só
-- passa a vir de um campo que diz isso, em vez de vir da AUSÊNCIA de dono.
--
-- QUEM É O DONO
-- Alpa Construtora e Incoporadora (926cf626), a organização principal do grupo:
-- já detém 109 dos fornecedores com dono, e é onde estão os cadastros que o
-- grupo mantém. Decisão registrada no plano; reversível pelo backup de ids em
-- `scratch/BACKUP_fase2_ids_org_nula.json`.
--
-- ⚠️ `code` É ZERADO ONDE COLIDE. Há índice único em
--    `(COALESCE(organization_id, uuid-zero), code)` em `suppliers` e `clients`,
--    e todas as linhas sem dono compartilham o mesmo espaço de numeração — bater
--    código com a organização de destino é coincidência esperada. Mesma
--    justificativa e mesmo precedente da migration `20270132000000`: código é
--    rótulo de numeração, não dado financeiro, e o dono renumera pela UI.
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '5s';

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. suppliers (119)
-- ────────────────────────────────────────────────────────────
UPDATE public.suppliers s
   SET organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6',
       code = CASE
                WHEN s.code IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.suppliers x
                   WHERE x.organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6'
                     AND x.code = s.code AND x.id <> s.id)
                THEN NULL ELSE s.code
              END
 WHERE s.organization_id IS NULL;

-- ────────────────────────────────────────────────────────────
-- 2. clients (7)
-- ────────────────────────────────────────────────────────────
UPDATE public.clients c
   SET organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6',
       code = CASE
                WHEN c.code IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.clients x
                   WHERE x.organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6'
                     AND x.code = c.code AND x.id <> c.id)
                THEN NULL ELSE c.code
              END
 WHERE c.organization_id IS NULL;

-- ────────────────────────────────────────────────────────────
-- 3. partner_workspaces (1)
--    Herda do fornecedor vinculado, que acabou de ganhar dono no passo 1.
-- ────────────────────────────────────────────────────────────
UPDATE public.partner_workspaces w
   SET organization_id = s.organization_id
  FROM public.suppliers s
 WHERE s.id = w.supplier_id
   AND w.organization_id IS NULL
   AND s.organization_id IS NOT NULL;

COMMIT;

-- ==========================================================================
-- CONFERÊNCIA
-- ==========================================================================

-- 1. Nenhuma linha sem dono. Esperado: 0, 0, 0
-- SELECT 'suppliers' t, count(*) FROM public.suppliers WHERE organization_id IS NULL
-- UNION ALL SELECT 'clients', count(*) FROM public.clients WHERE organization_id IS NULL
-- UNION ALL SELECT 'partner_workspaces', count(*) FROM public.partner_workspaces WHERE organization_id IS NULL;

-- 2. NINGUÉM PERDEU VISIBILIDADE — os compartilhados continuam os mesmos.
--    Esperado: 119, 7, 1 (idêntico ao de antes desta migration)
-- SELECT 'suppliers' t, count(*) FROM public.suppliers WHERE is_shared
-- UNION ALL SELECT 'clients', count(*) FROM public.clients WHERE is_shared
-- UNION ALL SELECT 'partner_workspaces', count(*) FROM public.partner_workspaces WHERE is_shared;

-- 3. Quantos códigos foram zerados (informativo — o dono renumera pela UI):
-- SELECT count(*) FROM public.suppliers WHERE is_shared AND code IS NULL;

-- ==========================================================================
-- FIM: aplicar_20270914000019_backfill_dono_compartilhados.sql
-- ==========================================================================
