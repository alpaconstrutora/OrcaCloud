-- =============================================================================
-- Migration: 20261123000000_opura_cno_previdencia.sql
-- Módulo: ÒPURA CNO & Previdência de Obras
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABELAS DE DOMÍNIO
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1 Cadastro e Abertura do CNO
CREATE TABLE IF NOT EXISTS public.opura_cno_registrations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id          UUID UNIQUE REFERENCES public.projects(id) ON DELETE SET NULL,
    cno_number          VARCHAR(50) UNIQUE,
    status              VARCHAR(50) DEFAULT 'rascunho' 
                        CONSTRAINT chk_cno_status CHECK (status IN ('rascunho', 'documentacao_enviada', 'validacao', 'aberto', 'encerrado')),
    data_abertura       DATE,
    data_encerramento   DATE,
    matricula_imovel    VARCHAR(100),
    alvara_numero       VARCHAR(100),
    area_aprovada       NUMERIC(12, 2) DEFAULT 0,
    area_real           NUMERIC(12, 2) DEFAULT 0,
    padrao_construtivo  VARCHAR(50) CONSTRAINT chk_padrao_const CHECK (padrao_construtivo IN ('baixo', 'normal', 'alto')),
    tipo_obra           VARCHAR(100), -- ex: residencial_vertical, galpao_logistico
    responsavel_tipo    VARCHAR(50) CONSTRAINT chk_resp_tipo CHECK (responsavel_tipo IN ('proprietario', 'incorporador', 'construtor')),
    art_rrt             VARCHAR(100),
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.2 Simulador Inteligente de INSS e Cenários
CREATE TABLE IF NOT EXISTS public.opura_cno_simulations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id          UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    scenario_name       VARCHAR(150) NOT NULL,
    area_construida     NUMERIC(12, 2) NOT NULL DEFAULT 0,
    custo_estimado      NUMERIC(15, 2) NOT NULL DEFAULT 0,
    metodo_construtivo  VARCHAR(50) CONSTRAINT chk_metodo_const CHECK (metodo_construtivo IN ('convencional', 'estrutura_metalica', 'pre_moldado', 'steel_frame', 'drywall', 'modular', 'industrializada')),
    regime_contratacao  VARCHAR(50) CONSTRAINT chk_regime_contra CHECK (regime_contratacao IN ('empreitada_global', 'equipe_propria', 'empreitada_parcial', 'turnkey', 'bts')),
    mao_de_obra_estimada NUMERIC(15, 2) NOT NULL DEFAULT 0,
    inss_estimado       NUMERIC(15, 2) NOT NULL DEFAULT 0,
    economia_potencial  NUMERIC(15, 2) DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.3 Controle de Deduções de Materiais e Serviços
CREATE TABLE IF NOT EXISTS public.opura_cno_deductions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id                  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    cno_registration_id         UUID REFERENCES public.opura_cno_registrations(id) ON DELETE CASCADE,
    source_type                 VARCHAR(50) NOT NULL CONSTRAINT chk_deduction_source CHECK (source_type IN ('nfe', 'measurement')),
    nfe_invoice_id              UUID REFERENCES public.nfe_invoices(id) ON DELETE SET NULL,
    contractor_measurement_id   UUID REFERENCES public.contractor_measurements(id) ON DELETE SET NULL,
    description                 TEXT NOT NULL,
    valor_base                  NUMERIC(15, 2) NOT NULL DEFAULT 0,
    valor_abatimento            NUMERIC(15, 2) NOT NULL DEFAULT 0, -- INSS abatido ou retido
    status_validacao            VARCHAR(50) DEFAULT 'pendente' 
                                CONSTRAINT chk_validacao CHECK (status_validacao IN ('pendente', 'aproveitado', 'rejeitado', 'documentacao_pendente')),
    revisao_ia_check            BOOLEAN DEFAULT FALSE,
    revisao_ia_feedback         TEXT,
    created_at                  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at                  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.4 Score de Compliance Previdenciário (Consolidado)
