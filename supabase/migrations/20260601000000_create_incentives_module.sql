-- ============================================================
-- Módulo: Incentivos & Produtividade (Gratificações)
-- Camada sobre o módulo Labor/Folha existente (rubrics + payroll_events).
-- Sprints: 0 (rubricas de incentivo), 1 (aprovação/coletivo),
--          2 (habitualidade — índices/visão), 3 (motor de regras).
-- Idempotente: ADD COLUMN IF NOT EXISTS / ON CONFLICT / CREATE IF NOT EXISTS.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SPRINT 0 — Marcar rubricas como incentivo + seed INC_*
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.rubrics
    ADD COLUMN IF NOT EXISTS is_incentive       BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS incentive_category TEXT;

-- Rubrica BONUS legada passa a ser reconhecida como incentivo
UPDATE public.rubrics
SET is_incentive = true, incentive_category = COALESCE(incentive_category, 'GERAL')
WHERE code = 'BONUS';

-- Seed das rubricas de incentivo. São proventos variáveis (eventuais).
-- Incidências marcadas como true por padrão (postura conservadora/protetiva):
-- um incentivo pago de forma habitual integra o salário e gera reflexos —
-- a "Guarda de Habitualidade" (Sprint 2) alerta quando isso ocorre.
INSERT INTO public.rubrics
    (code, name, type, incidence_inss, incidence_fgts, incidence_irrf,
     is_automatic, calculation_type, active, is_incentive, incentive_category)
VALUES
    ('INC_ASSIDUIDADE',  'Prêmio Assiduidade',        'provento', true, true, true, false, 'manual', true, true, 'ASSIDUIDADE'),
    ('INC_PRODUTIVIDADE','Bônus Produtividade',       'provento', true, true, true, false, 'manual', true, true, 'PRODUTIVIDADE'),
    ('INC_SEGURANCA',    'Prêmio Segurança (SST)',    'provento', true, true, true, false, 'manual', true, true, 'SEGURANCA'),
    ('INC_PRAZO',        'Bônus Entrega no Prazo',    'provento', true, true, true, false, 'manual', true, true, 'PRAZO'),
    ('INC_META_OBRA',    'Bônus Meta da Obra',        'provento', true, true, true, false, 'manual', true, true, 'META_OBRA'),
    ('INC_QUALIDADE',    'Prêmio Qualidade',          'provento', true, true, true, false, 'manual', true, true, 'QUALIDADE'),
    ('INC_RETENCAO',     'Bônus Retenção',            'provento', true, true, true, false, 'manual', true, true, 'RETENCAO')
ON CONFLICT (code) DO UPDATE
    SET is_incentive = true,
        incentive_category = EXCLUDED.incentive_category;

CREATE INDEX IF NOT EXISTS idx_rubrics_is_incentive ON public.rubrics(is_incentive) WHERE is_incentive = true;

-- ─────────────────────────────────────────────────────────────
-- SPRINT 1 — Aprovação + lançamento coletivo em payroll_events
-- ─────────────────────────────────────────────────────────────
-- Eventos já existentes recebem 'APROVADO' (preserva o fluxo atual da folha).
-- Novos eventos de incentivo entram como 'PENDENTE' e só contam na folha
-- quando aprovados (filtro feito no serviço/engine).
ALTER TABLE public.payroll_events
    ADD COLUMN IF NOT EXISTS approval_status    TEXT DEFAULT 'APROVADO',
    ADD COLUMN IF NOT EXISTS justification      TEXT,
    ADD COLUMN IF NOT EXISTS attachment_url     TEXT,
    ADD COLUMN IF NOT EXISTS requested_by       UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS approved_by        UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason   TEXT,
    ADD COLUMN IF NOT EXISTS team_id            UUID,
    ADD COLUMN IF NOT EXISTS incentive_batch_id UUID,
    ADD COLUMN IF NOT EXISTS project_id         UUID,
    ADD COLUMN IF NOT EXISTS source_rule_id     UUID;

