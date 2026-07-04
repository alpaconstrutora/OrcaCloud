-- Migration: Remuneração Societária — encargos corretos do pró-labore
-- Ver PLANO_MODULO_REMUNERACAO_SOCIETARIA.md
--
-- Bug corrigido: o cálculo de pró-labore reusava inss_brackets (tabela
-- progressiva do EMPREGADO CLT), mas o sócio-administrador é contribuinte
-- individual perante o INSS — alíquota FIXA (11%) sobre o pró-labore,
-- limitada ao teto do salário de contribuição, sem parcela a deduzir.
-- Além disso, a empresa (quando não optante do Simples Nacional) recolhe
-- adicionalmente a Cota Patronal (20%) — despesa da empresa, não desconto
-- do sócio. FGTS nunca incide sobre pró-labore (já não incidia).

-- ─── 1. Regra de INSS do pró-labore, parametrizável por competência ────────
-- (mesmo padrão de inss_brackets/irrf_brackets/dividend_withholding_rules:
-- NÃO hardcode a alíquota/teto no código.)

CREATE TABLE IF NOT EXISTS public.prolabore_inss_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valid_from     DATE NOT NULL,
  valid_to       DATE,
  rate           NUMERIC(5,4) NOT NULL DEFAULT 0.11,   -- INSS do sócio (contribuinte individual) — fixo
  teto           NUMERIC(15,2) NOT NULL,                -- teto do salário de contribuição (mesmo teto do INSS geral)
  patronal_rate  NUMERIC(5,4) NOT NULL DEFAULT 0.20,    -- Cota Patronal — só incide se empresa NÃO for Simples Nacional
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prolabore_inss_rules_valid ON public.prolabore_inss_rules(valid_from, valid_to);

ALTER TABLE public.prolabore_inss_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prolabore_inss_rules_manage_all" ON public.prolabore_inss_rules;
CREATE POLICY "prolabore_inss_rules_manage_all" ON public.prolabore_inss_rules
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "prolabore_inss_rules_anon_all" ON public.prolabore_inss_rules;
CREATE POLICY "prolabore_inss_rules_anon_all" ON public.prolabore_inss_rules
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- Seed 2025 (mesmo teto usado no topo de inss_brackets 2025: 8.157,41).
-- Atualizar quando a tabela oficial de 2026 for publicada (mesma prática
-- já adotada para inss_brackets/irrf_brackets, ainda não seedados p/ 2026).
INSERT INTO public.prolabore_inss_rules (valid_from, valid_to, rate, teto, patronal_rate)
SELECT '2025-01-01', NULL, 0.11, 8157.41, 0.20
WHERE NOT EXISTS (SELECT 1 FROM public.prolabore_inss_rules WHERE valid_from = '2025-01-01');

-- ─── 2. Cota Patronal + Contribuições de Terceiros por item/folha ──────────
-- (despesas da empresa, não descontam do líquido do sócio)
--
-- Contribuições de Terceiros (Sistema S: Salário-Educação/INCRA/SENAC/SESC/
-- SEBRAE etc., ~5,8%) incide sobre a MESMA base da Cota Patronal — inclusive
-- sobre pró-labore — quando a empresa não é Simples Nacional. A alíquota já
-- é configurável por organização em localStorage (payrollService.
-- getOrgTerceirosTaxes/TERCEIROS_TAXES_DEFAULT, reusado pelo módulo Encargos
-- Sociais para a folha CLT) — aqui só armazenamos o valor calculado.

ALTER TABLE public.prolabore_payroll_items
  ADD COLUMN IF NOT EXISTS patronal_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terceiros_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE public.prolabore_payrolls
  ADD COLUMN IF NOT EXISTS patronal_total   NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terceiros_total  NUMERIC(15,2) NOT NULL DEFAULT 0;

-- ─── 3. Exceção: Simples Nacional Anexo IV ─────────────────────────────────
-- Empresas do Simples Nacional recolhem a Cota Patronal (CPP) embutida na
-- guia DAS — EXCETO as do Anexo IV (advocacia, limpeza, segurança, construção
-- civil, decoração etc.), que pagam a CPP (20%) à parte, na DARF Unificada,
-- igual a Lucro Presumido/Real. Sem esse flag, toda empresa regime_tributario
-- = 'simples' seria isentada por engano, mesmo sendo Anexo IV.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS simples_anexo_iv BOOLEAN NOT NULL DEFAULT false;
