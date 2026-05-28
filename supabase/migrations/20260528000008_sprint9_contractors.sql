-- ============================================================
-- Sprint 9: Empreiteiros / Terceiros
-- Tabelas: contractors, contractor_documents, contractor_measurements
-- ============================================================

-- 1. EMPRESAS TERCEIRIZADAS / EMPREITEIROS
CREATE TABLE IF NOT EXISTS public.contractors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    razao_social        TEXT NOT NULL,
    nome_fantasia       TEXT,
    cnpj                TEXT,
    cpf                 TEXT,           -- pessoa física
    tipo                TEXT NOT NULL DEFAULT 'EMPREITEIRO'
                            CHECK (tipo IN (
                                'EMPREITEIRO','SUBEMPREITEIRO','FORNECEDOR_SERVICO',
                                'COOPERATIVA','MEI','AUTONOMO'
                            )),
    especialidade       TEXT,           -- ex: Elétrica, Hidráulica, Estrutura
    contato_nome        TEXT,
    contato_telefone    TEXT,
    contato_email       TEXT,
    endereco            TEXT,
    -- Dados bancários
    banco_nome          TEXT,
    banco_agencia       TEXT,
    banco_conta         TEXT,
    banco_pix           TEXT,
    -- Retenções padrão
    retencao_inss_pct   NUMERIC(5,2) DEFAULT 11,   -- % de retenção ISS/INSS
    retencao_iss_pct    NUMERIC(5,2) DEFAULT 0,
    retencao_irrf_pct   NUMERIC(5,2) DEFAULT 0,
    -- Contrato
    contrato_inicio     DATE,
    contrato_fim        DATE,
    valor_contrato      NUMERIC(14,2),
    status              TEXT NOT NULL DEFAULT 'ATIVO'
                            CHECK (status IN ('ATIVO','INATIVO','SUSPENSO')),
    notas               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractors_org    ON public.contractors(org_id);
CREATE INDEX IF NOT EXISTS idx_contractors_cnpj   ON public.contractors(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contractors_status ON public.contractors(org_id, status);

-- 2. DOCUMENTOS DO EMPREITEIRO (CND, FGTS, etc.)
CREATE TABLE IF NOT EXISTS public.contractor_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contractor_id   UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
    categoria       TEXT NOT NULL CHECK (categoria IN (
                        'CND_FEDERAL','CND_ESTADUAL','CND_MUNICIPAL',
                        'CRF_FGTS','CND_TRABALHISTA','CONTRATO',
                        'ALVARA','ISO','OUTROS'
                    )),
    titulo          TEXT NOT NULL,
    file_url        TEXT,
    data_emissao    DATE,
    data_validade   DATE,
    status          TEXT NOT NULL DEFAULT 'VIGENTE'
                        CHECK (status IN ('VIGENTE','VENCIDO','PENDENTE')),
    notas           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractor_docs_contractor ON public.contractor_documents(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_docs_validade   ON public.contractor_documents(data_validade) WHERE data_validade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contractor_docs_org        ON public.contractor_documents(org_id);

-- 3. MEDIÇÕES / BOLETINS DE MEDIÇÃO
CREATE TABLE IF NOT EXISTS public.contractor_measurements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contractor_id       UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
    project_id          UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name        TEXT,
    numero_medicao      INTEGER NOT NULL,
    periodo_inicio      DATE NOT NULL,
    periodo_fim         DATE NOT NULL,
    descricao           TEXT,
    valor_bruto         NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- Retenções (calculadas ou manuais)
    retencao_inss       NUMERIC(14,2) DEFAULT 0,
    retencao_iss        NUMERIC(14,2) DEFAULT 0,
    retencao_irrf       NUMERIC(14,2) DEFAULT 0,
    outras_retencoes    NUMERIC(14,2) DEFAULT 0,
    valor_liquido       NUMERIC(14,2) GENERATED ALWAYS AS (
                            valor_bruto - retencao_inss - retencao_iss - retencao_irrf - outras_retencoes
                        ) STORED,
    status              TEXT NOT NULL DEFAULT 'PENDENTE'
                            CHECK (status IN ('PENDENTE','APROVADO','PAGO','CONTESTADO')),
    data_aprovacao      DATE,
    data_pagamento      DATE,
    nota_fiscal         TEXT,
    nf_url              TEXT,
    comprovante_url     TEXT,
    notas               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (contractor_id, numero_medicao)
);

CREATE INDEX IF NOT EXISTS idx_contractor_meas_contractor ON public.contractor_measurements(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_meas_project    ON public.contractor_measurements(project_id);
CREATE INDEX IF NOT EXISTS idx_contractor_meas_status     ON public.contractor_measurements(org_id, status);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.contractors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_measurements  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractors_org_access"             ON public.contractors             FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "contractor_documents_org_access"    ON public.contractor_documents    FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "contractor_measurements_org_access" ON public.contractor_measurements FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================

CREATE TRIGGER trg_contractors_updated_at
    BEFORE UPDATE ON public.contractors
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_contractor_docs_updated_at
    BEFORE UPDATE ON public.contractor_documents
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_contractor_meas_updated_at
    BEFORE UPDATE ON public.contractor_measurements
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();
