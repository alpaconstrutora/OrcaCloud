-- ════════════════════════════════════════════════════════════════════════════
-- EQUIVALÊNCIA DE UNIDADES POR ITEM (21/11/2026)
-- Plano: docs/planos/2026-11-21-equivalencia-unidades.md
--
-- "o item 32, ACO CA-50, 6,3 MM, VERGALHAO com unidade KG, porem ele pode ser
--  por m (metro)". Cadastro GLOBAL (vale para todas as organizações), mantido
-- pelo superadministrador da plataforma.
--
-- Sentido do fator: 1 `unidade` = `fator` × `unidade_base`  (1 M = 0,245 KG).
-- `unidade_base` é a unidade do item NO MOMENTO do cadastro: o app só aplica a
-- linha se a unidade atual do item (normalizada) for igual a ela — item que
-- mudou de unidade entre competências fica sem conversão, nunca com a errada.
--
-- REGRA #7, pergunta 1: SELECT libera qualquer autenticado SOZINHO — de
-- propósito, o cadastro é global e não tem dado de organização (só código de
-- item, unidades e fator). Escrita: só `is_superadmin()`.
-- Pergunta 2: nenhuma função nova (o gatilho usa `update_updated_at_column`).
--
-- Aplicar: npx supabase db query --linked -f <este arquivo>   (nunca db push)
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.item_unit_equivalences (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code    text NOT NULL CHECK (btrim(item_code) <> ''),
    unidade_base text NOT NULL CHECK (unidade_base ~ '^[A-Z0-9]{1,10}$'),
    unidade      text NOT NULL CHECK (unidade ~ '^[A-Z0-9]{1,10}$'),
    fator        numeric(20,10) NOT NULL CHECK (fator > 0),
    observacao   text,
    created_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT item_unit_equivalences_difere CHECK (unidade <> unidade_base),
    CONSTRAINT item_unit_equivalences_unica UNIQUE (item_code, unidade_base, unidade)
);

COMMENT ON TABLE public.item_unit_equivalences IS
    'Equivalência GLOBAL de unidades por item (SINAPI/base própria): 1 unidade = fator × unidade_base. '
    'Vale só quando a unidade atual do item = unidade_base. Escrita: superadmin. Plano 2026-11-21-equivalencia-unidades.';

DROP TRIGGER IF EXISTS trg_item_unit_equivalences_updated_at ON public.item_unit_equivalences;
CREATE TRIGGER trg_item_unit_equivalences_updated_at
    BEFORE UPDATE ON public.item_unit_equivalences
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.item_unit_equivalences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_unit_eq_select ON public.item_unit_equivalences;
CREATE POLICY item_unit_eq_select ON public.item_unit_equivalences
    FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS item_unit_eq_insert_superadmin ON public.item_unit_equivalences;
CREATE POLICY item_unit_eq_insert_superadmin ON public.item_unit_equivalences
    FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS item_unit_eq_update_superadmin ON public.item_unit_equivalences;
CREATE POLICY item_unit_eq_update_superadmin ON public.item_unit_equivalences
    FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS item_unit_eq_delete_superadmin ON public.item_unit_equivalences;
CREATE POLICY item_unit_eq_delete_superadmin ON public.item_unit_equivalences
    FOR DELETE TO authenticated USING (public.is_superadmin());

REVOKE ALL ON TABLE public.item_unit_equivalences FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.item_unit_equivalences FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.item_unit_equivalences TO authenticated;

-- ── SEED: vergalhões SINAPI de bitola ÚNICA ───────────────────────────────────
-- Massa nominal NBR 7480 = 0,006165 × d² kg/m (a mesma `theoreticalLinearWeight`
-- de utils/rebarEngine.ts), barra de 12 m. Código que cita várias bitolas
-- ("12,5 MM OU 16,0 MM") tem kg/m ambíguo e fica de fora.
WITH vergalhoes AS (
    SELECT DISTINCT ON (s.code) s.code, s.description, s.unit
      FROM public.sinapi_items s
     WHERE s.description ILIKE 'A_O CA-%VERGALH_O%'
     ORDER BY s.code, s.reference_date DESC
), lidos AS (
    SELECT v.code,
           replace(substring(v.description FROM '([0-9]+(,[0-9]+)?) ?MM'), ',', '.')::numeric AS bitola
      FROM vergalhoes v
     WHERE upper(btrim(v.unit)) = 'KG'
       AND v.description !~* '\mOU\M'
), pesos AS (
    SELECT code, round(0.006165 * bitola * bitola, 3) AS kg_m
      FROM lidos
     WHERE bitola IS NOT NULL
)
INSERT INTO public.item_unit_equivalences (item_code, unidade_base, unidade, fator, observacao, created_by)
SELECT code, 'KG', 'M', kg_m, 'Massa nominal NBR 7480', NULL::uuid FROM pesos
UNION ALL
SELECT code, 'KG', 'BR', round(kg_m * 12, 4), 'Barra de 12 m — massa nominal NBR 7480', NULL::uuid FROM pesos
ON CONFLICT (item_code, unidade_base, unidade) DO NOTHING;
