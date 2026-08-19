-- ============================================================================
-- Catálogo de "Características Adicionais" da unidade (aba nova em
-- Incorporação › Empreendimento, visível quando o TIPO do empreendimento tem
-- ao menos 1 característica aplicável).
--
-- Duas tabelas, mesmo par catálogo/valor de `empreendimento_types` +
-- `empreendimentos.tipo`, mas aqui o valor mora em tabela própria porque uma
-- unidade pode ter VÁRIOS valores por característica (Acessibilidade admite
-- Elevador + Rampas ao mesmo tempo — MULTI_SELECT) e o catálogo pode crescer
-- (3ª, 4ª, 10ª característica) sem migration nova.
--
-- `empreendimento_unit_characteristics` — o CATÁLOGO (o que existe, quais
--   opções, a quais tipos de empreendimento se aplica). Editável por
--   organização, sem noção de "tipo do sistema" (diferente de
--   empreendimento_types — aqui toda linha é da organização que criou).
--
-- `empreendimento_unit_characteristic_values` — o VALOR por unidade. Sempre
--   um array de texto (`values TEXT[]`): SELECT/TEXT/NUMBER usam 1 elemento,
--   MULTI_SELECT usa N. Um valor por (unidade, característica) — UNIQUE é o
--   onConflict do upsert da tela.
--
-- `applies_to_tipos TEXT[]` guarda SLUGS de `empreendimento_types` (vazio =
-- "todos os tipos"). É comparação de slug, não de motor_category: o usuário
-- decide "essa característica é do Edifício Comercial", não "é de tudo que o
-- motor de Áreas classifica como commercial" — dois Cond. Logístico e
-- Industrial caem no mesmo motor_category mas podem não querer as mesmas
-- características.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ, no SQL Editor do Supabase. O editor
--    roda o script inteiro como UMA transação: um erro no meio desfaz os
--    blocos anteriores — rodar bloco a bloco isola o problema.
-- ============================================================================

-- ═══ BLOCO 1 — catálogo ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.empreendimento_unit_characteristics (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    slug             TEXT NOT NULL,
    input_type       TEXT NOT NULL DEFAULT 'SELECT'
                         CHECK (input_type IN ('SELECT','MULTI_SELECT','TEXT','NUMBER','BOOLEAN')),
    -- [{ "value": "elevador", "label": "Elevador", "color": "blue" }, ...]
    -- Só usado por SELECT/MULTI_SELECT; TEXT/NUMBER/BOOLEAN ignoram.
    options          JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Slugs de empreendimento_types.slug. Vazio = aplica a QUALQUER tipo.
    applies_to_tipos TEXT[] NOT NULL DEFAULT '{}',
    active           BOOLEAN NOT NULL DEFAULT true,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT empr_unit_characteristics_slug_org_unique UNIQUE (organization_id, slug)
);

COMMENT ON TABLE public.empreendimento_unit_characteristics IS
  'Catálogo configurável de características adicionais de unidade (ex: Acessibilidade, '
  'Comunicação Visual). applies_to_tipos vazio = aplica a todo tipo de empreendimento.';

COMMENT ON COLUMN public.empreendimento_unit_characteristics.applies_to_tipos IS
  'Slugs de empreendimento_types.slug — não motor_category. Vazio = todos os tipos.';

CREATE INDEX IF NOT EXISTS idx_empr_unit_characteristics_org
    ON public.empreendimento_unit_characteristics(organization_id);

DROP TRIGGER IF EXISTS set_updated_at_empr_unit_characteristics ON public.empreendimento_unit_characteristics;
CREATE TRIGGER set_updated_at_empr_unit_characteristics BEFORE UPDATE ON public.empreendimento_unit_characteristics
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ BLOCO 2 — valores por unidade ══════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.empreendimento_unit_characteristic_values (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id            UUID NOT NULL,
    characteristic_id  UUID NOT NULL,

    -- Denormalizado pelo mesmo motivo de unit_occupancies.organization_id
    -- (aplicar_20270905000017): empreendimento_units não guarda organization_id
    -- direto — a org só existe dois hops acima (unit → tower → empreendimento).
    -- Sem esta coluna, toda leitura filtrada por organização vira join duplo.
    -- O trigger do BLOCO 5 é o que impede a denormalização de mentir.
    organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Sempre array: SELECT/TEXT/NUMBER usam 1 elemento, MULTI_SELECT usa N.
    -- Um único tipo de coluna para as duas formas evita duas tabelas de valor.
    values             TEXT[] NOT NULL DEFAULT '{}',

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT empr_unit_char_values_unit_char_unique UNIQUE (unit_id, characteristic_id)
);

COMMENT ON TABLE public.empreendimento_unit_characteristic_values IS
  'Valor de UMA característica em UMA unidade. UNIQUE(unit_id, characteristic_id) é o '
  'onConflict do upsert da tela — 1 linha por par, values guarda 1..N elementos.';