CREATE TABLE IF NOT EXISTS public.opura_cno_compliance_score (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id                  UUID UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
    score                       INTEGER NOT NULL DEFAULT 100 CONSTRAINT chk_score CHECK (score >= 0 AND score <= 100),
    status_color                VARCHAR(10) DEFAULT 'verde' CONSTRAINT chk_status_color CHECK (status_color IN ('verde', 'amarelo', 'vermelho')),
    cno_regular                 BOOLEAN DEFAULT TRUE,
    esocial_atualizado          BOOLEAN DEFAULT TRUE,
    retencoes_corretas          BOOLEAN DEFAULT TRUE,
    certidoes_validas           BOOLEAN DEFAULT TRUE,
    recolhimentos_compativeis   BOOLEAN DEFAULT TRUE,
    last_calculated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. HABILITAR ROW LEVEL SECURITY (RLS) - Regra 2
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.opura_cno_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_cno_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_cno_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_cno_compliance_score ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. POLÍTICAS RLS (PRODUÇÃO E AUTENTICADOS) - Regra 2
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.1 opura_cno_registrations
DROP POLICY IF EXISTS "cno_registrations_org_access" ON public.opura_cno_registrations;
CREATE POLICY "cno_registrations_org_access" ON public.opura_cno_registrations
FOR ALL TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- 3.2 opura_cno_simulations
DROP POLICY IF EXISTS "cno_simulations_org_access" ON public.opura_cno_simulations;
CREATE POLICY "cno_simulations_org_access" ON public.opura_cno_simulations
FOR ALL TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- 3.3 opura_cno_deductions
DROP POLICY IF EXISTS "cno_deductions_org_access" ON public.opura_cno_deductions;
CREATE POLICY "cno_deductions_org_access" ON public.opura_cno_deductions
FOR ALL TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- 3.4 opura_cno_compliance_score
DROP POLICY IF EXISTS "cno_compliance_score_org_access" ON public.opura_cno_compliance_score;
CREATE POLICY "cno_compliance_score_org_access" ON public.opura_cno_compliance_score
FOR ALL TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. POLÍTICAS DEV (ANON) - Regra 8
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon all on opura_cno_registrations" ON public.opura_cno_registrations;
CREATE POLICY "Allow anon all on opura_cno_registrations" 
ON public.opura_cno_registrations FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on opura_cno_simulations" ON public.opura_cno_simulations;
CREATE POLICY "Allow anon all on opura_cno_simulations" 
ON public.opura_cno_simulations FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on opura_cno_deductions" ON public.opura_cno_deductions;
CREATE POLICY "Allow anon all on opura_cno_deductions" 
ON public.opura_cno_deductions FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on opura_cno_compliance_score" ON public.opura_cno_compliance_score;
CREATE POLICY "Allow anon all on opura_cno_compliance_score" 
ON public.opura_cno_compliance_score FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. INDEXAÇÃO (Performance de buscas e JOINs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cno_reg_org_proj ON public.opura_cno_registrations(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_cno_sim_org_proj ON public.opura_cno_simulations(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_cno_ded_org_proj ON public.opura_cno_deductions(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_cno_ded_cno_reg ON public.opura_cno_deductions(cno_registration_id);
CREATE INDEX IF NOT EXISTS idx_cno_ded_nfe ON public.opura_cno_deductions(nfe_invoice_id) WHERE nfe_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cno_ded_meas ON public.opura_cno_deductions(contractor_measurement_id) WHERE contractor_measurement_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TRIGGERS (Auto updated_at)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_opura_cno_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cno_registrations_updated_at ON public.opura_cno_registrations;
CREATE TRIGGER trg_cno_registrations_updated_at
    BEFORE UPDATE ON public.opura_cno_registrations
    FOR EACH ROW EXECUTE FUNCTION public.update_opura_cno_updated_at();

DROP TRIGGER IF EXISTS trg_cno_simulations_updated_at ON public.opura_cno_simulations;
CREATE TRIGGER trg_cno_simulations_updated_at
    BEFORE UPDATE ON public.opura_cno_simulations
    FOR EACH ROW EXECUTE FUNCTION public.update_opura_cno_updated_at();

DROP TRIGGER IF EXISTS trg_cno_deductions_updated_at ON public.opura_cno_deductions;
CREATE TRIGGER trg_cno_deductions_updated_at
    BEFORE UPDATE ON public.opura_cno_deductions
    FOR EACH ROW EXECUTE FUNCTION public.update_opura_cno_updated_at();

-- Unique constraint para evitar duplicidade de abatimentos de NF-e
ALTER TABLE public.opura_cno_deductions DROP CONSTRAINT IF EXISTS unique_nfe_deduction;
ALTER TABLE public.opura_cno_deductions ADD CONSTRAINT unique_nfe_deduction UNIQUE (nfe_invoice_id);
