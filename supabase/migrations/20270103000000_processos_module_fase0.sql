-- migration: 20270103000000_processos_module_fase0.sql
-- Módulo ÒPURA Processos — Fase 0 (pré-requisitos).
-- Motor de orquestração template→instância→etapa. NÃO reimplementa aprovação/tarefa/
-- documento: a etapa delega para approvalService/taskService/documentService (ver
-- PLANO_MODULO_PROCESSOS.md). Schema usa organization_id (não company_id).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. process_templates — modelo de processo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.process_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    department_id UUID REFERENCES public.company_departments(id) ON DELETE SET NULL,
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ATIVO'
        CHECK (status IN ('RASCUNHO', 'ATIVO', 'INATIVO', 'ARQUIVADO')),
    version INTEGER NOT NULL DEFAULT 1,
    criticality TEXT NOT NULL DEFAULT 'MEDIA'
        CHECK (criticality IN ('BAIXA', 'MEDIA', 'ALTA')),
    default_sla_hours NUMERIC,
    trigger_type TEXT NOT NULL DEFAULT 'MANUAL'
        CHECK (trigger_type IN ('MANUAL', 'EVENTO')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS process_templates_org_idx ON public.process_templates (organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. process_template_steps — etapas do modelo (sequencial no MVP: order_index)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.process_template_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_template_id UUID NOT NULL REFERENCES public.process_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    step_type TEXT NOT NULL
        CHECK (step_type IN ('approval', 'task', 'document', 'validation', 'manual')),
    order_index INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN NOT NULL DEFAULT true,
    default_responsible_type TEXT
        CHECK (default_responsible_type IN ('USER', 'DEPARTMENT', 'ROLE') OR default_responsible_type IS NULL),
    default_responsible_id UUID,
    sla_hours NUMERIC,
    requires_document BOOLEAN NOT NULL DEFAULT false,
    can_skip BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS process_template_steps_template_idx
    ON public.process_template_steps (process_template_id, order_index);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. process_instances — execução real de um template
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.process_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    process_template_id UUID NOT NULL REFERENCES public.process_templates(id) ON DELETE RESTRICT,
    template_version INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO'
        CHECK (status IN (
            'EM_ANDAMENTO', 'AGUARDANDO_RESPONSAVEL', 'AGUARDANDO_APROVACAO',
            'AGUARDANDO_DOCUMENTO', 'BLOQUEADO', 'ATRASADO', 'DEVOLVIDO',
            'CONCLUIDO', 'CANCELADO'
        )),
    priority TEXT NOT NULL DEFAULT 'MEDIA'
        CHECK (priority IN ('BAIXA', 'MEDIA', 'ALTA')),
    criticality TEXT NOT NULL DEFAULT 'MEDIA'
        CHECK (criticality IN ('BAIXA', 'MEDIA', 'ALTA')),
    current_step_id UUID, -- FK adicionada após criar process_instance_steps
    requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.company_departments(id) ON DELETE SET NULL,

    -- Vínculos com outras entidades do ÒPURA (uma instância pode se ligar a várias)
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,

    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    due_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS process_instances_org_idx ON public.process_instances (organization_id);
CREATE INDEX IF NOT EXISTS process_instances_template_idx ON public.process_instances (process_template_id);
CREATE INDEX IF NOT EXISTS process_instances_status_idx ON public.process_instances (organization_id, status);
CREATE INDEX IF NOT EXISTS process_instances_project_idx ON public.process_instances (project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. process_instance_steps — etapas executadas. Colunas approval_* espelham
--    o padrão de contracts/internal_transactions para o approvalService poder
--    tratar 'process_step' como mais uma entidade (sem lógica nova).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.process_instance_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_instance_id UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
    template_step_id UUID NOT NULL REFERENCES public.process_template_steps(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    step_type TEXT NOT NULL
        CHECK (step_type IN ('approval', 'task', 'document', 'validation', 'manual')),
    order_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'REPROVADO', 'PULADO')),
    responsible_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Ponte para as primitivas existentes (Regra de Ouro 12 — nada reimplementado)
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    document_id UUID,

    -- Espelha contracts.approval_* — permite approvalService tratar esta tabela
    -- como 4ª ApprovalEntity ('process_step'), sem lógica nova no serviço.
    approval_status TEXT NOT NULL DEFAULT 'RASCUNHO'
        CHECK (approval_status IN ('RASCUNHO', 'PENDENTE', 'APROVADO', 'REJEITADO')),
    approval_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
    approval_required_levels INTEGER NOT NULL DEFAULT 1
        CHECK (approval_required_levels IN (1, 2)),
    amount NUMERIC, -- valor de referência p/ resolver faixa, quando a etapa for de aprovação

    started_at TIMESTAMP WITH TIME ZONE,
    due_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS process_instance_steps_instance_idx
    ON public.process_instance_steps (process_instance_id, order_index);
CREATE INDEX IF NOT EXISTS process_instance_steps_status_idx
    ON public.process_instance_steps (status);

ALTER TABLE public.process_instances
    DROP CONSTRAINT IF EXISTS process_instances_current_step_fk;
ALTER TABLE public.process_instances
    ADD CONSTRAINT process_instances_current_step_fk
    FOREIGN KEY (current_step_id) REFERENCES public.process_instance_steps(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.process_instances
    VALIDATE CONSTRAINT process_instances_current_step_fk;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. process_comments — comentários por instância/etapa
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.process_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_instance_id UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
    step_id UUID REFERENCES public.process_instance_steps(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    comment TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'INTERNO'
        CHECK (visibility IN ('INTERNO', 'PUBLICO')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS process_comments_instance_idx ON public.process_comments (process_instance_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. process_audit_logs — auditoria (obrigatório para R5/R13 e auditabilidade)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.process_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_instance_id UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS process_audit_logs_instance_idx ON public.process_audit_logs (process_instance_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS — dual-check uid+email (organization_members.user_id pode ser NULL),
--    mesmo padrão de empr_user_org_ids / investors_user_org_ids.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.proc_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
       OR email = auth.jwt()->>'email';
$$;

ALTER TABLE public.process_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_template_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_instance_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_audit_logs ENABLE ROW LEVEL SECURITY;

-- process_templates (raiz)
DROP POLICY IF EXISTS "org_access_process_templates" ON public.process_templates;
CREATE POLICY "org_access_process_templates" ON public.process_templates
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.proc_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.proc_user_org_ids()));

-- process_template_steps (um hop)
DROP POLICY IF EXISTS "org_access_process_template_steps" ON public.process_template_steps;
CREATE POLICY "org_access_process_template_steps" ON public.process_template_steps
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.id = process_template_steps.process_template_id
            AND t.organization_id IN (SELECT public.proc_user_org_ids())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.id = process_template_steps.process_template_id
            AND t.organization_id IN (SELECT public.proc_user_org_ids())
        )
    );

-- process_instances (raiz)
DROP POLICY IF EXISTS "org_access_process_instances" ON public.process_instances;
CREATE POLICY "org_access_process_instances" ON public.process_instances
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.proc_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.proc_user_org_ids()));

-- process_instance_steps (um hop — inclui o approvalService operando como 'process_step')
DROP POLICY IF EXISTS "org_access_process_instance_steps" ON public.process_instance_steps;
CREATE POLICY "org_access_process_instance_steps" ON public.process_instance_steps
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.process_instances i
            WHERE i.id = process_instance_steps.process_instance_id
            AND i.organization_id IN (SELECT public.proc_user_org_ids())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.process_instances i
            WHERE i.id = process_instance_steps.process_instance_id
            AND i.organization_id IN (SELECT public.proc_user_org_ids())
        )
    );

-- process_comments (um hop)
DROP POLICY IF EXISTS "org_access_process_comments" ON public.process_comments;
CREATE POLICY "org_access_process_comments" ON public.process_comments
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.process_instances i
            WHERE i.id = process_comments.process_instance_id
            AND i.organization_id IN (SELECT public.proc_user_org_ids())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.process_instances i
            WHERE i.id = process_comments.process_instance_id
            AND i.organization_id IN (SELECT public.proc_user_org_ids())
        )
    );

-- process_audit_logs (um hop; somente leitura pela UI — inserts vêm do service layer)
DROP POLICY IF EXISTS "org_access_process_audit_logs" ON public.process_audit_logs;
CREATE POLICY "org_access_process_audit_logs" ON public.process_audit_logs
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.process_instances i
            WHERE i.id = process_audit_logs.process_instance_id
            AND i.organization_id IN (SELECT public.proc_user_org_ids())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.process_instances i
            WHERE i.id = process_audit_logs.process_instance_id
            AND i.organization_id IN (SELECT public.proc_user_org_ids())
        )
    );
