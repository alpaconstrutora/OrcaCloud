-- migration: 20260627000006_fix_investors_rls_match_working_pattern.sql
-- A RLS anterior exigia role IN ('owner','admin') no INSERT/UPDATE. Se o membro
-- está vinculado por email (user_id NULL) ou tem role custom, o INSERT falhava
-- com 42501 (RLS violation). Alinha investors ao padrão JÁ COMPROVADO do módulo
-- Empreendimentos: helper SECURITY DEFINER com dual-check (uid OU email), sem
-- restrição de role — qualquer membro da org pode gerir investidores da org.

-- Helper: organizações do usuário atual (por uid OU email)
CREATE OR REPLACE FUNCTION public.investors_user_org_ids()
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

GRANT EXECUTE ON FUNCTION public.investors_user_org_ids() TO authenticated;

-- Remove todas as políticas antigas (nomes de todas as versões anteriores)
DROP POLICY IF EXISTS "investors_select" ON public.investors;
DROP POLICY IF EXISTS "investors_insert" ON public.investors;
DROP POLICY IF EXISTS "investors_update" ON public.investors;
DROP POLICY IF EXISTS "investors_delete" ON public.investors;
DROP POLICY IF EXISTS "Members can read their org investors" ON public.investors;
DROP POLICY IF EXISTS "Admins can create investors" ON public.investors;
DROP POLICY IF EXISTS "Admins can update their org investors" ON public.investors;
DROP POLICY IF EXISTS "Owners can delete their org investors" ON public.investors;
DROP POLICY IF EXISTS "Allow authenticated users to read investors" ON public.investors;
DROP POLICY IF EXISTS "Allow authenticated users to manage investors" ON public.investors;

-- SELECT: membros da org (ou registros globais com org NULL)
CREATE POLICY "investors_select" ON public.investors
    FOR SELECT TO authenticated
    USING (
        organization_id IS NULL
        OR organization_id IN (SELECT public.investors_user_org_ids())
    );

-- INSERT: membro da org pode criar (org precisa ser uma das do usuário)
CREATE POLICY "investors_insert" ON public.investors
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT public.investors_user_org_ids()));

-- UPDATE: membro da org pode atualizar (inclui migrar registros legados org NULL)
CREATE POLICY "investors_update" ON public.investors
    FOR UPDATE TO authenticated
    USING (
        organization_id IS NULL
        OR organization_id IN (SELECT public.investors_user_org_ids())
    )
    WITH CHECK (organization_id IN (SELECT public.investors_user_org_ids()));

-- DELETE: membro da org pode excluir
CREATE POLICY "investors_delete" ON public.investors
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT public.investors_user_org_ids()));
