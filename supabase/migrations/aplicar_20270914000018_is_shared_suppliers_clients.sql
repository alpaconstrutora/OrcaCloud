-- ==========================================================================
-- Fase 1 — `is_shared`: separar "quem é o dono" de "quem enxerga"
-- ==========================================================================
-- Plano: docs/planos/2026-08-28-organization-id-dono-explicito-e-compartilhamento.md
--
-- CONTEXTO
-- `organization_id = NULL` carrega hoje dois significados incompatíveis:
--   "compartilhado com todas as organizações"  (intencional — supplierService.ts:232,276)
--   "ninguém preencheu"                        (acidente — 7 clients, 1 partner_workspace)
-- e a policy `organization_id IS NULL OR is_org_member(...)` dá leitura E
-- ESCRITA aos dois casos, para qualquer usuário de qualquer inquilino.
--
-- O CLAUDE.md (REGRA #5) já diz que "Todas" nunca é NULL, e manda replicar por
-- organização. Em `suppliers` replicar é impossível: `suppliers_email_key` é
-- UNIQUE (email) GLOBAL, e 48 dos 119 têm e-mail. `is_shared` é o que fecha essa
-- lacuna sem replicar e sem perder a identidade única do cadastro.
--
-- ⚠️ ESTA MIGRATION É PURAMENTE ADITIVA E NÃO MUDA NADA PARA O USUÁRIO.
--    Ela só REGISTRA, num campo próprio, o que hoje está implícito no NULL.
--    Nenhuma linha muda de organização; nenhuma policy é tocada. Quem enxerga o
--    quê continua exatamente igual até a Fase 4.
--
-- ⚠️ APLICAR À MÃO — o SQL Editor executa só a seleção. NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────
-- 1. A coluna
--    `NOT NULL DEFAULT false`: registro novo nasce privado. Compartilhar é ato
--    explícito — o oposto do NULL de hoje, em que esquecer já compartilhava.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.suppliers          ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients            ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.partner_workspaces ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.suppliers.is_shared IS
  'Visível para todas as organizações, mantendo o dono em organization_id. '
  'Substitui o antigo organization_id NULL como forma de dizer "todas as '
  'organizações" — ver docs/planos/2026-08-28-organization-id-dono-explicito-e-compartilhamento.md';
COMMENT ON COLUMN public.clients.is_shared            IS 'Ver suppliers.is_shared.';
COMMENT ON COLUMN public.partner_workspaces.is_shared IS 'Ver suppliers.is_shared.';

-- ────────────────────────────────────────────────────────────
-- 2. Traduzir o significado que hoje está no NULL
--    Toda linha sem organização é, HOJE, visível para todas — então nasce
--    `is_shared = true`. É isso que garante que a Fase 2 (dar dono) não tire a
--    visibilidade de ninguém.
-- ────────────────────────────────────────────────────────────
UPDATE public.suppliers          SET is_shared = true WHERE organization_id IS NULL AND NOT is_shared;
UPDATE public.clients            SET is_shared = true WHERE organization_id IS NULL AND NOT is_shared;
UPDATE public.partner_workspaces SET is_shared = true WHERE organization_id IS NULL AND NOT is_shared;

-- ==========================================================================
-- CONFERÊNCIA
-- ==========================================================================

-- 1. Toda linha sem organização ficou marcada como compartilhada. Esperado: 0,0,0
-- SELECT 'suppliers' t, count(*) FROM public.suppliers WHERE organization_id IS NULL AND NOT is_shared
-- UNION ALL SELECT 'clients', count(*) FROM public.clients WHERE organization_id IS NULL AND NOT is_shared
-- UNION ALL SELECT 'partner_workspaces', count(*) FROM public.partner_workspaces WHERE organization_id IS NULL AND NOT is_shared;

-- 2. NADA foi atribuído ainda — as contagens de org nula têm que estar iguais
--    às de antes (suppliers 119, clients 7, partner_workspaces 1).
-- SELECT 'suppliers' t, count(*) FROM public.suppliers WHERE organization_id IS NULL
-- UNION ALL SELECT 'clients', count(*) FROM public.clients WHERE organization_id IS NULL
-- UNION ALL SELECT 'partner_workspaces', count(*) FROM public.partner_workspaces WHERE organization_id IS NULL;

-- 3. Ninguém que JÁ tinha organização foi marcado por engano. Esperado: 0,0,0
-- SELECT 'suppliers' t, count(*) FROM public.suppliers WHERE organization_id IS NOT NULL AND is_shared
-- UNION ALL SELECT 'clients', count(*) FROM public.clients WHERE organization_id IS NOT NULL AND is_shared
-- UNION ALL SELECT 'partner_workspaces', count(*) FROM public.partner_workspaces WHERE organization_id IS NOT NULL AND is_shared;

-- ==========================================================================
-- FIM: aplicar_20270914000018_is_shared_suppliers_clients.sql
-- ==========================================================================
