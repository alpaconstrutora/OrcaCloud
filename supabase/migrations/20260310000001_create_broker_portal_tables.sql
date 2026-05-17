-- ==========================================================================
-- Migration: Portal do Corretor â€” Todas as Tabelas
-- Date: 2026-03-10
-- Description: Cria 9 tabelas do Portal do Corretor com RLS e Ã­ndices
-- ==========================================================================

-- ========================================
-- 1. broker_profiles â€” Perfis de Corretores
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    cpf TEXT,
    creci TEXT,
    agency_name TEXT,
    commission_rate NUMERIC(5,2) DEFAULT 5.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(organization_id, email)
);

ALTER TABLE public.broker_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_profiles_select" ON public.broker_profiles
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = email OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "broker_profiles_manage" ON public.broker_profiles
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE INDEX IF NOT EXISTS broker_profiles_org_idx ON public.broker_profiles(organization_id);
CREATE INDEX IF NOT EXISTS broker_profiles_email_idx ON public.broker_profiles(email);


-- ========================================
-- 2. broker_portal_units â€” Unidades do Empreendimento
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_units (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    block TEXT NOT NULL,
    floor INTEGER NOT NULL,
    number TEXT NOT NULL,
    typology TEXT,
    private_area NUMERIC(10,2),
    total_area NUMERIC(10,2),
    bedrooms INTEGER DEFAULT 0,
    parking_spaces INTEGER DEFAULT 0,
    sun_position TEXT,
    base_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    current_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    price_index TEXT DEFAULT 'INCC',
    status TEXT NOT NULL DEFAULT 'DISPONIVEL'
        CHECK (status IN ('DISPONIVEL', 'RESERVADO', 'EM_NEGOCIACAO', 'VENDIDO', 'BLOQUEADO')),
    features JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(organization_id, block, number)
);

ALTER TABLE public.broker_portal_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_units_select" ON public.broker_portal_units
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "broker_units_manage" ON public.broker_portal_units
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE INDEX IF NOT EXISTS broker_units_org_idx ON public.broker_portal_units(organization_id);
CREATE INDEX IF NOT EXISTS broker_units_status_idx ON public.broker_portal_units(status);
CREATE INDEX IF NOT EXISTS broker_units_project_idx ON public.broker_portal_units(project_id);


