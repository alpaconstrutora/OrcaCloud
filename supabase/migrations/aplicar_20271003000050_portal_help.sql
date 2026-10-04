-- Ajuda dos portais externos (Parceiro, Fornecedor, Corretor) — F1
--
-- Pedido do usuário em 03/10/2026: "o que eu quero é criar um sistema de ajuda
-- ao parceiro no uso do portal". Decisões dele: central de ajuda + tour guiado +
-- perguntas frequentes + contato com a construtora; conteúdo EDITÁVEL pela
-- construtora por organização; vale para Parceiro, Fornecedor e Corretor.
-- Plano: docs/planos/2026-10-03-ajuda-portais-externos.md
--
-- Desenho: o conteúdo PADRÃO vive no código (utils/portalHelpDefaults.ts), com
-- uma chave estável por item. Esta tabela guarda só o que a construtora mudou:
--   default_key preenchido = sobrescrita de um item padrão (título/corpo/ocultar);
--   default_key NULL       = item próprio da organização.
-- O portal junta padrão + linhas desta tabela (mergePortalHelp). Assim um texto
-- padrão melhorado numa atualização chega a toda construtora que não o
-- sobrescreveu, sem seed nem drift; "Restaurar padrão" é apagar a linha.
--
-- Quem lê: só por RPC (SECURITY DEFINER), nunca pela tabela:
--   <portal>_portal_help_get(p_token)  — acesso pelo link (anon), org do token;
--   portal_help_get_mine(p_portal, p_org) — externo logado por e-mail, org(s)
--     resolvida(s) pela identidade (partner_users / suppliers / broker_profiles)
--     e também membro interno (prévia);
--   portal_help_org_json(p_org, p_portal) — núcleo sem chamador externo.
--
-- UNIQUE (organization_id, portal, default_key) é constraint COMPLETA, não índice
-- parcial: o upsert do PostgREST (on_conflict) não infere índice parcial
-- (memória: upsert × índice parcial = 42P10). NULL em default_key não colide.
--
-- Sem FK para organizations (precedente 20270825000010: DDL com FK em tabela
-- quente travou). lock_timeout curto por parte.
--
-- REGRA #7
--   Pergunta 1 (policy): a única policy exige is_org_manager(organization_id) —
--   owner/admin. NÃO usa is_org_member, que devolve TRUE para corretor ativo da
--   org (20260706000002) e deixaria o corretor editar a própria ajuda.
--   Pergunta 2 (quem executa): núcleo com REVOKE de PUBLIC, anon e authenticated;
--   cascas de token com GRANT a anon e authenticated (é a porta do link);
--   get_mine só authenticated; função de gatilho com REVOKE literal.

-- ─── PARTE 1 — tabela ──────────────────────────────────────────────────────────
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.portal_help_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    portal          TEXT NOT NULL CHECK (portal IN ('parceiro', 'fornecedor', 'corretor')),
    kind            TEXT NOT NULL CHECK (kind IN ('artigo', 'faq', 'tour')),
    default_key     TEXT,
    section         TEXT,
    title           TEXT NOT NULL,
    body_html       TEXT NOT NULL DEFAULT '',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_published    BOOLEAN NOT NULL DEFAULT TRUE,
    default_hash    TEXT,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT portal_help_items_override_uq UNIQUE (organization_id, portal, default_key)
);

COMMENT ON TABLE public.portal_help_items IS
    'Ajuda dos portais externos, por organização. default_key preenchido = sobrescrita de um item padrão do código (utils/portalHelpDefaults.ts); NULL = item próprio. Lida pelos portais só por RPC.';

CREATE INDEX IF NOT EXISTS portal_help_items_org_portal_idx
    ON public.portal_help_items (organization_id, portal);

CREATE OR REPLACE FUNCTION public.portal_help_items_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.portal_help_items_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS portal_help_items_touch ON public.portal_help_items;
CREATE TRIGGER portal_help_items_touch
    BEFORE UPDATE ON public.portal_help_items
    FOR EACH ROW EXECUTE FUNCTION public.portal_help_items_touch();

ALTER TABLE public.portal_help_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_help_items_manager ON public.portal_help_items;
CREATE POLICY portal_help_items_manager ON public.portal_help_items
    FOR ALL TO authenticated
    USING (public.is_org_manager(organization_id))
    WITH CHECK (public.is_org_manager(organization_id));

REVOKE ALL ON TABLE public.portal_help_items FROM anon;

-- ─── PARTE 2 — funções ─────────────────────────────────────────────────────────
SET lock_timeout = '3s';

