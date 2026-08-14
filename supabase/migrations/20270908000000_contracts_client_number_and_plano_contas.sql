-- ============================================================
-- Contratos (Suprimentos): Número do Contrato do Cliente + Plano de Contas
-- ============================================================
-- Pedido do usuário (2026-08-14):
--   1. Campo para o número que o CLIENTE/contratante deu ao contrato (o nosso
--      número interno já existe em `contracts.number`, gerado pela numeração
--      de Configurações > Nomenclatura — este é um segundo campo, livre,
--      preenchido à mão).
--   2. Coluna de Plano de Contas na listagem. `contracts.category_id` já
--      existe mas aponta para `financial_categories` (rotulado "Conta
--      Financeira" no ContractModal) — é OUTRA dimensão, não Plano de Contas.
--      Ver memória centro-custo-vs-plano-de-contas-canonico: Centro de Custo
--      = cost_centers_v2 (contracts.cost_center_id, já existe desde
--      20270822000003); Plano de Contas = tabela `plano_de_contas`, que
--      ainda não tinha FK em `contracts`. Mesmo padrão de
--      20270846000000_commercial_deals_cost_center_plano_contas.sql.
--
-- lock_timeout curto — mesmo cuidado das migrations anteriores em `contracts`.
-- Aplicar MANUALMENTE no Supabase (nunca `supabase db push`). Idempotente.
SET lock_timeout = '5s';

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS client_contract_number TEXT,
    ADD COLUMN IF NOT EXISTS plano_de_contas_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'contracts_plano_de_contas_id_fkey'
          AND conrelid = 'public.contracts'::regclass
    ) THEN
        ALTER TABLE public.contracts
            ADD CONSTRAINT contracts_plano_de_contas_id_fkey
            FOREIGN KEY (plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.contracts.client_contract_number IS
    'Número do contrato atribuído pelo cliente/contratante (livre, digitado). '
    'Distinto de contracts.number, que é a numeração interna gerada pela '
    'nomenclatura da organização.';
COMMENT ON COLUMN public.contracts.plano_de_contas_id IS
    'Plano de Contas (plano_de_contas) do contrato. NÃO confundir com '
    'cost_center_id (cost_centers_v2) nem com category_id (financial_categories, '
    'rotulado "Conta Financeira" no ContractModal).';

RESET lock_timeout;

-- Garante que o PostgREST enxergue as colunas novas sem esperar o refresh.
NOTIFY pgrst, 'reload schema';
