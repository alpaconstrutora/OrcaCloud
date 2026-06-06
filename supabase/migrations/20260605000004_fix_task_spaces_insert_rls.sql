-- Fix: task_spaces INSERT policy não precisa verificar is_org_member.
-- A FK org_id → organizations(id) já garante que a org existe.
-- owner_user_id = auth.uid() já garante autoria.
-- is_org_member falhava para usuários sem linha em organization_members
-- (mesmo problema já corrigido em tasks via fix_tasks_rls.sql).

DROP POLICY IF EXISTS task_spaces_insert ON public.task_spaces;
CREATE POLICY task_spaces_insert ON public.task_spaces
    FOR INSERT WITH CHECK (owner_user_id = auth.uid());
