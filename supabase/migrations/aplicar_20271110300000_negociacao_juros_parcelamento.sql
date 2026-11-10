-- Parcelamento com juros (Price/SAC) em Gerenciar Negociação › Financeiro.
-- Idempotente: pode ser reexecutada sem erro.
-- Aplicar com `npx supabase db query --linked -f <arquivo>` (nunca `db push`).

ALTER TABLE public.commercial_deals
  ADD COLUMN IF NOT EXISTS interest_rate_monthly numeric(7,4),
  ADD COLUMN IF NOT EXISTS amortization_system text CHECK (amortization_system IN ('PRICE','SAC')),
  ADD COLUMN IF NOT EXISTS price_before_interest numeric(14,2);

ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS interest_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS interest_category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.commercial_deals.interest_rate_monthly IS
  'Taxa de juros mensal (%) do parcelamento da venda. Gravada pelo DealModal ao "Montar plano" (Gerenciar Negociação › Financeiro); lida por ele ao reabrir a negociação. Nula = parcelamento sem juros.';
COMMENT ON COLUMN public.commercial_deals.amortization_system IS
  'Sistema de amortização do parcelamento com juros: PRICE (parcela fixa) ou SAC (amortização constante). Gravada pelo DealModal ao "Montar plano" (Gerenciar Negociação › Financeiro); lida por ele ao reabrir a negociação.';
COMMENT ON COLUMN public.commercial_deals.price_before_interest IS
  'Saldo financiado ANTES dos juros (base do cálculo Price/SAC). Gravada pelo DealModal ao "Montar plano" (Gerenciar Negociação › Financeiro); lida por ele ao reabrir a negociação para refazer o plano.';
COMMENT ON COLUMN public.internal_transactions.interest_amount IS
  'Parte de juros da parcela (o restante é principal). Gravada por contractService.syncParceladoScheduleToFinance ao lançar o cronograma em Contas a Receber; lida por v_internal_transactions_dre (DRE/Balancete) para separar a receita financeira.';
COMMENT ON COLUMN public.internal_transactions.interest_category_id IS
  'Categoria financeira (financial_categories) em que os juros da parcela são classificados. Gravada por contractService.syncParceladoScheduleToFinance; lida por v_internal_transactions_dre (DRE/Balancete).';
