-- Add status_updated_at column to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN status_updated_at TIMESTAMPTZ;

-- Initialize status_updated_at with created_at for existing rows
UPDATE purchase_orders SET status_updated_at = created_at WHERE status_updated_at IS NULL;
