-- ============================================================
-- Sprint 3: Módulo de Férias e Ausências
-- Tabelas: absences, vacation_balance
-- ============================================================

-- 1. AUSÊNCIAS / AFASTAMENTOS
CREATE TABLE IF NOT EXISTS public.absences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    tipo            TEXT NOT NULL CHECK (tipo IN (
                        'FERIAS', 'ATESTADO', 'FALTA', 'LICENCA_MATERNIDADE',
                        'LICENCA_PATERNIDADE', 'LICENCA_MEDICA', 'AFASTAMENTO_INSS',
                        'SUSPENSAO', 'OUTROS'
                    )),
    data_inicio     DATE NOT NULL,
    data_fim        DATE NOT NULL,
    dias            INTEGER GENERATED ALWAYS AS (
                        (data_fim - data_inicio + 1)
                    ) STORED,
    status          TEXT NOT NULL DEFAULT 'SOLICITADO'
                        CHECK (status IN ('SOLICITADO','APROVADO','REJEITADO','CANCELADO')),
    motivo          TEXT,
    atestado_url    TEXT,           -- path no bucket organization-assets
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    rejection_reason TEXT,
    -- Férias: período aquisitivo a que se refere
    vacation_period_start   DATE,
    vacation_period_end     DATE,
    -- Controle
    payroll_run_id  UUID REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
    created_by      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT absence_dates_check CHECK (data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_absences_org        ON public.absences(org_id);
CREATE INDEX IF NOT EXISTS idx_absences_employee   ON public.absences(employee_id);
CREATE INDEX IF NOT EXISTS idx_absences_status     ON public.absences(org_id, status);
CREATE INDEX IF NOT EXISTS idx_absences_dates      ON public.absences(data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_absences_tipo       ON public.absences(org_id, tipo);

-- 2. SALDO DE FÉRIAS (um registro por período aquisitivo por colaborador)
CREATE TABLE IF NOT EXISTS public.vacation_balance (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id             UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    periodo_inicio          DATE NOT NULL,      -- início do período aquisitivo
    periodo_fim             DATE NOT NULL,      -- fim do período aquisitivo (normalmente +1 ano)
    dias_direito            INTEGER NOT NULL DEFAULT 30,
    dias_gozados            INTEGER NOT NULL DEFAULT 0 CHECK (dias_gozados >= 0),
    dias_vendidos           INTEGER NOT NULL DEFAULT 0 CHECK (dias_vendidos >= 0), -- abono pecuniário
    dias_restantes          INTEGER GENERATED ALWAYS AS (
                                dias_direito - dias_gozados - dias_vendidos
                            ) STORED,
    status                  TEXT NOT NULL DEFAULT 'ABERTO'
                                CHECK (status IN ('ABERTO','PARCIAL','GOZADO','VENCIDO')),
    vencimento              DATE GENERATED ALWAYS AS (
                                periodo_fim + INTERVAL '12 months'
                            ) STORED,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (employee_id, periodo_inicio)
);

CREATE INDEX IF NOT EXISTS idx_vacation_balance_employee ON public.vacation_balance(employee_id);
CREATE INDEX IF NOT EXISTS idx_vacation_balance_org      ON public.vacation_balance(org_id);
CREATE INDEX IF NOT EXISTS idx_vacation_balance_venc     ON public.vacation_balance(vencimento);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.absences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "absences_org_access" ON public.absences
    FOR ALL USING (public.is_org_member(org_id));

CREATE POLICY "vacation_balance_org_access" ON public.vacation_balance
    FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================

CREATE TRIGGER trg_absences_updated_at
    BEFORE UPDATE ON public.absences
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_vacation_balance_updated_at
    BEFORE UPDATE ON public.vacation_balance
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- FUNÇÃO: ao aprovar férias, debita dias_gozados no saldo
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_vacation_balance_on_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- Ao aprovar férias, incrementa dias_gozados no período correspondente
    IF NEW.tipo = 'FERIAS'
       AND NEW.status = 'APROVADO'
       AND OLD.status <> 'APROVADO'
       AND NEW.vacation_period_start IS NOT NULL THEN

        UPDATE public.vacation_balance
        SET dias_gozados = dias_gozados + NEW.dias
        WHERE employee_id = NEW.employee_id
          AND periodo_inicio = NEW.vacation_period_start;
    END IF;

    -- Ao cancelar ou rejeitar férias antes aprovadas, estorna dias
    IF NEW.tipo = 'FERIAS'
       AND OLD.status = 'APROVADO'
       AND NEW.status IN ('CANCELADO','REJEITADO')
       AND NEW.vacation_period_start IS NOT NULL THEN

        UPDATE public.vacation_balance
        SET dias_gozados = GREATEST(0, dias_gozados - NEW.dias)
        WHERE employee_id = NEW.employee_id
          AND periodo_inicio = NEW.vacation_period_start;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_vacation_balance
    AFTER UPDATE ON public.absences
    FOR EACH ROW EXECUTE FUNCTION public.sync_vacation_balance_on_approval();

-- ============================================================
-- FUNÇÃO RPC: criar saldo aquisitivo automaticamente na admissão
-- Chamada pelo service ao criar colaborador ou manualmente
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_vacation_period(
    p_employee_id UUID,
    p_org_id      UUID,
    p_hire_date   DATE
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.vacation_balance (
        org_id, employee_id, periodo_inicio, periodo_fim, dias_direito
    ) VALUES (
        p_org_id,
        p_employee_id,
        p_hire_date,
        p_hire_date + INTERVAL '1 year' - INTERVAL '1 day',
        30
    )
    ON CONFLICT (employee_id, periodo_inicio) DO NOTHING
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
