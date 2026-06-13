-- ============================================================
-- Migration: 20261125000000_opura_organization_governance
-- Módulo: ÒPURA Organization & Governance
-- Sistema Operacional Organizacional e Governança Corporativa
-- ============================================================

-- ─── 1. TIPOS ENUMERADOS (ENUMS) ─────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_relationship_type') THEN
        CREATE TYPE org_relationship_type AS ENUM (
            'hierarquico', 
            'funcional', 
            'operacional', 
            'comunicacao', 
            'consulta', 
            'auditoria'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'authority_flow_type') THEN
        CREATE TYPE authority_flow_type AS ENUM (
            'compras', 
            'pagamentos', 
            'contratos', 
            'investimentos'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'readiness_level') THEN
        CREATE TYPE readiness_level AS ENUM (
            'imediato', 
            '1_a_2_anos', 
            '3_a_5_anos', 
            'longo_prazo'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
        CREATE TYPE risk_level AS ENUM (
            'baixo', 
            'medio', 
            'alto', 
            'critico'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'raci_role_type') THEN
        CREATE TYPE raci_role_type AS ENUM (
            'R', 
            'A', 
            'C', 
            'I'
        );
    END IF;
END
$$;

-- ─── 2. TABELA DE CARGOS (org_roles) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.org_roles (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nome                  TEXT NOT NULL,
    codigo                TEXT,
    descricao             TEXT,
    nivel_hierarquico     INT NOT NULL DEFAULT 1,
    responsabilidades     TEXT[] DEFAULT '{}'::text[],
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_org_roles_company ON public.org_roles(company_id);

CREATE OR REPLACE FUNCTION set_org_roles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS org_roles_updated_at ON public.org_roles;
CREATE TRIGGER org_roles_updated_at
    BEFORE UPDATE ON public.org_roles
    FOR EACH ROW EXECUTE FUNCTION set_org_roles_updated_at();

-- ─── 3. ADICIONAR COLUNAS EM public.employees ────────────────

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.org_roles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.company_departments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS user_email TEXT;

CREATE INDEX IF NOT EXISTS idx_employees_role_id ON public.employees(role_id) WHERE role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON public.employees(department_id) WHERE department_id IS NOT NULL;

-- ─── 4. RELACIONAMENTOS DINÂMICOS (org_relationships) ────────

CREATE TABLE IF NOT EXISTS public.org_relationships (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    relationship_type     org_relationship_type NOT NULL DEFAULT 'hierarquico',
    
    -- Relacionamento pode ser estrutural (entre cargos) ou individual (entre pessoas)
    source_role_id        UUID REFERENCES public.org_roles(id) ON DELETE CASCADE,
    target_role_id        UUID REFERENCES public.org_roles(id) ON DELETE CASCADE,
    
    source_employee_id    UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    target_employee_id    UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    
    data_inicio           DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim              DATE,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT check_source_target_roles CHECK (source_role_id <> target_role_id),
    CONSTRAINT check_source_target_employees CHECK (source_employee_id <> target_employee_id),
    CONSTRAINT check_relation_target_not_empty CHECK (
        (source_role_id IS NOT NULL AND target_role_id IS NOT NULL) OR
        (source_employee_id IS NOT NULL AND target_employee_id IS NOT NULL)
    ),
    CONSTRAINT check_dates CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_org_relationships_company ON public.org_relationships(company_id);
CREATE INDEX IF NOT EXISTS idx_org_relationships_active ON public.org_relationships(data_inicio, data_fim);

-- ─── 5. LIMITES DE AUTORIDADE / ALÇADAS (org_authority_limits) ──

CREATE TABLE IF NOT EXISTS public.org_authority_limits (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    flow_type             authority_flow_type NOT NULL,
    
    -- Alçada pode pertencer a um cargo, a um departamento inteiro ou a uma pessoa específica
    role_id               UUID REFERENCES public.org_roles(id) ON DELETE CASCADE,
    department_id         UUID REFERENCES public.company_departments(id) ON DELETE CASCADE,
    employee_id           UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    
    limite_minimo         NUMERIC(15,2) DEFAULT 0.00,
    limite_maximo         NUMERIC(15,2) NOT NULL, -- usar valor negativo ou muito alto para "ilimitado"
    requer_dupla_assinatura BOOLEAN DEFAULT false,
    
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT check_limits CHECK (limite_maximo >= limite_minimo),
    CONSTRAINT check_target_exists CHECK (
        (role_id IS NOT NULL AND department_id IS NULL AND employee_id IS NULL) OR
        (role_id IS NULL AND department_id IS NOT NULL AND employee_id IS NULL) OR
        (role_id IS NULL AND department_id IS NULL AND employee_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_authority_limits_company ON public.org_authority_limits(company_id);

CREATE OR REPLACE FUNCTION set_org_authority_limits_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS org_authority_limits_updated_at ON public.org_authority_limits;
CREATE TRIGGER org_authority_limits_updated_at
    BEFORE UPDATE ON public.org_authority_limits
    FOR EACH ROW EXECUTE FUNCTION set_org_authority_limits_updated_at();

-- ─── 6. DELEGAÇÕES TEMPORÁRIAS (org_delegations) ─────────────

CREATE TABLE IF NOT EXISTS public.org_delegations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    delegator_employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    delegatee_employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    flow_type             authority_flow_type, -- NULL indica delegação total de todas as alçadas
    limite_maximo         NUMERIC(15,2),
    
    data_inicio           TIMESTAMPTZ NOT NULL,
    data_fim              TIMESTAMPTZ NOT NULL,
    status                TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'expirada', 'revogada')),
    motivo                TEXT,
    
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT check_delegator_delegatee CHECK (delegator_employee_id <> delegatee_employee_id),
    CONSTRAINT check_delegation_dates CHECK (data_fim > data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_org_delegations_company ON public.org_delegations(company_id);
CREATE INDEX IF NOT EXISTS idx_org_delegations_active ON public.org_delegations(status) WHERE status = 'ativa';

-- ─── 7. MATRIZ RACI (org_raci_matrix) ────────────────────────

CREATE TABLE IF NOT EXISTS public.org_raci_matrix (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    processo_nome         TEXT NOT NULL,
    etapa_nome            TEXT,
    role_type             raci_role_type NOT NULL,
    
    role_id               UUID REFERENCES public.org_roles(id) ON DELETE CASCADE,
    department_id         UUID REFERENCES public.company_departments(id) ON DELETE CASCADE,
    employee_id           UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT check_raci_target_exists CHECK (
        (role_id IS NOT NULL AND department_id IS NULL AND employee_id IS NULL) OR
        (role_id IS NULL AND department_id IS NOT NULL AND employee_id IS NULL) OR
        (role_id IS NULL AND department_id IS NULL AND employee_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_raci_matrix_company ON public.org_raci_matrix(company_id);

-- Índice único baseado em expressão para lidar com múltiplos nulos no PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS idx_raci_matrix_unique_expr 
    ON public.org_raci_matrix(
        company_id, 
        processo_nome, 
        COALESCE(etapa_nome, ''), 
        role_type, 
        COALESCE(role_id, '00000000-0000-0000-0000-000000000000'::uuid), 
        COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid), 
        COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

-- ─── 8. GESTÃO DE COMITÊS (org_committees) ───────────────────

CREATE TABLE IF NOT EXISTS public.org_committees (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nome                  TEXT NOT NULL,
    descricao             TEXT,
    data_constituicao     DATE,
    data_encerramento     DATE,
    status                TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'suspenso')),
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_committees_company ON public.org_committees(company_id);

CREATE TABLE IF NOT EXISTS public.org_committee_members (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    committee_id          UUID NOT NULL REFERENCES public.org_committees(id) ON DELETE CASCADE,
    employee_id           UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    papel                 TEXT NOT NULL DEFAULT 'membro',
    data_inicio           DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim              DATE,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(committee_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_committee_members_committee ON public.org_committee_members(committee_id);

-- ─── 9. PLANOS DE SUCESSÃO (org_succession_plans) ────────────

CREATE TABLE IF NOT EXISTS public.org_succession_plans (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    target_role_id        UUID NOT NULL REFERENCES public.org_roles(id) ON DELETE CASCADE,
    current_employee_id   UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    successor_employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    
    prontidao             readiness_level NOT NULL,
    risco_perda           risk_level NOT NULL DEFAULT 'baixo',
    gap_competencias      TEXT[] DEFAULT '{}'::text[],
    plano_desenvolvimento TEXT,
    
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(target_role_id, successor_employee_id)
);

CREATE INDEX IF NOT EXISTS idx_succession_plans_company ON public.org_succession_plans(company_id);

CREATE OR REPLACE FUNCTION set_org_succession_plans_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS org_succession_plans_updated_at ON public.org_succession_plans;
CREATE TRIGGER org_succession_plans_updated_at
    BEFORE UPDATE ON public.org_succession_plans
    FOR EACH ROW EXECUTE FUNCTION set_org_succession_plans_updated_at();

-- ─── 10. MODO SANDBOX (org_sandbox_scenarios) ────────────────

CREATE TABLE IF NOT EXISTS public.org_sandbox_scenarios (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nome                  TEXT NOT NULL,
    descricao             TEXT,
    estrutura_dados       JSONB NOT NULL,
    criador_email         TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovado', 'arquivado')),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_scenarios_company ON public.org_sandbox_scenarios(company_id);

CREATE OR REPLACE FUNCTION set_org_sandbox_scenarios_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS org_sandbox_scenarios_updated_at ON public.org_sandbox_scenarios;
CREATE TRIGGER org_sandbox_scenarios_updated_at
    BEFORE UPDATE ON public.org_sandbox_scenarios
    FOR EACH ROW EXECUTE FUNCTION set_org_sandbox_scenarios_updated_at();

-- ─── 11. HABILITAR ROW LEVEL SECURITY (RLS) ──────────────────

ALTER TABLE public.org_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_authority_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_raci_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_committee_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_succession_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_sandbox_scenarios ENABLE ROW LEVEL SECURITY;

-- ─── 12. POLÍTICAS DE RLS (ROW LEVEL SECURITY) ───────────────

-- Função de ajuda interna para encurtar políticas
CREATE OR REPLACE FUNCTION public.check_user_belongs_to_company(c_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = c_id
          AND c.org_id IN (
              SELECT organization_id FROM public.organization_members
              WHERE email = (auth.jwt() ->> 'email')
          )
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.check_user_is_admin_of_company(c_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = c_id
          AND c.org_id IN (
              SELECT organization_id FROM public.organization_members
              WHERE email = (auth.jwt() ->> 'email')
                AND role IN ('owner', 'admin')
          )
    );
END;
$$ LANGUAGE plpgsql;

-- 12.1. org_roles
DROP POLICY IF EXISTS "org_roles_select" ON public.org_roles;
CREATE POLICY "org_roles_select" ON public.org_roles
    FOR SELECT USING (public.check_user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "org_roles_all_admin" ON public.org_roles;
CREATE POLICY "org_roles_all_admin" ON public.org_roles
    FOR ALL USING (public.check_user_is_admin_of_company(company_id));

-- 12.2. org_relationships
DROP POLICY IF EXISTS "org_relationships_select" ON public.org_relationships;
CREATE POLICY "org_relationships_select" ON public.org_relationships
    FOR SELECT USING (public.check_user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "org_relationships_all_admin" ON public.org_relationships;
CREATE POLICY "org_relationships_all_admin" ON public.org_relationships
    FOR ALL USING (public.check_user_is_admin_of_company(company_id));

-- 12.3. org_authority_limits
DROP POLICY IF EXISTS "org_authority_limits_select" ON public.org_authority_limits;
CREATE POLICY "org_authority_limits_select" ON public.org_authority_limits
    FOR SELECT USING (public.check_user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "org_authority_limits_all_admin" ON public.org_authority_limits;
CREATE POLICY "org_authority_limits_all_admin" ON public.org_authority_limits
    FOR ALL USING (public.check_user_is_admin_of_company(company_id));

-- 12.4. org_delegations
DROP POLICY IF EXISTS "org_delegations_select" ON public.org_delegations;
CREATE POLICY "org_delegations_select" ON public.org_delegations
    FOR SELECT USING (public.check_user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "org_delegations_all_admin" ON public.org_delegations;
CREATE POLICY "org_delegations_all_admin" ON public.org_delegations
    FOR ALL USING (public.check_user_is_admin_of_company(company_id));

-- 12.5. org_raci_matrix
DROP POLICY IF EXISTS "org_raci_matrix_select" ON public.org_raci_matrix;
CREATE POLICY "org_raci_matrix_select" ON public.org_raci_matrix
    FOR SELECT USING (public.check_user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "org_raci_matrix_all_admin" ON public.org_raci_matrix;
CREATE POLICY "org_raci_matrix_all_admin" ON public.org_raci_matrix
    FOR ALL USING (public.check_user_is_admin_of_company(company_id));

-- 12.6. org_committees
DROP POLICY IF EXISTS "org_committees_select" ON public.org_committees;
CREATE POLICY "org_committees_select" ON public.org_committees
    FOR SELECT USING (public.check_user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "org_committees_all_admin" ON public.org_committees;
CREATE POLICY "org_committees_all_admin" ON public.org_committees
    FOR ALL USING (public.check_user_is_admin_of_company(company_id));

-- 12.7. org_committee_members
DROP POLICY IF EXISTS "org_committee_members_select" ON public.org_committee_members;
CREATE POLICY "org_committee_members_select" ON public.org_committee_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.org_committees c
            WHERE c.id = committee_id
              AND public.check_user_belongs_to_company(c.company_id)
        )
    );

DROP POLICY IF EXISTS "org_committee_members_all_admin" ON public.org_committee_members;
CREATE POLICY "org_committee_members_all_admin" ON public.org_committee_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.org_committees c
            WHERE c.id = committee_id
              AND public.check_user_is_admin_of_company(c.company_id)
        )
    );

-- 12.8. org_succession_plans
DROP POLICY IF EXISTS "org_succession_plans_select" ON public.org_succession_plans;
CREATE POLICY "org_succession_plans_select" ON public.org_succession_plans
    FOR SELECT USING (public.check_user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "org_succession_plans_all_admin" ON public.org_succession_plans;
CREATE POLICY "org_succession_plans_all_admin" ON public.org_succession_plans
    FOR ALL USING (public.check_user_is_admin_of_company(company_id));

-- 12.9. org_sandbox_scenarios
DROP POLICY IF EXISTS "org_sandbox_scenarios_select" ON public.org_sandbox_scenarios;
CREATE POLICY "org_sandbox_scenarios_select" ON public.org_sandbox_scenarios
    FOR SELECT USING (public.check_user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "org_sandbox_scenarios_all_admin" ON public.org_sandbox_scenarios;
CREATE POLICY "org_sandbox_scenarios_all_admin" ON public.org_sandbox_scenarios
    FOR ALL USING (public.check_user_is_admin_of_company(company_id));


-- ─── 13. TRIGGERS DE AUDITORIA (INTEGRAÇÃO COM company_audit_log) ─

-- Trigger para auditar mudanças nas alçadas financeiras (org_authority_limits)
CREATE OR REPLACE FUNCTION log_org_authority_limits_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.company_audit_log (company_id, user_email, action, field_changed, old_value, new_value)
        VALUES (
            NEW.company_id,
            COALESCE(auth.jwt() ->> 'email', 'system'),
            'create',
            'authority_limit',
            NULL,
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.company_audit_log (company_id, user_email, action, field_changed, old_value, new_value)
        VALUES (
            NEW.company_id,
            COALESCE(auth.jwt() ->> 'email', 'system'),
            'update',
            'authority_limit',
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.company_audit_log (company_id, user_email, action, field_changed, old_value, new_value)
        VALUES (
            OLD.company_id,
            COALESCE(auth.jwt() ->> 'email', 'system'),
            'delete',
            'authority_limit',
            to_jsonb(OLD),
            NULL
        );
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS org_authority_limits_audit ON public.org_authority_limits;
CREATE TRIGGER org_authority_limits_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.org_authority_limits
    FOR EACH ROW EXECUTE FUNCTION log_org_authority_limits_change();

-- Trigger para auditar delegações temporárias de autoridade (org_delegations)
CREATE OR REPLACE FUNCTION log_org_delegations_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.company_audit_log (company_id, user_email, action, field_changed, old_value, new_value)
        VALUES (
            NEW.company_id,
            COALESCE(auth.jwt() ->> 'email', 'system'),
            'create',
            'delegation',
            NULL,
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.company_audit_log (company_id, user_email, action, field_changed, old_value, new_value)
        VALUES (
            NEW.company_id,
            COALESCE(auth.jwt() ->> 'email', 'system'),
            'update',
            'delegation',
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.company_audit_log (company_id, user_email, action, field_changed, old_value, new_value)
        VALUES (
            OLD.company_id,
            COALESCE(auth.jwt() ->> 'email', 'system'),
            'delete',
            'delegation',
            to_jsonb(OLD),
            NULL
        );
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS org_delegations_audit ON public.org_delegations;
CREATE TRIGGER org_delegations_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.org_delegations
    FOR EACH ROW EXECUTE FUNCTION log_org_delegations_change();
