-- Fix RLS for invoices table
-- We need to allow UPDATE and DELETE for the frontend to work correctly

-- 1. Drop existing restrictive policies if any (optional but safer)
DROP POLICY IF EXISTS "Permitir update publico" ON public.invoices;
DROP POLICY IF EXISTS "Permitir delete publico" ON public.invoices;
DROP POLICY IF EXISTS "Allow all on invoices" ON public.invoices;

-- 2. Create the missing policies
-- Using the same pattern as purchase_orders to allow testing/dev flow
CREATE POLICY "Allow all on invoices" ON public.invoices
    FOR ALL TO public USING (true) WITH CHECK (true);

-- Also ensure the storage objects are fully accessible if needed
-- (They already seem okay from 20260215_create_invoices_table.sql but let's be sure)
DROP POLICY IF EXISTS "Acesso total storage invoices" ON storage.objects;
CREATE POLICY "Acesso total storage invoices" ON storage.objects
    FOR ALL TO public USING (bucket_id = 'invoices') WITH CHECK (bucket_id = 'invoices');
