-- ============================================================
-- Hotfix: pgcrypto digest no Supabase fica no schema extensions.
-- A funcao calculate_area_version precisa enxergar extensions.digest.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER FUNCTION public.calculate_area_version(UUID)
    SET search_path = public, extensions;

