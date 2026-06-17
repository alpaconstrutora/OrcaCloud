-- ============================================================
-- employee_org_shares: disponibiliza um colaborador para
-- outras organizações do mesmo grupo de usuários.
-- ============================================================

-- 1. Tabela de compartilhamentos
CREATE TABLE IF NOT EXISTS public.employee_org_shares (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   UUID NOT NULL REFERENCES public.employees(id)     ON DELETE CASCADE,
    target_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    granted_by    TEXT,                              -- email do usuário que concedeu o acesso
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (employee_id, target_org_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_org_shares_employee ON public.employee_org_shares(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_org_shares_target   ON public.employee_org_shares(target_org_id);

-- 2. RLS da tabela de compartilhamentos:
--    - pode ver/editar quem é membro da org dona do colaborador OU da org destino
ALTER TABLE public.employee_org_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_shares_select" ON public.employee_org_shares
    FOR SELECT USING (
        public.is_org_member((SELECT org_id FROM public.employees WHERE id = employee_id))
        OR public.is_org_member(target_org_id)
    );

CREATE POLICY "employee_shares_insert_delete" ON public.employee_org_shares
    FOR ALL USING (
        public.is_org_member((SELECT org_id FROM public.employees WHERE id = employee_id))
    );

-- 3. Função auxiliar SECURITY DEFINER para verificar acesso via compartilhamento
--    (evita recursão de RLS ao ser chamada dentro da policy de employees)
CREATE OR REPLACE FUNCTION public.is_employee_shared_with_user(p_employee_id uuid)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.employee_org_shares eos
        JOIN public.organization_members om ON om.organization_id = eos.target_org_id
        WHERE eos.employee_id = p_employee_id
          AND om.email = (auth.jwt() ->> 'email')
    );
END;
$$;

-- 4. Atualiza a policy de employees para incluir acesso via compartilhamento
DROP POLICY IF EXISTS "employees_org_access" ON public.employees;

CREATE POLICY "employees_org_access" ON public.employees
    FOR ALL USING (
        public.is_org_member(org_id)
        OR public.is_employee_shared_with_user(id)
    );
