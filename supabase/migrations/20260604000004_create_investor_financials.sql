-- Fase 1 do Investor OS: fundação financeira
-- investor_contributions (aportes/retiradas/dividendos) + investor_participations (% de participação)
-- Date: 2026-06-04

-- ─── investor_participations ─────────────────────────────────────────────────
-- Participação societária do investidor em um empreendimento (projeto)
CREATE TABLE IF NOT EXISTS public.investor_participations (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    investor_id      uuid NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
    ownership_pct    numeric(7,4) NOT NULL DEFAULT 0,   -- % de participação (0-100)
    committed_amount numeric(15,2) NOT NULL DEFAULT 0,  -- capital comprometido
    quota_count      integer NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, investor_id)
);

ALTER TABLE public.investor_participations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org participations" ON public.investor_participations
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Admins can manage org participations" ON public.investor_participations
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

CREATE INDEX IF NOT EXISTS idx_inv_participations_org ON public.investor_participations(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_participations_project ON public.investor_participations(project_id);
CREATE INDEX IF NOT EXISTS idx_inv_participations_investor ON public.investor_participations(investor_id);

-- ─── investor_contributions ──────────────────────────────────────────────────
-- Movimentações financeiras entre investidor e empreendimento
CREATE TABLE IF NOT EXISTS public.investor_contributions (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    investor_id      uuid NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
    type             text NOT NULL DEFAULT 'aporte'
                     CHECK (type IN ('aporte', 'retirada', 'dividendo', 'distribuicao')),
    amount           numeric(15,2) NOT NULL DEFAULT 0,
    due_date         date,
    paid_date        date,
    status           text NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente', 'liquidado', 'atrasado')),
    description      text,
    payment_method   text,
    receipt_url      text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org contributions" ON public.investor_contributions
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Admins can manage org contributions" ON public.investor_contributions
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

CREATE INDEX IF NOT EXISTS idx_inv_contributions_org ON public.investor_contributions(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_contributions_project ON public.investor_contributions(project_id);
CREATE INDEX IF NOT EXISTS idx_inv_contributions_investor ON public.investor_contributions(investor_id);
CREATE INDEX IF NOT EXISTS idx_inv_contributions_status ON public.investor_contributions(status);
