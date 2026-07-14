-- Migration: Fase 6.2 — Questionário de Risco Trabalhista
-- Manual Interno §8, Anexo H — PLANO_MODULO_CONTRATOS_GAPS.md
-- 8 perguntas Sim/Não do Manual. alert_count >= 2 bloqueia contratação de PF
-- sem parecer jurídico (enforce no contractService.createContract).

CREATE TABLE IF NOT EXISTS public.contract_labor_questionnaires (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id     UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    q_horario       BOOLEAN NOT NULL DEFAULT false,  -- trabalha todos os dias em horário definido pela ALPA?
    q_ordens        BOOLEAN NOT NULL DEFAULT false,  -- recebe ordens diretas contínuas de gestor?
    q_pessoalidade  BOOLEAN NOT NULL DEFAULT false,  -- prestação depende pessoalmente de uma pessoa específica?
    q_salario_fixo  BOOLEAN NOT NULL DEFAULT false,  -- pagamento mensal fixo semelhante a salário?
    q_permanente    BOOLEAN NOT NULL DEFAULT false,  -- atividade permanente e integrada à operação?
    q_exclusividade BOOLEAN NOT NULL DEFAULT false,  -- sem outros clientes e exclusividade prática?
    q_cargo_email   BOOLEAN NOT NULL DEFAULT false,  -- usa cargo/e-mail/uniforme/organograma como empregado?
    q_ferias        BOOLEAN NOT NULL DEFAULT false,  -- férias/folgas/jornada aprovadas pela ALPA?
    alert_count     SMALLINT GENERATED ALWAYS AS (
                        q_horario::int + q_ordens::int + q_pessoalidade::int + q_salario_fixo::int +
                        q_permanente::int + q_exclusividade::int + q_cargo_email::int + q_ferias::int
                    ) STORED,
    legal_opinion_url TEXT,           -- parecer jurídico anexado quando alert_count >= 2
    answered_by     TEXT,
    answered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_labor_questionnaires_contract ON public.contract_labor_questionnaires (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_labor_questionnaires_org ON public.contract_labor_questionnaires (organization_id);

ALTER TABLE public.contract_labor_questionnaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_labor_questionnaires" ON public.contract_labor_questionnaires;
CREATE POLICY "org_access_contract_labor_questionnaires" ON public.contract_labor_questionnaires
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_contract_labor_questionnaires_updated_at ON public.contract_labor_questionnaires;
CREATE TRIGGER trg_contract_labor_questionnaires_updated_at
    BEFORE UPDATE ON public.contract_labor_questionnaires
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