-- ═══ BLOCO 3 — chaves estrangeiras dos valores, sozinhas ═══════════════════
-- Separadas da criação da tabela: FK exige ShareRowExclusiveLock na tabela
-- REFERENCIADA, e empreendimento_units fica quente com o app aberto — mesma
-- família de cuidado de aplicar_20270905000017 BLOCO 4.
SET lock_timeout = '5s';

ALTER TABLE public.empreendimento_unit_characteristic_values
  DROP CONSTRAINT IF EXISTS empr_unit_char_values_unit_fk;
ALTER TABLE public.empreendimento_unit_characteristic_values
  ADD CONSTRAINT empr_unit_char_values_unit_fk
  FOREIGN KEY (unit_id) REFERENCES public.empreendimento_units(id) ON DELETE CASCADE;

ALTER TABLE public.empreendimento_unit_characteristic_values
  DROP CONSTRAINT IF EXISTS empr_unit_char_values_characteristic_fk;
ALTER TABLE public.empreendimento_unit_characteristic_values
  ADD CONSTRAINT empr_unit_char_values_characteristic_fk
  FOREIGN KEY (characteristic_id) REFERENCES public.empreendimento_unit_characteristics(id) ON DELETE CASCADE;

-- ═══ BLOCO 4 — índices e trigger de updated_at dos valores ══════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_empr_unit_char_values_unit
    ON public.empreendimento_unit_characteristic_values(unit_id);
CREATE INDEX IF NOT EXISTS idx_empr_unit_char_values_characteristic
    ON public.empreendimento_unit_characteristic_values(characteristic_id);
CREATE INDEX IF NOT EXISTS idx_empr_unit_char_values_org
    ON public.empreendimento_unit_characteristic_values(organization_id);

DROP TRIGGER IF EXISTS set_updated_at_empr_unit_char_values ON public.empreendimento_unit_characteristic_values;
CREATE TRIGGER set_updated_at_empr_unit_char_values BEFORE UPDATE ON public.empreendimento_unit_characteristic_values
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ BLOCO 5 — cascata de organização dos valores (herda do pai) ═══════════
-- Molde: fn_unit_occupancies_org (aplicar_20270905000017 BLOCO 6). A org NÃO
-- vem da tela: vem da unidade dona do valor. Divergência é erro, não silêncio.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_empr_unit_char_values_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_org_pai UUID;
BEGIN
    SELECT e.organization_id
      INTO v_org_pai
      FROM public.empreendimento_towers t
      JOIN public.empreendimentos e ON e.id = t.empreendimento_id
      JOIN public.empreendimento_units u ON u.tower_id = t.id
     WHERE u.id = NEW.unit_id;

    IF v_org_pai IS NULL THEN
        RAISE EXCEPTION 'Unidade % não tem empreendimento com organização definida.', NEW.unit_id;
    END IF;

    IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> v_org_pai THEN
        RAISE EXCEPTION
            'Valor na organização % mas a unidade % pertence à organização %. Filho herda a org do pai.',
            NEW.organization_id, NEW.unit_id, v_org_pai;
    END IF;

    NEW.organization_id := v_org_pai;
    RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_empr_unit_char_values_org() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_empr_unit_char_values_org ON public.empreendimento_unit_characteristic_values;
CREATE TRIGGER trg_empr_unit_char_values_org
    BEFORE INSERT OR UPDATE OF unit_id, organization_id ON public.empreendimento_unit_characteristic_values
    FOR EACH ROW EXECUTE FUNCTION public.fn_empr_unit_char_values_org();

-- ═══ BLOCO 6 — RLS do catálogo ══════════════════════════════════════════════
-- Sem policy para `anon` — tabela nasce do lado certo do rollout drop-anon
-- (ver 20270905000015 e vizinhas).
SET lock_timeout = '5s';

ALTER TABLE public.empreendimento_unit_characteristics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empr_unit_characteristics_org_read" ON public.empreendimento_unit_characteristics;
CREATE POLICY "empr_unit_characteristics_org_read" ON public.empreendimento_unit_characteristics
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "empr_unit_characteristics_org_insert" ON public.empreendimento_unit_characteristics;
CREATE POLICY "empr_unit_characteristics_org_insert" ON public.empreendimento_unit_characteristics
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "empr_unit_characteristics_org_update" ON public.empreendimento_unit_characteristics;
CREATE POLICY "empr_unit_characteristics_org_update" ON public.empreendimento_unit_characteristics
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "empr_unit_characteristics_org_delete" ON public.empreendimento_unit_characteristics;
CREATE POLICY "empr_unit_characteristics_org_delete" ON public.empreendimento_unit_characteristics
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON public.empreendimento_unit_characteristics FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empreendimento_unit_characteristics TO authenticated;

