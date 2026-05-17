-- Fix RLS for rubrics table
-- Permite que usuários autenticados gerenciem as rubricas

ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rubrics_read_all" ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_manage_all" ON public.rubrics;

CREATE POLICY "rubrics_read_all" ON public.rubrics
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "rubrics_manage_all" ON public.rubrics
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Garantir que as rubricas básicas existam e estejam marcadas como automáticas/fiscais se necessário
-- (O seed já foi feito na migração anterior, mas garantimos o status de 'active')
UPDATE public.rubrics SET active = true WHERE active IS NULL;
