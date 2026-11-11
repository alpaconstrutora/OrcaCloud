-- aplicar_20271111950000_link_celular_tabela_e_gemeos.sql
--
-- Link do celular — Minhas Tarefas (e depois o Diário) por token, sem login.
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md (Design §1 e §2,
-- Parte 1 / Task 1). Prova: scripts/teste-link-celular-tarefas.sql (seção A).
--
-- O que entra aqui:
--   1. user_mobile_links — um link por pessoa por organização. Guarda só o
--      SHA-256 do token; RLS ligada e NENHUMA policy (ninguém lê direto, nem
--      authenticated). Não copiar broker_portal_tokens: lá a policy anon deixa
--      a chave pública listar todos os tokens ativos.
--   2. _mobile_link_hash / _mobile_link_resolver — internos. O resolver é o
--      único portão das RPCs celular_* (próxima migration): token → (user, org),
--      reconfere se a pessoa AINDA é membro da org e grava last_used_at.
--      Inválido, vencido, revogado ou ex-membro: a MESMA recusa, que não diz se
--      o token existe.
--   3. Gêmeos dos helpers da RLS que recebem o usuário ("uma regra, dois
--      chamadores"): is_org_member_de, is_task_space_member_de,
--      is_task_collaborator_de. is_task_space_member / is_task_collaborator
--      passam a chamar o gêmeo com auth.uid(). is_org_member NÃO muda (caminho
--      quente de toda a RLS e lê auth.jwt()); a equivalência é provada no teste.
--   4. mobile_link_generate / _revoke / _status — gestão pelo app logado:
--      cada um para si; owner/admin da org GERA só para quem tem papel
--      `member` (admin/owner geram o próprio) e revoga/consulta o de qualquer
--      membro.
--   5. Gatilho em organization_members: apagar a linha do membro revoga o link
--      dele naquela org (reinserir a pessoa não ressuscita o link antigo).
--
-- REGRA #7: toda função leva REVOKE de PUBLIC e anon; internos e gêmeos também
-- de authenticated. As SECURITY DEFINER conferem a autorização por dentro.
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.

-- ── 1. Tabela ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_mobile_links (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
    revoked_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_mobile_links_token_hash_key UNIQUE (token_hash),
    CONSTRAINT user_mobile_links_org_user_key   UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS user_mobile_links_user_id_idx ON public.user_mobile_links (user_id);

COMMENT ON TABLE public.user_mobile_links IS
    'Link do celular (/celular?token=): um por pessoa por organização. token_hash = SHA-256 hex; '
    'o token em claro nunca é gravado. RLS sem policy: acesso só pelas funções mobile_link_* e _mobile_link_resolver.';

ALTER TABLE public.user_mobile_links ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito. E sem privilégio de tabela para os papéis da API:
-- a RLS já barraria, isto é a segunda tranca.
REVOKE ALL ON TABLE public.user_mobile_links FROM PUBLIC, anon, authenticated;

-- ── 2. Hash (interno) ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mobile_link_hash(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE STRICT
SET search_path = public, pg_temp
AS $$
    SELECT encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

-- ── 3. Gêmeos de autorização ────────────────────────────────────────────────
-- is_org_member_de: o mesmo corpo de is_org_member, com auth.uid() → p_user e o
-- e-mail de auth.jwt() → auth.users.email de p_user.
CREATE OR REPLACE FUNCTION public.is_org_member_de(p_user UUID, p_org UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_email TEXT;
BEGIN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user;

    -- Preferência: user_id quando preenchido na tabela.
    -- Fallback: e-mail para linhas legadas onde user_id é NULL.
    IF EXISTS (
        SELECT 1
          FROM public.organization_members om
         WHERE om.organization_id = p_org
           AND (
                 (om.user_id IS NOT NULL AND om.user_id = p_user)
              OR (om.user_id IS NULL AND lower(om.email) = lower(v_email))
           )
    ) THEN
        RETURN TRUE;
    END IF;

    -- Corretores (broker_profiles) não têm user_id — identificados por e-mail.
    IF EXISTS (
        SELECT 1
          FROM public.broker_profiles b
         WHERE b.organization_id = p_org
           AND lower(b.email) = lower(v_email)
           AND b.is_active = true
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_task_space_member_de(p_user UUID, p_space_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.task_space_members tsm
         WHERE tsm.space_id = p_space_id
           AND tsm.user_id  = p_user
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_task_collaborator_de(p_user UUID, p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.task_collaborators tc
          JOIN public.employees emp ON emp.id = tc.employee_id
         WHERE tc.task_id = p_task_id
           AND emp.email = (SELECT u.email FROM auth.users u WHERE u.id = p_user)
    )
$$;

-- Os originais (usados pelas policies de tasks, task_spaces, task_folders e
-- task_space_members) passam a chamar o gêmeo com auth.uid(). Mesmos nomes de
-- parâmetro e mesmo retorno; continuam SECURITY DEFINER (o gêmeo não tem GRANT
-- para os papéis da API).
CREATE OR REPLACE FUNCTION public.is_task_space_member(p_space_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.is_task_space_member_de(auth.uid(), p_space_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_task_collaborator(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.is_task_collaborator_de(auth.uid(), p_task_id);
END;
$$;

-- ── 4. Resolver (interno) ───────────────────────────────────────────────────
-- Token → (user_id, org_id) do dono do link. Reconfere is_org_member_de: quem
-- saiu da org perde o link na chamada seguinte. Grava last_used_at.
CREATE OR REPLACE FUNCTION public._mobile_link_resolver(p_token TEXT, OUT user_id UUID, OUT org_id UUID)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id   UUID;
    v_user UUID;
    v_org  UUID;
BEGIN
    SELECT l.id, l.user_id, l.org_id
      INTO v_id, v_user, v_org
      FROM public.user_mobile_links l
     WHERE l.token_hash = public._mobile_link_hash(p_token)
       AND l.revoked_at IS NULL
       AND l.expires_at > now();

    -- Mesma mensagem para inexistente, vencido, revogado e ex-membro: a recusa
    -- não diz se o token existe.
    IF v_id IS NULL OR public.is_org_member_de(v_user, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'link inválido ou vencido' USING ERRCODE = '42501';
    END IF;

    UPDATE public.user_mobile_links l SET last_used_at = now() WHERE l.id = v_id;

    user_id := v_user;
    org_id  := v_org;
END;
$$;

-- ── 5. Gestão do link (app logado) ──────────────────────────────────────────
-- Pode: o próprio usuário para si; owner/admin da org (is_org_manager) para
-- qualquer membro em revogar/consultar. GERAR para outra pessoa só se ela tiver
-- papel `member` nessa org: o link de um admin/owner (inclusive superadmin) só
-- ele mesmo gera (decisão do usuário, revisão final de 2026-11-11). Em qualquer
-- caso a pessoa do link tem de ser membro da org. Recusa: a mesma, 42501.

CREATE OR REPLACE FUNCTION public.mobile_link_generate(p_user_id UUID, p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ator  UUID := auth.uid();
    v_token TEXT;
BEGIN
    IF v_ator IS NULL OR p_user_id IS NULL OR p_org_id IS NULL
       OR (public.is_org_manager(p_org_id)
               AND (p_user_id = v_ator
                    OR EXISTS (SELECT 1 FROM public.organization_members om
                                WHERE om.organization_id = p_org_id
                                  AND om.user_id = p_user_id
                                  AND om.role = 'member'))
           OR (p_user_id = v_ator AND public.is_org_member(p_org_id))) IS NOT TRUE
       OR public.is_org_member_de(p_user_id, p_org_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'sem permissão para gerenciar o link do celular desta pessoa' USING ERRCODE = '42501';
    END IF;

    -- 32 bytes aleatórios em base64url sem '=' (43 caracteres). O translate
    -- também apaga a quebra de linha que o encode base64 pode inserir.
    v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/\n', '-_'), '=');

    INSERT INTO public.user_mobile_links AS l
           (org_id, user_id, token_hash, expires_at, revoked_at, last_used_at, created_by)
    VALUES (p_org_id, p_user_id, public._mobile_link_hash(v_token), now() + interval '90 days', NULL, NULL, v_ator)
    ON CONFLICT ON CONSTRAINT user_mobile_links_org_user_key DO UPDATE
       SET token_hash   = EXCLUDED.token_hash,
           expires_at   = EXCLUDED.expires_at,
           revoked_at   = NULL,
           last_used_at = NULL,   -- "último uso" é do link vigente, não do anterior
           created_by   = EXCLUDED.created_by;

    RETURN v_token;   -- em claro, só desta vez
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_link_revoke(p_user_id UUID, p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ator UUID := auth.uid();
BEGIN
    IF v_ator IS NULL OR p_user_id IS NULL OR p_org_id IS NULL
       OR (public.is_org_manager(p_org_id)
           OR (p_user_id = v_ator AND public.is_org_member(p_org_id))) IS NOT TRUE
       OR public.is_org_member_de(p_user_id, p_org_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'sem permissão para gerenciar o link do celular desta pessoa' USING ERRCODE = '42501';
    END IF;

    UPDATE public.user_mobile_links l
       SET revoked_at = now()
     WHERE l.org_id = p_org_id
       AND l.user_id = p_user_id
       AND l.revoked_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_link_status(p_user_id UUID, p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ator UUID := auth.uid();
    v      JSONB;
BEGIN
    IF v_ator IS NULL OR p_user_id IS NULL OR p_org_id IS NULL
       OR (public.is_org_manager(p_org_id)
           OR (p_user_id = v_ator AND public.is_org_member(p_org_id))) IS NOT TRUE
       OR public.is_org_member_de(p_user_id, p_org_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'sem permissão para gerenciar o link do celular desta pessoa' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
               'existe',       true,
               'expires_at',   l.expires_at,
               'last_used_at', l.last_used_at,
               'revogado',     l.revoked_at IS NOT NULL)
      INTO v
      FROM public.user_mobile_links l
     WHERE l.org_id = p_org_id
       AND l.user_id = p_user_id;

    RETURN coalesce(v, jsonb_build_object(
        'existe', false, 'expires_at', NULL, 'last_used_at', NULL, 'revogado', false));
END;
$$;

-- ── 6. Sair da org revoga o link ────────────────────────────────────────────
-- O resolver já recusa ex-membro, mas a linha continuava "viva": se a pessoa
-- voltasse à org (novo convite), o link antigo — que pode ter ficado num
-- celular de terceiro — voltaria a valer. Apagar a linha do membro revoga o
-- link dele naquela org; para voltar a usar, gera-se um novo.
-- Conferido antes de criar: nenhum fluxo normal apaga e reinsere membros
-- existentes (updateOrganization apaga só quem saiu da lista e faz upsert em
-- organization_id,email; invite-member só faz upsert).
-- Linha legada sem user_id: não há link (o link é por conta), nada a fazer.
CREATE OR REPLACE FUNCTION public._mobile_link_revoga_ao_sair_da_org()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.user_id IS NOT NULL THEN
        UPDATE public.user_mobile_links l
           SET revoked_at = now()
         WHERE l.org_id = OLD.organization_id
           AND l.user_id = OLD.user_id
           AND l.revoked_at IS NULL;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_members_revoga_link_celular ON public.organization_members;
CREATE TRIGGER trg_org_members_revoga_link_celular
    AFTER DELETE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public._mobile_link_revoga_ao_sair_da_org();

-- ── Privilégios (REGRA #7) ──────────────────────────────────────────────────
-- Internos e gêmeos: ninguém da API executa; só as funções do link (e, depois,
-- os núcleos e as celular_*), que rodam como dono.
REVOKE EXECUTE ON FUNCTION public._mobile_link_hash(TEXT)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._mobile_link_resolver(TEXT)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_member_de(UUID, UUID)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_task_space_member_de(UUID, UUID)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_task_collaborator_de(UUID, UUID)     FROM PUBLIC, anon, authenticated;
-- Função de gatilho: dispara sozinha; ninguém da API chama.
REVOKE EXECUTE ON FUNCTION public._mobile_link_revoga_ao_sair_da_org()   FROM PUBLIC, anon, authenticated;

-- Originais: as policies de tarefas são TO public e são avaliadas como o papel
-- de quem consulta, então anon, authenticated e service_role continuam com
-- EXECUTE (os mesmos de antes). Sai só o PUBLIC implícito.
REVOKE EXECUTE ON FUNCTION public.is_task_space_member(UUID)              FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_task_space_member(UUID)              TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_task_collaborator(UUID)              FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_task_collaborator(UUID)              TO anon, authenticated, service_role;

-- Gestão: só usuário logado; a autorização está dentro.
REVOKE EXECUTE ON FUNCTION public.mobile_link_generate(UUID, UUID)        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mobile_link_generate(UUID, UUID)        TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mobile_link_revoke(UUID, UUID)          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mobile_link_revoke(UUID, UUID)          TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mobile_link_status(UUID, UUID)          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mobile_link_status(UUID, UUID)          TO authenticated;
