-- Adicionar o status 'EXCHANGED' Ã  restriÃ§Ã£o de status de imÃ³veis
DO $$ 
BEGIN 
    ALTER TABLE commercial_properties DROP CONSTRAINT IF EXISTS commercial_properties_status_check;
    ALTER TABLE commercial_properties ADD CONSTRAINT commercial_properties_status_check 
        CHECK (status IN ('AVAILABLE', 'SOLD', 'RENTED', 'RESERVED', 'MAINTENANCE', 'EXCHANGED'));
EXCEPTION 
    WHEN others THEN NULL; 
END $$;
