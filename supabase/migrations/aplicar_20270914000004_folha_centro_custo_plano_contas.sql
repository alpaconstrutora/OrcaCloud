-- ==========================================================================
-- Folha de Pagamento · Centro de Custo e Plano de Contas
-- Date: 2026-08-23
-- Tabelas: public.payroll_runs, public.employees
-- ==========================================================================
-- CONTEXTO
-- A folha era a única origem financeira sem as duas dimensões contábeis:
-- `payroll_runs` guardava só período/tipo/status, e `employees.centro_custo`
-- (migration 20260528000000) era TEXTO LIVRE, sem FK, lido apenas pelo
-- formulário do colaborador. Resultado: toda linha de origem "Folha" em Contas
-- a Pagar aparecia sem Centro de Custo e sem Plano de Contas.
--
-- As três dimensões do sistema são distintas e não se misturam:
--   Centro de Custo      → public.cost_centers_v2
--   Plano de Contas      → public.plano_de_contas
--   Categoria Financeira → public.financial_categories
--
-- REGRA DE HERANÇA (definida pelo usuário em 2026-08-23)
--   colaborador (employees.*_id)   → se preenchido, vence
--   ciclo de folha (payroll_runs.*_id) → padrão
--   nenhum dos dois                → NULL
--
-- O override do colaborador só alcança as linhas financeiras que têm UM
-- colaborador (rubricas individualizadas, syncEmployeeToFinance). As linhas
-- agregadas por obra e "Não Alocado" somam vários colaboradores numa transação
-- só — nelas vale sempre a classificação do ciclo.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS + FK criada só se não existir; o
-- backfill só toca colaborador que ainda está sem `cost_center_id`.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: os dois cadastros precisam existir ─────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'cost_centers_v2'
    ) THEN
        RAISE EXCEPTION 'ABORTADO: cost_centers_v2 nao existe (rode 20270822000001 antes).';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'plano_de_contas'
    ) THEN
        RAISE EXCEPTION 'ABORTADO: plano_de_contas nao existe (rode 20270822000013 antes).';
    END IF;
END $$;

-- ==========================================================================
-- 1. Ciclo de folha — a classificação PADRÃO
-- ==========================================================================

ALTER TABLE public.payroll_runs
    ADD COLUMN IF NOT EXISTS cost_center_id     UUID,
    ADD COLUMN IF NOT EXISTS plano_de_contas_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_cost_center_id_fkey'
    ) THEN
        ALTER TABLE public.payroll_runs
            ADD CONSTRAINT payroll_runs_cost_center_id_fkey
            FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_plano_de_contas_id_fkey'
    ) THEN
        ALTER TABLE public.payroll_runs
            ADD CONSTRAINT payroll_runs_plano_de_contas_id_fkey
            FOREIGN KEY (plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.payroll_runs.cost_center_id IS
    'Centro de Custo padrao do ciclo (cost_centers_v2). Herdado por todas as '
    'linhas financeiras da folha, exceto onde o colaborador tem override.';
COMMENT ON COLUMN public.payroll_runs.plano_de_contas_id IS
    'Plano de Contas padrao do ciclo (plano_de_contas). Mesma heranca do '
    'cost_center_id.';

CREATE INDEX IF NOT EXISTS idx_payroll_runs_cost_center_id
    ON public.payroll_runs(cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_runs_plano_de_contas_id
    ON public.payroll_runs(plano_de_contas_id) WHERE plano_de_contas_id IS NOT NULL;

-- ==========================================================================
-- 2. Colaborador — o OVERRIDE
-- ==========================================================================

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS cost_center_id     UUID,
    ADD COLUMN IF NOT EXISTS plano_de_contas_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_cost_center_id_fkey'
    ) THEN
        ALTER TABLE public.employees
            ADD CONSTRAINT employees_cost_center_id_fkey
            FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_plano_de_contas_id_fkey'
    ) THEN
        ALTER TABLE public.employees
            ADD CONSTRAINT employees_plano_de_contas_id_fkey
            FOREIGN KEY (plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.employees.cost_center_id IS
    'Centro de Custo do colaborador (cost_centers_v2). Sobrepoe o do ciclo de '
    'folha nas linhas financeiras individuais. Substitui o texto livre '
    'employees.centro_custo, que fica como legado de leitura.';
COMMENT ON COLUMN public.employees.plano_de_contas_id IS
    'Plano de Contas do colaborador (plano_de_contas). Mesma regra do '
    'cost_center_id.';

CREATE INDEX IF NOT EXISTS idx_employees_cost_center_id
    ON public.employees(cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_plano_de_contas_id
    ON public.employees(plano_de_contas_id) WHERE plano_de_contas_id IS NOT NULL;

-- ==========================================================================
-- 3. Backfill do texto livre → FK
-- ==========================================================================
-- `employees.centro_custo` foi digitado à mão ("CC-001 / Obra Vila"). Só
-- religamos o que casa SEM AMBIGUIDADE com um centro de custo da MESMA
-- organização: por `code` exato ou por `name` exato (sem diferenciar
-- maiúsculas nem espaço nas pontas). Texto que casa com dois centros, ou com
-- nenhum, fica NULL — melhor vazio do que classificado errado.

WITH candidato AS (
    SELECT e.id AS employee_id,
           (array_agg(cc.id))[1] AS cost_center_id,
           count(*)              AS casamentos
      FROM public.employees e
      JOIN public.cost_centers_v2 cc
             ON cc.organization_id = e.org_id
            AND (
                 upper(btrim(cc.code)) = upper(btrim(e.centro_custo))
              OR upper(btrim(cc.name)) = upper(btrim(e.centro_custo))
                )
     WHERE e.cost_center_id IS NULL
       AND NULLIF(btrim(COALESCE(e.centro_custo, '')), '') IS NOT NULL
     GROUP BY e.id
)
UPDATE public.employees e
   SET cost_center_id = c.cost_center_id
  FROM candidato c
 WHERE e.id = c.employee_id
   AND c.casamentos = 1;

-- ==========================================================================
-- 4. Conferência
-- ==========================================================================
-- 4.a. As 4 colunas novas existem:
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND (table_name, column_name) IN (
--          ('payroll_runs','cost_center_id'), ('payroll_runs','plano_de_contas_id'),
--          ('employees','cost_center_id'),    ('employees','plano_de_contas_id'))
--  ORDER BY 1, 2;
--    -> esperado: 4 linhas
--
-- 4.b. Quantos colaboradores o backfill religou:
-- SELECT count(*) FROM public.employees WHERE cost_center_id IS NOT NULL;
--
-- 4.c. Texto livre que NÃO casou (revisar à mão na tela do colaborador):
-- SELECT DISTINCT centro_custo FROM public.employees
--  WHERE cost_center_id IS NULL
--    AND NULLIF(btrim(COALESCE(centro_custo, '')), '') IS NOT NULL
--  ORDER BY 1;
--
-- 4.d. A tela: fechar (ou re-sincronizar) uma folha e conferir em Contas a
--      Pagar, filtro Origem = "Folha", as colunas Centro de Custo e Plano de
--      Contas preenchidas.
-- ==========================================================================
-- FIM: aplicar_20270914000004_folha_centro_custo_plano_contas.sql
-- ==========================================================================
