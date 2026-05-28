-- ============================================================
-- Sprint 15: BI Avançado — Analytics RH
-- turnover por obra, produtividade histórica, retenção
-- ============================================================

-- 1. SNAPSHOTS MENSAIS DE MÉTRICAS RH
CREATE TABLE IF NOT EXISTS public.hr_monthly_snapshots (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    ano_mes                  DATE NOT NULL,   -- sempre o primeiro dia do mês
    -- Headcount
    headcount_inicio         INTEGER DEFAULT 0,
    headcount_fim            INTEGER DEFAULT 0,
    admissoes                INTEGER DEFAULT 0,
    demissoes                INTEGER DEFAULT 0,
    -- Turnover
    turnover_rate            NUMERIC(5,2),    -- %
    turnover_voluntario      INTEGER DEFAULT 0,
    turnover_involuntario    INTEGER DEFAULT 0,
    -- Absenteísmo
    dias_uteis               INTEGER,
    dias_ausencia            INTEGER DEFAULT 0,
    absenteismo_rate         NUMERIC(5,2),
    -- Custo (integração com folha)
    custo_folha_total        NUMERIC(14,2),
    custo_encargos           NUMERIC(14,2),
    custo_medio_colaborador  NUMERIC(14,2),
    -- Horas (integração com ponto)
    horas_trabalhadas        NUMERIC(10,2),
    horas_extras             NUMERIC(10,2),
    horas_extras_rate        NUMERIC(5,2),
    -- Breakdown por dimensão
    breakdown_por_funcao     JSONB DEFAULT '{}'::jsonb,
    breakdown_por_obra       JSONB DEFAULT '{}'::jsonb,
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (org_id, ano_mes)
);

CREATE INDEX IF NOT EXISTS idx_hr_snap_org     ON public.hr_monthly_snapshots(org_id);
CREATE INDEX IF NOT EXISTS idx_hr_snap_ano_mes ON public.hr_monthly_snapshots(org_id, ano_mes);

-- 2. EVENTOS DE MOVIMENTAÇÃO (histórico individual)
CREATE TABLE IF NOT EXISTS public.hr_turnover_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    tipo            TEXT NOT NULL CHECK (tipo IN (
                        'ADMISSAO','DEMISSAO_VOLUNTARIA','DEMISSAO_INVOLUNTARIA',
                        'TRANSFERENCIA','PROMOCAO','REBAIXAMENTO')),
    data_evento     DATE NOT NULL,
    motivo          TEXT,
    -- Para saídas
    cargo_saida     TEXT,
    salario_saida   NUMERIC(12,2),
    -- Para entradas / promoções
    cargo_entrada   TEXT,
    salario_entrada NUMERIC(12,2),
    -- Para transferências
    origem_ref      TEXT,   -- nome obra ou departamento
    destino_ref     TEXT,
    observacao      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_turnover_org      ON public.hr_turnover_events(org_id);
CREATE INDEX IF NOT EXISTS idx_turnover_emp      ON public.hr_turnover_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_turnover_data     ON public.hr_turnover_events(org_id, data_evento);
CREATE INDEX IF NOT EXISTS idx_turnover_tipo     ON public.hr_turnover_events(org_id, tipo);

-- 3. PRODUTIVIDADE POR OBRA / MÊS
CREATE TABLE IF NOT EXISTS public.hr_productivity_metrics (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id         UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    ano_mes            DATE NOT NULL,
    -- Horas
    hh_disponivel      NUMERIC(10,2),
    hh_produtivo       NUMERIC(10,2),
    eficiencia_pct     NUMERIC(5,2),
    -- Custo MO
    custo_mdo_direto   NUMERIC(14,2),
    custo_mdo_indireto NUMERIC(14,2),
    -- Avanço físico vs custo
    avanco_fisico_pct  NUMERIC(5,2),
    custo_previsto     NUMERIC(14,2),
    custo_realizado    NUMERIC(14,2),
    idc                NUMERIC(6,3),   -- Índice de Desempenho de Custo
    -- Equipe no mês
    headcount_obra     INTEGER,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (org_id, project_id, ano_mes)
);

CREATE INDEX IF NOT EXISTS idx_prod_org     ON public.hr_productivity_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_prod_project ON public.hr_productivity_metrics(project_id);
CREATE INDEX IF NOT EXISTS idx_prod_mes     ON public.hr_productivity_metrics(org_id, ano_mes);

