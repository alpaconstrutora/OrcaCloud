-- ============================================================
-- Sprint 8: SST — Segurança e Saúde do Trabalho
-- Tabelas: accidents (CAT), sst_checklists_obra, risk_assessments
-- ============================================================

-- 1. ACIDENTES DE TRABALHO (CAT)
CREATE TABLE IF NOT EXISTS public.accidents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    project_id          UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name        TEXT,

    -- Dados do acidente
    data_acidente       DATE NOT NULL,
    hora_acidente       TIME,
    tipo                TEXT NOT NULL CHECK (tipo IN (
                            'TIPICO','TRAJETO','DOENCA_OCUPACIONAL','QUASE_ACIDENTE'
                        )),
    gravidade           TEXT NOT NULL CHECK (gravidade IN (
                            'SEM_AFASTAMENTO','COM_AFASTAMENTO','INCAPACIDADE_PERMANENTE','OBITO'
                        )),
    local_acidente      TEXT,
    descricao           TEXT NOT NULL,
    causa_provavel      TEXT,
    parte_corpo         TEXT,
    agente_causador     TEXT,

    -- CAT
    cat_numero          TEXT,
    cat_emitida         BOOLEAN NOT NULL DEFAULT FALSE,
    cat_data_emissao    DATE,
    cat_url             TEXT,           -- PDF da CAT no storage

    -- Afastamento
    dias_afastamento    INTEGER DEFAULT 0,
    data_retorno        DATE,

    -- Investigação
    investigacao_realizada BOOLEAN NOT NULL DEFAULT FALSE,
    medidas_corretivas  TEXT,
    responsavel         TEXT,

    -- Indicadores
    horas_trabalhadas_acumuladas NUMERIC(10,2), -- para cálculo TFCA

    status              TEXT NOT NULL DEFAULT 'ABERTO'
                            CHECK (status IN ('ABERTO','INVESTIGANDO','FECHADO')),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accidents_org      ON public.accidents(org_id);
CREATE INDEX IF NOT EXISTS idx_accidents_employee ON public.accidents(employee_id);
CREATE INDEX IF NOT EXISTS idx_accidents_project  ON public.accidents(project_id);
CREATE INDEX IF NOT EXISTS idx_accidents_data     ON public.accidents(data_acidente);
CREATE INDEX IF NOT EXISTS idx_accidents_tipo     ON public.accidents(org_id, tipo);

-- 2. CHECKLISTS SST DE OBRA
CREATE TABLE IF NOT EXISTS public.sst_checklists_obra (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name    TEXT,
    responsavel_id  UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    nome_checklist  TEXT NOT NULL,
    nr_referencia   TEXT,           -- NR-18, NR-35, etc.
    data_aplicacao  DATE NOT NULL DEFAULT CURRENT_DATE,
    itens           JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Cada item: { id, descricao, conforme: bool|null, observacao, foto_url }
    conformidade_pct NUMERIC(5,2),  -- % de itens conformes
    status          TEXT NOT NULL DEFAULT 'PENDENTE'
                        CHECK (status IN ('PENDENTE','CONCLUIDO','REPROVADO')),
    observacoes     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sst_checklists_org     ON public.sst_checklists_obra(org_id);
CREATE INDEX IF NOT EXISTS idx_sst_checklists_project ON public.sst_checklists_obra(project_id);
CREATE INDEX IF NOT EXISTS idx_sst_checklists_data    ON public.sst_checklists_obra(data_aplicacao);

-- 3. AVALIAÇÕES DE RISCO (PGR / APR)
CREATE TABLE IF NOT EXISTS public.risk_assessments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name    TEXT,
    tipo            TEXT NOT NULL CHECK (tipo IN ('APR','PGR','PPRA','LTCAT','OUTROS')),
    titulo          TEXT NOT NULL,
    data_avaliacao  DATE NOT NULL DEFAULT CURRENT_DATE,
    proxima_revisao DATE,
    responsavel_tecnico TEXT,
    registro_profissional TEXT,
    riscos          JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Cada risco: { perigo, fonte, fator_risco, probabilidade 1-5, severidade 1-5,
    --               nivel_risco, medidas_controle[], status }
    status          TEXT NOT NULL DEFAULT 'VIGENTE'
                        CHECK (status IN ('VIGENTE','REVISAO','ARQUIVADO')),
    documento_url   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_org     ON public.risk_assessments(org_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_project ON public.risk_assessments(project_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.accidents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sst_checklists_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessments    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accidents_org_access"           ON public.accidents           FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "sst_checklists_org_access"      ON public.sst_checklists_obra FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "risk_assessments_org_access"    ON public.risk_assessments    FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================

CREATE TRIGGER trg_accidents_updated_at
    BEFORE UPDATE ON public.accidents
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_sst_checklists_updated_at
    BEFORE UPDATE ON public.sst_checklists_obra
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_risk_updated_at
    BEFORE UPDATE ON public.risk_assessments
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- FUNÇÃO RPC: indicadores SST (TFCA, taxa de gravidade)
-- ============================================================

CREATE OR REPLACE FUNCTION public.sst_indicators(
    p_org_id   UUID,
    p_year     INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS JSON AS $$
DECLARE
    v_total_accidents     INTEGER;
    v_with_leave          INTEGER;
    v_deaths              INTEGER;
    v_total_days_lost     INTEGER;
    v_hh_worked           NUMERIC;
    v_tfca                NUMERIC;   -- Taxa de Frequência com Afastamento
    v_tgca                NUMERIC;   -- Taxa de Gravidade
BEGIN
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE gravidade IN ('COM_AFASTAMENTO','INCAPACIDADE_PERMANENTE','OBITO')),
        COUNT(*) FILTER (WHERE gravidade = 'OBITO'),
        COALESCE(SUM(dias_afastamento), 0)
    INTO v_total_accidents, v_with_leave, v_deaths, v_total_days_lost
    FROM public.accidents
    WHERE org_id = p_org_id
      AND EXTRACT(YEAR FROM data_acidente) = p_year;

    -- Horas trabalhadas do ano (time_entries aprovadas)
    SELECT COALESCE(SUM(te.hours_worked), 0) INTO v_hh_worked
    FROM public.time_entries te
    JOIN public.employees e ON e.id = te.employee_id
    WHERE e.org_id = p_org_id
      AND te.status = 'APROVADO'
      AND EXTRACT(YEAR FROM te.date) = p_year;

    -- TFCA = (acidentes com afastamento / HH trabalhadas) * 1.000.000
    v_tfca := CASE WHEN v_hh_worked > 0 THEN ROUND((v_with_leave::NUMERIC / v_hh_worked) * 1000000, 2) ELSE 0 END;
    -- TGCA = (dias perdidos / HH trabalhadas) * 1.000.000
    v_tgca := CASE WHEN v_hh_worked > 0 THEN ROUND((v_total_days_lost::NUMERIC / v_hh_worked) * 1000000, 2) ELSE 0 END;

    RETURN json_build_object(
        'ano',              p_year,
        'total_acidentes',  v_total_accidents,
        'com_afastamento',  v_with_leave,
        'obitos',           v_deaths,
        'dias_perdidos',    v_total_days_lost,
        'hh_trabalhadas',   v_hh_worked,
        'tfca',             v_tfca,
        'tgca',             v_tgca
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.sst_indicators(UUID, INTEGER) TO authenticated;
