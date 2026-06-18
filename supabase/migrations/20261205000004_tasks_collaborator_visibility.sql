-- ============================================================
-- Permite que colaboradores (envolvidos) vejam as tarefas
-- em que foram adicionados via task_collaborators.
-- Versão corrigida: a policy é criada via função SECURITY DEFINER
-- na migration 20261205000005 para evitar referência circular de RLS.
-- Esta migration apenas cria o placeholder; a 000005 substitui.
-- ============================================================

-- (vazio — a policy é gerenciada pela migration 000005)
