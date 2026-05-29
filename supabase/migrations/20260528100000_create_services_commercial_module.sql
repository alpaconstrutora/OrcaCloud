-- =============================================================================
-- Módulo Comercial de Serviços de Execução de Obras — MVP-0
-- =============================================================================
-- Escopo: leads/oportunidades, visita técnica, orçamento, proposta, conversão
-- em obra (projects) + contrato de venda (services_contracts).
--
-- Decisões de arquitetura:
--   * Namespace 'services_*' separado das tabelas 'commercial_*' (que tratam de
--     incorporação imobiliária — domínio diferente).
--   * Lead e Oportunidade unificados em services_opportunities (MVP-0).
--   * Pipeline com 5 estágios fixos via CHECK constraint.
--   * Conversão para obra é idempotente: re-ganhar não duplica.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. SEQUENCE para numeração de propostas e contratos
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS services_proposal_seq;
CREATE SEQUENCE IF NOT EXISTS services_contract_seq;

-- ---------------------------------------------------------------------------
-- 2. services_opportunities — Lead + Oportunidade unificados
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Dados de contato (lead)
    contact_name TEXT NOT NULL,
    contact_phone TEXT,
    contact_email TEXT,
    contact_whatsapp TEXT,
    city TEXT,

    -- Dados da obra desejada
    work_type TEXT,
    estimated_area NUMERIC(10,2),
    estimated_value NUMERIC(15,2),
    scope_summary TEXT,

    -- Pipeline (5 estágios fixos no MVP-0)
    stage TEXT NOT NULL DEFAULT 'lead'
        CHECK (stage IN ('lead', 'visit', 'budget', 'proposal', 'won', 'lost')),

    -- Atribuição e prioridade
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),

    -- Origem
    origin_channel TEXT,

    -- Resolução
    lost_reason TEXT,
    won_at TIMESTAMPTZ,
    lost_at TIMESTAMPTZ,

    -- Referências criadas na conversão (preenchidas pelo trigger)
    converted_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    converted_contract_id UUID, -- FK definida após criar services_contracts

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Regra: ao marcar 'lost', motivo é obrigatório
    CONSTRAINT chk_lost_reason
        CHECK (stage <> 'lost' OR (lost_reason IS NOT NULL AND length(lost_reason) > 0))
);

CREATE INDEX IF NOT EXISTS idx_services_opp_org ON public.services_opportunities(organization_id);
CREATE INDEX IF NOT EXISTS idx_services_opp_stage ON public.services_opportunities(organization_id, stage);
CREATE INDEX IF NOT EXISTS idx_services_opp_assigned ON public.services_opportunities(assigned_to);