-- 4. METAS DE RH (targets para comparar com snapshots)
CREATE TABLE IF NOT EXISTS public.hr_targets (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    ano                  INTEGER NOT NULL,
    turnover_max_pct     NUMERIC(5,2),
    absenteismo_max_pct  NUMERIC(5,2),
    horas_extras_max_pct NUMERIC(5,2),
    eficiencia_min_pct   NUMERIC(5,2),
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (org_id, ano)
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.hr_monthly_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_turnover_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_productivity_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_targets             ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_snap_org"    ON public.hr_monthly_snapshots    FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "hr_turn_org"    ON public.hr_turnover_events      FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "hr_prod_org"    ON public.hr_productivity_metrics  FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "hr_targets_org" ON public.hr_targets              FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- RPC: Gerar snapshot mensal de RH
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_hr_monthly_snapshot(p_org_id UUID, p_ano_mes DATE)
RETURNS JSON AS $$
DECLARE
    v_inicio      DATE := DATE_TRUNC('month', p_ano_mes)::DATE;
    v_fim         DATE := (DATE_TRUNC('month', p_ano_mes) + INTERVAL '1 month - 1 day')::DATE;
    v_h_inicio    INTEGER;
    v_h_fim       INTEGER;
    v_admissoes   INTEGER;
    v_dem_vol     INTEGER;
    v_dem_inv     INTEGER;
    v_turnover    NUMERIC;
BEGIN
    SELECT COUNT(*) INTO v_h_inicio FROM public.employees
    WHERE org_id = p_org_id AND status = 'ATIVO' AND hire_date < v_inicio;

    SELECT COUNT(*) INTO v_h_fim FROM public.employees
    WHERE org_id = p_org_id AND status = 'ATIVO' AND hire_date <= v_fim;

    SELECT COUNT(*) INTO v_admissoes FROM public.employees
    WHERE org_id = p_org_id AND DATE_TRUNC('month', hire_date) = v_inicio;

    SELECT COUNT(*) INTO v_dem_vol FROM public.hr_turnover_events
    WHERE org_id = p_org_id AND tipo = 'DEMISSAO_VOLUNTARIA'
      AND DATE_TRUNC('month', data_evento) = v_inicio;

    SELECT COUNT(*) INTO v_dem_inv FROM public.hr_turnover_events
    WHERE org_id = p_org_id AND tipo = 'DEMISSAO_INVOLUNTARIA'
      AND DATE_TRUNC('month', data_evento) = v_inicio;

    -- Fórmula BDO: demissões / média headcount * 100
    v_turnover := CASE
        WHEN (v_h_inicio + v_h_fim) > 0
        THEN ROUND(((v_dem_vol + v_dem_inv)::NUMERIC / ((v_h_inicio + v_h_fim) / 2.0)) * 100, 2)
        ELSE 0
    END;

    INSERT INTO public.hr_monthly_snapshots (
        org_id, ano_mes,
        headcount_inicio, headcount_fim,
        admissoes, demissoes,
        turnover_rate, turnover_voluntario, turnover_involuntario
    ) VALUES (
        p_org_id, v_inicio,
        v_h_inicio, v_h_fim,
        v_admissoes, (v_dem_vol + v_dem_inv),
        v_turnover, v_dem_vol, v_dem_inv
    )
    ON CONFLICT (org_id, ano_mes) DO UPDATE SET
        headcount_inicio     = EXCLUDED.headcount_inicio,
        headcount_fim        = EXCLUDED.headcount_fim,
        admissoes            = EXCLUDED.admissoes,
        demissoes            = EXCLUDED.demissoes,
        turnover_rate        = EXCLUDED.turnover_rate,
        turnover_voluntario  = EXCLUDED.turnover_voluntario,
        turnover_involuntario = EXCLUDED.turnover_involuntario;

    RETURN json_build_object(
        'success', TRUE,
        'headcount_fim', v_h_fim,
        'turnover_rate', v_turnover,
        'admissoes', v_admissoes,
        'demissoes', (v_dem_vol + v_dem_inv)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.generate_hr_monthly_snapshot(UUID, DATE) TO authenticated;

-- ============================================================
-- VIEWS ANALÍTICAS
-- ============================================================

-- Tendência de turnover com média móvel 3 meses
CREATE OR REPLACE VIEW public.vw_hr_turnover_trend AS
SELECT
    s.org_id,
    s.ano_mes,
    s.headcount_fim,
    s.admissoes,
    s.demissoes,
    s.turnover_rate,
    s.turnover_voluntario,
    s.turnover_involuntario,
    s.absenteismo_rate,
    s.custo_folha_total,
    s.custo_medio_colaborador,
    ROUND(AVG(s.turnover_rate) OVER (
        PARTITION BY s.org_id ORDER BY s.ano_mes
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ), 2) AS turnover_media_3m,
    ROUND(AVG(s.absenteismo_rate) OVER (
        PARTITION BY s.org_id ORDER BY s.ano_mes
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ), 2) AS absenteismo_media_3m
FROM public.hr_monthly_snapshots s;

-- Retenção por tempo de casa
CREATE OR REPLACE VIEW public.vw_hr_retention_cohorts AS
SELECT
    e.org_id,
    DATE_TRUNC('month', e.hire_date)::DATE      AS coorte_mes,
    COUNT(*)                                    AS admitidos,
    COUNT(*) FILTER (WHERE e.status = 'ATIVO')  AS ainda_ativos,
    ROUND(
        COUNT(*) FILTER (WHERE e.status = 'ATIVO')::NUMERIC / NULLIF(COUNT(*), 0) * 100,
    1)                                          AS taxa_retencao_pct,
    ROUND(AVG(
        (COALESCE(e.termination_date, CURRENT_DATE) - e.hire_date)
    ))::INTEGER                                 AS permanencia_media_dias
FROM public.employees e
GROUP BY e.org_id, DATE_TRUNC('month', e.hire_date)::DATE;

-- Produtividade por obra com desvio de custo
CREATE OR REPLACE VIEW public.vw_hr_productivity_by_project AS
SELECT
    p.org_id,
    p.project_id,
    pr.name AS projeto_nome,
    SUM(p.hh_produtivo)                                                AS hh_total,
    ROUND(AVG(p.eficiencia_pct), 1)                                    AS eficiencia_media_pct,
    SUM(p.custo_mdo_direto)                                            AS custo_total_mdo,
    SUM(p.custo_previsto)                                              AS custo_previsto_total,
    SUM(p.custo_realizado)                                             AS custo_realizado_total,
    ROUND(
        (SUM(p.custo_realizado) - SUM(p.custo_previsto)) / NULLIF(SUM(p.custo_previsto), 0) * 100,
    1)                                                                 AS desvio_custo_pct,
    ROUND(AVG(p.idc), 3)                                               AS idc_medio
FROM public.hr_productivity_metrics p
LEFT JOIN public.projects pr ON pr.id = p.project_id
GROUP BY p.org_id, p.project_id, pr.name;
