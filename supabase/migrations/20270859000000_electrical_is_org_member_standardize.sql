-- Migration: electrical_is_org_member_standardize
-- Description: As 8 tabelas elétricas mais antigas (projects, versions, plans,
-- rooms, boards, circuits, points, takeoffs) ainda usavam a policy "org_access"
-- original — FOR ALL TO authenticated com subquery inline checando só e-mail
-- em organization_members. walls, elements e conduits já foram padronizados
-- para public.is_org_member(organization_id), que faz dual-check
-- user_id/e-mail e também cobre broker_profiles (corretores). Esta migration
-- estende o mesmo padrão às 8 tabelas restantes, fechando a divergência de
-- dialeto dentro do módulo elétrico.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'opura_electrical_projects',
        'opura_electrical_versions',
        'opura_electrical_plans',
        'opura_electrical_rooms',
        'opura_electrical_boards',
        'opura_electrical_circuits',
        'opura_electrical_points',
        'opura_electrical_takeoffs'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "org_access" ON public.%I', t);

        EXECUTE format(
            'CREATE POLICY "Enable read access for organization users on %s" ON public.%I FOR SELECT USING (public.is_org_member(organization_id))',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "Enable insert for organization users on %s" ON public.%I FOR INSERT WITH CHECK (public.is_org_member(organization_id))',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "Enable update for organization users on %s" ON public.%I FOR UPDATE USING (public.is_org_member(organization_id))',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "Enable delete for organization users on %s" ON public.%I FOR DELETE USING (public.is_org_member(organization_id))',
            t, t
        );
    END LOOP;
END $$;
