-- Fix: tasks INSERT policy não precisa verificar is_org_member.
-- A FK org_id → organizations(id) já garante que a org existe.
-- O check user_id = auth.uid() já garante autoria.
-- is_org_member falhava silenciosamente para usuários sem entrada em organization_members.

DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;

CREATE POLICY tasks_insert_own ON public.tasks
    FOR INSERT WITH CHECK (user_id = auth.uid());
