-- ============================================================
-- Sprint 13: Avaliação de Desempenho 360°
-- ============================================================

-- 1. CICLOS DE AVALIAÇÃO
CREATE TABLE IF NOT EXISTS public.evaluation_cycles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    descricao       TEXT,
    tipo            TEXT NOT NULL DEFAULT '180'
                        CHECK (tipo IN ('90','180','360','SELF')),
    periodo_inicio  DATE NOT NULL,
    periodo_fim     DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'RASCUNHO'
                        CHECK (status IN ('RASCUNHO','ATIVO','ENCERRADO')),
    -- Competências avaliadas (lista configurável por ciclo)
    competencias    JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Cada item: { id, nome, descricao, peso 1-5, categoria }
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_cycles_org    ON public.evaluation_cycles(org_id);
CREATE INDEX IF NOT EXISTS idx_eval_cycles_status ON public.evaluation_cycles(org_id, status);

-- 2. RESPOSTAS DE AVALIAÇÃO
CREATE TABLE IF NOT EXISTS public.evaluation_responses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cycle_id        UUID NOT NULL REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
    -- Quem está sendo avaliado
    evaluatee_id    UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    -- Quem está avaliando
    evaluator_id    UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('SELF','GESTOR','PAR','SUBORDINADO')),
    -- Respostas: [{ competencia_id, nota 1-5, comentario }]
    respostas       JSONB NOT NULL DEFAULT '[]'::jsonb,
    nota_media      NUMERIC(4,2),   -- calculada ao submeter
    pontos_fortes   TEXT,
    pontos_melhoria TEXT,
    comentario_geral TEXT,
    status          TEXT NOT NULL DEFAULT 'PENDENTE'
                        CHECK (status IN ('PENDENTE','EM_ANDAMENTO','CONCLUIDA')),
    submitted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cycle_id, evaluatee_id, evaluator_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_eval_resp_cycle      ON public.evaluation_responses(cycle_id);
CREATE INDEX IF NOT EXISTS idx_eval_resp_evaluatee  ON public.evaluation_responses(evaluatee_id);
CREATE INDEX IF NOT EXISTS idx_eval_resp_evaluator  ON public.evaluation_responses(evaluator_id);

