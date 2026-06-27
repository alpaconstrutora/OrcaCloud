-- migration: 20261228000002_fix_empreendimentos_rls_dual_check.sql
-- Corrige RLS do módulo Empreendimentos: organization_members pode ter user_id = NULL
-- (vínculo apenas por email), então checar só user_id = auth.uid() falha no INSERT.
-- Padrão correto: dual-check (user_id = auth.uid() OR email = auth.jwt()->>'email').

-- Helper: organizações do usuário atual (por uid OU email)
CREATE OR REPLACE FUNCTION public.empr_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
       OR email = auth.jwt()->>'email';
$$;

-- ── empreendimentos (raiz) ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_access_empreendimentos" ON public.empreendimentos;
CREATE POLICY "org_access_empreendimentos" ON public.empreendimentos
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.empr_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.empr_user_org_ids()));

-- ── empreendimento_towers ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_access_empr_towers" ON public.empreendimento_towers;
CREATE POLICY "org_access_empr_towers" ON public.empreendimento_towers
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.empreendimentos e
            WHERE e.id = empreendimento_towers.empreendimento_id
            AND e.organization_id IN (SELECT public.empr_user_org_ids())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.empreendimentos e
            WHERE e.id = empreendimento_towers.empreendimento_id
            AND e.organization_id IN (SELECT public.empr_user_org_ids())
        )
    );

-- ── empreendimento_units (dois hops) ─────────────────────────────────────────
DROP POLICY IF EXISTS "org_access_empr_units" ON public.empreendimento_units;
CREATE POLICY "org_access_empr_units" ON public.empreendimento_units
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.empreendimento_towers t
            JOIN public.empreendimentos e ON e.id = t.empreendimento_id
            WHERE t.id = empreendimento_units.tower_id
            AND e.organization_id IN (SELECT public.empr_user_org_ids())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.empreendimento_towers t
            JOIN public.empreendimentos e ON e.id = t.empreendimento_id
            WHERE t.id = empreendimento_units.tower_id
            AND e.organization_id IN (SELECT public.empr_user_org_ids())
        )
    );

-- ── empreendimento_common_areas ──────────────────────────────────────────────
DROP POLICY IF EXISTS "org_access_empr_common_areas" ON public.empreendimento_common_areas;
CREATE POLICY "org_access_empr_common_areas" ON public.empreendimento_common_areas
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.empreendimentos e
            WHERE e.id = empreendimento_common_areas.empreendimento_id
            AND e.organization_id IN (SELECT public.empr_user_org_ids())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.empreendimentos e
            WHERE e.id = empreendimento_common_areas.empreendimento_id
            AND e.organization_id IN (SELECT public.empr_user_org_ids())
        )
    );
