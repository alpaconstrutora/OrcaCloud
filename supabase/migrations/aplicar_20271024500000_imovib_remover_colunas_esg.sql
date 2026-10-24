-- ============================================================================
-- Remove de imovib_studies as colunas da aba "ESG e Parecer", que saiu do app
-- em 24/10/2026 (PR #130, main ee73430c). Plano:
-- docs/planos/2026-10-24-imovib-largura-das-abas-e-remover-esg.md.
--
-- A pedido do usuário ("apagar"), sem cópia: os valores eram só os padrões.
-- Estado no banco em 2026-10-24, antes de apagar (3 estudos):
--   esg_environmental/social/governance_score = 3 · 3 · 3 (padrão) em todos;
--   esg_certifications = [] · esg_notes e committee_notes nulos ·
--   committee_decision = 'draft' em todos;
--   esg_initiatives: [] em 2 estudos e a lista padrão de 5 iniciativas, todas
--   INATIVAS (custo ativo 0), no Bruninho.
-- Levantamento de dependências: nenhuma view, função, gatilho, CHECK, policy
-- ou índice usa estas colunas.
--
-- PRÉ-REQUISITO: o código que não lê estas colunas estar NO AR (ee73430c) —
-- o motor lia esg_initiatives e a listagem pedia a coluna no select (42703).
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — nunca db push.
-- ============================================================================

BEGIN;

ALTER TABLE public.imovib_studies
    DROP COLUMN IF EXISTS esg_environmental_score,
    DROP COLUMN IF EXISTS esg_social_score,
    DROP COLUMN IF EXISTS esg_governance_score,
    DROP COLUMN IF EXISTS esg_certifications,
    DROP COLUMN IF EXISTS esg_initiatives,
    DROP COLUMN IF EXISTS esg_notes,
    DROP COLUMN IF EXISTS committee_decision,
    DROP COLUMN IF EXISTS committee_notes;

COMMIT;
