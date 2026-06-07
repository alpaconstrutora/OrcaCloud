-- Adiciona coluna slug à tabela organizations para URLs públicas do marketplace
-- Padrão: /m/:slug  (ex.: /m/alpa)
-- Date: 2026-11-09

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Índice já vem do UNIQUE; cria índice parcial para buscas case-insensitive
CREATE INDEX IF NOT EXISTS idx_organizations_slug_lower
    ON public.organizations (lower(slug))
    WHERE slug IS NOT NULL;
