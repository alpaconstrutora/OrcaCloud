-- ============================================================
-- Negociação (Locações/Vendas): Centro de Custo + Plano de Contas
-- ============================================================
-- Pedido do usuário (2026-08-01): a aba "Forma de Pagamento" de
-- Comercial > Locações > Gestão de Unidades > Gerenciar Negociação passa a
-- definir as DUAS dimensões contábeis do negócio, e elas propagam para as
-- parcelas materializadas em Contas a Receber (internal_transactions).
--
-- São dimensões DIFERENTES — ver 20270822000013_restore_plano_de_contas.sql:
--   • Centro de Custo  → cost_centers_v2   (Minha Organização > Centro de Custo)
--   • Plano de Contas  → plano_de_contas   (Minha Organização > Plano de Contas)
-- Nunca tratar como sinônimos.
--
-- `plano_de_contas` era até aqui um cadastro SEM nenhuma FK apontando para ela
-- (nenhuma tabela transacional a usava como dimensão). Esta migration é a
-- primeira a torná-la dimensão de lançamento.
--
-- lock_timeout curto: `internal_transactions` é tabela quente e DDL nela já
-- deadlockou neste projeto. Falha rápido (55P03) em vez de segurar lock —
-- mesmo padrão de 20270822000003_contracts_cost_center_v2_fk.sql. Se falhar,
-- repita a migration num momento de menor movimento.
SET lock_timeout = '5s';

-- ── Cabeçalho da negociação (aba Forma de Pagamento) ────────────────────────
ALTER TABLE public.commercial_deals
    ADD COLUMN IF NOT EXISTS cost_center_id UUID,
    ADD COLUMN IF NOT EXISTS plano_de_contas_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'commercial_deals_cost_center_id_fkey'
          AND conrelid = 'public.commercial_deals'::regclass
    ) THEN
        ALTER TABLE public.commercial_deals
            ADD CONSTRAINT commercial_deals_cost_center_id_fkey
            FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'commercial_deals_plano_de_contas_id_fkey'
          AND conrelid = 'public.commercial_deals'::regclass
    ) THEN
        ALTER TABLE public.commercial_deals
            ADD CONSTRAINT commercial_deals_plano_de_contas_id_fkey
            FOREIGN KEY (plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.commercial_deals.cost_center_id IS
    'Centro de Custo (cost_centers_v2) da negociação. Propaga para as parcelas '
    'em internal_transactions ao gerar/sincronizar o plano de pagamento.';
COMMENT ON COLUMN public.commercial_deals.plano_de_contas_id IS
    'Plano de Contas (plano_de_contas) da negociação. NÃO confundir com '
    'cost_center_id nem com financial_categories (categoria/DRE).';

-- ── Parcela materializada em Contas a Receber ───────────────────────────────
-- cost_center_id JÁ existe em internal_transactions (FK re-apontada para
-- cost_centers_v2 em 20270822000008) — só falta a dimensão Plano de Contas.
ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS plano_de_contas_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'internal_transactions_plano_de_contas_id_fkey'
          AND conrelid = 'public.internal_transactions'::regclass
    ) THEN
        ALTER TABLE public.internal_transactions
            ADD CONSTRAINT internal_transactions_plano_de_contas_id_fkey
            FOREIGN KEY (plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.internal_transactions.plano_de_contas_id IS
    'Plano de Contas (plano_de_contas) do lançamento. Dimensão distinta de '
    'cost_center_id (cost_centers_v2) e de category (financial_categories).';

RESET lock_timeout;

-- Garante que o PostgREST enxergue as colunas novas sem esperar o refresh.
NOTIFY pgrst, 'reload schema';
