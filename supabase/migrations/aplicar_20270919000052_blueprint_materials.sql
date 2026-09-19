-- ============================================================================
-- Planta Inteligente — BIBLIOTECA DE MATERIAIS da organização (19/09/2026, E7.4)
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`,
-- fase 7.4: um material por linha — nome, CÓDIGO (o mesmo espaço de códigos de
-- `CamadaParede.itemCode`: SINAPI ou interno), unidade, custo, fabricante,
-- propriedades físicas (densidade, condutividade — P2), cor do desenho e
-- função construtiva/espessura padrão para a camada nascer pronta.
--
-- ─── O KERNEL NÃO MUDA ──────────────────────────────────────────────────────
-- A camada, o rodapé e o guarda-corpo continuam carregando `itemCode` opaco:
-- a biblioteca é quem RESOLVE o código (nome, custo, densidade) na hora de
-- mostrar e de orçar. Apagar um material não mexe em planta nenhuma; o código
-- fica no payload e passa a aparecer "sem material na biblioteca". Mesma
-- decisão de `blueprint_wall_types` (…000031).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_materials (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Código no espaço de `itemCode`: o SINAPI ("87879") ou um interno ("INT-PORC-60").
    codigo              TEXT NOT NULL,
    nome                TEXT NOT NULL,
    fonte               TEXT NOT NULL DEFAULT 'INTERNA' CHECK (fonte IN ('SINAPI', 'INTERNA')),
    -- Unidade em que o custo é cotado; é ela que decide a grandeza no orçamento (m², m³, m, un, kg).
    unidade             TEXT NOT NULL DEFAULT 'm²',
    custo               NUMERIC(14,4) NOT NULL DEFAULT 0,
    fabricante          TEXT,
    -- Propriedades físicas (P2): massa e desempenho térmico saem delas.
    densidade_kg_m3     NUMERIC(10,2),
    condutividade_w_mk  NUMERIC(10,4),
    -- Cor no desenho/3D (#rrggbb). NULL = a cor da função construtiva.
    cor                 TEXT CHECK (cor IS NULL OR cor ~ '^#[0-9a-fA-F]{6}$'),
    -- Para a camada nascer pronta: função construtiva e espessura usual.
    funcao              TEXT CHECK (funcao IS NULL OR funcao IN ('ESTRUTURAL','VEDACAO','REVESTIMENTO','ISOLAMENTO','ACABAMENTO','CAMARA_AR')),
    espessura_padrao_mm INTEGER CHECK (espessura_padrao_mm IS NULL OR espessura_padrao_mm > 0),
    propriedades        JSONB NOT NULL DEFAULT '{}'::jsonb,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_materials_codigo_key UNIQUE (organization_id, codigo)
);

COMMENT ON TABLE public.blueprint_materials IS
  'Biblioteca de materiais da organização para a Planta Inteligente: código (SINAPI ou interno, '
  'o mesmo de CamadaParede.itemCode), nome, unidade, custo, fabricante, densidade, condutividade, '
  'cor, função e espessura padrão. Resolve o código das camadas/rodapés/guarda-corpos na tela e no orçamento.';

CREATE INDEX IF NOT EXISTS blueprint_materials_org_idx
    ON public.blueprint_materials(organization_id) WHERE active;

DROP TRIGGER IF EXISTS trg_blueprint_materials_updated ON public.blueprint_materials;
CREATE TRIGGER trg_blueprint_materials_updated
    BEFORE UPDATE ON public.blueprint_materials
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_materials_org" ON public.blueprint_materials;
CREATE POLICY "blueprint_materials_org"
    ON public.blueprint_materials
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_materials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_materials TO authenticated;