-- ═══ BLOCO 7 — RLS dos valores ══════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.empreendimento_unit_characteristic_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empr_unit_char_values_org_read" ON public.empreendimento_unit_characteristic_values;
CREATE POLICY "empr_unit_char_values_org_read" ON public.empreendimento_unit_characteristic_values
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "empr_unit_char_values_org_insert" ON public.empreendimento_unit_characteristic_values;
CREATE POLICY "empr_unit_char_values_org_insert" ON public.empreendimento_unit_characteristic_values
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "empr_unit_char_values_org_update" ON public.empreendimento_unit_characteristic_values;
CREATE POLICY "empr_unit_char_values_org_update" ON public.empreendimento_unit_characteristic_values
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "empr_unit_char_values_org_delete" ON public.empreendimento_unit_characteristic_values;
CREATE POLICY "empr_unit_char_values_org_delete" ON public.empreendimento_unit_characteristic_values
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON public.empreendimento_unit_characteristic_values FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empreendimento_unit_characteristic_values TO authenticated;

-- ═══ BLOCO 8 — seed: Acessibilidade + Comunicação Visual ═══════════════════
-- Uma linha por organização que já tem ao menos um tipo de empreendimento com
-- motor_category='commercial' visível (global ou próprio) — é isso que faz a
-- aba nascer aparecendo no Edifício Comercial existente sem precisar saber o
-- slug dele de antemão. Organização sem nenhum tipo comercial no catálogo não
-- ganha seed (nada para aplicar_to ainda) — o cadastro manual continua livre.
SET lock_timeout = '5s';

INSERT INTO public.empreendimento_unit_characteristics
    (organization_id, name, slug, input_type, options, applies_to_tipos, sort_order)
SELECT
    o.id,
    'Acessibilidade',
    'acessibilidade',
    'MULTI_SELECT',
    '[
        {"value":"elevador","label":"Elevador","color":"blue"},
        {"value":"rampas","label":"Rampas","color":"emerald"},
        {"value":"escada","label":"Escada","color":"gray"}
     ]'::jsonb,
    tipos.slugs,
    1
FROM public.organizations o
JOIN LATERAL (
    SELECT array_agg(DISTINCT t.slug) AS slugs
      FROM public.empreendimento_types t
     WHERE t.motor_category = 'commercial'
       AND t.active = true
       AND (t.organization_id IS NULL OR t.organization_id = o.id)
) tipos ON tipos.slugs IS NOT NULL
ON CONFLICT (organization_id, slug) DO NOTHING;

INSERT INTO public.empreendimento_unit_characteristics
    (organization_id, name, slug, input_type, options, applies_to_tipos, sort_order)
SELECT
    o.id,
    'Comunicação Visual',
    'comunicacao_visual',
    'SELECT',
    '[
        {"value":"espaco_compartilhado","label":"Espaço compartilhado","color":"amber"},
        {"value":"espaco_privativo","label":"Espaço privativo","color":"violet"},
        {"value":"sem_comunicacao_visual","label":"Sem comunicação visual","color":"gray"}
     ]'::jsonb,
    tipos.slugs,
    2
FROM public.organizations o
JOIN LATERAL (
    SELECT array_agg(DISTINCT t.slug) AS slugs
      FROM public.empreendimento_types t
     WHERE t.motor_category = 'commercial'
       AND t.active = true
       AND (t.organization_id IS NULL OR t.organization_id = o.id)
) tipos ON tipos.slugs IS NOT NULL
ON CONFLICT (organization_id, slug) DO NOTHING;

-- ═══ BLOCO 9 — conferência ═══════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabelas=2, com_rls=2, policies_catalogo=4, policies_valores=4,
--           anon_policies=0, fks=2, trigger_org=1, seed_acessibilidade>=1

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public'
      AND tablename IN ('empreendimento_unit_characteristics','empreendimento_unit_characteristic_values'))
                                                                                          AS tabelas,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public'
      AND tablename IN ('empreendimento_unit_characteristics','empreendimento_unit_characteristic_values')
      AND rowsecurity)                                                                  AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='empreendimento_unit_characteristics')      AS policies_catalogo,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='empreendimento_unit_characteristic_values')AS policies_valores,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('empreendimento_unit_characteristics','empreendimento_unit_characteristic_values')
      AND 'anon' = ANY(roles))                                                          AS anon_policies,
  (SELECT count(*) FROM pg_constraint
    WHERE conname IN ('empr_unit_char_values_unit_fk','empr_unit_char_values_characteristic_fk'))
                                                                                          AS fks,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname='trg_empr_unit_char_values_org')                                       AS trigger_org,
  (SELECT count(*) FROM public.empreendimento_unit_characteristics
    WHERE slug='acessibilidade')                                                        AS seed_acessibilidade;

-- FIM: aplicar_20270905000029_empreendimento_unit_characteristics.sql
