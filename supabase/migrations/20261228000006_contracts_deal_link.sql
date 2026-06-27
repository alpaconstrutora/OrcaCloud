-- migration: 20261228000006_contracts_deal_link.sql
-- Ponte Negociação (commercial_deals) → Contrato de Venda (contracts, domain='VENDAS').
-- O botão "Gerar Contrato de Venda" na tela da negociação cria um contrato vinculado.
-- deal_id torna a ponte idempotente: uma negociação gera no máximo um contrato.

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.commercial_deals(id) ON DELETE SET NULL;

-- Garante 1 contrato por negociação (índice único parcial — ignora NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_deal_id_unique
    ON public.contracts (deal_id)
    WHERE deal_id IS NOT NULL;

COMMENT ON COLUMN public.contracts.deal_id IS
    'Negociação de origem (commercial_deals) quando o contrato foi gerado a partir do módulo Vendas de Ativos. Domínio sempre VENDAS.';
