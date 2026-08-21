-- ============================================================
-- Suprimentos (Pedidos de Compra): FK de verdade para Plano de Contas
-- ============================================================
-- Mesmo padrão de 20270822000002_purchase_orders_cost_center_fk.sql (Centro de
-- Custo) e 20270908000000_contracts_client_number_and_plano_contas.sql
-- (Contratos): `purchase_orders.chart_of_accounts` hoje é texto livre, sem
-- ligação com o cadastro canônico `plano_de_contas` (ver memória
-- centro-custo-vs-plano-de-contas-canonico — NÃO confundir com
-- financial_categories). Coluna nova e nullable é metadata-only (barata); a
-- coluna de texto legada é mantida para não quebrar a exibição de pedidos
-- antigos (FinancialOrderDetails.tsx, financialService.ts).
--
-- Aplicar MANUALMENTE no Supabase (nunca `supabase db push`). Idempotente.
SET lock_timeout = '5s';

ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS plano_de_contas_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'purchase_orders_plano_de_contas_id_fkey'
          AND conrelid = 'public.purchase_orders'::regclass
    ) THEN
        ALTER TABLE public.purchase_orders
            ADD CONSTRAINT purchase_orders_plano_de_contas_id_fkey
            FOREIGN KEY (plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_plano_de_contas_id ON public.purchase_orders(plano_de_contas_id);

COMMENT ON COLUMN public.purchase_orders.plano_de_contas_id IS
    'FK para plano_de_contas — substitui gradualmente a coluna de texto livre chart_of_accounts. NÃO confundir com cost_center_id (cost_centers_v2).';

RESET lock_timeout;

-- Garante que o PostgREST enxergue a coluna nova sem esperar o refresh automático.
NOTIFY pgrst, 'reload schema';
