-- ==========================================================================
-- Migration: settings JSONB em suppliers
-- Permite ao admin configurar quais abas são visíveis no portal de cada
-- fornecedor, espelhando broker_profiles.settings.brokerPortalTabs
-- (20260627000004_broker_portal_tab_settings.sql). A coluna é incluída
-- automaticamente em row_to_json(v_sup) nas RPCs de supplier_portal_tokens
-- (20270822000017), então o link público reflete a config sem mudança de SQL.
-- ==========================================================================

-- ADD COLUMN com DEFAULT é metadata-only no PG11+ (não reescreve a tabela),
-- mas ainda pega AccessExclusiveLock. suppliers tem muitas FKs apontando pra
-- ela; lock_timeout faz falhar rápido e limpo em vez de esperar o deadlock
-- detector (mesmo padrão de 20261220000004 e 20270716000004). Reexecutar é
-- seguro — IF NOT EXISTS.
SET lock_timeout = '4s';

ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.suppliers.settings IS
    'Configurações do portal do fornecedor. Chave supplierPortalTabs: lista de IDs de abas visíveis.';
