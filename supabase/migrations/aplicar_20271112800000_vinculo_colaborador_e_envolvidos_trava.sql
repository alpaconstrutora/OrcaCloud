-- aplicar_20271112800000_vinculo_colaborador_e_envolvidos_trava.sql
--
-- Fecha duas brechas de RLS que já existiam e que a regra do responsável
-- (aplicar_20271111995000) tornou relevantes:
--   1. Qualquer membro da org grava o vínculo colaborador → conta
--      (employees_org_access é ALL sem olhar papel). Quem o colaborador "é"
--      passa a ver e editar as tarefas de que ele é responsável e a ver as de
--      que ele é envolvido.
--   2. task_collaborators_all (ALL) não tinha WITH CHECK: pela regra, quem tem
--      o e-mail de um colaborador se poria como envolvido de QUALQUER tarefa.
--      Medido em 2026-11-12: não chegava a acontecer porque as duas policies
--      liam auth.users direto, que anon/authenticated não leem — TODO acesso
--      pela API a task_collaborators dava 42501 "permission denied for table
--      users", inclusive para o dono. Os "Envolvidos" do TaskForm nunca
--      carregavam nem gravavam (o erro é ignorado lá). Esta migration conserta
--      as duas coisas: os envolvidos voltam a funcionar, já com o CHECK.
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md (Ajustes — brechas).
-- Prova: scripts/teste-vinculo-colaborador-envolvidos.sql.
-- Decisão do usuário (2026-11-12): "Sim, fechar as duas".
--
-- 1. Gatilho trg_employees_vinculo_so_gestor (BEFORE INSERT OR UPDATE OF
--    user_id, email). Para quem chama pela API (auth.role() anon/authenticated),
--    exige owner/admin da org do colaborador (antiga e nova, se mudar) ou
--    superadmin para:
--      • gravar/trocar/limpar employees.user_id (no INSERT: user_id não nulo);
--      • num UPDATE, trocar o e-mail para o de um login (auth.users) que não
--        seja a própria conta já vinculada (user_id). As regras do responsável
--        e do envolvido também casam pelo e-mail — trocar o e-mail é vincular.
--    E-mail que não é login (a maior parte da mão de obra) continua livre;
--    INSERT com e-mail também (colaborador novo não tem tarefa; hire_candidate
--    e academy_portal_users_create criam assim). service_role, postgres e
--    gatilhos de manutenção (auth.role() NULL/service_role) não passam aqui.
--    SECURITY DEFINER porque lê auth.users; quem chama vem de auth.role() e
--    auth.uid() (claims), que o DEFINER não troca.
-- 2. task_collaborators: a policy ALL vira uma por comando. Gerir os envolvidos
--    = dono da tarefa OU membro do espaço dela (os mesmos que editam a tarefa
--    por tasks_update):
--      • INSERT: WITH CHECK gerir;  UPDATE: USING e WITH CHECK gerir;
--      • DELETE: gerir;
--      • SELECT: gerir OU envolvido da tarefa (is_task_collaborator, DEFINER —
--        a mesma regra de tasks_select_collaborator, sem ler auth.users na
--        policy). Quem gere precisa LER: o TaskForm "apaga tudo e reinsere";
--        lendo a lista vazia, sumiria com os envolvidos ao salvar.
-- REGRA #7, pergunta 2:
--   • _employees_vinculo_so_gestor(): função de gatilho; ninguém da API executa.
--   • pode_gerir_envolvidos_da_tarefa(task): SECURITY INVOKER — lê tasks com a
--     RLS de quem chama e só responde sobre auth.uid(); EXECUTE para anon,
--     authenticated e service_role (as policies são TO public).
--
-- Idempotente (CREATE OR REPLACE, DROP POLICY/TRIGGER IF EXISTS). Aplicar com
-- `npx supabase db query --linked -f` — nunca `db push`.

-- ── 1. employees: vínculo com a conta só por owner/admin ────────────────────
CREATE OR REPLACE FUNCTION public._employees_vinculo_so_gestor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_email_novo TEXT := lower(nullif(btrim(NEW.email), ''));
    v_muda_usuario BOOLEAN;
    v_email_de_login BOOLEAN := false;
BEGIN
    IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_muda_usuario := NEW.user_id IS NOT NULL;
    ELSE
        v_muda_usuario := NEW.user_id IS DISTINCT FROM OLD.user_id;
        IF v_email_novo IS NOT NULL
           AND v_email_novo IS DISTINCT FROM lower(nullif(btrim(OLD.email), '')) THEN
            SELECT EXISTS (SELECT 1 FROM auth.users u
                            WHERE lower(u.email) = v_email_novo
                              AND u.id IS DISTINCT FROM NEW.user_id)
              INTO v_email_de_login;
        END IF;
    END IF;

    IF NOT (v_muda_usuario OR v_email_de_login) OR public.is_superadmin() THEN
        RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.organization_members m
                WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'admin')
                  AND m.organization_id = NEW.org_id)
       AND (TG_OP = 'INSERT' OR OLD.org_id IS NOT DISTINCT FROM NEW.org_id
            OR EXISTS (SELECT 1 FROM public.organization_members m
                        WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'admin')
                          AND m.organization_id = OLD.org_id)) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'só owner ou admin da organização vincula o colaborador a um usuário do sistema '
               || '(campo Usuário do sistema, ou e-mail igual ao de um login)';
END;
$$;

REVOKE EXECUTE ON FUNCTION public._employees_vinculo_so_gestor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_employees_vinculo_so_gestor ON public.employees;
CREATE TRIGGER trg_employees_vinculo_so_gestor
    BEFORE INSERT OR UPDATE OF user_id, email ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public._employees_vinculo_so_gestor();

-- ── 2. task_collaborators: uma policy por comando ───────────────────────────
CREATE OR REPLACE FUNCTION public.pode_gerir_envolvidos_da_tarefa(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tasks t
         WHERE t.id = p_task_id
           AND (   t.user_id = auth.uid()
                OR (t.space_id IS NOT NULL AND public.is_task_space_member(t.space_id))))
$$;

REVOKE EXECUTE ON FUNCTION public.pode_gerir_envolvidos_da_tarefa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pode_gerir_envolvidos_da_tarefa(UUID) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS task_collaborators_all    ON public.task_collaborators;
DROP POLICY IF EXISTS task_collaborators_select ON public.task_collaborators;
DROP POLICY IF EXISTS task_collaborators_insert ON public.task_collaborators;
DROP POLICY IF EXISTS task_collaborators_update ON public.task_collaborators;
DROP POLICY IF EXISTS task_collaborators_delete ON public.task_collaborators;

CREATE POLICY task_collaborators_select ON public.task_collaborators
    FOR SELECT
    USING (public.pode_gerir_envolvidos_da_tarefa(task_id) OR public.is_task_collaborator(task_id));

CREATE POLICY task_collaborators_insert ON public.task_collaborators
    FOR INSERT
    WITH CHECK (public.pode_gerir_envolvidos_da_tarefa(task_id));

CREATE POLICY task_collaborators_update ON public.task_collaborators
    FOR UPDATE
    USING      (public.pode_gerir_envolvidos_da_tarefa(task_id))
    WITH CHECK (public.pode_gerir_envolvidos_da_tarefa(task_id));

CREATE POLICY task_collaborators_delete ON public.task_collaborators
    FOR DELETE
    USING (public.pode_gerir_envolvidos_da_tarefa(task_id));
