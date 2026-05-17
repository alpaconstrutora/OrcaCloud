-- Adicionar coluna budget_id para permitir vÃ­nculo explÃ­cito com um orÃ§amento
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS budget_id uuid REFERENCES projects(id);

-- ComentÃ¡rio para documentaÃ§Ã£o
COMMENT ON COLUMN contracts.budget_id IS 'ID do orÃ§amento vinculado, caso seja diferente da obra principal ou para vÃ­nculo especÃ­fico de versÃ£o.';
