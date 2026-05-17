-- MigraÃ§Ã£o para adicionar contract_number e atualizar tipos de negociaÃ§Ã£o
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS contract_number TEXT;

-- Atualizar constraint de Tipo para incluir 'SERVICE'
ALTER TABLE commercial_deals DROP CONSTRAINT IF EXISTS commercial_deals_type_check;
ALTER TABLE commercial_deals ADD CONSTRAINT commercial_deals_type_check 
    CHECK (type IN ('SALE', 'RENTAL', 'SERVICE'));
a
COMMENT ON COLUMN commercial_deals.contract_number IS 'NÃºmero identificador do contrato (venda, locaÃ§Ã£o ou serviÃ§o)';
