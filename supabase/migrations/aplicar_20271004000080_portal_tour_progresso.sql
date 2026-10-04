-- Tour dos portais — "já viu" por pessoa no banco + acompanhamento (tour v2, F7)
--
-- Pedido do usuário em 04/10/2026: "Tour guiado (F3) funcionou mais ficou bem
-- básico. faça plano para contemplar o restante" — entre as escolhas dele:
-- "'Já viu' por pessoa + acompanhamento (marca por e-mail no banco, não repete
-- em outro aparelho; no app, quem concluiu/pulou o tour)". Depois: "implementar
-- f7 e f8". Plano: docs/planos/2026-10-04-tour-guiado-v2-portais.md (F7).
--
-- Desenho
--   portal_tour_progress guarda o ESTADO por identidade × tour (upsert, não
--   log): limita o crescimento sob chamadas anônimas e responde direto "quem
--   concluiu/pulou". tour_id = 'geral' | <aba> | 'checklist:<chave>' (F8).
--   Identidade:
--     'link'  → o id da EMPRESA do link (partner_workspaces.id /
--               suppliers.id / broker_profiles.id). Não o token: nenhum
--               segredo de acesso vai para a tabela, e gerar link novo não faz
--               o tour voltar. No link não há pessoa — todos que usam o mesmo
--               link contam como um.
--     'email' → lower(e-mail do JWT), no acesso por e-mail e senha.
--   Escrita SÓ pela RPC portal_tour_mark (a tabela não tem policy de escrita).
--   Leitura do externo: as cascas *_portal_help_get e portal_help_get_mine
--   passam a devolver `seen` (o que AQUELA identidade já viu) — sem chamada
--   extra. Leitura do gestor: portal_tour_stats (is_org_manager).
--
-- Funções recriadas a partir do BANCO em 04/10/2026 (md5 partner
-- 44f8e6535dcb04dfc1edfe92c34f1a93, mine de43e7b6363dd4d5322c5b9c0ea17b33 —
-- iguais a aplicar_20271003000050). portal_help_org_json não muda.
--
-- REGRA #7
--   Pergunta 1 (policy): uma policy, SELECT TO authenticated com
--   is_org_manager(organization_id) — corretor ativo é is_org_member e não
--   pode ver o acompanhamento de outros.
--   Pergunta 2 (quem executa): núcleos (portal_link_identidade,
--   portal_help_orgs_of, portal_tour_seen_json) com REVOKE de PUBLIC, anon e
--   authenticated; cascas e portal_tour_mark com GRANT anon, authenticated
--   (validam o token ou o e-mail do JWT); get_mine e portal_tour_stats só
--   authenticated.

-- ─── PARTE 1 — tabela ──────────────────────────────────────────────────────────
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.portal_tour_progress (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    portal          TEXT NOT NULL CHECK (portal IN ('parceiro', 'fornecedor', 'corretor')),
    identity_kind   TEXT NOT NULL CHECK (identity_kind IN ('link', 'email')),
    identity        TEXT NOT NULL,
    tour_id         TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('concluido', 'pulado', 'visto')),
    step_reached    INTEGER,
    times           INTEGER NOT NULL DEFAULT 1,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT portal_tour_progress_uq UNIQUE (organization_id, portal, identity, tour_id)
);

COMMENT ON TABLE public.portal_tour_progress IS
    'Tour/checklist dos portais externos: estado por identidade (link = empresa do link; email = pessoa) × tour. Escrita só por portal_tour_mark; leitura do gestor por portal_tour_stats.';

CREATE INDEX IF NOT EXISTS portal_tour_progress_org_idx
    ON public.portal_tour_progress (organization_id, portal, updated_at DESC);

ALTER TABLE public.portal_tour_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_tour_progress_manager_read ON public.portal_tour_progress;
CREATE POLICY portal_tour_progress_manager_read ON public.portal_tour_progress
    FOR SELECT TO authenticated
    USING (public.is_org_manager(organization_id));

REVOKE ALL ON TABLE public.portal_tour_progress FROM anon;

-- ─── PARTE 2 — núcleos (sem grant) ─────────────────────────────────────────────
SET lock_timeout = '3s';