-- ========================================
-- 3. broker_portal_reservations â€” Reservas TemporÃ¡rias
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_reservations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    unit_id UUID NOT NULL REFERENCES public.broker_portal_units(id) ON DELETE CASCADE,
    broker_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ATIVA'
        CHECK (status IN ('ATIVA', 'EXPIRADA', 'CONVERTIDA', 'CANCELADA')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_reservations_select" ON public.broker_portal_reservations
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "broker_reservations_manage" ON public.broker_portal_reservations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS broker_reservations_unit_idx ON public.broker_portal_reservations(unit_id);
CREATE INDEX IF NOT EXISTS broker_reservations_broker_idx ON public.broker_portal_reservations(broker_email);
CREATE INDEX IF NOT EXISTS broker_reservations_expires_idx ON public.broker_portal_reservations(expires_at);


-- ========================================
-- 4. broker_portal_proposals â€” Propostas de Compra
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_proposals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES public.broker_portal_units(id) ON DELETE RESTRICT,
    broker_email TEXT NOT NULL,
    buyer_name TEXT NOT NULL,
    buyer_cpf TEXT NOT NULL,
    buyer_email TEXT,
    buyer_phone TEXT,
    buyer_income NUMERIC(14,2),
    total_value NUMERIC(14,2) NOT NULL,
    down_payment NUMERIC(14,2) DEFAULT 0,
    installments INTEGER DEFAULT 0,
    installment_value NUMERIC(14,2) DEFAULT 0,
    financing_value NUMERIC(14,2) DEFAULT 0,
    payment_plan JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'RASCUNHO'
        CHECK (status IN ('RASCUNHO', 'ENVIADA', 'EM_ANALISE', 'APROVADA', 'CONTRAPROPOSTA', 'REJEITADA', 'CANCELADA')),
    notes TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_proposals ENABLE ROW LEVEL SECURITY;

-- Corretor vÃª apenas suas propostas; incorporadora (org member) vÃª todas
CREATE POLICY "broker_proposals_select" ON public.broker_portal_proposals
    FOR SELECT TO authenticated
    USING (
        broker_email = auth.jwt()->>'email'
        OR public.is_org_member(organization_id)
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );

CREATE POLICY "broker_proposals_insert" ON public.broker_portal_proposals
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "broker_proposals_update" ON public.broker_portal_proposals
    FOR UPDATE TO authenticated
    USING (
        broker_email = auth.jwt()->>'email'
        OR public.is_org_member(organization_id)
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );

CREATE INDEX IF NOT EXISTS broker_proposals_org_idx ON public.broker_portal_proposals(organization_id);
CREATE INDEX IF NOT EXISTS broker_proposals_unit_idx ON public.broker_portal_proposals(unit_id);
CREATE INDEX IF NOT EXISTS broker_proposals_broker_idx ON public.broker_portal_proposals(broker_email);
CREATE INDEX IF NOT EXISTS broker_proposals_status_idx ON public.broker_portal_proposals(status);


-- ========================================
-- 5. broker_portal_leads â€” GestÃ£o de Leads
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    broker_email TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    cpf TEXT,
    income NUMERIC(14,2),
    origin TEXT DEFAULT 'DIRETO'
        CHECK (origin IN ('SITE', 'INDICACAO', 'PLANTAO', 'REDES_SOCIAIS', 'DIRETO', 'OUTRO')),
    stage TEXT NOT NULL DEFAULT 'LEAD'
        CHECK (stage IN ('LEAD', 'VISITA', 'PROPOSTA', 'NEGOCIACAO', 'VENDA', 'PERDIDO')),
    interest TEXT,
    protection_until TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_leads ENABLE ROW LEVEL SECURITY;

-- Corretor vÃª apenas seus leads; incorporadora vÃª todos
CREATE POLICY "broker_leads_select" ON public.broker_portal_leads
    FOR SELECT TO authenticated
    USING (
        broker_email = auth.jwt()->>'email'
        OR public.is_org_member(organization_id)
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );

CREATE POLICY "broker_leads_insert" ON public.broker_portal_leads
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "broker_leads_update" ON public.broker_portal_leads
    FOR UPDATE TO authenticated
    USING (
        broker_email = auth.jwt()->>'email'
        OR public.is_org_member(organization_id)
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );

CREATE INDEX IF NOT EXISTS broker_leads_org_idx ON public.broker_portal_leads(organization_id);
CREATE INDEX IF NOT EXISTS broker_leads_broker_idx ON public.broker_portal_leads(broker_email);
CREATE INDEX IF NOT EXISTS broker_leads_stage_idx ON public.broker_portal_leads(stage);
CREATE INDEX IF NOT EXISTS broker_leads_cpf_idx ON public.broker_portal_leads(cpf);
CREATE INDEX IF NOT EXISTS broker_leads_protection_idx ON public.broker_portal_leads(protection_until);


-- ========================================
-- 5.1 broker_portal_lead_interactions â€” HistÃ³rico de InteraÃ§Ãµes
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_lead_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES public.broker_portal_leads(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'NOTE'
        CHECK (type IN ('LIGACAO', 'VISITA', 'EMAIL', 'WHATSAPP', 'PROPOSTA', 'NOTE')),
    description TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_lead_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_lead_interactions_all" ON public.broker_portal_lead_interactions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS broker_lead_interactions_lead_idx ON public.broker_portal_lead_interactions(lead_id);


-- ========================================
-- 6. broker_portal_commissions â€” ComissÃµes
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_commissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    proposal_id UUID REFERENCES public.broker_portal_proposals(id) ON DELETE SET NULL,
    broker_email TEXT NOT NULL,
    unit_number TEXT,
    block TEXT,
    buyer_name TEXT,
    sale_value NUMERIC(14,2) NOT NULL DEFAULT 0,
    commission_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    commission_predicted NUMERIC(14,2) NOT NULL DEFAULT 0,
    commission_released NUMERIC(14,2) NOT NULL DEFAULT 0,
    commission_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (status IN ('PENDENTE', 'PARCIAL', 'LIBERADA', 'PAGA')),
    milestones JSONB DEFAULT '[]'::jsonb,
    -- milestones: [{ name: "Assinatura", pct: 30, released: true, date: "2026-01-15" }, ...]
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_commissions ENABLE ROW LEVEL SECURITY;

-- Corretor vÃª suas comissÃµes; incorporadora vÃª todas
CREATE POLICY "broker_commissions_select" ON public.broker_portal_commissions
    FOR SELECT TO authenticated
    USING (
        broker_email = auth.jwt()->>'email'
        OR public.is_org_member(organization_id)
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );

CREATE POLICY "broker_commissions_manage" ON public.broker_portal_commissions
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE INDEX IF NOT EXISTS broker_commissions_org_idx ON public.broker_portal_commissions(organization_id);
CREATE INDEX IF NOT EXISTS broker_commissions_broker_idx ON public.broker_portal_commissions(broker_email);
CREATE INDEX IF NOT EXISTS broker_commissions_status_idx ON public.broker_portal_commissions(status);


-- ========================================
-- 7. broker_portal_materials â€” Materiais de Venda
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_materials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'BOOK'
        CHECK (type IN ('BOOK', 'PLANTA', 'RENDER', 'VIDEO', 'TOUR_360', 'MEMORIAL', 'TABELA')),
    file_url TEXT,
    thumbnail_url TEXT,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,
    views_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_materials_select" ON public.broker_portal_materials
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "broker_materials_manage" ON public.broker_portal_materials
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE INDEX IF NOT EXISTS broker_materials_org_idx ON public.broker_portal_materials(organization_id);
CREATE INDEX IF NOT EXISTS broker_materials_type_idx ON public.broker_portal_materials(type);


-- ========================================
-- 8. broker_portal_events â€” Agenda de Eventos
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'OUTRO'
        CHECK (type IN ('PLANTAO', 'LANCAMENTO', 'TREINAMENTO', 'VISITA_OBRA', 'NETWORKING', 'OUTRO')),
    date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    location TEXT,
    max_capacity INTEGER,
    status TEXT NOT NULL DEFAULT 'ABERTO'
        CHECK (status IN ('ABERTO', 'LOTADO', 'ENCERRADO', 'CANCELADO')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_events_select" ON public.broker_portal_events
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "broker_events_manage" ON public.broker_portal_events
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE INDEX IF NOT EXISTS broker_events_org_idx ON public.broker_portal_events(organization_id);
CREATE INDEX IF NOT EXISTS broker_events_date_idx ON public.broker_portal_events(date);


-- ========================================
-- 8.1 broker_portal_event_registrations â€” InscriÃ§Ãµes em Eventos
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_event_registrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.broker_portal_events(id) ON DELETE CASCADE,
    broker_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CONFIRMADA'
        CHECK (status IN ('CONFIRMADA', 'CANCELADA', 'PRESENTE')),
    checked_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(event_id, broker_email)
);

ALTER TABLE public.broker_portal_event_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_event_regs_all" ON public.broker_portal_event_registrations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS broker_event_regs_event_idx ON public.broker_portal_event_registrations(event_id);
CREATE INDEX IF NOT EXISTS broker_event_regs_broker_idx ON public.broker_portal_event_registrations(broker_email);


-- ========================================
-- 9. broker_portal_chat_channels â€” Canais de Chat
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_chat_channels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_chat_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_channels_select" ON public.broker_portal_chat_channels
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "broker_channels_manage" ON public.broker_portal_chat_channels
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE INDEX IF NOT EXISTS broker_channels_org_idx ON public.broker_portal_chat_channels(organization_id);


-- ========================================
-- 9.1 broker_portal_chat_messages â€” Mensagens do Chat
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES public.broker_portal_chat_channels(id) ON DELETE CASCADE,
    sender_email TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_type TEXT NOT NULL DEFAULT 'CORRETOR'
        CHECK (sender_type IN ('CORRETOR', 'INCORPORADORA')),
    message TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_messages_select" ON public.broker_portal_chat_messages
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "broker_messages_insert" ON public.broker_portal_chat_messages
    FOR INSERT TO authenticated WITH CHECK (true);

-- Apenas incorporadora pode fixar/editar mensagens
CREATE POLICY "broker_messages_update" ON public.broker_portal_chat_messages
    FOR UPDATE TO authenticated
    USING (
        sender_email = auth.jwt()->>'email'
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );

CREATE INDEX IF NOT EXISTS broker_messages_channel_idx ON public.broker_portal_chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS broker_messages_pinned_idx ON public.broker_portal_chat_messages(is_pinned) WHERE is_pinned = true;


-- ========================================
-- 10. broker_portal_trainings â€” MÃ³dulos de Treinamento
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_trainings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'VIDEO'
        CHECK (type IN ('VIDEO', 'DOCUMENTO', 'QUIZ')),
    content_url TEXT,
    duration_minutes INTEGER,
    is_required BOOLEAN DEFAULT false,
    questions JSONB DEFAULT '[]'::jsonb,
    -- questions: [{ question: "...", options: ["a","b","c","d"], correct_index: 1 }]
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_trainings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_trainings_select" ON public.broker_portal_trainings
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "broker_trainings_manage" ON public.broker_portal_trainings
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE INDEX IF NOT EXISTS broker_trainings_org_idx ON public.broker_portal_trainings(organization_id);


-- ========================================
-- 10.1 broker_portal_training_progress â€” Progresso individual
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_training_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    training_id UUID NOT NULL REFERENCES public.broker_portal_trainings(id) ON DELETE CASCADE,
    broker_email TEXT NOT NULL,
    progress_pct INTEGER DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
    is_completed BOOLEAN DEFAULT false,
    score NUMERIC(5,2),
    completed_at TIMESTAMPTZ,
    certificate_url TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(training_id, broker_email)
);

ALTER TABLE public.broker_portal_training_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_training_progress_select" ON public.broker_portal_training_progress
    FOR SELECT TO authenticated
    USING (broker_email = auth.jwt()->>'email' OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "broker_training_progress_manage" ON public.broker_portal_training_progress
    FOR ALL TO authenticated
    USING (broker_email = auth.jwt()->>'email' OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS broker_training_progress_training_idx ON public.broker_portal_training_progress(training_id);
CREATE INDEX IF NOT EXISTS broker_training_progress_broker_idx ON public.broker_portal_training_progress(broker_email);


-- ========================================
-- 11. broker_portal_rankings â€” Rankings (materializado)
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_rankings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    broker_email TEXT NOT NULL,
    broker_name TEXT NOT NULL,
    period TEXT NOT NULL, -- 'MES_2026_03', 'TRIM_2026_Q1', 'ANO_2026'
    sales_count INTEGER DEFAULT 0,
    sales_volume NUMERIC(14,2) DEFAULT 0,
    leads_converted INTEGER DEFAULT 0,
    proposals_sent INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    previous_position INTEGER,
    badges JSONB DEFAULT '[]'::jsonb,
    goal_sales INTEGER DEFAULT 0,
    goal_volume NUMERIC(14,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(organization_id, broker_email, period)
);

ALTER TABLE public.broker_portal_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_rankings_select" ON public.broker_portal_rankings
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "broker_rankings_manage" ON public.broker_portal_rankings
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE INDEX IF NOT EXISTS broker_rankings_org_idx ON public.broker_portal_rankings(organization_id);
CREATE INDEX IF NOT EXISTS broker_rankings_period_idx ON public.broker_portal_rankings(period);
CREATE INDEX IF NOT EXISTS broker_rankings_position_idx ON public.broker_portal_rankings(position);


-- ========================================
-- 12. broker_portal_integrations â€” IntegraÃ§Ãµes CRM/ERP
-- ========================================
CREATE TABLE IF NOT EXISTS public.broker_portal_integrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'OUTRO'
        CHECK (type IN ('CRM', 'ERP', 'ASSINATURA', 'PAGAMENTO', 'OUTRO')),
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'INATIVO'
        CHECK (status IN ('ATIVO', 'INATIVO', 'CONFIGURANDO', 'ERRO')),
    config JSONB DEFAULT '{}'::jsonb,
    -- config: { api_key: "...", webhook_url: "...", field_mapping: {...} }
    last_sync TIMESTAMPTZ,
    events_count INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.broker_portal_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_integrations_select" ON public.broker_portal_integrations
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "broker_integrations_manage" ON public.broker_portal_integrations
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE INDEX IF NOT EXISTS broker_integrations_org_idx ON public.broker_portal_integrations(organization_id);


-- ========================================
-- Enable Realtime for chat messages (for live updates)
-- ========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.broker_portal_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broker_portal_units;
