-- ============================================================
-- Módulo: Estrutural / Ferragem Armada (quantitativo de aço)
-- OrçaCloud SaaS - Migration
--
-- Princípio: QUANTIFICAR, não DIMENSIONAR. Recebe a armadura já
-- definida pelo projetista (bitola, quantidade, espaçamento, geometria)
-- e calcula comprimento, dobra, transpasse, peso, perda, custo, corte.
-- NÃO recebe cargas — evita responsabilidade técnica (ART).
--
-- Hierarquia: projects → structural_assemblies → structural_elements → structural_rebars
-- Catálogo de aço (NBR 7480) global (org_id NULL) + overrides por org.
-- ============================================================

-- ── Função de updated_at compartilhada do módulo ─────────────
CREATE OR REPLACE FUNCTION public.structural_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END $$;

-- ============================================================
-- 1. CATÁLOGO DE AÇO (NBR 7480)
--    org_id NULL = linha do catálogo base global (read-only para todos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.structural_steel_catalog (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id               UUID REFERENCES public.organizations(id) ON DELETE CASCADE,  -- NULL = global

    tipo                 TEXT NOT NULL DEFAULT 'CA-50'
                           CHECK (tipo IN ('CA-50','CA-60','tela','trelica')),
    bitola_mm            NUMERIC NOT NULL CHECK (bitola_mm > 0),
    peso_linear_kg_m     NUMERIC NOT NULL CHECK (peso_linear_kg_m > 0),  -- valor tabelado NBR 7480
    comprimento_barra_m  NUMERIC NOT NULL DEFAULT 12 CHECK (comprimento_barra_m > 0),
    fabricante           TEXT,
    custo_kg             NUMERIC CHECK (custo_kg IS NULL OR custo_kg >= 0),
    custo_barra          NUMERIC CHECK (custo_barra IS NULL OR custo_barra >= 0),
    perda_pct_padrao     NUMERIC NOT NULL DEFAULT 10 CHECK (perda_pct_padrao >= 0),

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           UUID REFERENCES auth.users(id),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_steel_catalog_org ON public.structural_steel_catalog(org_id);

DROP TRIGGER IF EXISTS trg_steel_catalog_touch ON public.structural_steel_catalog;
CREATE TRIGGER trg_steel_catalog_touch
    BEFORE UPDATE ON public.structural_steel_catalog
    FOR EACH ROW EXECUTE FUNCTION public.structural_touch_updated_at();

-- ============================================================
-- 2. AGRUPADOR DENTRO DA OBRA (ex.: "Fundação", "Pav. Térreo")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.structural_assemblies (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

    nome          TEXT NOT NULL,
    tipo          TEXT,  -- fundacao | estrutura | ... (livre)

    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by    UUID REFERENCES auth.users(id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assemblies_project ON public.structural_assemblies(project_id);
CREATE INDEX IF NOT EXISTS idx_assemblies_org ON public.structural_assemblies(org_id);

DROP TRIGGER IF EXISTS trg_assemblies_touch ON public.structural_assemblies;
CREATE TRIGGER trg_assemblies_touch
    BEFORE UPDATE ON public.structural_assemblies
    FOR EACH ROW EXECUTE FUNCTION public.structural_touch_updated_at();

-- ============================================================
-- 3. ELEMENTO ESTRUTURAL (9 tipos)
--    geometria em JSONB: { b, h, comprimento } em cm (varia por tipo)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.structural_elements (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    assembly_id   UUID NOT NULL REFERENCES public.structural_assemblies(id) ON DELETE CASCADE,

    tipo          TEXT NOT NULL
                    CHECK (tipo IN ('viga','pilar','sapata','bloco','radier','laje','escada','muro','baldrame')),
    nome          TEXT NOT NULL,                       -- 'V1', 'P3'
    quantidade    INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
    geometria     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { b, h, comprimento } cm
    cobrimento_cm NUMERIC NOT NULL DEFAULT 3 CHECK (cobrimento_cm >= 0),

    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by    UUID REFERENCES auth.users(id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_elements_assembly ON public.structural_elements(assembly_id);
CREATE INDEX IF NOT EXISTS idx_elements_org ON public.structural_elements(org_id);

DROP TRIGGER IF EXISTS trg_elements_touch ON public.structural_elements;
CREATE TRIGGER trg_elements_touch
    BEFORE UPDATE ON public.structural_elements
    FOR EACH ROW EXECUTE FUNCTION public.structural_touch_updated_at();

-- ============================================================
-- 4. ARMADURA (uma "chamada" da prancha)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.structural_rebars (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    element_id          UUID NOT NULL REFERENCES public.structural_elements(id) ON DELETE CASCADE,
    bitola_id           UUID NOT NULL REFERENCES public.structural_steel_catalog(id),

    funcao              TEXT NOT NULL DEFAULT 'longitudinal'
                          CHECK (funcao IN ('longitudinal','estribo','porta_estribo','distribuicao','ancoragem')),
    posicao             INTEGER,                          -- nº da posição na prancha
    quantidade          INTEGER NOT NULL CHECK (quantidade > 0),
    espacamento_cm      NUMERIC CHECK (espacamento_cm IS NULL OR espacamento_cm > 0),
    comprimento_unit_cm NUMERIC CHECK (comprimento_unit_cm IS NULL OR comprimento_unit_cm > 0),
    formato_dobra       TEXT NOT NULL DEFAULT 'reta',     -- reta | L | U | estribo_fechado...
    dobras              JSONB NOT NULL DEFAULT '[]'::jsonb,-- [{tipo:'reta',cm}, {tipo:'dobra',ang}]

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID REFERENCES auth.users(id),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rebars_element ON public.structural_rebars(element_id);
CREATE INDEX IF NOT EXISTS idx_rebars_org ON public.structural_rebars(org_id);

DROP TRIGGER IF EXISTS trg_rebars_touch ON public.structural_rebars;
CREATE TRIGGER trg_rebars_touch
    BEFORE UPDATE ON public.structural_rebars
    FOR EACH ROW EXECUTE FUNCTION public.structural_touch_updated_at();

-- ============================================================
-- 5. RLS — isolamento por organização (helper public.is_org_member)
-- ============================================================

-- Catálogo: leitura do catálogo global (org_id NULL) liberada a todos;
-- escrita/leitura de linhas da org só para membros da org.
ALTER TABLE public.structural_steel_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS steel_catalog_select ON public.structural_steel_catalog;
CREATE POLICY steel_catalog_select ON public.structural_steel_catalog
    FOR SELECT USING (org_id IS NULL OR public.is_org_member(org_id));

DROP POLICY IF EXISTS steel_catalog_insert ON public.structural_steel_catalog;
CREATE POLICY steel_catalog_insert ON public.structural_steel_catalog
    FOR INSERT WITH CHECK (org_id IS NOT NULL AND public.is_org_member(org_id));

DROP POLICY IF EXISTS steel_catalog_update ON public.structural_steel_catalog;
CREATE POLICY steel_catalog_update ON public.structural_steel_catalog
    FOR UPDATE USING (org_id IS NOT NULL AND public.is_org_member(org_id))
    WITH CHECK (org_id IS NOT NULL AND public.is_org_member(org_id));

DROP POLICY IF EXISTS steel_catalog_delete ON public.structural_steel_catalog;
CREATE POLICY steel_catalog_delete ON public.structural_steel_catalog
    FOR DELETE USING (org_id IS NOT NULL AND public.is_org_member(org_id));

-- Tabelas operacionais: acesso total para membros da org dona.
ALTER TABLE public.structural_assemblies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assemblies_all ON public.structural_assemblies;
CREATE POLICY assemblies_all ON public.structural_assemblies
    FOR ALL USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.structural_elements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS elements_all ON public.structural_elements;
CREATE POLICY elements_all ON public.structural_elements
    FOR ALL USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.structural_rebars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rebars_all ON public.structural_rebars;
CREATE POLICY rebars_all ON public.structural_rebars
    FOR ALL USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

-- ============================================================
-- 6. SEED — catálogo base NBR 7480 (global, org_id NULL)
--    Pesos lineares tabelados (kg/m). Idempotente.
-- ============================================================
INSERT INTO public.structural_steel_catalog (org_id, tipo, bitola_mm, peso_linear_kg_m, comprimento_barra_m)
SELECT * FROM (VALUES
    (NULL::uuid, 'CA-60', 5.0,  0.154, 12),
    (NULL::uuid, 'CA-50', 6.3,  0.245, 12),
    (NULL::uuid, 'CA-50', 8.0,  0.395, 12),
    (NULL::uuid, 'CA-50', 10.0, 0.617, 12),
    (NULL::uuid, 'CA-50', 12.5, 0.963, 12),
    (NULL::uuid, 'CA-50', 16.0, 1.578, 12),
    (NULL::uuid, 'CA-50', 20.0, 2.466, 12),
    (NULL::uuid, 'CA-50', 25.0, 3.853, 12)
) AS seed(org_id, tipo, bitola_mm, peso_linear_kg_m, comprimento_barra_m)
WHERE NOT EXISTS (
    SELECT 1 FROM public.structural_steel_catalog c
    WHERE c.org_id IS NULL AND c.bitola_mm = seed.bitola_mm AND c.tipo = seed.tipo
);

-- ============================================================
COMMENT ON TABLE public.structural_steel_catalog IS 'Catálogo de aço NBR 7480. org_id NULL = catálogo base global (read-only). Módulo Estrutural/Ferragem.';
COMMENT ON TABLE public.structural_assemblies   IS 'Agrupador de estrutura dentro de uma obra (projects). Módulo Estrutural/Ferragem.';
COMMENT ON TABLE public.structural_elements     IS 'Elemento estrutural (viga/pilar/sapata/...). Quantifica, não dimensiona. Módulo Estrutural/Ferragem.';
COMMENT ON TABLE public.structural_rebars       IS 'Armadura (chamada da prancha) de um elemento. Módulo Estrutural/Ferragem.';
