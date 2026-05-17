-- Add 'Em NegociaÃ§Ã£o' to purchase_orders status check
-- First, drop the existing constraint
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

-- Add the expanded constraint
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check 
  CHECK (status IN ('Rascunho', 'Enviado', 'Em NegociaÃ§Ã£o', 'Confirmado', 'SeparaÃ§Ã£o', 'Em TrÃ¢nsito', 'Entregue', 'Recebido', 'DivergÃªncia', 'Cancelado'));

-- Create purchase_order_negotiations table
CREATE TABLE IF NOT EXISTS purchase_order_negotiations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  sender_role text CHECK (sender_role IN ('buyer', 'supplier')) NOT NULL,
  delivery_date date,
  items jsonb NOT NULL, -- Stores array of PurchaseOrderItem at that point in time
  message text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'countered', 'rejected')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_negotiations_order_id ON purchase_order_negotiations(order_id);
