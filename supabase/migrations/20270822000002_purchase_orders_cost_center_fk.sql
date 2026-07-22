-- Conecta Suprimentos ao novo Centro de Custo (cost_centers_v2) por FK de
-- verdade. Hoje `purchase_orders.cost_center` é texto livre (nome copiado do
-- item selecionado, ver services/orderService.ts) — divergente do padrão que
-- Comercial/Financeiro já usam (cost_center_id). Coluna nova e nullable é
-- metadata-only (barata); a coluna de texto legada é mantida para não quebrar
-- a exibição de pedidos antigos (FinancialOrderDetails.tsx, financialService.ts).
ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_cost_center_id ON public.purchase_orders(cost_center_id);

COMMENT ON COLUMN public.purchase_orders.cost_center_id IS
    'FK para cost_centers_v2 — substitui gradualmente a coluna de texto livre cost_center (mantida para pedidos antigos).';
