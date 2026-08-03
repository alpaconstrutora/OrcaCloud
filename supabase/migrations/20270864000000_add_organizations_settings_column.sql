-- Migration: Add settings column to organizations
-- Date: 2026-08-03
--
-- organizationService.ts / types/users.ts (Organization.settings) já leem e
-- gravam este campo (module_visibility, tax_recognition_regime) há tempo, mas
-- nenhuma migration anterior criou a coluna -- update falhava com PGRST204
-- "Could not find the 'settings' column of 'organizations' in the schema cache".

alter table organizations add column if not exists settings jsonb default '{}'::jsonb;
