-- Add RLS policies for custom_items (write was blocked with 403)
ALTER TABLE public.custom_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_custom_items"  ON public.custom_items;
DROP POLICY IF EXISTS "authenticated_write_custom_items" ON public.custom_items;
DROP POLICY IF EXISTS "anon_all_custom_items"            ON public.custom_items;

CREATE POLICY "authenticated_read_custom_items"
    ON public.custom_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_write_custom_items"
    ON public.custom_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Dev: anon policy (remover antes de produção)
CREATE POLICY "anon_all_custom_items"
    ON public.custom_items FOR ALL TO anon USING (true) WITH CHECK (true);
