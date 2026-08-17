-- ============================================================
-- Boletos a Pagar: campo Plano de Contas
-- ============================================================
-- Pedido do usuário (2026-08-17): a captura de boletos passa a ter, além de
-- Centro de Custo, a dimensão Plano de Contas — mesma dupla e mesmo padrão de
-- seletor (drawer) já usados em Comercial > Locações > Gerenciar Negociação >
-- Forma de Pagamento (ver 20270846000000_commercial_deals_cost_center_plano_contas.sql).
--
-- `chart_of_accounts_id` (já existente em `boletos`) é o campo ANTIGO,
-- aposentado, apontando para `chart_of_accounts` (tabela em desativação — ver
-- PLANO_MODULO_FINANCEIRO.md, dívida técnica). Não reaproveitar: esta coluna
-- nova aponta para `plano_de_contas`, a dimensão canônica.
--
-- `internal_transactions.plano_de_contas_id` já existe desde 20270846000000 e
-- já é exposta por `vw_payables` (20270848000000) — o lançamento gerado na
-- aprovação do boleto (boletoService.aprovarECriarInvoice) só precisa passar a
-- gravar essa coluna a partir de boletos.plano_de_contas_id.
--
-- lock_timeout curto: mesma cautela de 20270846000000 (DDL em tabela quente já
-- deadlockou neste projeto).
SET lock_timeout = '5s';

ALTER TABLE public.boletos
    ADD COLUMN IF NOT EXISTS plano_de_contas_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'boletos_plano_de_contas_id_fkey'
          AND conrelid = 'public.boletos'::regclass
    ) THEN
        ALTER TABLE public.boletos
            ADD CONSTRAINT boletos_plano_de_contas_id_fkey
            FOREIGN KEY (plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.boletos.plano_de_contas_id IS
    'Plano de Contas (plano_de_contas) do boleto. Dimensão distinta de '
    'cost_center_id (cost_centers_v2) e do aposentado chart_of_accounts_id.';

RESET lock_timeout;

-- Garante que o PostgREST enxergue a coluna nova sem esperar o refresh.
NOTIFY pgrst, 'reload schema';
