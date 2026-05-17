-- Adicionar colunas faltantes para Inteligência de Precifição em commercial_properties
ALTER TABLE commercial_properties ADD COLUMN IF NOT EXISTS position_type TEXT CHECK (position_type IN ('FRONT', 'LATERAL', 'BACK'));
ALTER TABLE commercial_properties ADD COLUMN IF NOT EXISTS view_type TEXT CHECK (view_type IN ('NONE', 'PARTIAL', 'FULL'));
ALTER TABLE commercial_properties ADD COLUMN IF NOT EXISTS sun_orientation TEXT CHECK (sun_orientation IN ('NORTH', 'SOUTH', 'EAST', 'WEST'));

-- Comentários para documentação
COMMENT ON COLUMN commercial_properties.position_type IS 'Tipo de posição no pavimento (Frente, Lateral, Fundos)';
COMMENT ON COLUMN commercial_properties.view_type IS 'Qualidade da vista da unidade';
COMMENT ON COLUMN commercial_properties.sun_orientation IS 'Orientação solar predominante';
