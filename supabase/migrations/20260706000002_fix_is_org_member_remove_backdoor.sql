-- Migration: Corrige is_org_member (user_id preferencial + fallback email)
--            e remove backdoor admin@admin.com das políticas
-- Date: 2026-07-06
-- Problema 1: is_org_member usava apenas email do JWT; troca de email quebrava
--   acesso e e-mail reatribuído herdava acesso de outro usuário.
-- Problema 2: policies de commercial_properties e commercial_deals incluíam
--   cláusula OR LOWER(email) = 'admin@admin.com' abrindo acesso irrestrito.

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Preferência: user_id (auth.uid()) quando preenchido na tabela.
  -- Fallback: email para linhas legadas onde user_id é NULL.
  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = org_id
      AND (
        (user_id IS NOT NULL AND user_id = auth.uid())
        OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
      )
  ) THEN
    RETURN TRUE;
  END IF;

  -- Corretores (broker_profiles) não têm user_id — identificados por email.
  IF EXISTS (
    SELECT 1
    FROM public.broker_profiles
    WHERE organization_id = org_id
      AND LOWER(email) = LOWER(auth.jwt()->>'email')
      AND is_active = true
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Remove backdoor admin@admin.com de commercial_properties
DROP POLICY IF EXISTS "Enable access to organization members" ON public.commercial_properties;
CREATE POLICY "Enable access to organization members"
  ON public.commercial_properties FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Remove backdoor admin@admin.com de commercial_deals
DROP POLICY IF EXISTS "Enable access to organization members" ON public.commercial_deals;
CREATE POLICY "Enable access to organization members"
  ON public.commercial_deals FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.commercial_properties p
      WHERE p.id = commercial_deals.property_id
        AND public.is_org_member(p.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.commercial_properties p
      WHERE p.id = commercial_deals.property_id
        AND public.is_org_member(p.organization_id)
    )
  );
