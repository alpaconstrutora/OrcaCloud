-- Adiciona assigned_email como campo de texto simples para atribuição no MVP.
-- O campo assigned_to (UUID) permanece para futura integração com auth.users.
ALTER TABLE public.services_opportunities
    ADD COLUMN IF NOT EXISTS assigned_email TEXT;
