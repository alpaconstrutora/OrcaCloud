-- Migração: Adicionar campos de corretor e data de vencimento de pagamento na tabela commercial_deals
-- Criado em: 2026-03-22

ALTER TABLE public.commercial_deals
  ADD COLUMN IF NOT EXISTS payment_due_date date,
  ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES public.broker_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS broker_name text,
  ADD COLUMN IF NOT EXISTS broker_commission_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS broker_commission_value numeric(15,2);

-- Índice para facilitar consultas por corretor
CREATE INDEX IF NOT EXISTS commercial_deals_broker_id_idx ON public.commercial_deals(broker_id);

COMMENT ON COLUMN public.commercial_deals.payment_due_date IS 'Data de vencimento do pagamento da negociação';
COMMENT ON COLUMN public.commercial_deals.broker_id IS 'Referência ao perfil do corretor responsável pela negociação';
COMMENT ON COLUMN public.commercial_deals.broker_name IS 'Nome do corretor (cache para relatórios)';
COMMENT ON COLUMN public.commercial_deals.broker_commission_pct IS 'Percentual de comissão do corretor (ex: 5.00 = 5%)';
COMMENT ON COLUMN public.commercial_deals.broker_commission_value IS 'Valor calculado da comissão do corretor';
