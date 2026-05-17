-- Migration to add Foreign Key relationship between purchase_orders and suppliers
-- This enables implicit joins in PostgREST (Supabase)

-- First, ensure all supplier_ids that exist in purchase_orders also exist in suppliers
-- If they don't, we can set them to NULL to avoid constraint violation
UPDATE public.purchase_orders
SET supplier_id = NULL
WHERE supplier_id IS NOT NULL
AND supplier_id NOT IN (SELECT id FROM public.suppliers);

-- Now add the foreign key constraint
ALTER TABLE public.purchase_orders
DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;

ALTER TABLE public.purchase_orders
ADD CONSTRAINT purchase_orders_supplier_id_fkey
FOREIGN KEY (supplier_id)
REFERENCES public.suppliers(id)
ON DELETE SET NULL;

-- Also verify project_id fk while we are at it
ALTER TABLE public.purchase_orders
DROP CONSTRAINT IF EXISTS purchase_orders_project_id_fkey;

ALTER TABLE public.purchase_orders
ADD CONSTRAINT purchase_orders_project_id_fkey
FOREIGN KEY (project_id)
REFERENCES public.projects(id)
ON DELETE CASCADE;
