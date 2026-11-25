-- Sai o marketplace público (25/11/2026).
-- Plano: docs/planos/2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace.md (F1). Pedido do usuário:
-- "Minha sugestão é exlcluir marketplace e termos apenas Oportunidades e Portal do Investidor"; na aprovação,
-- "apagar a coluna também" (organizations.slug).
--
-- Conferido no banco antes (25/11): só get_public_marketplace lê organizations.slug; só ela e
-- submit_public_interest leem investor_opportunities.no_marketplace; nenhuma view, policy ou gatilho usa as duas
-- colunas. Valores de antes do DROP e as funções inteiras: scripts/rollback-sem-marketplace.sql.

DROP FUNCTION IF EXISTS public.get_public_marketplace(text);
DROP FUNCTION IF EXISTS public.submit_public_interest(uuid, text, text, text, text, text);

ALTER TABLE public.investor_opportunities DROP COLUMN IF EXISTS no_marketplace;

-- Leva junto organizations_slug_key (UNIQUE) e idx_organizations_slug_lower.
ALTER TABLE public.organizations DROP COLUMN IF EXISTS slug;
