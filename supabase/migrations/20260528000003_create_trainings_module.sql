-- ============================================================
-- Sprint 4: Módulo de Treinamentos
-- Tabelas: training_courses, employee_trainings
-- ============================================================

-- 1. CATÁLOGO DE CURSOS / TREINAMENTOS
CREATE TABLE IF NOT EXISTS public.training_courses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome                TEXT NOT NULL,
    descricao           TEXT,
    nr_referencia       TEXT,               -- Ex: NR-35, NR-18, NR-10
    categoria           TEXT NOT NULL DEFAULT 'INTERNO'
                            CHECK (categoria IN (
                                'NR_OBRIGATORIA','INTEGRACAO','DDS',
                                'QUALIDADE','LIDERANCA','TECNICO','OUTROS'
                            )),
    carga_horaria       NUMERIC(6,1) DEFAULT 0,
    validade_meses      INTEGER,            -- NULL = sem validade
    instrutor           TEXT,
    is_obrigatorio      BOOLEAN NOT NULL DEFAULT FALSE,
    -- Funções que exigem este treinamento (array de strings)
    roles_obrigatorios  TEXT[] DEFAULT '{}',
    status              TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','INATIVO')),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_courses_org    ON public.training_courses(org_id);
CREATE INDEX IF NOT EXISTS idx_training_courses_nr     ON public.training_courses(nr_referencia) WHERE nr_referencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_courses_status ON public.training_courses(org_id, status);

-- 2. TREINAMENTOS POR COLABORADOR
CREATE TABLE IF NOT EXISTS public.employee_trainings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    course_id       UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
    data_realizacao DATE NOT NULL,
    data_validade   DATE,               -- preenchido automaticamente se course tiver validade_meses
    instrutor       TEXT,
    local           TEXT,
    carga_horaria   NUMERIC(6,1),
    certificado_url TEXT,               -- path no bucket organization-assets
    nota            NUMERIC(4,1),       -- 0-10
    aprovado        BOOLEAN NOT NULL DEFAULT TRUE,
    status          TEXT NOT NULL DEFAULT 'ATIVO'
                        CHECK (status IN ('ATIVO','VENCIDO','PENDENTE')),
    observacoes     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_trainings_employee  ON public.employee_trainings(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_trainings_course    ON public.employee_trainings(course_id);
CREATE INDEX IF NOT EXISTS idx_emp_trainings_org       ON public.employee_trainings(org_id);
CREATE INDEX IF NOT EXISTS idx_emp_trainings_validade  ON public.employee_trainings(data_validade) WHERE data_validade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emp_trainings_status    ON public.employee_trainings(org_id, status);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.training_courses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_trainings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_courses_org_access" ON public.training_courses
    FOR ALL USING (public.is_org_member(org_id));

CREATE POLICY "employee_trainings_org_access" ON public.employee_trainings
    FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER trg_training_courses_updated_at
    BEFORE UPDATE ON public.training_courses
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_employee_trainings_updated_at
    BEFORE UPDATE ON public.employee_trainings
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- FUNÇÃO: preencher data_validade automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_training_validade()
RETURNS TRIGGER AS $$
DECLARE
    v_validade_meses INTEGER;
BEGIN
    -- Se não foi informada data_validade manualmente, calcula pelo curso
    IF NEW.data_validade IS NULL THEN
        SELECT validade_meses INTO v_validade_meses
        FROM public.training_courses WHERE id = NEW.course_id;

        IF v_validade_meses IS NOT NULL THEN
            NEW.data_validade := NEW.data_realizacao + (v_validade_meses || ' months')::INTERVAL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_training_validade
    BEFORE INSERT ON public.employee_trainings
    FOR EACH ROW EXECUTE FUNCTION public.set_training_validade();
