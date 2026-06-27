-- ==========================================================================
-- Migration: settings JSONB em broker_profiles
-- Permite ao admin configurar quais abas são visíveis no portal de cada corretor.
-- A coluna é incluída automaticamente em row_to_json(v_bp) nas RPCs existentes.
-- ==========================================================================

ALTER TABLE public.broker_profiles
    ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.broker_profiles.settings IS
    'Configurações do portal do corretor. Chave brokerPortalTabs: lista de IDs de abas visíveis.';