-- ---------------------------------------------------------------------------
-- 3. services_opportunity_events — histórico/timeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services_opportunity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES public.services_opportunities(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    -- ex: 'stage_changed', 'note_added', 'visit_scheduled', 'proposal_sent'
    from_value TEXT,
    to_value TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    actor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_opp_events_opp
    ON public.services_opportunity_events(opportunity_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. services_visits — visita técnica (PWA)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES public.services_opportunities(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    scheduled_at TIMESTAMPTZ,
    performed_at TIMESTAMPTZ,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    checklist JSONB DEFAULT '[]'::jsonb, -- [{item: '...', ok: bool, note: '...'}]
    observations TEXT,

    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),

    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'completed', 'cancelled')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_visits_opp ON public.services_visits(opportunity_id);

-- ---------------------------------------------------------------------------
-- 5. services_visit_photos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services_visit_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL REFERENCES public.services_visits(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL, -- caminho no bucket 'services-visits'
    caption TEXT,
    taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_visit_photos_visit ON public.services_visit_photos(visit_id);

-- ---------------------------------------------------------------------------
-- 6. services_budgets — orçamento (1 por oportunidade no MVP-0)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES public.services_opportunities(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Totais (computados pela aplicação ou via view; armazenados para snapshot)
    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
    margin_pct NUMERIC(5,2) NOT NULL DEFAULT 0, -- margem global
    total NUMERIC(15,2) NOT NULL DEFAULT 0,

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (opportunity_id) -- 1 orçamento por oportunidade no MVP-0
);

-- ---------------------------------------------------------------------------
-- 7. services_budget_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services_budget_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES public.services_budgets(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    position INTEGER NOT NULL DEFAULT 0, -- ordem de exibição
    description TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'un',
    quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    total NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_budget_items_budget
    ON public.services_budget_items(budget_id, position);

-- ---------------------------------------------------------------------------
-- 8. services_proposals — proposta enviada ao cliente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES public.services_opportunities(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    budget_id UUID REFERENCES public.services_budgets(id) ON DELETE SET NULL,

    proposal_number TEXT NOT NULL, -- PROP-{YYYY}-{seq} gerado por trigger
    total_value NUMERIC(15,2) NOT NULL DEFAULT 0,

    scope TEXT,
    payment_terms TEXT,
    delivery_term_days INTEGER,
    valid_until DATE,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),

    pdf_storage_path TEXT, -- caminho no bucket após gerar
    sent_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (organization_id, proposal_number)
);

CREATE INDEX IF NOT EXISTS idx_services_proposals_opp ON public.services_proposals(opportunity_id);

-- ---------------------------------------------------------------------------
-- 9. services_contracts — contrato de VENDA ao cliente
-- (distinto de public.contracts, que é de fornecedores)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES public.services_opportunities(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    proposal_id UUID REFERENCES public.services_proposals(id) ON DELETE SET NULL,

    contract_number TEXT NOT NULL,
    client_name TEXT NOT NULL, -- snapshot no momento da assinatura
    total_value NUMERIC(15,2) NOT NULL DEFAULT 0,

    start_date DATE,
    end_date DATE,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (organization_id, contract_number)
);

CREATE INDEX IF NOT EXISTS idx_services_contracts_org ON public.services_contracts(organization_id);

-- FK pendente do opportunities -> services_contracts
ALTER TABLE public.services_opportunities
    ADD CONSTRAINT fk_opp_converted_contract
    FOREIGN KEY (converted_contract_id)
    REFERENCES public.services_contracts(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 10. Triggers de updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_services_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'services_opportunities', 'services_visits', 'services_budgets',
        'services_proposals', 'services_contracts'
    ] LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;
             CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.tg_services_set_updated_at();',
            t, t, t, t
        );
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 11. Trigger de numeração de proposta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_services_assign_proposal_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.proposal_number IS NULL OR NEW.proposal_number = '' THEN
        NEW.proposal_number := 'PROP-' || to_char(NOW(), 'YYYY')
            || '-' || lpad(nextval('services_proposal_seq')::text, 5, '0');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_proposal_number ON public.services_proposals;
CREATE TRIGGER trg_services_proposal_number
    BEFORE INSERT ON public.services_proposals
    FOR EACH ROW EXECUTE FUNCTION public.tg_services_assign_proposal_number();

-- ---------------------------------------------------------------------------
-- 12. Trigger de histórico (event log) ao mudar de stage
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_services_log_stage_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.services_opportunity_events
            (opportunity_id, organization_id, event_type, to_value, actor)
        VALUES (NEW.id, NEW.organization_id, 'created', NEW.stage, auth.uid());
        RETURN NEW;
    END IF;

    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
        INSERT INTO public.services_opportunity_events
            (opportunity_id, organization_id, event_type, from_value, to_value, actor)
        VALUES (NEW.id, NEW.organization_id, 'stage_changed',
                OLD.stage, NEW.stage, auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_opp_log ON public.services_opportunities;
CREATE TRIGGER trg_services_opp_log
    AFTER INSERT OR UPDATE OF stage ON public.services_opportunities
    FOR EACH ROW EXECUTE FUNCTION public.tg_services_log_stage_change();

-- ---------------------------------------------------------------------------
-- 13. Trigger de conversão: stage='won' cria projeto (obra) + contrato.
-- Idempotente: se já houver converted_contract_id, não recria nada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_services_convert_to_project()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_project_id UUID;
    v_contract_id UUID;
    v_contract_number TEXT;
    v_total NUMERIC(15,2);
    v_proposal_id UUID;
BEGIN
    -- Só age na transição para 'won'
    IF NEW.stage <> 'won' OR OLD.stage = 'won' THEN
        RETURN NEW;
    END IF;

    -- Idempotência: já convertido, ignora
    IF NEW.converted_contract_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Pega a última proposta enviada/aceita (se houver)
    SELECT id, total_value INTO v_proposal_id, v_total
    FROM public.services_proposals
    WHERE opportunity_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_total IS NULL THEN
        v_total := COALESCE(NEW.estimated_value, 0);
    END IF;

    -- 1) Cria a obra (projects) se ainda não houver
    IF NEW.converted_project_id IS NULL THEN
        INSERT INTO public.projects (organization_id, name, created_at)
        VALUES (
            NEW.organization_id,
            COALESCE(NEW.contact_name, 'Obra') || ' - ' || COALESCE(NEW.work_type, 'Serviço'),
            NOW()
        )
        RETURNING id INTO v_project_id;

        NEW.converted_project_id := v_project_id;
    ELSE
        v_project_id := NEW.converted_project_id;
    END IF;

    -- 2) Cria o contrato de venda
    v_contract_number := 'CTR-' || to_char(NOW(), 'YYYY')
        || '-' || lpad(nextval('services_contract_seq')::text, 5, '0');

    INSERT INTO public.services_contracts (
        organization_id, opportunity_id, project_id, proposal_id,
        contract_number, client_name, total_value, status, start_date
    ) VALUES (
        NEW.organization_id, NEW.id, v_project_id, v_proposal_id,
        v_contract_number, NEW.contact_name, v_total, 'active', CURRENT_DATE
    )
    RETURNING id INTO v_contract_id;

    NEW.converted_contract_id := v_contract_id;
    NEW.won_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_convert ON public.services_opportunities;
