-- 1. Ensure columns exist
ALTER TABLE public.rubrics ADD COLUMN IF NOT EXISTS is_clt_mandatory BOOLEAN DEFAULT false;

-- 2. Drop any potentially conflicting policies
DROP POLICY IF EXISTS "rubrics_read_all" ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_manage_all" ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_insert_all" ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_update_all" ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_delete_all" ON public.rubrics;

-- 3. Create comprehensive policies
CREATE POLICY "rubrics_read_all" ON public.rubrics
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "rubrics_insert_all" ON public.rubrics
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "rubrics_update_all" ON public.rubrics
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "rubrics_delete_all" ON public.rubrics
    FOR DELETE TO authenticated USING (true);

-- 4. Ensure RLS is enabled
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
