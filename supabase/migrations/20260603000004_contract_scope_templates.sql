CREATE TABLE IF NOT EXISTS public.contract_scope_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_scope_templates_org ON public.contract_scope_templates(organization_id);

ALTER TABLE public.contract_scope_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scope_tpl_select ON public.contract_scope_templates;
DROP POLICY IF EXISTS scope_tpl_insert ON public.contract_scope_templates;
DROP POLICY IF EXISTS scope_tpl_update ON public.contract_scope_templates;
DROP POLICY IF EXISTS scope_tpl_delete ON public.contract_scope_templates;

CREATE POLICY scope_tpl_select ON public.contract_scope_templates FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY scope_tpl_insert ON public.contract_scope_templates FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY scope_tpl_update ON public.contract_scope_templates FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY scope_tpl_delete ON public.contract_scope_templates FOR DELETE USING (public.is_org_member(organization_id));