CREATE TRIGGER trg_services_convert
    BEFORE UPDATE OF stage ON public.services_opportunities
    FOR EACH ROW EXECUTE FUNCTION public.tg_services_convert_to_project();

-- ---------------------------------------------------------------------------
-- 14. Trigger auxiliar: marca lost_at ao mover para 'lost'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_services_mark_lost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.stage = 'lost' AND OLD.stage <> 'lost' THEN
        NEW.lost_at := NOW();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_mark_lost ON public.services_opportunities;
CREATE TRIGGER trg_services_mark_lost
    BEFORE UPDATE OF stage ON public.services_opportunities
    FOR EACH ROW EXECUTE FUNCTION public.tg_services_mark_lost();

-- ---------------------------------------------------------------------------
-- 15. RLS — todas as tabelas isoladas por organização
-- ---------------------------------------------------------------------------
ALTER TABLE public.services_opportunities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_opportunity_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_visits              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_visit_photos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_budgets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_budget_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_proposals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_contracts           ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'services_opportunities','services_opportunity_events','services_visits',
        'services_visit_photos','services_budgets','services_budget_items',
        'services_proposals','services_contracts'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "org_members_all" ON public.%I;', t);
        EXECUTE format(
            'CREATE POLICY "org_members_all" ON public.%I
             FOR ALL TO authenticated
             USING (public.is_org_member(organization_id))
             WITH CHECK (public.is_org_member(organization_id));',
            t
        );
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 16. Storage bucket para fotos de visita técnica
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('services-visits', 'services-visits', false)
ON CONFLICT (id) DO NOTHING;

-- Policies de storage: membros da org podem ler/escrever em pastas {org_id}/...
DROP POLICY IF EXISTS "services_visits_org_read" ON storage.objects;
CREATE POLICY "services_visits_org_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'services-visits'
        AND public.is_org_member((storage.foldername(name))[1]::uuid)
    );

DROP POLICY IF EXISTS "services_visits_org_write" ON storage.objects;
CREATE POLICY "services_visits_org_write" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'services-visits'
        AND public.is_org_member((storage.foldername(name))[1]::uuid)
    );

DROP POLICY IF EXISTS "services_visits_org_delete" ON storage.objects;
CREATE POLICY "services_visits_org_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'services-visits'
        AND public.is_org_member((storage.foldername(name))[1]::uuid)
    );

-- ---------------------------------------------------------------------------
-- 17. Comentários
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.services_opportunities IS
    'Pipeline comercial de serviços de execução de obras (lead+oportunidade unificados no MVP-0).';
COMMENT ON TABLE public.services_contracts IS
    'Contrato de VENDA ao cliente (distinto de public.contracts, que cobre fornecedores).';
COMMENT ON COLUMN public.services_opportunities.stage IS
    '5 estágios fixos no MVP-0: lead, visit, budget, proposal, won, lost.';
