-- Chamada de capital como workflow formal (emissão + cobrança por sócio/cota)
-- Complementa spe_partners.capital_calls_total/capital_paid (mantidos como totalizadores
-- de leitura rápida; a fonte de verdade granular passa a ser esta tabela).
-- Date: 2027-07-16

CREATE TABLE IF NOT EXISTS public.capital_calls (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    spe_entity_id       uuid NOT NULL REFERENCES public.spe_entities(id) ON DELETE CASCADE,
    title               text NOT NULL,
    description         text,
    total_amount        numeric NOT NULL,
    issue_date          date NOT NULL DEFAULT CURRENT_DATE,
    due_date            date NOT NULL,
    status              text NOT NULL DEFAULT 'aberta'
                        CHECK (status IN ('aberta', 'parcialmente_paga', 'paga', 'cancelada')),
    created_by_email    text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.capital_call_items (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    capital_call_id     uuid NOT NULL REFERENCES public.capital_calls(id) ON DELETE CASCADE,
    spe_partner_id      uuid NOT NULL REFERENCES public.spe_partners(id) ON DELETE CASCADE,
    amount_due          numeric NOT NULL,
    amount_paid         numeric NOT NULL DEFAULT 0,
    status              text NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente', 'parcial', 'pago', 'atrasado')),
    paid_at             timestamptz,
    payment_reference   text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (capital_call_id, spe_partner_id)
);

ALTER TABLE public.capital_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_call_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read capital calls" ON public.capital_calls
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Admins can manage capital calls" ON public.capital_calls
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

CREATE POLICY "Members can read capital call items" ON public.capital_call_items
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Admins can manage capital call items" ON public.capital_call_items
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

CREATE INDEX IF NOT EXISTS idx_capital_calls_org ON public.capital_calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_capital_calls_spe ON public.capital_calls(spe_entity_id);
CREATE INDEX IF NOT EXISTS idx_capital_call_items_org ON public.capital_call_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_capital_call_items_call ON public.capital_call_items(capital_call_id);
CREATE INDEX IF NOT EXISTS idx_capital_call_items_partner ON public.capital_call_items(spe_partner_id);
