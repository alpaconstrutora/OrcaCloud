-- Motor operacional por tipo de obra
-- tipo_obra como coluna dedicada (indexável, filtrável) em vez de enterrada no JSONB settings

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS tipo_obra TEXT,
  ADD COLUMN IF NOT EXISTS regime_obra TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_tipo_obra_check'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_tipo_obra_check
      CHECK (tipo_obra IS NULL OR tipo_obra IN (
        'residencial_multifamiliar', 'casa', 'loja', 'sala', 'galpao', 'reforma', 'outro'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_regime_obra_check'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_regime_obra_check
      CHECK (regime_obra IS NULL OR regime_obra IN (
        'empreitada_global', 'administracao', 'preco_unitario', 'turn_key'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_tipo_obra ON projects(tipo_obra) WHERE tipo_obra IS NOT NULL;
