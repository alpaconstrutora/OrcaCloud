-- ============================================================================
-- Planta Inteligente — PLUGINS por organização (21/09/2026, backlog P2 "plugins")
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`,
-- backlog P2 do corte original: "plugins".
--
-- ─── DESENHO ────────────────────────────────────────────────────────────────
--
-- Um plugin é uma PÁGINA https de terceiros que a Planta abre num iframe com
-- sandbox (só scripts, sem same-origin) e com quem fala por `postMessage`:
-- a Planta manda o payload canônico (e os quantitativos, se permitido); o
-- plugin devolve COMANDOS do kernel, que só entram no desenho depois de a
-- pessoa ver a proposta e clicar Aplicar. Nenhum código de terceiro roda na
-- página da Planta; nenhuma credencial vai ao plugin.
--
-- Esta tabela é só o CADASTRO (org, nome, URL, permissões, ativo). RLS por
-- `is_org_member`, como webhooks e templates de vista.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_plugins (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome              TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
    url               TEXT NOT NULL CHECK (url ~* '^https://' AND length(url) <= 2000),
    descricao         TEXT NOT NULL DEFAULT '' CHECK (length(descricao) <= 400),
    -- ler = recebe o payload canônico · quantitativos = recebe também os quantitativos
    -- · escrever = pode propor comandos · selecionar = pode pedir seleção no desenho
    permissoes        TEXT[] NOT NULL DEFAULT ARRAY['ler'],
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_plugins_permissoes_validas CHECK (
        permissoes <@ ARRAY['ler', 'quantitativos', 'escrever', 'selecionar']::text[]
        AND 'ler' = ANY (permissoes)
    )
);

COMMENT ON TABLE public.blueprint_plugins IS
  'Plugins da Planta Inteligente por organização: página https aberta em iframe com sandbox, protocolo postMessage (payload canônico → comandos propostos). Só cadastro; nada roda no servidor.';

CREATE INDEX IF NOT EXISTS blueprint_plugins_org_idx ON public.blueprint_plugins(organization_id) WHERE active;

DROP TRIGGER IF EXISTS trg_blueprint_plugins_updated ON public.blueprint_plugins;
CREATE TRIGGER trg_blueprint_plugins_updated
    BEFORE UPDATE ON public.blueprint_plugins
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_plugins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blueprint_plugins_org" ON public.blueprint_plugins;
CREATE POLICY "blueprint_plugins_org"
    ON public.blueprint_plugins
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
REVOKE ALL ON public.blueprint_plugins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_plugins TO authenticated;
