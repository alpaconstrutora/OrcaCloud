-- Tabela dedicada de contratantes em contratos de serviço (OUTGOING)
-- Separada da tabela 'clients' (compradores CRM) e 'suppliers' (fornecedores)
CREATE TABLE IF NOT EXISTS public.service_clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    document        TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    contact_name    TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_clients_org ON public.service_clients(organization_id);

ALTER TABLE public.service_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_clients_select ON public.service_clients;
DROP POLICY IF EXISTS service_clients_insert ON public.service_clients;
DROP POLICY IF EXISTS service_clients_update ON public.service_clients;
DROP POLICY IF EXISTS service_clients_delete ON public.service_clients;

CREATE POLICY service_clients_select ON public.service_clients FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY service_clients_insert ON public.service_clients FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY service_clients_update ON public.service_clients FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY service_clients_delete ON public.service_clients FOR DELETE USING (public.is_org_member(organization_id));
