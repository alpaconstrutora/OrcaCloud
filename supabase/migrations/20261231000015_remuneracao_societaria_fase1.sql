-- Migration: Remuneração Societária — Fase 1 (Pró-labore + Lucros/Dividendos)
-- Data: 2026-07-03
-- Ver PLANO_MODULO_REMUNERACAO_SOCIETARIA.md
--
-- Princípio: NÃO recria cadastro de sócio (já é company_partners) nem motor fiscal
-- (INSS/IRRF já vive em inss_brackets/irrf_brackets + fiscalService/lib/payrollCalc).
-- Só o delta: atributos de beneficiário no sócio + tabelas de transação
-- (folha de pró-labore, distribuição de lucros) + regra de retenção 2026 versionada
-- no mesmo padrão de inss_brackets/irrf_brackets.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. ESTENDER company_partners (não recria cadastro de sócio)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.company_partners
  ADD COLUMN IF NOT EXISTS beneficiario_tipo   TEXT
    CHECK (beneficiario_tipo IN ('pf_residente','pj_residente','exterior')) DEFAULT 'pf_residente',
  ADD COLUMN IF NOT EXISTS dependentes_ir      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_account_id     UUID REFERENCES public.company_bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pix_chave           TEXT,
  ADD COLUMN IF NOT EXISTS regime_remuneracao  TEXT
    CHECK (regime_remuneracao IN ('prolabore','dividendos','ambos','nenhum')) DEFAULT 'nenhum';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. partner_compensation_settings — regime de pró-labore por sócio
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.partner_compensation_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  partner_id          UUID NOT NULL REFERENCES public.company_partners(id) ON DELETE CASCADE,

  has_prolabore       BOOLEAN NOT NULL DEFAULT false,
  prolabore_amount    NUMERIC(15,2),
  prolabore_start_date DATE,
  prolabore_end_date   DATE,

  cost_center_id      UUID,   -- alocação livre (obra/CC/holding) — sem FK rígida, mesmo padrão de internal_transactions
  payment_day         INT CHECK (payment_day BETWEEN 1 AND 31),
  bank_account_id     UUID REFERENCES public.company_bank_accounts(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (partner_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_comp_settings_org     ON public.partner_compensation_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_partner_comp_settings_company ON public.partner_compensation_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_partner_comp_settings_partner ON public.partner_compensation_settings(partner_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Pró-labore mensal
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.prolabore_payrolls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  competence_month  DATE NOT NULL,  -- sempre dia 1 do mês de competência
  status            TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN (
                       'rascunho','calculado','em_aprovacao','aprovado',
                       'enviado_financeiro','pago','contabilizado','encerrado',
                       'cancelado','bloqueado'
                     )),

  gross_total       NUMERIC(15,2) NOT NULL DEFAULT 0,
  inss_total        NUMERIC(15,2) NOT NULL DEFAULT 0,
  irrf_total        NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_total         NUMERIC(15,2) NOT NULL DEFAULT 0,

  approved_by_email TEXT,
  approved_at       TIMESTAMPTZ,
  created_by_email  TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (company_id, competence_month)
);

CREATE INDEX IF NOT EXISTS idx_prolabore_payrolls_org     ON public.prolabore_payrolls(organization_id);
CREATE INDEX IF NOT EXISTS idx_prolabore_payrolls_company ON public.prolabore_payrolls(company_id);

CREATE TABLE IF NOT EXISTS public.prolabore_payroll_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id          UUID NOT NULL REFERENCES public.prolabore_payrolls(id) ON DELETE CASCADE,
  partner_id          UUID NOT NULL REFERENCES public.company_partners(id) ON DELETE RESTRICT,

  gross_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  inss_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  irrf_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,

  cost_center_id      UUID,
  financial_entry_id  UUID REFERENCES public.internal_transactions(id) ON DELETE SET NULL,
  receipt_document_id UUID REFERENCES public.opura_documents(id) ON DELETE SET NULL,

  status              TEXT NOT NULL DEFAULT 'calculado' CHECK (status IN (
                         'calculado','aprovado','pago','contabilizado','cancelado'
                       )),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (payroll_id, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_prolabore_items_payroll ON public.prolabore_payroll_items(payroll_id);
CREATE INDEX IF NOT EXISTS idx_prolabore_items_partner ON public.prolabore_payroll_items(partner_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Distribuição de lucros/dividendos
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profit_distribution_batches (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id               UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  profit_period_start      DATE NOT NULL,
  profit_period_end        DATE NOT NULL,

  -- MVP: apuração manual (Controladoria Fase 3 ainda não existe). Exige documento anexado.
  accounting_profit_amount NUMERIC(15,2),
  available_profit_amount  NUMERIC(15,2) NOT NULL,
  proposed_amount          NUMERIC(15,2) NOT NULL,
  approved_amount          NUMERIC(15,2),

  approval_date            DATE,
  payment_date             DATE,
  distribution_rule        TEXT NOT NULL DEFAULT 'proporcional'
                            CHECK (distribution_rule IN ('proporcional','manual')),

  status                   TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN (
                              'rascunho','em_validacao_contabil','aguardando_aprovacao',
                              'aprovado','agendado_financeiro','pago_parcial','pago_integral',
                              'contabilizado','encerrado',
                              'bloqueado_sem_lucro','bloqueado_sem_ata','cancelado'
                            )),

  document_id               UUID REFERENCES public.opura_documents(id) ON DELETE SET NULL,  -- ata/deliberação

  created_by_email          TEXT,
  approved_by_email         TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (profit_period_end >= profit_period_start),
  CHECK (proposed_amount <= available_profit_amount)
);

CREATE INDEX IF NOT EXISTS idx_profit_batches_org     ON public.profit_distribution_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_profit_batches_company ON public.profit_distribution_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_profit_batches_status  ON public.profit_distribution_batches(status);

CREATE TABLE IF NOT EXISTS public.profit_distribution_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID NOT NULL REFERENCES public.profit_distribution_batches(id) ON DELETE CASCADE,
  partner_id            UUID NOT NULL REFERENCES public.company_partners(id) ON DELETE RESTRICT,

  beneficiary_type      TEXT NOT NULL CHECK (beneficiary_type IN ('pf_residente','pj_residente','exterior')),
  ownership_percentage  NUMERIC(5,2) NOT NULL,
  gross_amount          NUMERIC(15,2) NOT NULL,

  withholding_tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,  -- calculado pelo agregador mensal (seção 5)
  net_amount             NUMERIC(15,2) NOT NULL DEFAULT 0,

  financial_entry_id     UUID REFERENCES public.internal_transactions(id) ON DELETE SET NULL,
  receipt_document_id    UUID REFERENCES public.opura_documents(id) ON DELETE SET NULL,

  status                 TEXT NOT NULL DEFAULT 'proposto' CHECK (status IN (
                            'proposto','aprovado','pago','contabilizado','cancelado'
                          )),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (batch_id, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_profit_items_batch   ON public.profit_distribution_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_profit_items_partner ON public.profit_distribution_items(partner_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. dividend_withholding_rules — parametrizável por competência
--    (mesmo padrão de inss_brackets/irrf_brackets: NÃO hardcode a alíquota no código)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.dividend_withholding_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year              INT NOT NULL,
  beneficiary_type  TEXT NOT NULL CHECK (beneficiary_type IN ('pf_residente','pj_residente','exterior')),
  monthly_threshold NUMERIC(15,2) NOT NULL,
  rate              NUMERIC(5,4) NOT NULL,
  effective_from    DATE NOT NULL,
  effective_to      DATE,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dividend_rules_lookup
  ON public.dividend_withholding_rules(beneficiary_type, year, is_active);

-- Lei 15.270/2025: retenção de 10% sobre lucros/dividendos > R$ 50.000/mês
-- pagos por uma mesma PJ a uma mesma PF residente, a partir de 01/01/2026.
INSERT INTO public.dividend_withholding_rules
  (year, beneficiary_type, monthly_threshold, rate, effective_from, is_active)
SELECT 2026, 'pf_residente', 50000.00, 0.1000, DATE '2026-01-01', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.dividend_withholding_rules
  WHERE year = 2026 AND beneficiary_type = 'pf_residente'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Agregador mensal — recalcula retenção sobre o TOTAL pago no mês
--    (a lei manda recalcular quando há mais de um pagamento no mesmo mês)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_dividend_withholding_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id   UUID;
  v_ref_date     DATE;
  v_month_start  DATE;
  v_month_end    DATE;
  v_year         INT;
  v_total_mes    NUMERIC(15,2);
  v_already      NUMERIC(15,2);
  v_rule         RECORD;
  v_retention    NUMERIC(15,2);
BEGIN
  -- Evita recursão: este trigger só faz UPDATE da própria linha (via RETURN NEW),
  -- nunca escreve em outras linhas, então não há risco de loop entre itens.
  IF NEW.beneficiary_type IS DISTINCT FROM 'pf_residente' THEN
    NEW.withholding_tax_amount := 0;
    NEW.net_amount := NEW.gross_amount;
    RETURN NEW;
  END IF;

  SELECT company_id, COALESCE(payment_date, approval_date, profit_period_end)
    INTO v_company_id, v_ref_date
    FROM public.profit_distribution_batches
    WHERE id = NEW.batch_id;

  IF v_ref_date IS NULL THEN
    -- Ainda sem data de referência (rascunho) — sem retenção provisória até haver data.
    NEW.withholding_tax_amount := 0;
    NEW.net_amount := NEW.gross_amount;
    RETURN NEW;
  END IF;

  v_month_start := date_trunc('month', v_ref_date)::date;
  v_month_end   := (date_trunc('month', v_ref_date) + interval '1 month - 1 day')::date;
  v_year        := extract(year FROM v_ref_date)::int;

  -- Total já pago/proposto no mês para este sócio nesta empresa, EXCLUINDO a linha atual
  -- (ela ainda não está commitada na tabela durante um BEFORE trigger).
  SELECT COALESCE(SUM(i.gross_amount), 0), COALESCE(SUM(i.withholding_tax_amount), 0)
    INTO v_total_mes, v_already
    FROM public.profit_distribution_items i
    JOIN public.profit_distribution_batches b ON b.id = i.batch_id
    WHERE b.company_id = v_company_id
      AND i.partner_id = NEW.partner_id
      AND i.beneficiary_type = 'pf_residente'
      AND i.status <> 'cancelado'
      AND i.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(b.payment_date, b.approval_date, b.profit_period_end) BETWEEN v_month_start AND v_month_end;

  v_total_mes := v_total_mes + NEW.gross_amount;

  SELECT * INTO v_rule
    FROM public.dividend_withholding_rules
    WHERE beneficiary_type = 'pf_residente'
      AND is_active = true
      AND year = v_year
      AND v_ref_date >= effective_from
      AND (effective_to IS NULL OR v_ref_date <= effective_to)
    ORDER BY effective_from DESC
    LIMIT 1;

  IF v_rule IS NULL OR v_total_mes <= v_rule.monthly_threshold THEN
    NEW.withholding_tax_amount := 0;
    NEW.net_amount := NEW.gross_amount;
    RETURN NEW;
  END IF;

  -- Retenção recalculada sobre o total do mês; abate o que já foi retido nos
  -- pagamentos anteriores do mesmo mês (efeito "catch-up" no pagamento que estoura o limite).
  v_retention := GREATEST(ROUND(v_total_mes * v_rule.rate, 2) - v_already, 0);
  v_retention := LEAST(v_retention, NEW.gross_amount);  -- nunca reter mais que o próprio item

  NEW.withholding_tax_amount := v_retention;
  NEW.net_amount := NEW.gross_amount - v_retention;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dividend_withholding_recalc ON public.profit_distribution_items;
CREATE TRIGGER trg_dividend_withholding_recalc
  BEFORE INSERT OR UPDATE OF gross_amount, beneficiary_type ON public.profit_distribution_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_dividend_withholding_recalc();

-- ════════════════════════════════════════════════════════════════════════════
-- 7. updated_at triggers (padrão do projeto)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.remuneracao_societaria_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_partner_comp_settings_updated_at ON public.partner_compensation_settings;
CREATE TRIGGER trg_partner_comp_settings_updated_at
  BEFORE UPDATE ON public.partner_compensation_settings
  FOR EACH ROW EXECUTE FUNCTION public.remuneracao_societaria_set_updated_at();

DROP TRIGGER IF EXISTS trg_prolabore_payrolls_updated_at ON public.prolabore_payrolls;
CREATE TRIGGER trg_prolabore_payrolls_updated_at
  BEFORE UPDATE ON public.prolabore_payrolls
  FOR EACH ROW EXECUTE FUNCTION public.remuneracao_societaria_set_updated_at();

DROP TRIGGER IF EXISTS trg_prolabore_items_updated_at ON public.prolabore_payroll_items;
CREATE TRIGGER trg_prolabore_items_updated_at
  BEFORE UPDATE ON public.prolabore_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.remuneracao_societaria_set_updated_at();

DROP TRIGGER IF EXISTS trg_profit_batches_updated_at ON public.profit_distribution_batches;
CREATE TRIGGER trg_profit_batches_updated_at
  BEFORE UPDATE ON public.profit_distribution_batches
  FOR EACH ROW EXECUTE FUNCTION public.remuneracao_societaria_set_updated_at();

DROP TRIGGER IF EXISTS trg_profit_items_updated_at ON public.profit_distribution_items;
CREATE TRIGGER trg_profit_items_updated_at
  BEFORE UPDATE ON public.profit_distribution_items
  FOR EACH ROW EXECUTE FUNCTION public.remuneracao_societaria_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 8. RLS — usa is_org_member(organization_id), mesmo padrão de supplier_payments
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.partner_compensation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prolabore_payrolls            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prolabore_payroll_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_distribution_batches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_distribution_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividend_withholding_rules     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_comp_settings_all" ON public.partner_compensation_settings;
CREATE POLICY "partner_comp_settings_all" ON public.partner_compensation_settings
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "prolabore_payrolls_all" ON public.prolabore_payrolls;
CREATE POLICY "prolabore_payrolls_all" ON public.prolabore_payrolls
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Itens não têm organization_id próprio — checa via payroll pai.
DROP POLICY IF EXISTS "prolabore_items_all" ON public.prolabore_payroll_items;
CREATE POLICY "prolabore_items_all" ON public.prolabore_payroll_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prolabore_payrolls p
      WHERE p.id = prolabore_payroll_items.payroll_id
        AND public.is_org_member(p.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prolabore_payrolls p
      WHERE p.id = prolabore_payroll_items.payroll_id
        AND public.is_org_member(p.organization_id)
    )
  );

DROP POLICY IF EXISTS "profit_batches_all" ON public.profit_distribution_batches;
CREATE POLICY "profit_batches_all" ON public.profit_distribution_batches
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "profit_items_all" ON public.profit_distribution_items;
CREATE POLICY "profit_items_all" ON public.profit_distribution_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profit_distribution_batches b
      WHERE b.id = profit_distribution_items.batch_id
        AND public.is_org_member(b.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profit_distribution_batches b
      WHERE b.id = profit_distribution_items.batch_id
        AND public.is_org_member(b.organization_id)
    )
  );

-- Regra fiscal é leitura global (não é por org) — só authenticated pode ler; escrita fica
-- restrita a service role (ajustes de alíquota via migration/admin, não pela UI).
DROP POLICY IF EXISTS "dividend_rules_select" ON public.dividend_withholding_rules;
CREATE POLICY "dividend_rules_select" ON public.dividend_withholding_rules
  FOR SELECT TO authenticated USING (true);

-- Acesso anônimo para fluxo de dev (mesmo padrão das demais tabelas financeiras do projeto)
DROP POLICY IF EXISTS "partner_comp_settings_anon_all" ON public.partner_compensation_settings;
CREATE POLICY "partner_comp_settings_anon_all" ON public.partner_compensation_settings
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "prolabore_payrolls_anon_all" ON public.prolabore_payrolls;
CREATE POLICY "prolabore_payrolls_anon_all" ON public.prolabore_payrolls
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "prolabore_items_anon_all" ON public.prolabore_payroll_items;
CREATE POLICY "prolabore_items_anon_all" ON public.prolabore_payroll_items
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "profit_batches_anon_all" ON public.profit_distribution_batches;
CREATE POLICY "profit_batches_anon_all" ON public.profit_distribution_batches
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "profit_items_anon_all" ON public.profit_distribution_items;
CREATE POLICY "profit_items_anon_all" ON public.profit_distribution_items
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "dividend_rules_anon_all" ON public.dividend_withholding_rules;
CREATE POLICY "dividend_rules_anon_all" ON public.dividend_withholding_rules
  FOR ALL TO anon USING (true) WITH CHECK (true);
