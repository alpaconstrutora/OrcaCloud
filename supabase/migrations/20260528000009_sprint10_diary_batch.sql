-- ============================================================
-- Sprint 10: Diário de Obra Integrado + Apontamento HH em Lote
-- ============================================================

-- 1. Vincular productivity_logs ao diário de obra
ALTER TABLE public.productivity_logs
    ADD COLUMN IF NOT EXISTS diary_entry_id UUID,   -- FK opcional para diário de obra existente
    ADD COLUMN IF NOT EXISTS turno          TEXT DEFAULT 'MANHA'
        CHECK (turno IN ('MANHA','TARDE','NOITE') OR turno IS NULL),
    ADD COLUMN IF NOT EXISTS condicao_tempo TEXT DEFAULT 'BOM'
        CHECK (condicao_tempo IN ('BOM','NUBLADO','CHUVA','CHUVA_FORTE') OR condicao_tempo IS NULL),
    ADD COLUMN IF NOT EXISTS efetivo_previsto INTEGER,
    ADD COLUMN IF NOT EXISTS efetivo_realizado INTEGER;

-- 2. REGISTROS DE DIÁRIO DE MÃO DE OBRA (resumo diário por obra/equipe)
CREATE TABLE IF NOT EXISTS public.labor_diary_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name    TEXT,
    team_id         UUID REFERENCES public.labor_teams(id) ON DELETE SET NULL,
    encarregado_id  UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    data            DATE NOT NULL DEFAULT CURRENT_DATE,
    turno           TEXT NOT NULL DEFAULT 'MANHA'
                        CHECK (turno IN ('MANHA','TARDE','NOITE','INTEGRAL')),
    condicao_tempo  TEXT DEFAULT 'BOM'
                        CHECK (condicao_tempo IN ('BOM','NUBLADO','CHUVA','CHUVA_FORTE')),
    efetivo         INTEGER NOT NULL DEFAULT 0,
    total_hh        NUMERIC(8,2) DEFAULT 0,         -- calculado ao fechar
    atividades      TEXT,                            -- resumo livre das atividades
    ocorrencias     TEXT,                            -- intercorrências / observações
    foto_urls       TEXT[] DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'ABERTO'
                        CHECK (status IN ('ABERTO','FECHADO')),
    -- Ao fechar: gera time_entries em lote automaticamente
    batch_generated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (project_id, team_id, data, turno)
);

CREATE INDEX IF NOT EXISTS idx_labor_diary_org     ON public.labor_diary_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_labor_diary_project ON public.labor_diary_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_labor_diary_data    ON public.labor_diary_entries(data);
CREATE INDEX IF NOT EXISTS idx_labor_diary_team    ON public.labor_diary_entries(team_id);

-- 3. PARTICIPANTES DO DIÁRIO (quais colaboradores estavam presentes)
CREATE TABLE IF NOT EXISTS public.labor_diary_workers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diary_entry_id  UUID NOT NULL REFERENCES public.labor_diary_entries(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    horas_trabalhadas NUMERIC(5,2) NOT NULL DEFAULT 8,
    horas_extras    NUMERIC(5,2) DEFAULT 0,
    presente        BOOLEAN NOT NULL DEFAULT TRUE,
    observacao      TEXT,
    UNIQUE (diary_entry_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_diary_workers_diary    ON public.labor_diary_workers(diary_entry_id);
CREATE INDEX IF NOT EXISTS idx_diary_workers_employee ON public.labor_diary_workers(employee_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.labor_diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_diary_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labor_diary_entries_org_access" ON public.labor_diary_entries
    FOR ALL USING (public.is_org_member(org_id));

CREATE POLICY "labor_diary_workers_org_access" ON public.labor_diary_workers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.labor_diary_entries d
            WHERE d.id = diary_entry_id AND public.is_org_member(d.org_id)
        )
    );

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER trg_labor_diary_updated_at
    BEFORE UPDATE ON public.labor_diary_entries
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- FUNÇÃO RPC: fechar diário e gerar time_entries em lote
-- ============================================================

CREATE OR REPLACE FUNCTION public.close_labor_diary(p_diary_id UUID)
RETURNS JSON AS $$
DECLARE
    v_diary     public.labor_diary_entries;
    v_worker    public.labor_diary_workers;
    v_emp       public.employees;
    v_inserted  INTEGER := 0;
    v_skipped   INTEGER := 0;
BEGIN
    SELECT * INTO v_diary FROM public.labor_diary_entries WHERE id = p_diary_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Diário não encontrado');
    END IF;

    IF v_diary.status = 'FECHADO' AND v_diary.batch_generated THEN
        RETURN json_build_object('success', FALSE, 'error', 'Diário já fechado e lote gerado');
    END IF;

    -- Para cada trabalhador presente no diário
    FOR v_worker IN
        SELECT * FROM public.labor_diary_workers
        WHERE diary_entry_id = p_diary_id AND presente = TRUE
    LOOP
        SELECT * INTO v_emp FROM public.employees WHERE id = v_worker.employee_id;

        -- Inserir time_entry (ignora duplicatas pelo unique index)
        BEGIN
            INSERT INTO public.time_entries (
                employee_id, project_id, project_name, team_id,
                date, hours_worked, overtime_hours, hourly_rate,
                status, entry_method, notes
            ) VALUES (
                v_worker.employee_id,
                v_diary.project_id,
                v_diary.project_name,
                v_diary.team_id,
                v_diary.data,
                v_worker.horas_trabalhadas,
                v_worker.horas_extras,
                COALESCE(v_emp.hourly_cost, 0),
                'PENDENTE',
                'app',
                'Gerado automaticamente pelo diário de obra'
            );
            v_inserted := v_inserted + 1;
        EXCEPTION WHEN unique_violation THEN
            v_skipped := v_skipped + 1;
        END;
    END LOOP;

    -- Calcular total HH e fechar
    UPDATE public.labor_diary_entries
    SET
        status          = 'FECHADO',
        batch_generated = TRUE,
        total_hh        = (
            SELECT COALESCE(SUM(horas_trabalhadas + horas_extras), 0)
            FROM public.labor_diary_workers
            WHERE diary_entry_id = p_diary_id AND presente = TRUE
        ),
        updated_at = NOW()
    WHERE id = p_diary_id;

    RETURN json_build_object(
        'success',   TRUE,
        'inserted',  v_inserted,
        'skipped',   v_skipped,
        'total_hh',  (SELECT total_hh FROM public.labor_diary_entries WHERE id = p_diary_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.close_labor_diary(UUID) TO authenticated;
