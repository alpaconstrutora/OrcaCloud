-- MigraÃ§Ã£o para adicionar coluna de cliente aos imÃ³veis comerciais
ALTER TABLE commercial_properties 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

-- ComentÃ¡rio para documentaÃ§Ã£o
COMMENT ON COLUMN commercial_properties.client_id IS 'ID do cliente vinculado ao imÃ³vel (proprietÃ¡rio ou inquilino atual)';
