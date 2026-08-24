-- ==========================================================================
-- Folha de Pagamento · Rateio contábil por colaborador
-- Date: 2026-08-23
-- Tabela: public.employee_cost_splits (nova)
-- ==========================================================================
-- CONTEXTO
-- `aplicar_20270914000004` deu à folha UM Centro de Custo e UM Plano de Contas
-- por ciclo, com override de UM valor por colaborador. Não cobre o caso real
-- (relatado pelo usuário em 2026-08-23): dentro de um mesmo mês, um colaborador
-- pode apropriar o custo em MAIS DE UM centro de custo / plano de contas.
--
-- DECISÃO DO USUÁRIO (perguntado na mesma sessão): o rateio contábil é
-- INDEPENDENTE do rateio de obra (`employee_allocations`) — tabela separada,
-- percentuais próprios. Um colaborador pode estar 100% numa obra e ainda assim
-- dividir o custo entre dois centros de custo.
--
-- HERANÇA RESULTANTE (4 degraus, aplicada em services/payrollService.ts):
--   employee_cost_splits (colaborador × mês) → se houver linhas, RATEIA
--   employees.cost_center_id / .plano_de_contas_id → senão, valor único
--   payroll_runs.cost_center_id / .plano_de_contas_id → senão, padrão do ciclo
--   null → senão
--
-- Soma parcial NÃO perde custo: se as linhas somam 95%, os 5% restantes caem
-- para o degrau seguinte. Erro de digitação não faz dinheiro sumir da
-- contabilidade.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: dependências ───────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'cost_centers_v2') THEN
        RAISE EXCEPTION 'ABORTADO: cost_centers_v2 nao existe (rode 20270822000001 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'plano_de_contas') THEN
        RAISE EXCEPTION 'ABORTADO: plano_de_contas nao existe (rode 20270822000013 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'is_org_member') THEN
        RAISE EXCEPTION 'ABORTADO: public.is_org_member() nao existe.';
    END IF;
END $$;

-- ==========================================================================
-- 1. Tabela
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.employee_cost_splits (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id        uuid NOT NULL REFERENCES public.employees(id)     ON DELETE CASCADE,
    -- 'YYYY-MM' — MESMO formato de employee_allocations.reference_period, para
    -- as duas telas de rateio falarem do mesmo mês sem conversão.
    reference_period   text NOT NULL CHECK (reference_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    -- ON DELETE RESTRICT nas duas: apagar um centro de custo que tem rateio
    -- histórico reescreveria a contabilidade de meses já fechados. O SET NULL
    -- da 20270914000004 era aceitável num valor solto; aqui não é.
    cost_center_id     uuid REFERENCES public.cost_centers_v2(id) ON DELETE RESTRICT,
    plano_de_contas_id uuid REFERENCES public.plano_de_contas(id) ON DELETE RESTRICT,
    percent            numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    -- Linha sem nenhuma das duas dimensões não classifica nada — só consumiria
    -- percentual do rateio.
    CONSTRAINT employee_cost_splits_dimensao_obrigatoria
        CHECK (cost_center_id IS NOT NULL OR plano_de_contas_id IS NOT NULL)
);

COMMENT ON TABLE public.employee_cost_splits IS
    'Rateio contabil do custo do colaborador no mes: percentual por Centro de '
    'Custo (cost_centers_v2) e Plano de Contas (plano_de_contas). INDEPENDENTE '
    'do rateio de obra (employee_allocations) — decisao do usuario 2026-08-23.';
COMMENT ON COLUMN public.employee_cost_splits.percent IS
    'Percentual do custo do colaborador no mes. A soma por (employee_id, '
    'reference_period) deveria ser 100; se for menor, o resto herda a '
    'classificacao do colaborador e depois a do ciclo de folha.';

-- Mesma combinação de dimensões não pode aparecer duas vezes no mesmo mês —
-- seriam duas linhas somando onde deveria haver uma. COALESCE porque UNIQUE
-- não compara NULLs entre si.
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_cost_splits_dimensao
    ON public.employee_cost_splits (
        employee_id,
        reference_period,
        COALESCE(cost_center_id,     '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(plano_de_contas_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE INDEX IF NOT EXISTS idx_employee_cost_splits_lookup
    ON public.employee_cost_splits (employee_id, reference_period);
CREATE INDEX IF NOT EXISTS idx_employee_cost_splits_org
    ON public.employee_cost_splits (org_id, reference_period);

-- updated_at automático (a tela salva em bloco; sem isto a coluna congela).
CREATE OR REPLACE FUNCTION public.fn_employee_cost_splits_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fn_employee_cost_splits_touch() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_employee_cost_splits_touch ON public.employee_cost_splits;
CREATE TRIGGER trg_employee_cost_splits_touch
    BEFORE UPDATE ON public.employee_cost_splits
    FOR EACH ROW EXECUTE FUNCTION public.fn_employee_cost_splits_touch();

-- ==========================================================================
-- 2. RLS
-- ==========================================================================

ALTER TABLE public.employee_cost_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_cost_splits_org_all ON public.employee_cost_splits;
CREATE POLICY employee_cost_splits_org_all
    ON public.employee_cost_splits
    FOR ALL
    TO authenticated
    USING      (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

-- REVOKE de anon explícito: o Supabase concede SELECT a `anon` via ALTER
-- DEFAULT PRIVILEGES, então revogar de PUBLIC sozinho não fecha.
REVOKE ALL ON public.employee_cost_splits FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_cost_splits TO authenticated;

-- ==========================================================================
-- 3. Conferência
-- ==========================================================================
-- 3.a. A tabela existe e está com RLS ligada:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname = 'employee_cost_splits';
--    -> esperado: t
--
-- 3.b. A policy está no lugar:
-- SELECT policyname, roles, cmd FROM pg_policies
--  WHERE tablename = 'employee_cost_splits';
--    -> esperado: employee_cost_splits_org_all | {authenticated} | ALL
--
-- 3.c. anon não lê (rodar com a anon key, fora do SQL Editor):
--   GET /rest/v1/employee_cost_splits?select=id  -> [] ou 401, nunca dados
--
-- 3.d. Rateios que não fecham 100% (relatório de conferência para a tela):
-- SELECT employee_id, reference_period, sum(percent) AS total
--   FROM public.employee_cost_splits
--  GROUP BY 1, 2 HAVING sum(percent) <> 100
--  ORDER BY 2 DESC;
-- ==========================================================================
-- FIM: aplicar_20270914000005_employee_cost_splits.sql
-- ==========================================================================
