-- ============================================================
-- Módulo Tarefas — Espaços e Pastas com membros por espaço
-- Hierarquia: Espaço → Pasta → Tarefa → Subtarefa
-- Compartilhamento opt-in por espaço (escolha do owner).
-- Tarefas sem espaço continuam sendo 100% pessoais (inbox).
-- Date: 2026-06-05
-- ============================================================

-- ─── 1. task_spaces ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_spaces (
    id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    owner_user_id uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name          text    NOT NULL,
    color         text    NOT NULL DEFAULT '#3b82f6',
    icon          text,                          -- nome do ícone lucide (opcional)
    position      smallint NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_spaces_org   ON public.task_spaces(org_id);
CREATE INDEX IF NOT EXISTS idx_task_spaces_owner ON public.task_spaces(owner_user_id);

-- ─── 2. task_space_members ────────────────────────────────────────────────────
-- Controla quem pode ver/editar as tarefas de um espaço.
-- O owner entra automaticamente (trigger abaixo).
CREATE TABLE IF NOT EXISTS public.task_space_members (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   uuid NOT NULL REFERENCES public.task_spaces(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_space_members_space ON public.task_space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_task_space_members_user  ON public.task_space_members(user_id);

-- Trigger: ao criar espaço, insere o owner como membro role='owner' automaticamente
CREATE OR REPLACE FUNCTION public.seed_space_owner_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
    INSERT INTO public.task_space_members (space_id, user_id, role)
    VALUES (NEW.id, NEW.owner_user_id, 'owner')
    ON CONFLICT (space_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_space_owner ON public.task_spaces;
CREATE TRIGGER trg_seed_space_owner
    AFTER INSERT ON public.task_spaces
    FOR EACH ROW EXECUTE FUNCTION public.seed_space_owner_member();

-- updated_at automático em task_spaces
CREATE OR REPLACE FUNCTION public.task_spaces_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_task_spaces_touch ON public.task_spaces;
CREATE TRIGGER trg_task_spaces_touch
    BEFORE UPDATE ON public.task_spaces
    FOR EACH ROW EXECUTE FUNCTION public.task_spaces_touch_updated_at();

-- ─── 3. task_folders ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_folders (
    id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   uuid    NOT NULL REFERENCES public.task_spaces(id) ON DELETE CASCADE,
    name       text    NOT NULL,
    color      text,
    position   smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_folders_space ON public.task_folders(space_id);

-- ─── 4. Colunas space_id / folder_id em tasks ────────────────────────────────
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS space_id  uuid REFERENCES public.task_spaces(id)  ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.task_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_space_id  ON public.tasks(space_id);
CREATE INDEX IF NOT EXISTS idx_tasks_folder_id ON public.tasks(folder_id);

-- ─── 5. Helper SECURITY DEFINER ───────────────────────────────────────────────
-- Análogo a is_org_member(); evita recursão nas políticas de RLS.
CREATE OR REPLACE FUNCTION public.is_task_space_member(p_space_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.task_space_members
        WHERE space_id = p_space_id
          AND user_id  = auth.uid()
    );
END;
$$;

-- ─── 6. RLS — task_spaces ─────────────────────────────────────────────────────
ALTER TABLE public.task_spaces ENABLE ROW LEVEL SECURITY;

-- Qualquer membro do espaço pode ler
DROP POLICY IF EXISTS task_spaces_select ON public.task_spaces;
CREATE POLICY task_spaces_select ON public.task_spaces
    FOR SELECT USING (public.is_task_space_member(id));

-- Qualquer membro da org pode criar espaços próprios
DROP POLICY IF EXISTS task_spaces_insert ON public.task_spaces;
CREATE POLICY task_spaces_insert ON public.task_spaces
    FOR INSERT WITH CHECK (
        owner_user_id = auth.uid()
        AND public.is_org_member(org_id)
    );

-- Só o owner renomeia / recolore / reposiciona
DROP POLICY IF EXISTS task_spaces_update ON public.task_spaces;
CREATE POLICY task_spaces_update ON public.task_spaces
    FOR UPDATE USING (owner_user_id = auth.uid())
    WITH CHECK (owner_user_id = auth.uid());

-- Só o owner exclui
DROP POLICY IF EXISTS task_spaces_delete ON public.task_spaces;
CREATE POLICY task_spaces_delete ON public.task_spaces
    FOR DELETE USING (owner_user_id = auth.uid());

-- ─── 7. RLS — task_space_members ─────────────────────────────────────────────
ALTER TABLE public.task_space_members ENABLE ROW LEVEL SECURITY;

-- Membros do espaço veem a lista de membros
DROP POLICY IF EXISTS task_space_members_select ON public.task_space_members;
CREATE POLICY task_space_members_select ON public.task_space_members
    FOR SELECT USING (public.is_task_space_member(space_id));

-- Só o owner adiciona / remove membros
DROP POLICY IF EXISTS task_space_members_insert ON public.task_space_members;
CREATE POLICY task_space_members_insert ON public.task_space_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.task_space_members m
            WHERE m.space_id = task_space_members.space_id
              AND m.user_id  = auth.uid()
              AND m.role     = 'owner'
        )
    );

DROP POLICY IF EXISTS task_space_members_delete ON public.task_space_members;
CREATE POLICY task_space_members_delete ON public.task_space_members
    FOR DELETE USING (
        -- owner pode remover qualquer membro (exceto a si mesmo via trigger abaixo)
        EXISTS (
            SELECT 1 FROM public.task_space_members m
            WHERE m.space_id = task_space_members.space_id
              AND m.user_id  = auth.uid()
              AND m.role     = 'owner'
        )
    );

-- Garante que o owner não se auto-remove (evita espaço órfão)
CREATE OR REPLACE FUNCTION public.prevent_owner_self_remove()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.role = 'owner' AND OLD.user_id = auth.uid() THEN
        RAISE EXCEPTION 'O owner não pode remover a si mesmo do espaço.';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_owner_self_remove ON public.task_space_members;
CREATE TRIGGER trg_prevent_owner_self_remove
    BEFORE DELETE ON public.task_space_members
    FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_self_remove();

-- ─── 8. RLS — task_folders ────────────────────────────────────────────────────
ALTER TABLE public.task_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_folders_select ON public.task_folders;
CREATE POLICY task_folders_select ON public.task_folders
    FOR SELECT USING (public.is_task_space_member(space_id));

DROP POLICY IF EXISTS task_folders_insert ON public.task_folders;
CREATE POLICY task_folders_insert ON public.task_folders
    FOR INSERT WITH CHECK (public.is_task_space_member(space_id));

DROP POLICY IF EXISTS task_folders_update ON public.task_folders;
CREATE POLICY task_folders_update ON public.task_folders
    FOR UPDATE USING (public.is_task_space_member(space_id))
    WITH CHECK (public.is_task_space_member(space_id));

DROP POLICY IF EXISTS task_folders_delete ON public.task_folders;
CREATE POLICY task_folders_delete ON public.task_folders
    FOR DELETE USING (
        -- só owner do espaço exclui pasta
        EXISTS (
            SELECT 1 FROM public.task_space_members m
            WHERE m.space_id = task_folders.space_id
              AND m.user_id  = auth.uid()
              AND m.role     = 'owner'
        )
    );

-- ─── 9. RLS — tasks (reescrita completa) ─────────────────────────────────────
-- Substitui as 4 políticas existentes por versões que incluem visibilidade
-- via espaço compartilhado, mantendo o comportamento pessoal intacto.

DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
    FOR SELECT USING (
        -- tarefa minha (inbox pessoal)
        user_id = auth.uid()
        -- OU tarefa em espaço do qual sou membro
        OR (space_id IS NOT NULL AND public.is_task_space_member(space_id))
    );

DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND (
            space_id IS NULL
            OR public.is_task_space_member(space_id)
        )
    );

DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
CREATE POLICY tasks_update ON public.tasks
    FOR UPDATE USING (
        user_id = auth.uid()
        OR (space_id IS NOT NULL AND public.is_task_space_member(space_id))
    )
    WITH CHECK (
        user_id = auth.uid()
        OR (space_id IS NOT NULL AND public.is_task_space_member(space_id))
    );

DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks
    FOR DELETE USING (
        -- minha tarefa — sempre posso excluir
        user_id = auth.uid()
        -- OU sou owner do espaço (pode moderar)
        OR (
            space_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.task_space_members m
                WHERE m.space_id = tasks.space_id
                  AND m.user_id  = auth.uid()
                  AND m.role     = 'owner'
            )
        )
    );

-- ─── Comentários ──────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.task_spaces         IS 'Espaços de trabalho (taxonomia de tarefas). Owner controla membros. Tarefas sem espaço = inbox pessoal.';
COMMENT ON TABLE  public.task_space_members  IS 'Membros de um espaço. Somente membros veem e editam as tarefas do espaço.';
COMMENT ON TABLE  public.task_folders        IS 'Pastas dentro de um espaço. Organização opcional; herda membros do espaço.';
COMMENT ON FUNCTION public.is_task_space_member IS 'True se auth.uid() é membro do espaço. SECURITY DEFINER para uso seguro em RLS.';
