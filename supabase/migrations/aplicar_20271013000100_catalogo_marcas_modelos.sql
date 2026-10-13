-- ============================================================================
-- Configurações do Sistema › Marcas e Modelos (13/10/2026)
--
-- Plano: docs/planos/2026-10-13-marcas-e-modelos.md
--
-- Pedido: "Configurações do Sistema: criar gerenciamento de Marcas e modelos de
-- equipamentos, componentes, materiais etc. Conectar com: 1. Comercial > Ativos
-- do edifício 2. Gestão de Ativos > Ativos Patrimoniais" (+ Almoxarifado, por
-- decisão do usuário na mesma sessão).
--
-- ─── DESENHO ────────────────────────────────────────────────────────────────
--
-- 1. Catálogo NEUTRO por organização: `product_brands` 1─N `product_models`.
--    Atende ativo (opura_assets) e material (stock_items) — por isso não se
--    evoluiu `opura_asset_brands` (nome amarrado a um módulo, organization_id
--    sem FK, RLS por subselect user_id). A linha dela é copiada com o MESMO id;
--    o congelamento é a migration ...000200, aplicada DEPOIS do deploy.
--
-- 2. O registro guarda o ID e o TEXTO (decisão do usuário): `brand_id`/`model_id`
--    + `brand`/`model`. O texto é DERIVADO no banco — quem lê texto (RPC do
--    Portal do Cliente, utils/assetToStockItemRow) continua igual.
--      (a) fn_catalogo_espelho  BEFORE INSERT/UPDATE nos registros: texto a
--          partir do id; id a partir do texto quando só o texto mudou (edição
--          em lote, cliente antigo); modelo de outra marca é desvinculado.
--      (b) fn_catalogo_propagar_nome  AFTER UPDATE OF name no catálogo: o
--          renomear chega a todo registro vinculado. SECURITY DEFINER porque a
--          RLS de opura_assets/stock_items é por e-mail (≠ is_org_member): com
--          INVOKER, linha invisível ficaria com o nome antigo, sem erro.
--
-- 3. Organização: a do MODELO é a da marca; a do registro é a dele. As FKs
--    COMPOSTAS (brand_id, organization_id) e (model_id, brand_id) tornam
--    impossível ligar ativo de uma org a marca de outra — no banco, não na tela.
--
-- 4. Excluir catálogo em uso: marca com modelo = RESTRICT (a tela inativa);
--    registro vinculado = SET NULL só da coluna do id, o texto fica.
--
-- ⚠️ Aplicar à mão, bloco a bloco: `npx supabase db query --linked -f <arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ⚠️ FK em tabela quente (opura_assets): se der 40P01/55P03, repetir com o app
--    fechado — mesmo alerta de aplicar_20270905000018.
-- ============================================================================

SET lock_timeout = '5s';

-- ─── BLOCO 1 · catálogo ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_brands (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- 100 = largura de opura_assets.brand (VARCHAR 100): nome maior quebraria o espelho.
    name             TEXT NOT NULL CHECK (
                         length(name) BETWEEN 1 AND 100
                         AND name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
                     ),
    name_key         TEXT GENERATED ALWAYS AS (lower(name)) STORED,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_brands_org_nome_uq UNIQUE (organization_id, name_key),
    CONSTRAINT product_brands_id_org_uq   UNIQUE (id, organization_id)
);

COMMENT ON TABLE public.product_brands IS
  'Configurações › Marcas e Modelos: marcas por organização (equipamentos, componentes, materiais). Registros (opura_assets, stock_items) guardam brand_id + texto espelhado.';

CREATE TABLE IF NOT EXISTS public.product_models (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL,
    brand_id                    UUID NOT NULL,
    name                        TEXT NOT NULL CHECK (
                                    length(name) BETWEEN 1 AND 100
                                    AND name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
                                ),
    name_key                    TEXT GENERATED ALWAYS AS (lower(name)) STORED,
    item_type                   TEXT NOT NULL DEFAULT 'equipamento' CHECK (item_type IN (
                                    'equipamento', 'componente', 'material', 'ferramenta',
                                    'veiculo', 'tecnologia', 'mobiliario', 'outro')),
    -- part number / referência do fabricante — sem UNIQUE: repete legitimamente.
    manufacturer_code           TEXT CHECK (manufacturer_code IS NULL OR length(manufacturer_code) <= 100),
    -- padrões que o formulário do ativo AUTOPREENCHE (sem sobrescrever o manual).
    -- Mesmo domínio de AssetCategory (types/assets.ts).
    default_asset_category      TEXT CHECK (default_asset_category IS NULL OR default_asset_category IN (
                                    'equipamento', 'ferramenta', 'veiculo', 'tecnologia', 'imovel', 'mobiliario')),
    default_useful_life_months  INTEGER CHECK (default_useful_life_months IS NULL
                                    OR default_useful_life_months BETWEEN 1 AND 1200),
    technical_spec              TEXT CHECK (technical_spec IS NULL OR length(technical_spec) <= 4000),
    datasheet_url               TEXT CHECK (datasheet_url IS NULL
                                    OR (datasheet_url ~* '^https?://' AND length(datasheet_url) <= 2000)),
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- a org do modelo é SEMPRE a da marca
    CONSTRAINT product_models_brand_fk FOREIGN KEY (brand_id, organization_id)
        REFERENCES public.product_brands(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT product_models_marca_nome_uq UNIQUE (brand_id, name_key),
    CONSTRAINT product_models_id_brand_uq   UNIQUE (id, brand_id)
);

COMMENT ON TABLE public.product_models IS
  'Configurações › Marcas e Modelos: modelos de uma marca, com tipo de item, part number, padrões de categoria/vida útil para o ativo, especificação e ficha técnica.';

CREATE INDEX IF NOT EXISTS product_brands_org_idx ON public.product_brands(organization_id);
CREATE INDEX IF NOT EXISTS product_models_org_idx ON public.product_models(organization_id);
CREATE INDEX IF NOT EXISTS product_models_brand_idx ON public.product_models(brand_id);

DROP TRIGGER IF EXISTS trg_product_brands_updated_at ON public.product_brands;
CREATE TRIGGER trg_product_brands_updated_at
    BEFORE UPDATE ON public.product_brands
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_product_models_updated_at ON public.product_models;
CREATE TRIGGER trg_product_models_updated_at
    BEFORE UPDATE ON public.product_models
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_brands_org" ON public.product_brands;
CREATE POLICY "product_brands_org"
    ON public.product_brands
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
REVOKE ALL ON public.product_brands FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_brands TO authenticated;

ALTER TABLE public.product_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_models_org" ON public.product_models;
CREATE POLICY "product_models_org"
    ON public.product_models
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
REVOKE ALL ON public.product_models FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_models TO authenticated;

-- ─── BLOCO 2 · colunas nos registros ────────────────────────────────────────

ALTER TABLE public.opura_assets
    ADD COLUMN IF NOT EXISTS brand_id UUID,
    ADD COLUMN IF NOT EXISTS model_id UUID;

ALTER TABLE public.stock_items
    ADD COLUMN IF NOT EXISTS brand_id UUID,
    ADD COLUMN IF NOT EXISTS model_id UUID,
    ADD COLUMN IF NOT EXISTS brand    TEXT CHECK (brand IS NULL OR length(brand) <= 100),
    ADD COLUMN IF NOT EXISTS model    TEXT CHECK (model IS NULL OR length(model) <= 100);

-- ─── BLOCO 3 · FKs compostas (barram cruzar organizações) ───────────────────
-- MATCH SIMPLE: com brand_id NULL a FK não é checada — registro sem marca segue livre.
-- SET NULL (col) exige PG ≥ 15; o remoto é 17.6 (diagnóstico de 13/10).

ALTER TABLE public.opura_assets DROP CONSTRAINT IF EXISTS opura_assets_brand_fk;
ALTER TABLE public.opura_assets ADD CONSTRAINT opura_assets_brand_fk
    FOREIGN KEY (brand_id, organization_id) REFERENCES public.product_brands(id, organization_id)
    ON DELETE SET NULL (brand_id);
ALTER TABLE public.opura_assets DROP CONSTRAINT IF EXISTS opura_assets_model_fk;
ALTER TABLE public.opura_assets ADD CONSTRAINT opura_assets_model_fk
    FOREIGN KEY (model_id, brand_id) REFERENCES public.product_models(id, brand_id)
    ON UPDATE CASCADE ON DELETE SET NULL (model_id);

ALTER TABLE public.stock_items DROP CONSTRAINT IF EXISTS stock_items_brand_fk;
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_brand_fk
    FOREIGN KEY (brand_id, organization_id) REFERENCES public.product_brands(id, organization_id)
    ON DELETE SET NULL (brand_id);
ALTER TABLE public.stock_items DROP CONSTRAINT IF EXISTS stock_items_model_fk;
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_model_fk
    FOREIGN KEY (model_id, brand_id) REFERENCES public.product_models(id, brand_id)
    ON UPDATE CASCADE ON DELETE SET NULL (model_id);

CREATE INDEX IF NOT EXISTS opura_assets_brand_idx ON public.opura_assets(brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS opura_assets_model_idx ON public.opura_assets(model_id) WHERE model_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_items_brand_idx  ON public.stock_items(brand_id)  WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_items_model_idx  ON public.stock_items(model_id)  WHERE model_id IS NOT NULL;

-- ─── BLOCO 4 · backfill (antes dos gatilhos) ────────────────────────────────

-- 4.1 a marca do catálogo antigo, com o MESMO id. opura_asset_brands não tem FK
--     para organizations: só entra a linha cuja org existe.
INSERT INTO public.product_brands (id, organization_id, name, created_at, updated_at)
SELECT b.id, b.organization_id,
       left(btrim(regexp_replace(b.name, '\s+', ' ', 'g')), 100),
       b.created_at, b.updated_at
  FROM public.opura_asset_brands b
 WHERE EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = b.organization_id)
   AND btrim(coalesce(b.name, '')) <> ''
ON CONFLICT DO NOTHING;

-- 4.2 marcas a partir do texto dos ativos
INSERT INTO public.product_brands (organization_id, name)
SELECT DISTINCT ON (a.organization_id, lower(btrim(regexp_replace(a.brand, '\s+', ' ', 'g'))))
       a.organization_id, btrim(regexp_replace(a.brand, '\s+', ' ', 'g'))
  FROM public.opura_assets a
 WHERE btrim(coalesce(a.brand, '')) <> ''
ON CONFLICT (organization_id, name_key) DO NOTHING;

UPDATE public.opura_assets a
   SET brand_id = b.id, brand = b.name
  FROM public.product_brands b
 WHERE b.organization_id = a.organization_id
   AND b.name_key = lower(btrim(regexp_replace(a.brand, '\s+', ' ', 'g')))
   AND btrim(coalesce(a.brand, '')) <> ''
   AND a.brand_id IS NULL;

-- 4.3 modelos a partir do texto (0 em 13/10, mas genérico). Tipo vem da categoria.
INSERT INTO public.product_models (organization_id, brand_id, name, item_type)
SELECT DISTINCT ON (a.brand_id, lower(btrim(regexp_replace(a.model, '\s+', ' ', 'g'))))
       a.organization_id, a.brand_id,
       left(btrim(regexp_replace(a.model, '\s+', ' ', 'g')), 100),
       CASE a.category
            WHEN 'sistema_predial' THEN 'equipamento'
            WHEN 'imovel'          THEN 'outro'
            WHEN 'ferramenta'      THEN 'ferramenta'
            WHEN 'veiculo'         THEN 'veiculo'
            WHEN 'tecnologia'      THEN 'tecnologia'
            WHEN 'mobiliario'      THEN 'mobiliario'
            ELSE 'equipamento'
       END
  FROM public.opura_assets a
 WHERE a.brand_id IS NOT NULL
   AND btrim(coalesce(a.model, '')) <> ''
ON CONFLICT (brand_id, name_key) DO NOTHING;

UPDATE public.opura_assets a
   SET model_id = m.id, model = m.name
  FROM public.product_models m
 WHERE m.brand_id = a.brand_id
   AND m.name_key = lower(btrim(regexp_replace(a.model, '\s+', ' ', 'g')))
   AND btrim(coalesce(a.model, '')) <> ''
   AND a.model_id IS NULL;

-- ─── BLOCO 5 · gatilhos do espelho ──────────────────────────────────────────

-- (a) Espelho no registro. Mesma função para opura_assets e stock_items (as duas
--     têm organization_id, brand_id, model_id, brand, model). Ordem das regras:
--     R1 texto mudou e o id não → revincula pelo nome (ou desvincula)
--     R2 INSERT só com texto     → vincula se já existir (NÃO cria: criar é da tela)
--     R3 modelo de outra marca   → marca mexida nesta operação vence (modelo sai);
--                                  senão a marca segue o modelo
--     R4 id presente             → texto = nome do catálogo (só se achou a linha)
--     SECURITY DEFINER: lê o catálogo da org DO REGISTRO, e o registro já passou
--     pela RLS da própria tabela — quem grava é membro dessa org.
CREATE OR REPLACE FUNCTION public.fn_catalogo_espelho()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_chave_marca  TEXT := lower(btrim(regexp_replace(coalesce(NEW.brand, ''), '\s+', ' ', 'g')));
    v_chave_modelo TEXT := lower(btrim(regexp_replace(coalesce(NEW.model, ''), '\s+', ' ', 'g')));
    v_marca_mexida BOOLEAN;
    v_texto_marca  BOOLEAN;
    v_texto_modelo BOOLEAN;
    v_marca_do_modelo UUID;
    v_nome TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_marca_mexida := NEW.brand_id IS NOT NULL;
        v_texto_marca  := NEW.brand_id IS NULL AND v_chave_marca <> '';
        v_texto_modelo := NEW.model_id IS NULL AND v_chave_modelo <> '';
    ELSE
        v_marca_mexida := NEW.brand_id IS DISTINCT FROM OLD.brand_id;
        -- texto mudou sem o id mudar (lote, cliente antigo) — ou a org mudou
        v_texto_marca  := (NOT v_marca_mexida)
                          AND (NEW.brand IS DISTINCT FROM OLD.brand
                               OR NEW.organization_id IS DISTINCT FROM OLD.organization_id);
        v_texto_modelo := (NEW.model_id IS NOT DISTINCT FROM OLD.model_id)
                          AND (NEW.model IS DISTINCT FROM OLD.model
                               OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
                               OR v_texto_marca);
    END IF;

    -- R1/R2 · marca pelo nome
    IF v_texto_marca THEN
        NEW.brand_id := NULL;
        IF v_chave_marca <> '' THEN
            SELECT b.id INTO NEW.brand_id
              FROM public.product_brands b
             WHERE b.organization_id = NEW.organization_id AND b.name_key = v_chave_marca;
        END IF;
    END IF;

    -- R1/R2 · modelo pelo nome, dentro da marca resultante
    IF v_texto_modelo THEN
        NEW.model_id := NULL;
        IF v_chave_modelo <> '' AND NEW.brand_id IS NOT NULL THEN
            SELECT m.id INTO NEW.model_id
              FROM public.product_models m
             WHERE m.brand_id = NEW.brand_id AND m.name_key = v_chave_modelo;
        END IF;
    END IF;

    -- R3 · modelo e marca coerentes
    IF NEW.model_id IS NOT NULL THEN
        SELECT m.brand_id INTO v_marca_do_modelo FROM public.product_models m WHERE m.id = NEW.model_id;
        IF NOT FOUND THEN
            NEW.model_id := NULL;
        ELSIF NEW.brand_id IS NULL THEN
            NEW.brand_id := v_marca_do_modelo;
        ELSIF NEW.brand_id <> v_marca_do_modelo THEN
            IF v_marca_mexida AND TG_OP = 'UPDATE' AND NEW.model_id IS NOT DISTINCT FROM OLD.model_id THEN
                NEW.model_id := NULL;               -- trocou a marca: o modelo antigo sai
            ELSIF v_marca_mexida AND TG_OP = 'INSERT' THEN
                NEW.model_id := NULL;               -- marca explícita vence
            ELSE
                NEW.brand_id := v_marca_do_modelo;  -- trocou o modelo: a marca segue
            END IF;
        END IF;
    END IF;

    -- R4 · texto a partir do id (só se achou: SELECT sem linha zeraria o texto)
    IF NEW.brand_id IS NOT NULL THEN
        SELECT b.name INTO v_nome FROM public.product_brands b WHERE b.id = NEW.brand_id;
        IF FOUND THEN NEW.brand := v_nome; END IF;
    END IF;
    IF NEW.model_id IS NOT NULL THEN
        SELECT m.name INTO v_nome FROM public.product_models m WHERE m.id = NEW.model_id;
        IF FOUND THEN NEW.model := v_nome; END IF;
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_catalogo_espelho() FROM PUBLIC, anon, authenticated;

-- A lista de colunas faz os UPDATEs de cron de garantia (warranty_alerted_*)
-- não passarem por aqui.
DROP TRIGGER IF EXISTS trg_opura_assets_catalogo_espelho ON public.opura_assets;
CREATE TRIGGER trg_opura_assets_catalogo_espelho
    BEFORE INSERT OR UPDATE OF brand_id, model_id, brand, model, organization_id ON public.opura_assets
    FOR EACH ROW EXECUTE FUNCTION public.fn_catalogo_espelho();

DROP TRIGGER IF EXISTS trg_stock_items_catalogo_espelho ON public.stock_items;
CREATE TRIGGER trg_stock_items_catalogo_espelho
    BEFORE INSERT OR UPDATE OF brand_id, model_id, brand, model, organization_id ON public.stock_items
    FOR EACH ROW EXECUTE FUNCTION public.fn_catalogo_espelho();

-- (b) Renomear no catálogo chega aos registros. Idempotente com a R1 (o nome
--     novo resolve para o mesmo id). Efeito aceito: stock_items.updated_at sobe.
--     Autorização: o gatilho só dispara depois de o usuário passar na RLS do
--     catálogo, e a FK composta garante que todo registro com este id é da
--     mesma organização.
CREATE OR REPLACE FUNCTION public.fn_catalogo_propagar_nome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF TG_TABLE_NAME = 'product_brands' THEN
        UPDATE public.opura_assets SET brand = NEW.name WHERE brand_id = NEW.id AND brand IS DISTINCT FROM NEW.name;
        UPDATE public.stock_items  SET brand = NEW.name WHERE brand_id = NEW.id AND brand IS DISTINCT FROM NEW.name;
    ELSE
        UPDATE public.opura_assets SET model = NEW.name WHERE model_id = NEW.id AND model IS DISTINCT FROM NEW.name;
        UPDATE public.stock_items  SET model = NEW.name WHERE model_id = NEW.id AND model IS DISTINCT FROM NEW.name;
    END IF;
    RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_catalogo_propagar_nome() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_brands_propagar_nome ON public.product_brands;
CREATE TRIGGER trg_product_brands_propagar_nome
    AFTER UPDATE OF name ON public.product_brands
    FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
    EXECUTE FUNCTION public.fn_catalogo_propagar_nome();

DROP TRIGGER IF EXISTS trg_product_models_propagar_nome ON public.product_models;
CREATE TRIGGER trg_product_models_propagar_nome
    AFTER UPDATE OF name ON public.product_models
    FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
    EXECUTE FUNCTION public.fn_catalogo_propagar_nome();

NOTIFY pgrst, 'reload schema';
