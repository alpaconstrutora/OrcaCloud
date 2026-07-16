-- ============================================================
-- Migration: 20270716000004_opura_tts_regime.sql
-- ÒPURA Compliance — Regime TTS-MG (crédito presumido de ICMS)
--
-- Objetivo: dar BASE DE DADOS REAL para o painel de Compliance, que hoje
-- opera com valores mockados (ComplianceDashboard.tsx: interestadualPct=32.4
-- "Simulado via ERP"). Duas tabelas + uma view de apuração:
--
--   1. tts_regime_settings   — parâmetros LEGAIS configuráveis por org/filial
--      (alíquotas de débito e efetivas, meta de % interestadual). NADA de
--      alíquota fixa no código: muda por decreto sem exigir deploy.
--   2. tts_fiscal_movements  — ledger de saídas/entradas para apuração de
--      ICMS por competência e escopo (interna/interestadual), origem manual
--      ou NF-e. É daqui que sai o % interestadual REAL e a base do cálculo.
--   3. tts_apuracao_view     — agregação por org/filial/competência (somas
--      brutas). O cálculo de ICMS-devido-com/sem-TTS mora no ttsService, que
--      combina estas somas com as alíquotas de tts_regime_settings.
--
-- ⚠️ RESISTÊNCIA A DEADLOCK (correção 2026-07-16): a 1ª versão criava as
-- tabelas com `REFERENCES` inline. Adicionar FK exige lock na tabela
-- REFERENCIADA (organizations/companies/nfe_invoices) — e com o app lendo
-- essas tabelas ao vivo, o lock cruza com o AccessShareLock das queries em
-- voo e dá `40P01 deadlock detected` (mesmo padrão de broker_proposals).
-- Correção: (a) tabelas criadas SEM FK inline — só toca os objetos novos, não
-- deadlocka; (b) FKs adicionadas depois, cada uma em bloco idempotente, com
-- `NOT VALID` (não varre + lock menor) e `lock_timeout` para FALHAR RÁPIDO em
-- vez de travar. Reexecutar é seguro (tudo IF NOT EXISTS / DROP-CREATE) — se
-- um passo de FK falhar por lock, as tabelas já existem e só as FVs restantes
-- são retentadas.
--
-- RLS: padrão vigente da casa — public.is_org_member(org_id), org-scoped,
-- SEM policy anon (rollout drop-anon, ver project_rls_anon_rollout).
-- ============================================================

-- Falha rápido em espera de lock (em vez de bloquear até o deadlock detector).
SET lock_timeout = '6s';

-- ─── 1. Parâmetros do regime (config por org/filial) — SEM FK inline ──
CREATE TABLE IF NOT EXISTS public.tts_regime_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    company_id UUID,
    home_uf VARCHAR(2) NOT NULL DEFAULT 'MG',        -- UF de origem do benefício
    active BOOLEAN NOT NULL DEFAULT true,             -- regime TTS habilitado?

    -- Alíquotas de DÉBITO (ICMS destacado na saída, regime normal)
    debit_rate_internal NUMERIC(6,4) NOT NULL DEFAULT 0.1800,      -- 18% saída interna
    debit_rate_interstate NUMERIC(6,4) NOT NULL DEFAULT 0.1200,    -- 12% saída interestadual

    -- Alíquotas EFETIVAS sob TTS (carga final após crédito presumido)
    effective_rate_internal NUMERIC(6,4) NOT NULL DEFAULT 0.0600,   -- 6% interna
    effective_rate_interstate NUMERIC(6,4) NOT NULL DEFAULT 0.0130, -- 1,3% interestadual

    -- Alíquota de crédito real de referência (apenas p/ ponto de equilíbrio)
    credit_rate_default NUMERIC(6,4) NOT NULL DEFAULT 0.1200,

    -- Meta mínima de participação interestadual p/ manter o benefício
    min_interstate_share NUMERIC(6,4) NOT NULL DEFAULT 0.3000,      -- 30%

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- Um conjunto de parâmetros por filial (ou um default org-wide com company_id NULL)
    CONSTRAINT tts_regime_settings_org_company_uq UNIQUE (org_id, company_id)
);

-- ─── 2. Ledger de apuração (saídas/entradas por competência) — SEM FK inline ──
CREATE TABLE IF NOT EXISTS public.tts_fiscal_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    company_id UUID NOT NULL,

    reference_month DATE NOT NULL,                    -- competência (1º dia do mês)
    direction VARCHAR(10) NOT NULL,                   -- 'saida' | 'entrada'
    scope VARCHAR(15) NOT NULL,                       -- 'interna' | 'interestadual' | 'exterior'
    cfop VARCHAR(4),                                  -- CFOP (5xxx interna, 6xxx interestadual...)

    base_amount NUMERIC(15,2) NOT NULL DEFAULT 0,     -- base de cálculo do ICMS
    icms_debit NUMERIC(15,2) NOT NULL DEFAULT 0,      -- ICMS destacado (saídas)
    icms_credit NUMERIC(15,2) NOT NULL DEFAULT 0,     -- crédito real de ICMS (entradas)

    source VARCHAR(10) NOT NULL DEFAULT 'manual',     -- 'manual' | 'nfe' | 'erp'
    nfe_invoice_id UUID,
    document_ref VARCHAR(100),                        -- nº NF-e / chave / lançamento
    description TEXT,

    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by VARCHAR(255),

    CONSTRAINT tts_movements_direction_chk CHECK (direction IN ('saida', 'entrada')),
    CONSTRAINT tts_movements_scope_chk CHECK (scope IN ('interna', 'interestadual', 'exterior')),
    CONSTRAINT tts_movements_source_chk CHECK (source IN ('manual', 'nfe', 'erp'))
);