-- Link válido → organização e empresa do link.
CREATE OR REPLACE FUNCTION public.portal_link_identidade(p_portal TEXT, p_token TEXT, OUT o_org UUID, OUT o_ident TEXT)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF p_portal = 'parceiro' THEN
        SELECT t.org_id, t.workspace_id::text INTO o_org, o_ident
          FROM public.partner_portal_tokens t
         WHERE t.token = p_token AND t.is_active = TRUE AND t.expires_at > NOW()
         LIMIT 1;
    ELSIF p_portal = 'fornecedor' THEN
        SELECT t.org_id, t.supplier_id::text INTO o_org, o_ident
          FROM public.supplier_portal_tokens t
         WHERE t.token = p_token AND t.is_active = TRUE AND t.expires_at > NOW()
         LIMIT 1;
    ELSIF p_portal = 'corretor' THEN
        SELECT t.org_id, t.broker_id::text INTO o_org, o_ident
          FROM public.broker_portal_tokens t
         WHERE t.token = p_token AND t.is_active = TRUE AND t.expires_at > NOW()
         LIMIT 1;
    END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_link_identidade(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Organizações a que um e-mail dá acesso num portal (+ membro interno, para a
-- prévia). Era o SELECT de dentro de portal_help_get_mine; agora é usado também
-- por portal_tour_mark.
CREATE OR REPLACE FUNCTION public.portal_help_orgs_of(p_email TEXT, p_portal TEXT)
 RETURNS UUID[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT coalesce(array_agg(DISTINCT org), '{}') FROM (
        SELECT pw.organization_id AS org
          FROM public.partner_users pu
          JOIN public.partner_workspaces pw ON pw.id = pu.partner_workspace_id
         WHERE p_portal = 'parceiro' AND lower(pu.email) = p_email
           AND pu.is_active = TRUE AND pw.is_active = TRUE AND pw.organization_id IS NOT NULL
        UNION
        SELECT t.org_id
          FROM public.partner_users pu
          JOIN public.partner_portal_tokens t ON t.workspace_id = pu.partner_workspace_id
         WHERE p_portal = 'parceiro' AND lower(pu.email) = p_email AND pu.is_active = TRUE
        UNION
        SELECT bp.organization_id
          FROM public.broker_profiles bp
         WHERE p_portal = 'corretor' AND lower(bp.email) = p_email AND bp.is_active = TRUE
           AND bp.organization_id IS NOT NULL
        UNION
        SELECT s.organization_id
          FROM public.suppliers s
         WHERE p_portal = 'fornecedor' AND lower(s.email) = p_email AND s.organization_id IS NOT NULL
        UNION
        SELECT sh.target_org_id
          FROM public.supplier_org_shares sh
          JOIN public.suppliers s ON s.id = sh.supplier_id
         WHERE p_portal = 'fornecedor' AND lower(s.email) = p_email
        UNION
        SELECT om.organization_id
          FROM public.organization_members om
         WHERE lower(om.email) = p_email
    ) x WHERE org IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.portal_help_orgs_of(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- O que uma identidade já viu (tour e checklist) numa organização/portal.
CREATE OR REPLACE FUNCTION public.portal_tour_seen_json(p_org UUID, p_portal TEXT, p_identity TEXT)
 RETURNS JSONB
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT coalesce(jsonb_agg(jsonb_build_object('tour_id', p.tour_id, 'status', p.status) ORDER BY p.tour_id), '[]'::jsonb)
      FROM public.portal_tour_progress p
     WHERE p.organization_id = p_org AND p.portal = p_portal AND p.identity = p_identity;
$function$;
REVOKE ALL ON FUNCTION public.portal_tour_seen_json(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ─── PARTE 3 — cascas de leitura devolvem `seen` ───────────────────────────────
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.partner_portal_help_get(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID;
    v_ident TEXT;
BEGIN
    SELECT o_org, o_ident INTO v_org, v_ident FROM public.portal_link_identidade('parceiro', p_token);
    IF v_org IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE)
        || public.portal_help_org_json(v_org, 'parceiro')
        || jsonb_build_object('seen', public.portal_tour_seen_json(v_org, 'parceiro', v_ident));
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_portal_help_get(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_help_get(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_help_get(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID;
    v_ident TEXT;
BEGIN
    SELECT o_org, o_ident INTO v_org, v_ident FROM public.portal_link_identidade('fornecedor', p_token);
    IF v_org IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE)
        || public.portal_help_org_json(v_org, 'fornecedor')
        || jsonb_build_object('seen', public.portal_tour_seen_json(v_org, 'fornecedor', v_ident));
END;
$function$;
REVOKE ALL ON FUNCTION public.supplier_portal_help_get(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_portal_help_get(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.broker_portal_help_get(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID;
    v_ident TEXT;
BEGIN
    SELECT o_org, o_ident INTO v_org, v_ident FROM public.portal_link_identidade('corretor', p_token);
    IF v_org IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE)
        || public.portal_help_org_json(v_org, 'corretor')
        || jsonb_build_object('seen', public.portal_tour_seen_json(v_org, 'corretor', v_ident));
END;
$function$;
REVOKE ALL ON FUNCTION public.broker_portal_help_get(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broker_portal_help_get(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_help_get_mine(p_portal TEXT, p_org UUID DEFAULT NULL)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_email TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_orgs  UUID[];
    v_org   UUID;
BEGIN
    IF v_email = '' OR p_portal NOT IN ('parceiro', 'fornecedor', 'corretor') THEN
        RETURN jsonb_build_object('orgs', '[]'::jsonb, 'help', NULL);
    END IF;

    v_orgs := public.portal_help_orgs_of(v_email, p_portal);

    IF p_org IS NOT NULL AND p_org = ANY (v_orgs) THEN
        v_org := p_org;
    ELSIF array_length(v_orgs, 1) = 1 THEN
        v_org := v_orgs[1];
    END IF;

    RETURN jsonb_build_object(
        'orgs', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.name)
            FROM public.organizations o WHERE o.id = ANY (v_orgs)
        ), '[]'::jsonb),
        'help', CASE WHEN v_org IS NULL THEN NULL ELSE
            public.portal_help_org_json(v_org, p_portal)
            || jsonb_build_object('seen', public.portal_tour_seen_json(v_org, p_portal, v_email)) END
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_help_get_mine(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_help_get_mine(TEXT, UUID) TO authenticated;

-- ─── PARTE 4 — escrita do externo e leitura do gestor ──────────────────────────
SET lock_timeout = '3s';

-- Marca "visto/concluído/pulado". Com token: identidade = empresa do link.
-- Sem token: e-mail do JWT, e só numa organização a que esse e-mail dá acesso.
CREATE OR REPLACE FUNCTION public.portal_tour_mark(
    p_portal TEXT, p_token TEXT, p_org UUID, p_tour_id TEXT, p_status TEXT, p_step INTEGER DEFAULT NULL)
 RETURNS VOID
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org   UUID;
    v_ident TEXT;
    v_kind  TEXT;
BEGIN
    IF p_portal IS NULL OR p_portal NOT IN ('parceiro', 'fornecedor', 'corretor')
       OR p_status IS NULL OR p_status NOT IN ('concluido', 'pulado', 'visto')
       OR p_tour_id IS NULL OR p_tour_id !~ '^[a-z0-9:._-]{1,96}$' THEN
        RAISE EXCEPTION 'portal_tour_mark: parâmetros inválidos' USING ERRCODE = '22023';
    END IF;

    IF coalesce(p_token, '') <> '' THEN
        SELECT o_org, o_ident INTO v_org, v_ident FROM public.portal_link_identidade(p_portal, p_token);
        IF v_org IS NULL THEN
            RAISE EXCEPTION 'portal_tour_mark: link inválido ou expirado' USING ERRCODE = '42501';
        END IF;
        v_kind := 'link';
    ELSE
        v_ident := lower(coalesce(auth.jwt() ->> 'email', ''));
        IF v_ident = '' OR p_org IS NULL OR NOT (p_org = ANY (public.portal_help_orgs_of(v_ident, p_portal))) THEN
            RAISE EXCEPTION 'portal_tour_mark: sem acesso a esta organização' USING ERRCODE = '42501';
        END IF;
        v_org := p_org;
        v_kind := 'email';
    END IF;

    INSERT INTO public.portal_tour_progress AS p (organization_id, portal, identity_kind, identity, tour_id, status, step_reached)
    VALUES (v_org, p_portal, v_kind, v_ident, p_tour_id, p_status, p_step)
    ON CONFLICT (organization_id, portal, identity, tour_id) DO UPDATE
       SET status = EXCLUDED.status,
           step_reached = EXCLUDED.step_reached,
           times = p.times + 1,
           updated_at = NOW();
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_tour_mark(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_tour_mark(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER) TO anon, authenticated;

-- Acompanhamento para o gestor: quem viu, concluiu ou pulou cada tour.
-- `#variable_conflict use_column`: RETURNS TABLE cria variáveis com os nomes
-- das colunas (portal, status…) — sem isso o plpgsql acusa ambiguidade.
CREATE OR REPLACE FUNCTION public.portal_tour_stats(p_org UUID, p_portal TEXT DEFAULT NULL)
 RETURNS TABLE (
    portal TEXT, acesso TEXT, quem TEXT, contato TEXT, tour_id TEXT, status TEXT,
    step_reached INTEGER, times INTEGER, first_seen_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
    IF p_org IS NULL OR NOT public.is_org_manager(p_org) THEN
        RAISE EXCEPTION 'portal_tour_stats: sem permissão nesta organização' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT
        g.portal,
        g.identity_kind,
        CASE WHEN g.identity_kind = 'link' THEN
            CASE g.portal
                WHEN 'parceiro' THEN (SELECT s.name FROM public.partner_workspaces w JOIN public.suppliers s ON s.id = w.supplier_id WHERE w.id::text = g.identity)
                WHEN 'fornecedor' THEN (SELECT s.name FROM public.suppliers s WHERE s.id::text = g.identity)
                WHEN 'corretor' THEN (SELECT b.name FROM public.broker_profiles b WHERE b.id::text = g.identity)
            END
        ELSE coalesce(
            CASE g.portal
                WHEN 'parceiro' THEN (SELECT pu.name FROM public.partner_users pu WHERE lower(pu.email) = g.identity ORDER BY pu.is_active DESC LIMIT 1)
                WHEN 'fornecedor' THEN (SELECT s.name FROM public.suppliers s WHERE lower(s.email) = g.identity LIMIT 1)
                WHEN 'corretor' THEN (SELECT b.name FROM public.broker_profiles b WHERE lower(b.email) = g.identity LIMIT 1)
            END, g.identity)
        END,
        CASE WHEN g.identity_kind = 'email' THEN g.identity END,
        g.tour_id, g.status, g.step_reached, g.times, g.first_seen_at, g.updated_at
    FROM public.portal_tour_progress g
    WHERE g.organization_id = p_org AND (p_portal IS NULL OR g.portal = p_portal)
    ORDER BY g.updated_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_tour_stats(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_tour_stats(UUID, TEXT) TO authenticated;
