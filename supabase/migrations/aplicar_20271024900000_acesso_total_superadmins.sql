-- Acesso total para as contas de `public.superadmins` (regra do usuário, 24/10/2026):
-- "o login desenvolvedor@alpaconstrutora.com.br deve ter acesso a absolutamente
-- tudo do app".
--
-- O RLS libera dado por MEMBERSHIP (organization_members, task_space_members);
-- `is_superadmin()` só aparece em ~50 policies. Então superadmin, sozinho, não vê
-- tudo — precisa ser `owner` em toda organização e em todo espaço de tarefas.
-- Antes desta migration o desenvolvedor@ não estava em 2 das 6 orgs, era só
-- `member` na SPE Garden Cambuhy e não estava em nenhum espaço de tarefas.
--
-- Os gatilhos são CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED de propósito:
-- `create_organization_v2` insere a org e DEPOIS o criador em organization_members
-- sem ON CONFLICT. Um AFTER INSERT comum inseriria o superadmin antes — e quando o
-- criador é o próprio superadmin, a inserção do criador estouraria a UNIQUE
-- (organization_id, email). Adiado para o fim da transação, o criador já entrou e
-- o ON CONFLICT DO NOTHING só pula.
--
-- No front, o atalho de menu/rota é `lib/acessoTotal.ts` (EMAILS_ACESSO_TOTAL) —
-- conta nova precisa entrar nos dois lugares.

BEGIN;

INSERT INTO public.superadmins (email)
VALUES ('desenvolvedor@alpaconstrutora.com.br')
ON CONFLICT (email) DO NOTHING;

-- ── Toda organização nova recebe os superadmins como owner ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_org_inclui_superadmins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.organization_members (organization_id, email, role, permissions)
    SELECT NEW.id, s.email, 'owner', '{}'::jsonb
      FROM public.superadmins s
    ON CONFLICT (organization_id, email) DO NOTHING;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_org_inclui_superadmins() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_inclui_superadmins ON public.organizations;
CREATE CONSTRAINT TRIGGER trg_org_inclui_superadmins
    AFTER INSERT ON public.organizations
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.fn_org_inclui_superadmins();

-- ── Todo espaço de tarefas novo recebe os superadmins como owner ───────────────
-- task_spaces_select é (owner_user_id = auth.uid() OR is_task_space_member(id)):
-- espaço é privado de quem cria, nem admin da org enxerga sem ser membro.
CREATE OR REPLACE FUNCTION public.fn_task_space_inclui_superadmins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.task_space_members (space_id, user_id, role)
    SELECT NEW.id, u.id, 'owner'
      FROM public.superadmins s
      JOIN auth.users u ON lower(u.email) = lower(s.email)
    ON CONFLICT (space_id, user_id) DO NOTHING;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_task_space_inclui_superadmins() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_space_inclui_superadmins ON public.task_spaces;
CREATE CONSTRAINT TRIGGER trg_task_space_inclui_superadmins
    AFTER INSERT ON public.task_spaces
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.fn_task_space_inclui_superadmins();

-- ── Backfill do desenvolvedor@ (só ele: o altair.rosa@ já tem as orgs e é
-- admin na Alpa por escolha — não mexer no papel de outra conta) ──────────────
INSERT INTO public.organization_members (organization_id, email, role, permissions)
SELECT o.id, 'desenvolvedor@alpaconstrutora.com.br', 'owner', '{}'::jsonb
  FROM public.organizations o
ON CONFLICT (organization_id, email) DO UPDATE SET role = 'owner'
 WHERE public.organization_members.role IS DISTINCT FROM 'owner';

INSERT INTO public.task_space_members (space_id, user_id, role)
SELECT t.id, u.id, 'owner'
  FROM public.task_spaces t
  CROSS JOIN auth.users u
 WHERE lower(u.email) = 'desenvolvedor@alpaconstrutora.com.br'
ON CONFLICT (space_id, user_id) DO UPDATE SET role = 'owner'
 WHERE public.task_space_members.role IS DISTINCT FROM 'owner';

COMMIT;
