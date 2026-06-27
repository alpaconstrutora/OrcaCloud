-- migration: 20261228000003_contracts_domain_discriminator.sql
-- Separa os três domínios de contrato que compartilham a tabela `contracts`:
--   SUPRIMENTOS → contratos com fornecedores (supply chain, INCOMING)
--   SERVICOS    → contratos de prestação de serviços a clientes (OUTGOING)
--   LOCACAO     → contratos de locação a clientes (OUTGOING)
--   VENDAS      → contratos de compra e venda de ativos/imóveis (OUTGOING)
-- Regra de negócio: esses domínios NUNCA devem se misturar nas listagens.

-- ── Coluna discriminadora ────────────────────────────────────────────────────
ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'SUPRIMENTOS';

-- Backfill por origem atual (antes do CHECK, para não falhar em dados legados):
--   OUTGOING        → única origem hoje é Contratos de Serviço → SERVICOS
--   INCOMING / NULL → Suprimentos → SUPRIMENTOS
UPDATE public.contracts
    SET domain = 'SERVICOS'
    WHERE direction = 'OUTGOING';

UPDATE public.contracts
    SET domain = 'SUPRIMENTOS'
    WHERE direction = 'INCOMING' OR direction IS NULL;

-- ── Constraint de domínios válidos ───────────────────────────────────────────
ALTER TABLE public.contracts
    DROP CONSTRAINT IF EXISTS contracts_domain_check;
ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_domain_check
    CHECK (domain IN ('SUPRIMENTOS', 'SERVICOS', 'LOCACAO', 'VENDAS'));

COMMENT ON COLUMN public.contracts.domain IS
    'Domínio de negócio do contrato: SUPRIMENTOS (fornecedores), SERVICOS, LOCACAO ou VENDAS (clientes). Nunca misturar nas listagens.';

-- Índice para filtragem por domínio nas listagens de cada módulo
CREATE INDEX IF NOT EXISTS idx_contracts_org_domain
    ON public.contracts (organization_id, domain);