-- Garante valores válidos sem quebrar linhas legadas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payroll_events_approval_status_chk'
    ) THEN
        ALTER TABLE public.payroll_events
            ADD CONSTRAINT payroll_events_approval_status_chk
            CHECK (approval_status IN ('RASCUNHO','PENDENTE','APROVADO','REJEITADO'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_events_approval ON public.payroll_events(org_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_payroll_events_batch    ON public.payroll_events(incentive_batch_id);

-- ─────────────────────────────────────────────────────────────
-- SPRINT 2 — Guarda de Habitualidade (suporte de consulta)
-- Visão que expõe, por colaborador × rubrica de incentivo, em quais
-- meses houve pagamento APROVADO. O cálculo de "virou habitual" é feito
-- no serviço (janela móvel N meses).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_incentive_event_months AS
SELECT
    e.org_id,
    e.employee_id,
    COALESCE(e.rubric_code, e.code)                      AS rubric_code,
    date_trunc('month', e.reference_date::timestamp)::date AS month,
    SUM(e.amount)                                        AS total_amount,
    COUNT(*)                                             AS event_count
FROM public.payroll_events e
JOIN public.rubrics r
    ON r.code = COALESCE(e.rubric_code, e.code)
WHERE r.is_incentive = true
  AND e.approval_status = 'APROVADO'
  AND e.type = 'provento'
GROUP BY e.org_id, e.employee_id, COALESCE(e.rubric_code, e.code),
         date_trunc('month', e.reference_date::timestamp);

-- ─────────────────────────────────────────────────────────────
-- SPRINT 3 — Motor de Regras de Incentivo (semi-automático)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.incentive_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    rule_type           TEXT NOT NULL CHECK (rule_type IN
                            ('ASSIDUIDADE','PRODUTIVIDADE','SEGURANCA','PRAZO','META_OBRA','QUALIDADE','RETENCAO')),
    scope               TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK (scope IN ('EMPLOYEE','TEAM','PROJECT')),
    target_rubric_code  TEXT NOT NULL,
    -- condition: JSON livre interpretado pelo motor. Ex.:
    --   ASSIDUIDADE  { "min_days": 22, "max_faltas": 0 }
    --   PRODUTIVIDADE{ "min_productivity_pct": 100, "rate_per_unit": 15, "unit": "m2" }
    --   SEGURANCA    { "dias_sem_acidente": 60 }
    condition           JSONB NOT NULL DEFAULT '{}'::jsonb,
    amount              NUMERIC(15,2) DEFAULT 0,  -- valor fixo (quando aplicável)
    formula             TEXT,                     -- alternativa: fórmula textual
    project_id          UUID,                     -- restringe a uma obra (opcional)
    valid_from          DATE,
    valid_to            DATE,
    active              BOOLEAN NOT NULL DEFAULT true,
    created_by          UUID REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incentive_rules_org ON public.incentive_rules(org_id, active);

ALTER TABLE public.incentive_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incentive_rules_org_access" ON public.incentive_rules;
CREATE POLICY "incentive_rules_org_access" ON public.incentive_rules
    FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

-- updated_at automático (reusa função do módulo labor se existir)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_labor_updated_at') THEN
        DROP TRIGGER IF EXISTS trg_incentive_rules_updated_at ON public.incentive_rules;
        CREATE TRIGGER trg_incentive_rules_updated_at
            BEFORE UPDATE ON public.incentive_rules
            FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Storage — bucket de comprovantes de incentivo
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('incentive-evidence', 'incentive-evidence', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Incentive Evidence Read" ON storage.objects;
CREATE POLICY "Public Incentive Evidence Read"
    ON storage.objects FOR SELECT
    USING ( bucket_id = 'incentive-evidence' );

DROP POLICY IF EXISTS "Authenticated Incentive Evidence Upload" ON storage.objects;
CREATE POLICY "Authenticated Incentive Evidence Upload"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK ( bucket_id = 'incentive-evidence' );

DROP POLICY IF EXISTS "Authenticated Incentive Evidence Update" ON storage.objects;
CREATE POLICY "Authenticated Incentive Evidence Update"
    ON storage.objects FOR UPDATE TO authenticated
    USING ( bucket_id = 'incentive-evidence' );

DROP POLICY IF EXISTS "Authenticated Incentive Evidence Delete" ON storage.objects;
CREATE POLICY "Authenticated Incentive Evidence Delete"
    ON storage.objects FOR DELETE TO authenticated
    USING ( bucket_id = 'incentive-evidence' );
