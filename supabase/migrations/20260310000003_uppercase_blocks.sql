-- MigraÃ§Ã£o para padronizar nomes de blocos em maiÃºsculas
UPDATE commercial_properties 
SET block = UPPER(block) 
WHERE block IS NOT NULL;

-- Adicionar um check constraint para garantir que novos registros tambÃ©m sejam maiÃºsculos (opcional, mas recomendado)
-- ALTER TABLE commercial_properties ADD CONSTRAINT block_uppercase CHECK (block = UPPER(block));