-- Núcleo: tudo o que a organização tem para um portal (inclusive sobrescritas
-- despublicadas, porque "despublicar" uma sobrescrita significa ocultar o
-- padrão — quem aplica a regra é mergePortalHelp, no front).
CREATE OR REPLACE FUNCTION public.portal_help_org_json(p_org UUID, p_portal TEXT)
 RETURNS JSONB
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT jsonb_build_object(
        'org_id', p_org,
        'contact', (
            SELECT jsonb_build_object('name', o.name, 'email', o.email, 'phone', o.phone, 'website', o.website)
            FROM public.organizations o WHERE o.id = p_org
        ),
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', h.id, 'kind', h.kind, 'default_key', h.default_key, 'section', h.section,
                'title', h.title, 'body_html', h.body_html, 'sort_order', h.sort_order,
                'is_published', h.is_published, 'updated_at', h.updated_at
            ) ORDER BY h.sort_order, h.created_at)
            FROM public.portal_help_items h
            WHERE h.organization_id = p_org AND h.portal = p_portal
        ), '[]'::jsonb)
    );
$function$;
REVOKE ALL ON FUNCTION public.portal_help_org_json(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Casca do link — Parceiro
CREATE OR REPLACE FUNCTION public.partner_portal_help_get(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID;
BEGIN
    SELECT t.org_id INTO v_org
    FROM public.partner_portal_tokens t
    WHERE t.token = p_token AND t.is_active = TRUE AND t.expires_at > NOW();
    IF v_org IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || public.portal_help_org_json(v_org, 'parceiro');
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_portal_help_get(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_help_get(TEXT) TO anon, authenticated;

-- Casca do link — Fornecedor
CREATE OR REPLACE FUNCTION public.supplier_portal_help_get(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID;
BEGIN
    SELECT t.org_id INTO v_org
    FROM public.supplier_portal_tokens t
    WHERE t.token = p_token AND t.is_active = TRUE AND t.expires_at > NOW();
    IF v_org IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || public.portal_help_org_json(v_org, 'fornecedor');
END;
$function$;
REVOKE ALL ON FUNCTION public.supplier_portal_help_get(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_portal_help_get(TEXT) TO anon, authenticated;

-- Casca do link — Corretor
CREATE OR REPLACE FUNCTION public.broker_portal_help_get(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID;
BEGIN
    SELECT t.org_id INTO v_org
    FROM public.broker_portal_tokens t
    WHERE t.token = p_token AND t.is_active = TRUE AND t.expires_at > NOW();
    IF v_org IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;
    RETURN jsonb_build_object('valid', TRUE) || public.portal_help_org_json(v_org, 'corretor');
END;
$function$;
REVOKE ALL ON FUNCTION public.broker_portal_help_get(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broker_portal_help_get(TEXT) TO anon, authenticated;

-- Externo logado por e-mail (e membro interno, para prévia).
-- Devolve as organizações a que o e-mail do JWT dá acesso naquele portal e, quando
-- há uma só (ou p_org foi pedida e está no conjunto), a ajuda dela. Fornecedor
-- compartilhado com várias construtoras escolhe no painel.
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

    SELECT array_agg(DISTINCT org) INTO v_orgs FROM (
        SELECT pw.organization_id AS org
          FROM public.partner_users pu
          JOIN public.partner_workspaces pw ON pw.id = pu.partner_workspace_id
         WHERE p_portal = 'parceiro' AND lower(pu.email) = v_email
           AND pu.is_active = TRUE AND pw.is_active = TRUE AND pw.organization_id IS NOT NULL
        UNION
        SELECT t.org_id
          FROM public.partner_users pu
          JOIN public.partner_portal_tokens t ON t.workspace_id = pu.partner_workspace_id
         WHERE p_portal = 'parceiro' AND lower(pu.email) = v_email AND pu.is_active = TRUE
        UNION
        SELECT bp.organization_id
          FROM public.broker_profiles bp
         WHERE p_portal = 'corretor' AND lower(bp.email) = v_email AND bp.is_active = TRUE
           AND bp.organization_id IS NOT NULL
        UNION
        SELECT s.organization_id
          FROM public.suppliers s
         WHERE p_portal = 'fornecedor' AND lower(s.email) = v_email AND s.organization_id IS NOT NULL
        UNION
        SELECT sh.target_org_id
          FROM public.supplier_org_shares sh
          JOIN public.suppliers s ON s.id = sh.supplier_id
         WHERE p_portal = 'fornecedor' AND lower(s.email) = v_email
        UNION
        SELECT om.organization_id
          FROM public.organization_members om
         WHERE lower(om.email) = v_email
    ) x WHERE org IS NOT NULL;

    v_orgs := coalesce(v_orgs, '{}');

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
        'help', CASE WHEN v_org IS NULL THEN NULL ELSE public.portal_help_org_json(v_org, p_portal) END
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_help_get_mine(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_help_get_mine(TEXT, UUID) TO authenticated;
