-- Fix: SELECT policy de task_spaces bloqueia o INSERT.select() do Supabase JS.
--
-- Causa raiz: is_task_space_member() é STABLE (cacheável). Quando PostgREST
-- avalia o SELECT para "return=representation" na mesma query do INSERT,
-- o trigger seed_space_owner_member ainda não materializou do ponto de vista
-- do cache da função → is_task_space_member retorna false → 403.
--
-- Solução: owner sempre pode ver o próprio espaço diretamente (sem passar
-- pela função), evitando a dependência no trigger para o SELECT imediato.

DROP POLICY IF EXISTS task_spaces_select ON public.task_spaces;
CREATE POLICY task_spaces_select ON public.task_spaces
    FOR SELECT USING (
        owner_user_id = auth.uid()
        OR public.is_task_space_member(id)
    );

NOTIFY pgrst, 'reload schema';
