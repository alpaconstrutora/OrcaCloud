-- ============================================================================
-- Planta Inteligente — API PÚBLICA: tokens por organização e RPCs (20/09/2026, E9.2)
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`,
-- fase 9.2: "OpenAPI sobre RPCs security definer com token por organização:
-- estudos, versões (payload canônico + hash), quantitativos, planilha, IFC,
-- unidades/áreas; REVOKE public".
--
-- ─── DESENHO ────────────────────────────────────────────────────────────────
--
-- 1. `blueprint_api_tokens`: um token por integração, DA ORGANIZAÇÃO. Guarda-se
--    só o SHA-256 do token; o texto completo é mostrado UMA vez, na criação.
--    Membros da organização veem a lista (nome, prefixo, uso); ninguém lê o
--    hash de fora (o hash não autentica ninguém — a API compara hash(token)).
-- 2. Criar/revogar: RPCs `security definer` para AUTENTICADOS, que exigem
--    `is_org_member` da organização pedida — REGRA #5: a organização vem do
--    seletor do topo e é conferida no banco, não confiada.
-- 3. A API em si (`api_blueprint_*`): RPCs `security definer` que recebem o
--    token, validam (hash, ativo, validade), registram o uso e devolvem só o
--    que é daquela organização. EXECUTE apenas para `service_role`: quem as
--    chama é a Edge Function `planta-api`, nunca o navegador nem um cliente
--    anônimo. REVOKE de public/anon/authenticated em tudo (regra da casa).
--
-- O que exige o KERNEL (quantitativos, planilha, IFC, áreas) NÃO está aqui:
-- é TypeScript, e roda na Edge Function sobre o payload que estas RPCs
-- devolvem.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_api_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
    -- Os 12 primeiros caracteres ("opk_1a2b3c4d"), para a pessoa reconhecer o token na lista.
    prefixo         TEXT NOT NULL,
    token_hash      TEXT NOT NULL UNIQUE,
    escopos         TEXT[] NOT NULL DEFAULT ARRAY['leitura'],
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    usos            BIGINT NOT NULL DEFAULT 0,
    revoked_at      TIMESTAMPTZ
);

COMMENT ON TABLE public.blueprint_api_tokens IS
  'Tokens da API pública da Planta Inteligente, por organização. Só o SHA-256 fica guardado; o texto do token aparece uma vez, na criação.';

CREATE INDEX IF NOT EXISTS blueprint_api_tokens_org_idx
    ON public.blueprint_api_tokens(organization_id) WHERE active;

ALTER TABLE public.blueprint_api_tokens ENABLE ROW LEVEL SECURITY;

-- Só LEITURA pela tabela; criar e revogar passam pelas RPCs.
DROP POLICY IF EXISTS "blueprint_api_tokens_org_select" ON public.blueprint_api_tokens;
CREATE POLICY "blueprint_api_tokens_org_select"
    ON public.blueprint_api_tokens
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_api_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.blueprint_api_tokens TO authenticated;

-- ── Criar (autenticado, membro da organização) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.blueprint_api_token_create(
    p_organization_id UUID,
    p_nome TEXT,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (id UUID, token TEXT, prefixo TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT;
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_org_member(p_organization_id) THEN
        RAISE EXCEPTION 'você não é membro desta organização' USING ERRCODE = '42501';
    END IF;
    IF p_nome IS NULL OR length(btrim(p_nome)) = 0 THEN
        RAISE EXCEPTION 'nome é obrigatório' USING ERRCODE = '22023';
    END IF;
    IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
        RAISE EXCEPTION 'validade tem de estar no futuro' USING ERRCODE = '22023';
    END IF;
    -- "opk_" + 48 hex = 52 caracteres; 192 bits de aleatoriedade.
    v_token := 'opk_' || encode(extensions.gen_random_bytes(24), 'hex');
    INSERT INTO public.blueprint_api_tokens (organization_id, nome, prefixo, token_hash, created_by, expires_at)
    VALUES (p_organization_id, btrim(p_nome), left(v_token, 12), encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), p_expires_at)
    RETURNING blueprint_api_tokens.id INTO v_id;
    RETURN QUERY SELECT v_id, v_token, left(v_token, 12);
END;
$$;

-- ── Revogar (autenticado, membro da organização do token) ───────────────────
CREATE OR REPLACE FUNCTION public.blueprint_api_token_revoke(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
    END IF;
    SELECT t.organization_id INTO v_org FROM public.blueprint_api_tokens t WHERE t.id = p_id;
    IF v_org IS NULL THEN
        RETURN FALSE;
    END IF;
    IF NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'você não é membro desta organização' USING ERRCODE = '42501';
    END IF;
    UPDATE public.blueprint_api_tokens SET active = FALSE, revoked_at = now() WHERE id = p_id AND active;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.blueprint_api_token_create(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blueprint_api_token_create(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
REVOKE ALL ON FUNCTION public.blueprint_api_token_revoke(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blueprint_api_token_revoke(UUID) TO authenticated;

-- ── A API: resolver o token (service_role) ──────────────────────────────────
-- Valida e REGISTRA o uso. Devolve a organização; NULL = token inválido,
-- revogado ou vencido (a function responde 401 sem dizer qual dos três).
CREATE OR REPLACE FUNCTION public.api_blueprint_resolver(p_token TEXT)
RETURNS TABLE (organization_id UUID, token_id UUID, nome TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash TEXT;
BEGIN
    IF p_token IS NULL OR p_token !~ '^opk_[0-9a-f]{48}$' THEN
        RETURN;
    END IF;
    v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
    RETURN QUERY
        UPDATE public.blueprint_api_tokens t
           SET last_used_at = now(), usos = t.usos + 1
         WHERE t.token_hash = v_hash
           AND t.active
           AND (t.expires_at IS NULL OR t.expires_at > now())
        RETURNING t.organization_id, t.id, t.nome;
END;
$$;

-- ── Estudos da organização do token ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.api_blueprint_studies(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_org UUID;
BEGIN
    SELECT r.organization_id INTO v_org FROM public.api_blueprint_resolver(p_token) r;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'token inválido' USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', s.id,
            'nome', s.name,
            'status', s.status,
            'sistema_de_unidades', s.unit_system,
            'obra_id', s.project_id,
            'criado_em', s.created_at,
            'atualizado_em', s.updated_at,
            'versoes', (SELECT count(*) FROM public.blueprint_snapshots sn WHERE sn.study_id = s.id),
            'ultima_revisao', (SELECT max(sn.revision) FROM public.blueprint_snapshots sn WHERE sn.study_id = s.id),
            'ultima_publicacao', (SELECT max(sn.published_at) FROM public.blueprint_snapshots sn WHERE sn.study_id = s.id)
        ) ORDER BY s.updated_at DESC)
        FROM public.blueprint_studies s
        WHERE s.organization_id = v_org
    ), '[]'::jsonb);
END;
$$;

-- ── Versões publicadas de um estudo (sem o payload) ─────────────────────────
CREATE OR REPLACE FUNCTION public.api_blueprint_versions(p_token TEXT, p_study UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_org UUID;
BEGIN
    SELECT r.organization_id INTO v_org FROM public.api_blueprint_resolver(p_token) r;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'token inválido' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.blueprint_studies s WHERE s.id = p_study AND s.organization_id = v_org) THEN
        RETURN NULL;  -- estudo de outra organização = inexistente para este token
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'revisao', sn.revision,
            'hash', sn.hash,
            'kernel', sn.kernel_version,
            'publicada_em', sn.published_at,
            'notas', sn.notes,
            'aprovacao', sn.approval_status,
            'ramo_id', sn.branch_id
        ) ORDER BY sn.revision DESC)
        FROM public.blueprint_snapshots sn
        WHERE sn.study_id = p_study
    ), '[]'::jsonb);
END;
$$;

-- ── Uma versão, COM o payload canônico e o hash ─────────────────────────────
-- `p_revision` NULL = a última publicada.
CREATE OR REPLACE FUNCTION public.api_blueprint_version(p_token TEXT, p_study UUID, p_revision INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_org UUID;
BEGIN
    SELECT r.organization_id INTO v_org FROM public.api_blueprint_resolver(p_token) r;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'token inválido' USING ERRCODE = '42501';
    END IF;
    RETURN (
        SELECT jsonb_build_object(
            'estudo_id', sn.study_id,
            'estudo', s.name,
            'revisao', sn.revision,
            'hash', sn.hash,
            'kernel', sn.kernel_version,
            'publicada_em', sn.published_at,
            'notas', sn.notes,
            'aprovacao', sn.approval_status,
            'payload', sn.payload
        )
        FROM public.blueprint_snapshots sn
        JOIN public.blueprint_studies s ON s.id = sn.study_id
        WHERE sn.study_id = p_study
          AND s.organization_id = v_org
          AND (p_revision IS NULL OR sn.revision = p_revision)
        ORDER BY sn.revision DESC
        LIMIT 1
    );
END;
$$;

REVOKE ALL ON FUNCTION public.api_blueprint_resolver(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_blueprint_studies(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_blueprint_versions(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_blueprint_version(TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_blueprint_resolver(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_blueprint_studies(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_blueprint_versions(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_blueprint_version(TEXT, UUID, INTEGER) TO service_role;