CREATE INDEX IF NOT EXISTS idx_tts_movements_org_company_month
    ON public.tts_fiscal_movements (org_id, company_id, reference_month);
CREATE INDEX IF NOT EXISTS idx_tts_movements_nfe
    ON public.tts_fiscal_movements (nfe_invoice_id) WHERE nfe_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tts_regime_settings_org
    ON public.tts_regime_settings (org_id, company_id);

-- ─── 3. FKs adicionadas em separado, idempotentes, NOT VALID ──────────
-- NOT VALID: pula a varredura das linhas existentes (tabelas novas/vazias de
-- qualquer forma) e reduz a janela de lock na tabela referenciada. A regra
-- CASCADE / SET NULL continua valendo para novas operações mesmo NOT VALID.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tts_regime_settings_org_fk') THEN
        ALTER TABLE public.tts_regime_settings
            ADD CONSTRAINT tts_regime_settings_org_fk
            FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tts_regime_settings_company_fk') THEN
        ALTER TABLE public.tts_regime_settings
            ADD CONSTRAINT tts_regime_settings_company_fk
            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tts_movements_org_fk') THEN
        ALTER TABLE public.tts_fiscal_movements
            ADD CONSTRAINT tts_movements_org_fk
            FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tts_movements_company_fk') THEN
        ALTER TABLE public.tts_fiscal_movements
            ADD CONSTRAINT tts_movements_company_fk
            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tts_movements_nfe_fk') THEN
        ALTER TABLE public.tts_fiscal_movements
            ADD CONSTRAINT tts_movements_nfe_fk
            FOREIGN KEY (nfe_invoice_id) REFERENCES public.nfe_invoices(id) ON DELETE SET NULL NOT VALID;
    END IF;
END $$;

-- ─── 4. View de apuração (somas brutas por competência) ──────
-- Só agrega; o cálculo com/sem TTS (que depende das alíquotas) fica no service.
-- security_invoker=on é OBRIGATÓRIO: sem ele a view roda como o dono e IGNORA a
-- RLS das tabelas base, vazando apuração de todas as orgs. Com ele, o SELECT
-- aplica tts_fiscal_movements_org no papel do caller.
CREATE OR REPLACE VIEW public.tts_apuracao_view
WITH (security_invoker = on) AS
SELECT
    m.org_id,
    m.company_id,
    m.reference_month,
    COALESCE(SUM(m.base_amount) FILTER (WHERE m.direction = 'saida'), 0) AS total_saidas,
    COALESCE(SUM(m.base_amount) FILTER (WHERE m.direction = 'saida' AND m.scope = 'interestadual'), 0) AS saidas_interestaduais,
    COALESCE(SUM(m.base_amount) FILTER (WHERE m.direction = 'saida' AND m.scope = 'interna'), 0) AS saidas_internas,
    COALESCE(SUM(m.base_amount) FILTER (WHERE m.direction = 'entrada'), 0) AS total_entradas,
    COALESCE(SUM(m.icms_debit) FILTER (WHERE m.direction = 'saida'), 0) AS icms_debito_total,
    COALESCE(SUM(m.icms_credit) FILTER (WHERE m.direction = 'entrada'), 0) AS icms_credito_real,
    -- participação interestadual das saídas (0 quando não há saídas)
    CASE
        WHEN COALESCE(SUM(m.base_amount) FILTER (WHERE m.direction = 'saida'), 0) = 0 THEN 0
        ELSE ROUND(
            COALESCE(SUM(m.base_amount) FILTER (WHERE m.direction = 'saida' AND m.scope = 'interestadual'), 0)
            / SUM(m.base_amount) FILTER (WHERE m.direction = 'saida') * 100, 2)
    END AS pct_interestadual,
    COUNT(*) AS movimentos
FROM public.tts_fiscal_movements m
GROUP BY m.org_id, m.company_id, m.reference_month;

-- ─── 5. RLS ──────────────────────────────────────────────────
ALTER TABLE public.tts_regime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tts_fiscal_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tts_regime_settings_org" ON public.tts_regime_settings;
CREATE POLICY "tts_regime_settings_org" ON public.tts_regime_settings
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS "tts_fiscal_movements_org" ON public.tts_fiscal_movements;
CREATE POLICY "tts_fiscal_movements_org" ON public.tts_fiscal_movements
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

-- A view herda a RLS das tabelas base via security_invoker (definido acima).
GRANT SELECT ON public.tts_apuracao_view TO authenticated;
