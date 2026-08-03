-- Migration: electrical_drop_anon_access
-- Description: Remove o acesso anon (leitura/escrita irrestrita) criado em
-- 20270829000000_opura_projetos_eletricos_schema.sql e reprivatiza o bucket
-- de plantas elétricas. Qualquer pessoa com a anon key podia ler/editar/apagar
-- projetos elétricos de todas as organizações e baixar as plantas por URL pública.

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_projects" ON public.opura_electrical_projects;
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_versions" ON public.opura_electrical_versions;
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_plans" ON public.opura_electrical_plans;
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_rooms" ON public.opura_electrical_rooms;
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_boards" ON public.opura_electrical_boards;
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_circuits" ON public.opura_electrical_circuits;
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_points" ON public.opura_electrical_points;
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_takeoffs" ON public.opura_electrical_takeoffs;

    DROP POLICY IF EXISTS "Anon can do all on electrical plans" ON storage.objects;
END $$;

UPDATE storage.buckets
SET public = false
WHERE id = 'electrical_plans';
