-- CRM comercial OPURA - nucleo operacional do MVP

CREATE TABLE IF NOT EXISTS public.crm_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    email text,
    phone text,
    company text,
    document text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_opportunities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    title text NOT NULL,
    kind text NOT NULL DEFAULT 'VENDA_IMOVEL' CHECK (kind IN ('VENDA_IMOVEL', 'LOCACAO', 'SERVICO', 'INVESTIMENTO')),
    source text NOT NULL DEFAULT 'INTERNO' CHECK (source IN ('SITE', 'WHATSAPP', 'INDICACAO', 'CORRETOR', 'PORTAL', 'EVENTO', 'INTERNO')),
    stage_id text NOT NULL DEFAULT 'novo' CHECK (stage_id IN ('novo', 'primeiro-contato', 'qualificacao', 'visita', 'proposta', 'negociacao', 'contrato', 'ganho', 'perdido')),
    temperature text NOT NULL DEFAULT 'morno' CHECK (temperature IN ('frio', 'morno', 'quente')),
    value numeric(15,2) NOT NULL DEFAULT 0,
    property_id uuid REFERENCES public.commercial_properties(id) ON DELETE SET NULL,
    property_name text,
    building_name text,
    owner_name text,
    next_action_at timestamptz,
    loss_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
    type text NOT NULL DEFAULT 'RETORNO' CHECK (type IN ('LIGACAO', 'WHATSAPP', 'REUNIAO', 'VISITA', 'PROPOSTA', 'RETORNO')),
    title text NOT NULL,
    due_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'CONCLUIDA', 'ATRASADA')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
    version integer NOT NULL DEFAULT 1,
    value numeric(15,2) NOT NULL DEFAULT 0,
    discount_pct numeric(6,2) NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'ENVIADA', 'ACEITA', 'RECUSADA', 'VENCIDA')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (opportunity_id, version)
);

CREATE TABLE IF NOT EXISTS public.crm_timeline_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
    at timestamptz NOT NULL DEFAULT now(),
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_org ON public.crm_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_org_stage ON public.crm_opportunities(organization_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_property ON public.crm_opportunities(property_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_opp_due ON public.crm_tasks(opportunity_id, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_opp ON public.crm_proposals(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_timeline_opp_at ON public.crm_timeline_events(opportunity_id, at DESC);

CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_contacts_updated_at ON public.crm_contacts;
CREATE TRIGGER trg_crm_contacts_updated_at
    BEFORE UPDATE ON public.crm_contacts
    FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_opportunities_updated_at ON public.crm_opportunities;
CREATE TRIGGER trg_crm_opportunities_updated_at
    BEFORE UPDATE ON public.crm_opportunities
    FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_tasks_updated_at ON public.crm_tasks;
CREATE TRIGGER trg_crm_tasks_updated_at
    BEFORE UPDATE ON public.crm_tasks
    FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_proposals_updated_at ON public.crm_proposals;
CREATE TRIGGER trg_crm_proposals_updated_at
    BEFORE UPDATE ON public.crm_proposals
    FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_contacts_org_members" ON public.crm_contacts;
CREATE POLICY "crm_contacts_org_members" ON public.crm_contacts
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

DROP POLICY IF EXISTS "crm_opportunities_org_members" ON public.crm_opportunities;
CREATE POLICY "crm_opportunities_org_members" ON public.crm_opportunities
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

DROP POLICY IF EXISTS "crm_tasks_org_members" ON public.crm_tasks;
CREATE POLICY "crm_tasks_org_members" ON public.crm_tasks
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

DROP POLICY IF EXISTS "crm_proposals_org_members" ON public.crm_proposals;
CREATE POLICY "crm_proposals_org_members" ON public.crm_proposals
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

DROP POLICY IF EXISTS "crm_timeline_org_members" ON public.crm_timeline_events;
CREATE POLICY "crm_timeline_org_members" ON public.crm_timeline_events
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');