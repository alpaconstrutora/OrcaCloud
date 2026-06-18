-- ============================================================
-- Corrige referência circular entre RLS de tasks e
-- task_collaborators que causava erro ao carregar tarefas.
--
-- Problema: tasks_select_collaborator consultava task_collaborators;
-- task_collaborators_select consultava tasks → loop infinito.
--
-- Solução: função SECURITY DEFINER quebra o ciclo ao acessar
-- task_collaborators sem aplicar RLS da tabela.
-- ============================================================

-- Função que verifica se o usuário logado é colaborador da tarefa,
-- sem aplicar RLS em task_collaborators (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.is_task_collaborator(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_collaborators tc
    JOIN public.employees emp ON emp.id = tc.employee_id
    WHERE tc.task_id = p_task_id
      AND emp.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
$$;

-- Recria a policy usando a função (sem consulta direta a task_collaborators)
DROP POLICY IF EXISTS tasks_select_collaborator ON public.tasks;
CREATE POLICY tasks_select_collaborator ON public.tasks
    FOR SELECT USING (public.is_task_collaborator(id));

-- Simplifica policy de task_collaborators: agora não precisa mais
-- consultar tasks para evitar recursão; verifica diretamente
-- se o usuário é dono da tarefa (sem acionar RLS de tasks)
-- ou se é o próprio colaborador.
DROP POLICY IF EXISTS "task_collaborators_select" ON public.task_collaborators;
CREATE POLICY "task_collaborators_select" ON public.task_collaborators
    FOR SELECT USING (
        -- dono da tarefa (acesso direto sem RLS em tasks)
        EXISTS (
            SELECT 1 FROM public.tasks t
            WHERE t.id = task_id
              AND t.user_id = auth.uid()
        )
        OR
        -- o próprio colaborador
        EXISTS (
            SELECT 1 FROM public.employees emp
            WHERE emp.id = employee_id
              AND emp.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
    );

-- Atualiza também a policy ALL para o mesmo critério
DROP POLICY IF EXISTS "task_collaborators_all" ON public.task_collaborators;
CREATE POLICY "task_collaborators_all" ON public.task_collaborators
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            WHERE t.id = task_id
              AND t.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.employees emp
            WHERE emp.id = employee_id
              AND emp.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
    );
