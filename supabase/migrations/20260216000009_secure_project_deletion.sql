-- Migration: Secure Project Deletion
-- Date: 2026-02-16
-- Description: Removes ON DELETE CASCADE from purchase_orders.project_id to prevent accidental deletion of historic data.

-- 1. Identify the existing constraint name (usually purchase_orders_project_id_fkey)
-- 2. Drop it and recreate as NO ACTION or RESTRICT

DO $$
BEGIN
    -- Check if the constraint exists before trying to drop it
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'purchase_orders_project_id_fkey' 
        AND table_name = 'purchase_orders'
    ) THEN
        ALTER TABLE public.purchase_orders DROP CONSTRAINT purchase_orders_project_id_fkey;
    END IF;
END $$;

-- Add the new constraint without CASCADE
ALTER TABLE public.purchase_orders 
ADD CONSTRAINT purchase_orders_project_id_fkey 
FOREIGN KEY (project_id) 
REFERENCES projects(id) 
ON DELETE RESTRICT;

-- Note: ON DELETE RESTRICT will prevent the project from being deleted 
-- if there are any purchase orders referencing it.
