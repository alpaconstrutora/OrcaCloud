-- ============================================================================
-- Planta Inteligente — VIAS E GREIDE (C2, 26/09/2026)
--
-- Uma linha por VIA do estudo: o eixo desenhado (polilinha em mm do desenho),
-- o passo do estaqueamento, os PIVs do greide (com curva vertical) e a seção
-- tipo. Estacas, seções transversais, volumes e nota de serviço NÃO são
-- gravados: são derivados na tela, a cada abertura, contra a versão de
-- topografia exibida — o mesmo critério da premissa de terraplenagem.
--
-- ─── POR QUE TABELA LATERAL, E NÃO O KERNEL ─────────────────────────────────
-- O eixo é dado de PROJETO GEOMÉTRICO da via, não geometria da planta: muda
-- dez vezes numa tarde, vale para qualquer versão do terreno, e não entra em
-- prancha nem em quantitativo. Mesma decisão das linhas de perfil e da
-- drenagem (`blueprint_study_terraplenagem`). Quando a via vier do
-- loteamento (C3), `via_uid` aponta para o `Via` do kernel.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Tabela NOVA, nenhuma quente.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_vias (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,

    nome            TEXT NOT NULL DEFAULT 'Via',
    -- C3: o `uid` do `Via` do kernel quando o eixo vem do loteamento. NULL = eixo próprio.
    via_uid         UUID,
    -- Polilinha do eixo em mm do desenho: [{x, y}, …], ≥ 2 pontos.
    eixo            JSONB NOT NULL DEFAULT '[]'::jsonb,
    passo_m         NUMERIC NOT NULL DEFAULT 20 CHECK (passo_m > 0 AND passo_m <= 100),
    -- PIVs: {pontos: [{distM, cotaM, curvaM?}, …]}. NULL = greide de partida (reta terreno→terreno).
    greide          JSONB,
    -- {pistaM, calcadaM, taludeCorteH, taludeAterroH}. NULL = seção tipo padrão.
    secao_tipo      JSONB,
    -- A versão de topografia contra a qual o greide foi pensado (informativo).
    topografia_id   UUID REFERENCES public.blueprint_study_topografia(id) ON DELETE SET NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_study_vias_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS blueprint_study_vias_study_idx
    ON public.blueprint_study_vias (study_id);

COMMENT ON TABLE public.blueprint_study_vias IS
  'Vias de projeto de um estudo de Planta Inteligente (C2): eixo, passo do '
  'estaqueamento, PIVs do greide e seção tipo. Estacas, seções, volumes e nota '
  'de serviço são derivados na tela, nunca gravados.';

DROP TRIGGER IF EXISTS trg_blueprint_vias_updated ON public.blueprint_study_vias;
CREATE TRIGGER trg_blueprint_vias_updated
    BEFORE UPDATE ON public.blueprint_study_vias
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_vias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_vias_org" ON public.blueprint_study_vias;
CREATE POLICY "blueprint_study_vias_org"
    ON public.blueprint_study_vias
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- `FROM PUBLIC` sozinho não tira os privilégios padrão do Supabase (grant
-- direto em anon/authenticated) — medido em 10/09/2026 na tabela de topografia.
REVOKE ALL ON public.blueprint_study_vias FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_vias TO authenticated;

RESET lock_timeout;
