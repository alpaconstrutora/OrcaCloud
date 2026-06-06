-- Fix completo: recria todas as políticas de task_spaces do zero.
-- A migration anterior (000004) pode ter sido ignorada pelo PostgREST cache.
-- Aqui limpamos tudo e recriamos, incluindo NOTIFY para flush do cache.

-- Remove todas as políticas existentes
DROP POLICY IF EXISTS task_spaces_select ON public.task_spaces;
DROP POLICY IF EXISTS task_spaces_insert ON public.task_spaces;
DROP POLICY IF EXISTS task_spaces_update ON public.task_spaces;
DROP POLICY IF EXISTS task_spaces_delete ON public.task_spaces;

-- SELECT: qualquer membro do espaço pode ler
CREATE POLICY task_spaces_select ON public.task_spaces
    FOR SELECT USING (public.is_task_space_member(id));

-- INSERT: usuário autenticado, sem is_org_member (FK já garante org válida)
CREATE POLICY task_spaces_insert ON public.task_spaces
    FOR INSERT TO authenticated
    WITH CHECK (owner_user_id = auth.uid());

-- UPDATE: apenas o owner
CREATE POLICY task_spaces_update ON public.task_spaces
    FOR UPDATE USING (owner_user_id = auth.uid())
    WITH CHECK (owner_user_id = auth.uid());

-- DELETE: apenas o owner
CREATE POLICY task_spaces_delete ON public.task_spaces
    FOR DELETE USING (owner_user_id = auth.uid());

-- Força PostgREST a recarregar o schema cache
NOTIFY pgrst, 'reload schema';