-- 3. RESULTADOS CONSOLIDADOS (calculados ao encerrar ciclo)
CREATE TABLE IF NOT EXISTS public.evaluation_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cycle_id        UUID NOT NULL REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    nota_self       NUMERIC(4,2),
    nota_gestor     NUMERIC(4,2),
    nota_pares      NUMERIC(4,2),
    nota_final      NUMERIC(4,2),  -- média ponderada
    classificacao   TEXT CHECK (classificacao IN ('DESTAQUE','ACIMA','ESPERADO','ABAIXO','CRITICO')),
    notas_por_comp  JSONB DEFAULT '{}'::jsonb,  -- { comp_id: nota_media }
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cycle_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_results_cycle    ON public.evaluation_results(cycle_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_employee ON public.evaluation_results(employee_id);

-- 4. PLANO DE DESENVOLVIMENTO INDIVIDUAL (PDI)
CREATE TABLE IF NOT EXISTS public.pdi_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    cycle_id        UUID REFERENCES public.evaluation_cycles(id) ON DELETE SET NULL,
    competencia     TEXT NOT NULL,
    descricao       TEXT,
    acao            TEXT NOT NULL,
    recursos        TEXT,
    prazo           DATE,
    status          TEXT NOT NULL DEFAULT 'PENDENTE'
                        CHECK (status IN ('PENDENTE','EM_ANDAMENTO','CONCLUIDO','CANCELADO')),
    progresso_pct   INTEGER DEFAULT 0 CHECK (progresso_pct BETWEEN 0 AND 100),
    resultado       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdi_employee ON public.pdi_items(employee_id);
CREATE INDEX IF NOT EXISTS idx_pdi_org      ON public.pdi_items(org_id);
CREATE INDEX IF NOT EXISTS idx_pdi_status   ON public.pdi_items(org_id, status);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.evaluation_cycles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdi_items           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eval_cycles_org_access"    ON public.evaluation_cycles   FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "eval_responses_org_access" ON public.evaluation_responses FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "eval_results_org_access"   ON public.evaluation_results  FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "pdi_items_org_access"      ON public.pdi_items           FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE TRIGGER trg_eval_cycles_updated_at    BEFORE UPDATE ON public.evaluation_cycles   FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();
CREATE TRIGGER trg_eval_responses_updated_at BEFORE UPDATE ON public.evaluation_responses FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();
CREATE TRIGGER trg_pdi_updated_at            BEFORE UPDATE ON public.pdi_items           FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- RPC: Consolidar resultados de um ciclo
-- ============================================================
CREATE OR REPLACE FUNCTION public.consolidate_evaluation_cycle(p_cycle_id UUID)
RETURNS JSON AS $$
DECLARE
    v_cycle     public.evaluation_cycles;
    v_emp       RECORD;
    v_count     INTEGER := 0;
BEGIN
    SELECT * INTO v_cycle FROM public.evaluation_cycles WHERE id = p_cycle_id;
    IF NOT FOUND THEN RETURN json_build_object('error', 'Ciclo não encontrado'); END IF;

    -- Para cada avaliado, calcular notas consolidadas
    FOR v_emp IN
        SELECT DISTINCT evaluatee_id
        FROM public.evaluation_responses
        WHERE cycle_id = p_cycle_id AND status = 'CONCLUIDA'
    LOOP
        DECLARE
            v_nota_self   NUMERIC;
            v_nota_gestor NUMERIC;
            v_nota_pares  NUMERIC;
            v_nota_final  NUMERIC;
            v_class       TEXT;
        BEGIN
            SELECT AVG(nota_media) INTO v_nota_self   FROM public.evaluation_responses WHERE cycle_id = p_cycle_id AND evaluatee_id = v_emp.evaluatee_id AND tipo = 'SELF';
            SELECT AVG(nota_media) INTO v_nota_gestor FROM public.evaluation_responses WHERE cycle_id = p_cycle_id AND evaluatee_id = v_emp.evaluatee_id AND tipo = 'GESTOR';
            SELECT AVG(nota_media) INTO v_nota_pares  FROM public.evaluation_responses WHERE cycle_id = p_cycle_id AND evaluatee_id = v_emp.evaluatee_id AND tipo IN ('PAR','SUBORDINADO');

            v_nota_final := ROUND(
                (COALESCE(v_nota_gestor,0)*0.5 + COALESCE(v_nota_self,0)*0.2 + COALESCE(v_nota_pares,0)*0.3)
                / NULLIF(
                    CASE WHEN v_nota_gestor IS NOT NULL THEN 0.5 ELSE 0 END +
                    CASE WHEN v_nota_self   IS NOT NULL THEN 0.2 ELSE 0 END +
                    CASE WHEN v_nota_pares  IS NOT NULL THEN 0.3 ELSE 0 END, 0
                ), 2
            );

            v_class := CASE
                WHEN v_nota_final >= 4.5 THEN 'DESTAQUE'
                WHEN v_nota_final >= 3.5 THEN 'ACIMA'
                WHEN v_nota_final >= 2.5 THEN 'ESPERADO'
                WHEN v_nota_final >= 1.5 THEN 'ABAIXO'
                ELSE 'CRITICO'
            END;

            INSERT INTO public.evaluation_results (org_id, cycle_id, employee_id, nota_self, nota_gestor, nota_pares, nota_final, classificacao)
            VALUES (v_cycle.org_id, p_cycle_id, v_emp.evaluatee_id, v_nota_self, v_nota_gestor, v_nota_pares, v_nota_final, v_class)
            ON CONFLICT (cycle_id, employee_id)
            DO UPDATE SET nota_self = EXCLUDED.nota_self, nota_gestor = EXCLUDED.nota_gestor,
                          nota_pares = EXCLUDED.nota_pares, nota_final = EXCLUDED.nota_final,
                          classificacao = EXCLUDED.classificacao;

            v_count := v_count + 1;
        END;
    END LOOP;

    UPDATE public.evaluation_cycles SET status = 'ENCERRADO', updated_at = NOW() WHERE id = p_cycle_id;

    RETURN json_build_object('success', TRUE, 'consolidados', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.consolidate_evaluation_cycle(UUID) TO authenticated;
