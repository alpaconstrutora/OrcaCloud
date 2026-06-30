-- Vincula cargos e funcoes do RH aos departamentos da empresa.

ALTER TABLE public.org_roles
    ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.company_departments(id) ON DELETE SET NULL;

ALTER TABLE public.org_funcoes
    ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.company_departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_roles_department
    ON public.org_roles(department_id) WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_funcoes_department
    ON public.org_funcoes(department_id) WHERE department_id IS NOT NULL;

COMMENT ON COLUMN public.org_roles.department_id IS 'Departamento da empresa ao qual o cargo pertence.';
COMMENT ON COLUMN public.org_funcoes.department_id IS 'Departamento preferencial da empresa para esta funcao.';
