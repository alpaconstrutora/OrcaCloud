-- ============================================================
-- Entidade "Função" reutilizável (PRD 5.2)
-- Uma Função (o que a pessoa faz) pode ser compartilhada por
-- vários Cargos (posições formais). Ex: Função "Pedreiro" →
-- Cargos "Pedreiro Jr", "Pedreiro Pleno", "Pedreiro Sênior".
-- ============================================================

CREATE TABLE IF NOT EXISTS public.org_funcoes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nome        TEXT NOT NULL,
    descricao   TEXT,
    categoria   TEXT NOT NULL DEFAULT 'operacional'
                CHECK (categoria IN ('operacional','tecnica','administrativa','gerencial','comercial')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_funcoes_company_nome
    ON public.org_funcoes(company_id, nome);

CREATE INDEX IF NOT EXISTS idx_org_funcoes_company
    ON public.org_funcoes(company_id);

-- Cargo pode referenciar uma Função (opcional)
ALTER TABLE public.org_roles
    ADD COLUMN IF NOT EXISTS funcao_id UUID REFERENCES public.org_funcoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_roles_funcao
    ON public.org_roles(funcao_id) WHERE funcao_id IS NOT NULL;

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE public.org_funcoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_funcoes_select" ON public.org_funcoes;
CREATE POLICY "org_funcoes_select" ON public.org_funcoes
    FOR SELECT TO authenticated
    USING (
        company_id IN (
            SELECT c.id FROM public.companies c
            WHERE public.is_org_member(c.org_id)
        )
    );

DROP POLICY IF EXISTS "org_funcoes_insert" ON public.org_funcoes;
CREATE POLICY "org_funcoes_insert" ON public.org_funcoes
    FOR INSERT TO authenticated
    WITH CHECK (
        company_id IN (
            SELECT c.id FROM public.companies c
            WHERE public.is_org_member(c.org_id)
        )
    );

DROP POLICY IF EXISTS "org_funcoes_update" ON public.org_funcoes;
CREATE POLICY "org_funcoes_update" ON public.org_funcoes
    FOR UPDATE TO authenticated
    USING (
        company_id IN (
            SELECT c.id FROM public.companies c
            WHERE public.is_org_member(c.org_id)
        )
    )
    WITH CHECK (
        company_id IN (
            SELECT c.id FROM public.companies c
            WHERE public.is_org_member(c.org_id)
        )
    );

DROP POLICY IF EXISTS "org_funcoes_delete" ON public.org_funcoes;
CREATE POLICY "org_funcoes_delete" ON public.org_funcoes
    FOR DELETE TO authenticated
    USING (
        company_id IN (
            SELECT c.id FROM public.companies c
            WHERE public.is_org_member(c.org_id)
        )
    );
