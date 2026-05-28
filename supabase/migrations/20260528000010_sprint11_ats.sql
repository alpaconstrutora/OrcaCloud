-- ============================================================
-- Sprint 11: ATS — Recrutamento e Seleção
-- Tabelas: job_openings, candidates, interview_records
-- ============================================================

-- 1. VAGAS
CREATE TABLE IF NOT EXISTS public.job_openings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    titulo          TEXT NOT NULL,
    descricao       TEXT,
    requisitos      TEXT,
    cargo           TEXT NOT NULL,
    project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name    TEXT,
    tipo_contrato   TEXT DEFAULT 'CLT'
                        CHECK (tipo_contrato IN ('CLT','PJ','DIARISTA','EMPREITEIRO','ESTAGIARIO','TEMPORARIO','APRENDIZ')),
    salario_min     NUMERIC(12,2),
    salario_max     NUMERIC(12,2),
    quantidade      INTEGER NOT NULL DEFAULT 1,
    prioridade      TEXT NOT NULL DEFAULT 'NORMAL'
                        CHECK (prioridade IN ('URGENTE','ALTA','NORMAL','BAIXA')),
    responsavel_id  UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    data_abertura   DATE NOT NULL DEFAULT CURRENT_DATE,
    data_limite     DATE,
    status          TEXT NOT NULL DEFAULT 'ABERTA'
                        CHECK (status IN ('ABERTA','PAUSADA','FECHADA','CANCELADA')),
    notas           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_openings_org    ON public.job_openings(org_id);
CREATE INDEX IF NOT EXISTS idx_job_openings_status ON public.job_openings(org_id, status);

-- 2. CANDIDATOS
CREATE TABLE IF NOT EXISTS public.candidates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    job_id          UUID NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    email           TEXT,
    telefone        TEXT,
    cpf             TEXT,
    endereco        TEXT,
    origem          TEXT DEFAULT 'INDICACAO'
                        CHECK (origem IN ('INDICACAO','SITE','LINKEDIN','WHATSAPP','IFOOD_JOBS','CATHO','INFOJOBS','OUTROS')),
    curriculo_url   TEXT,
    foto_url        TEXT,
    -- Pipeline Kanban
    stage           TEXT NOT NULL DEFAULT 'RECEBIDO'
                        CHECK (stage IN (
                            'RECEBIDO','TRIAGEM','ENTREVISTA_RH',
                            'ENTREVISTA_TECNICA','TESTE','PROPOSTA',
                            'APROVADO','CONTRATADO','REPROVADO','DESISTIU'
                        )),
    -- Avaliações
    nota_curriculo  NUMERIC(3,1),   -- 0-10
    nota_entrevista NUMERIC(3,1),
    nota_tecnica    NUMERIC(3,1),
    nota_final      NUMERIC(3,1) GENERATED ALWAYS AS (
        CASE
            WHEN nota_curriculo IS NOT NULL AND nota_entrevista IS NOT NULL AND nota_tecnica IS NOT NULL
            THEN ROUND((COALESCE(nota_curriculo,0) + COALESCE(nota_entrevista,0) + COALESCE(nota_tecnica,0)) / 3.0, 1)
            WHEN nota_entrevista IS NOT NULL AND nota_curriculo IS NOT NULL
            THEN ROUND((nota_curriculo + nota_entrevista) / 2.0, 1)
            ELSE nota_curriculo
        END
    ) STORED,
    -- Dados adicionais
    pretensao_salarial NUMERIC(12,2),
    disponibilidade    TEXT,      -- ex: "imediata", "15 dias"
    experiencia_anos   INTEGER DEFAULT 0,
    observacoes        TEXT,
    -- Banco de talentos (mesmo reprovado, pode ficar no banco)
    banco_talentos     BOOLEAN NOT NULL DEFAULT FALSE,
    -- Admissão
    employee_id        UUID REFERENCES public.employees(id) ON DELETE SET NULL,  -- se contratado
    data_contratacao   DATE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_org   ON public.candidates(org_id);
CREATE INDEX IF NOT EXISTS idx_candidates_job   ON public.candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_candidates_stage ON public.candidates(job_id, stage);
CREATE INDEX IF NOT EXISTS idx_candidates_banco ON public.candidates(org_id) WHERE banco_talentos = TRUE;

-- 3. REGISTROS DE ENTREVISTA / INTERAÇÕES
CREATE TABLE IF NOT EXISTS public.interview_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    candidate_id    UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
    tipo            TEXT NOT NULL CHECK (tipo IN ('TRIAGEM','ENTREVISTA_RH','ENTREVISTA_TECNICA','TESTE','FEEDBACK','PROPOSTA','CONTATO')),
    data_hora       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    entrevistador   TEXT,
    canal           TEXT DEFAULT 'PRESENCIAL'
                        CHECK (canal IN ('PRESENCIAL','VIDEO','TELEFONE','WHATSAPP')),
    duracao_min     INTEGER,
    notas           TEXT,
    nota            NUMERIC(3,1),
    proxima_etapa   TEXT,
    created_by      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_records_candidate ON public.interview_records(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interview_records_org       ON public.interview_records(org_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.job_openings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_openings_org_access"      ON public.job_openings      FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "candidates_org_access"        ON public.candidates        FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "interview_records_org_access" ON public.interview_records FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER trg_job_openings_updated_at
    BEFORE UPDATE ON public.job_openings
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_candidates_updated_at
    BEFORE UPDATE ON public.candidates
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- FUNÇÃO: contratar candidato → cria employee automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.hire_candidate(
    p_candidate_id  UUID,
    p_hire_date     DATE DEFAULT CURRENT_DATE
)
RETURNS UUID AS $$
DECLARE
    v_candidate public.candidates;
    v_job       public.job_openings;
    v_emp_id    UUID;
BEGIN
    SELECT * INTO v_candidate FROM public.candidates WHERE id = p_candidate_id;
    SELECT * INTO v_job       FROM public.job_openings WHERE id = v_candidate.job_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Candidato não encontrado';
    END IF;

    -- Criar colaborador
    INSERT INTO public.employees (
        org_id, name, email, phone, cpf,
        contract_type, role, status, hire_date,
        base_salary
    ) VALUES (
        v_candidate.org_id,
        v_candidate.nome,
        v_candidate.email,
        v_candidate.telefone,
        v_candidate.cpf,
        COALESCE(v_job.tipo_contrato, 'CLT')::TEXT,
        v_job.cargo,
        'ATIVO',
        p_hire_date,
        COALESCE(v_candidate.pretensao_salarial, v_job.salario_min, 0)
    )
    RETURNING id INTO v_emp_id;

    -- Atualizar candidato
    UPDATE public.candidates
    SET stage = 'CONTRATADO', employee_id = v_emp_id, data_contratacao = p_hire_date
    WHERE id = p_candidate_id;

    -- Fechar vaga se quantidade atingida
    UPDATE public.job_openings
    SET status = 'FECHADA'
    WHERE id = v_candidate.job_id
      AND quantidade <= (
          SELECT COUNT(*) FROM public.candidates
          WHERE job_id = v_candidate.job_id AND stage = 'CONTRATADO'
      );

    RETURN v_emp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.hire_candidate(UUID, DATE) TO authenticated;
