-- Adiciona campo de colaboradores (múltiplos) na OE
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS collaborator_ids UUID[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_work_orders_collaborators
  ON work_orders USING GIN (collaborator_ids);
