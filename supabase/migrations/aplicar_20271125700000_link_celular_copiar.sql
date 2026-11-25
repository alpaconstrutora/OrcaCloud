-- aplicar_20271125700000_link_celular_copiar.sql
--
-- ⚠️ JÁ APLICADA em produção (25/11/2026 — `mobile_link_copiar` e a coluna `token` existem no banco).
-- NÃO rodar de novo. Nome antigo: aplicar_20271125600000_link_celular_copiar.sql — renomeada para
-- 20271125700000 porque colidia com aplicar_20271125600000_qualidade_siac_base.sql (#747), que chegou antes.
--
-- Link do celular — "Copiar link" a qualquer momento, como nos portais.
-- Pedido 25/11/2026 (docs/planos/2026-11-11-link-celular-tarefas-diario.md,
-- seção "Copiar link ativo"). Prova: scripts/teste-link-celular-copiar.sql.
--
-- Antes: user_mobile_links guardava só o SHA-256; o endereço aparecia uma vez,
-- ao gerar. Decisão do usuário (25/11): poder copiar depois, aceitando que o
-- gestor da org consiga copiar o link de um membro.
--
-- O que muda:
--   1. Coluna `token` (em claro). A tabela continua SEM policy e SEM privilégio
--      para anon/authenticated (REVOKE ALL da 950000) — só sai pela RPC abaixo.
--      `token_hash` segue sendo a credencial conferida pelo _mobile_link_resolver
--      (nada muda no caminho do celular).
--   2. mobile_link_generate grava o token junto do hash.
--   3. mobile_link_copiar: devolve o token do link ATIVO (não revogado, não
--      vencido) — mesma autorização de mobile_link_status/_revoke: a própria
--      pessoa, ou owner/admin da org. Visualizador/membro não copia o de outro.
--      Sem link ativo, ou link antigo (gerado antes desta migration, sem token):
--      NULL.
--   4. mobile_link_status ganha `copiavel` (a tela liga/desliga o botão sem
--      trazer o token a cada abertura).
--   5. Gatilho: revogar (por mobile_link_revoke ou ao sair da org) apaga o token
--      guardado — link revogado não fica legível em lugar nenhum.
--
-- Links existentes continuam valendo, mas sem token: "Copiar" só depois de
-- gerar um novo (não há como recuperar o endereço a partir do hash).
--
-- REGRA #7: função nova com REVOKE de PUBLIC/anon; DEFINER confere por dentro.
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_user_mobile_links_revogado_sem_token ON public.user_mobile_links;
--   DROP FUNCTION IF EXISTS public._mobile_link_revogado_sem_token();
--   DROP FUNCTION IF EXISTS public.mobile_link_copiar(UUID, UUID);
--   recriar mobile_link_generate e mobile_link_status de aplicar_20271111950000;
--   ALTER TABLE public.user_mobile_links DROP COLUMN IF EXISTS token;

-- ── 1. Coluna ───────────────────────────────────────────────────────────────
ALTER TABLE public.user_mobile_links ADD COLUMN IF NOT EXISTS token TEXT;

COMMENT ON COLUMN public.user_mobile_links.token IS
    'Token em claro do link vigente, para "Copiar link" (mobile_link_copiar). NULL em link revogado '
    'e nos gerados antes de 25/11/2026. Sem acesso pela API: só pelas funções mobile_link_*.';

COMMENT ON TABLE public.user_mobile_links IS
    'Link do celular (/celular?token=): um por pessoa por organização. token_hash = SHA-256 hex (credencial '
    'conferida pelo _mobile_link_resolver); token = em claro, só para copiar. RLS sem policy: acesso só pelas '
    'funções mobile_link_* e _mobile_link_resolver.';

-- Segunda tranca, repetida: nenhum papel da API lê a tabela (nem a coluna nova).
REVOKE ALL ON TABLE public.user_mobile_links FROM PUBLIC, anon, authenticated;

-- ── 2. Gerar guarda o token ─────────────────────────────────────────────────
-- Igual a aplicar_20271111950000, mais a coluna token.
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
           (org_id, user_id, token_hash, token, expires_at, revoked_at, last_used_at, created_by)
    VALUES (p_org_id, p_user_id, public._mobile_link_hash(v_token), v_token, now() + interval '90 days', NULL, NULL, v_ator)
    ON CONFLICT ON CONSTRAINT user_mobile_links_org_user_key DO UPDATE
       SET token_hash   = EXCLUDED.token_hash,
           token        = EXCLUDED.token,
           expires_at   = EXCLUDED.expires_at,
           revoked_at   = NULL,
           last_used_at = NULL,   -- "último uso" é do link vigente, não do anterior
           created_by   = EXCLUDED.created_by;

    RETURN v_token;
END;
$$;

-- ── 3. Copiar ───────────────────────────────────────────────────────────────
-- Autorização idêntica a mobile_link_status/_revoke. Volátil de propósito:
-- não é cacheável e não deve ir num GET do PostgREST.
CREATE OR REPLACE FUNCTION public.mobile_link_copiar(p_user_id UUID, p_org_id UUID)
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
           OR (p_user_id = v_ator AND public.is_org_member(p_org_id))) IS NOT TRUE
       OR public.is_org_member_de(p_user_id, p_org_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'sem permissão para gerenciar o link do celular desta pessoa' USING ERRCODE = '42501';
    END IF;

    SELECT l.token INTO v_token
      FROM public.user_mobile_links l
     WHERE l.org_id = p_org_id
       AND l.user_id = p_user_id
       AND l.revoked_at IS NULL
       AND l.expires_at > now();

    RETURN v_token;   -- NULL = sem link ativo, ou link antigo sem token guardado
END;
$$;

-- ── 4. Status diz se dá para copiar ─────────────────────────────────────────
-- Igual a aplicar_20271111950000, mais `copiavel`.
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
               'revogado',     l.revoked_at IS NOT NULL,
               'copiavel',     l.token IS NOT NULL AND l.revoked_at IS NULL AND l.expires_at > now())
      INTO v
      FROM public.user_mobile_links l
     WHERE l.org_id = p_org_id
       AND l.user_id = p_user_id;

    RETURN coalesce(v, jsonb_build_object(
        'existe', false, 'expires_at', NULL, 'last_used_at', NULL, 'revogado', false, 'copiavel', false));
END;
$$;

-- ── 5. Revogado não guarda token ────────────────────────────────────────────
-- Um gatilho cobre os dois caminhos que revogam (mobile_link_revoke e
-- _mobile_link_revoga_ao_sair_da_org) e qualquer outro que venha depois.
CREATE OR REPLACE FUNCTION public._mobile_link_revogado_sem_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.revoked_at IS NOT NULL THEN
        NEW.token := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_mobile_links_revogado_sem_token ON public.user_mobile_links;
CREATE TRIGGER trg_user_mobile_links_revogado_sem_token
    BEFORE INSERT OR UPDATE ON public.user_mobile_links
    FOR EACH ROW EXECUTE FUNCTION public._mobile_link_revogado_sem_token();

-- ── Privilégios (REGRA #7) ──────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public._mobile_link_revogado_sem_token()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mobile_link_copiar(UUID, UUID)          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mobile_link_copiar(UUID, UUID)          TO authenticated;
-- Recriadas: os mesmos REVOKE/GRANT de aplicar_20271111950000.
REVOKE EXECUTE ON FUNCTION public.mobile_link_generate(UUID, UUID)        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mobile_link_generate(UUID, UUID)        TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mobile_link_status(UUID, UUID)          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mobile_link_status(UUID, UUID)          TO authenticated;
