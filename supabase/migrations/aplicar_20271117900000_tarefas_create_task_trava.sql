-- ==========================================================================
-- Tarefas: só cria tarefa numa organização quem é membro dela, e só para alguém dela
-- Date: 2026-11-17
-- Plano: docs/planos/2026-11-17-rotinas-itens-de-fora.md (Tarefa 1)
-- Prova: scripts/teste-tarefas-create-task-trava.sql
-- Base:  20260530000000_create_tasks_module.sql (create_task) e a policy tasks_insert vigente
-- ==========================================================================
-- Pedido do usuário (17/11/2026): "Corrigir os itens que ficaram de fora" — item de segurança
-- achado na revisão do #530: qualquer usuário logado criava tarefa na agenda de qualquer pessoa
-- de qualquer organização.
--
-- O QUE MUDA
-- 1. `create_task` (SECURITY DEFINER, mesma assinatura → CREATE OR REPLACE) passa a conferir por
--    dentro (REGRA #7), quando há usuário na requisição:
--      · a organização é uma das dele (`minhas_orgs_membro()`; superadmin é owner de todas);
--      · a pessoa é ele mesmo, um membro da organização, ou o login de um colaborador da
--        organização — próprio ou disponibilizado para ela (`employee_org_shares`): a ordem de
--        execução escolhe o responsável entre os colaboradores visíveis, emprestados inclusive.
--    Sem usuário (`auth.uid()` nulo) é chamada interna — `generate_payment_tasks` no pg_cron,
--    service_role — e passa como antes. anon/PUBLIC não executam (REVOKE abaixo; já não tinham).
-- 2. `tasks_insert`: inserir direto também exige que a organização seja uma das do usuário. Antes
--    bastava `user_id = auth.uid()`: dava para gravar a tarefa com a org de outro cliente e um
--    colaborador dele como responsável, e ela aparecia para esse colaborador e os gestores de lá.
-- 3. Gatilho `trg_tasks_troca_de_org`: trocar o `org_id` de uma tarefa exige o mesmo. Fica
--    num gatilho, e só quando a org MUDA, porque no WITH CHECK do `tasks_update` quem saiu de uma
--    organização deixaria de conseguir concluir as próprias tarefas antigas de lá.
-- Dados em 17/11: as 66 tarefas têm `user_id` membro do `org_id` — nada existente fica de fora.
--
-- ROLLBACK
--   1. create_task: o corpo de 20260530000000 (INSERT … ON CONFLICT DO NOTHING RETURNING id,
--      sem conferência), mesma assinatura, SECURITY DEFINER, search_path public, pg_temp.
--   2. ALTER POLICY tasks_insert ON public.tasks
--        WITH CHECK ((user_id = auth.uid()) AND ((space_id IS NULL) OR is_task_space_member(space_id)));
--   3. DROP TRIGGER trg_tasks_troca_de_org ON public.tasks;
--      DROP FUNCTION public._tasks_org_so_das_minhas();
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.create_task(
    p_user_id       UUID,
    p_org_id        UUID,
    p_title         TEXT,
    p_due           TIMESTAMPTZ DEFAULT NULL,
    p_source_module TEXT        DEFAULT 'manual',
    p_source_ref    JSONB       DEFAULT NULL,
    p_priority      SMALLINT    DEFAULT 2,
    p_description   TEXT        DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_id  UUID;
BEGIN
    -- Sem usuário na requisição = chamada interna (pg_cron como postgres, service_role).
    -- Todo chamador da API tem usuário: anon e PUBLIC não executam esta função.
    IF v_uid IS NOT NULL THEN
        IF p_org_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM public.minhas_orgs_membro() o WHERE o = p_org_id) THEN
            RAISE EXCEPTION 'sem acesso à organização da tarefa: só quem é membro dela cria tarefa nela'
                USING ERRCODE = '42501';
        END IF;

        IF p_user_id IS DISTINCT FROM v_uid AND NOT (
               -- membro da organização (por user_id; linha antiga sem user_id, pelo e-mail — como is_org_member)
               EXISTS (SELECT 1 FROM public.organization_members m
                        WHERE m.organization_id = p_org_id
                          AND (m.user_id = p_user_id
                               OR (m.user_id IS NULL
                                   AND lower(m.email) = (SELECT lower(u.email) FROM auth.users u WHERE u.id = p_user_id))))
               -- login de um colaborador da organização, ou disponibilizado para ela
            OR EXISTS (SELECT 1 FROM public.employees e
                        WHERE e.user_id = p_user_id
                          AND (e.org_id = p_org_id
                               OR EXISTS (SELECT 1 FROM public.employee_org_shares s
                                           WHERE s.employee_id = e.id AND s.target_org_id = p_org_id)))
        ) THEN
            RAISE EXCEPTION 'a tarefa só vai para a agenda de quem é da organização dela (membro, ou colaborador da organização ou disponibilizado para ela)'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    INSERT INTO public.tasks (
        user_id, org_id, title, description, due_date,
        source_module, source_ref, priority
    ) VALUES (
        p_user_id, p_org_id, p_title, p_description, p_due,
        p_source_module, p_source_ref, p_priority
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_task(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB, SMALLINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB, SMALLINT, TEXT) TO authenticated, service_role;

-- Inserir direto: a organização da tarefa é uma das do usuário (forma de conjunto, #382).
ALTER POLICY tasks_insert ON public.tasks
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND (space_id IS NULL OR public.is_task_space_member(space_id))
        AND org_id IN (SELECT public.minhas_orgs_membro())
    );

-- Trocar a organização: só para uma das do usuário. Sem usuário (rotinas), não confere.
CREATE OR REPLACE FUNCTION public._tasks_org_so_das_minhas()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND NEW.org_id IS DISTINCT FROM OLD.org_id
       AND NOT EXISTS (SELECT 1 FROM public.minhas_orgs_membro() o WHERE o = NEW.org_id) THEN
        RAISE EXCEPTION 'a organização da tarefa só muda para uma organização de que você é membro'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public._tasks_org_so_das_minhas() FROM PUBLIC, anon, authenticated;

-- O nome decide a ordem: gatilhos BEFORE disparam em ordem alfabética, e este vem DEPOIS de
-- trg_tasks_responsavel_so_conteudo — o responsável que tenta mudar a org recebe a mensagem
-- dele ("o responsável só altera …"), mais útil que esta. (1º nome, trg_tasks_org_so_das_minhas,
-- disparava antes; ficou só no ensaio aplicado em 17/11 e é removido aqui.)
DROP TRIGGER IF EXISTS trg_tasks_org_so_das_minhas ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_troca_de_org ON public.tasks;
CREATE TRIGGER trg_tasks_troca_de_org
    BEFORE UPDATE OF org_id ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public._tasks_org_so_das_minhas();

COMMIT;
