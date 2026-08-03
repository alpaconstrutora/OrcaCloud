-- Migration: electrical_conduits_is_org_member
-- Description: opura_electrical_conduits usava uma policy "org_access" com
-- subquery inline (organization_members.email = auth.jwt()->>'email'), o
-- mesmo dialeto legado das tabelas elétricas mais antigas — só checa e-mail,
-- sem fallback por user_id. As tabelas mais novas do módulo (walls, elements)
-- já usam public.is_org_member(organization_id), que checa user_id com
-- fallback de e-mail e também cobre broker_profiles. Alinha conduits a esse
-- padrão mais novo e mais robusto.

DROP POLICY IF EXISTS "org_access" ON public.opura_electrical_conduits;

CREATE POLICY "Enable read access for organization users on opura_electrical_conduits"
    ON public.opura_electrical_conduits FOR SELECT
    USING (public.is_org_member(organization_id));

CREATE POLICY "Enable insert for organization users on opura_electrical_conduits"
    ON public.opura_electrical_conduits FOR INSERT
    WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Enable update for organization users on opura_electrical_conduits"
    ON public.opura_electrical_conduits FOR UPDATE
    USING (public.is_org_member(organization_id));

CREATE POLICY "Enable delete for organization users on opura_electrical_conduits"
    ON public.opura_electrical_conduits FOR DELETE
    USING (public.is_org_member(organization_id));
