-- MigraÃ§Ã£o para adicionar campos tÃ©cnicos aos imÃ³veis comerciais (CORRIGIDA)
ALTER TABLE commercial_properties 
ADD COLUMN IF NOT EXISTS block TEXT,
ADD COLUMN IF NOT EXISTS floor INTEGER,
ADD COLUMN IF NOT EXISTS private_area NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS common_area NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS total_area NUMERIC(10,2);

-- Atualizar total_area com o valor da Ã¡rea existente onde total_area Ã© nulo
UPDATE commercial_properties SET total_area = area WHERE total_area IS NULL;

-- ComentÃ¡rios para documentaÃ§Ã£o
COMMENT ON COLUMN commercial_properties.block IS 'Bloco ou torre do imÃ³vel';
COMMENT ON COLUMN commercial_properties.floor IS 'Andar ou pavimento';
COMMENT ON COLUMN commercial_properties.private_area IS 'Ãrea privativa da unidade';
COMMENT ON COLUMN commercial_properties.common_area IS 'Ãrea de uso comum proporcional';
COMMENT ON COLUMN commercial_properties.total_area IS 'Ãrea total do imÃ³vel (Privativa + Comum)';
