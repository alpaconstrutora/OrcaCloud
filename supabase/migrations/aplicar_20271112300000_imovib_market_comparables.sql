-- ==========================================================================
-- Imovib: comparáveis de mercado do estudo
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, item 7.1.
--
-- Um comparável é um empreendimento concorrente: preço/m², unidades totais e
-- vendidas, data de lançamento. O resumo (preço médio ponderado, VSO média) é
-- utils/imovibMercado.ts.
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): não há OR. As quatro policies usam
--      só imovib_unit_instance_org_check(study_id) — membro da organização DONA
--      do estudo, a mesma regra das outras tabelas filhas do Imovib.
--   P2 (quem mais executa?): nenhuma função criada; a de checagem já existe e
--      não tem EXECUTE para anon. Tabela: REVOKE de anon, GRANT só a authenticated.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: DROP TABLE public.imovib_market_comparables;

BEGIN;

CREATE TABLE IF NOT EXISTS public.imovib_market_comparables (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    name text NOT NULL,
    developer text,
    address text,
    distance_km numeric CHECK (distance_km IS NULL OR distance_km >= 0),
    launch_date date,
    total_units integer CHECK (total_units IS NULL OR total_units >= 0),
    sold_units integer CHECK (sold_units IS NULL OR sold_units >= 0),
    typical_area numeric CHECK (typical_area IS NULL OR typical_area >= 0),
    price_sqm numeric CHECK (price_sqm IS NULL OR price_sqm >= 0),
    ticket numeric CHECK (ticket IS NULL OR ticket >= 0),
    source text,
    collected_at date,
    notes text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_imovib_market_comparables_study ON public.imovib_market_comparables(study_id);

ALTER TABLE public.imovib_market_comparables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imovib_market_comparables_select ON public.imovib_market_comparables;
CREATE POLICY imovib_market_comparables_select ON public.imovib_market_comparables
    FOR SELECT TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_market_comparables_insert ON public.imovib_market_comparables;
CREATE POLICY imovib_market_comparables_insert ON public.imovib_market_comparables
    FOR INSERT TO authenticated
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_market_comparables_update ON public.imovib_market_comparables;
CREATE POLICY imovib_market_comparables_update ON public.imovib_market_comparables
    FOR UPDATE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id))
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_market_comparables_delete ON public.imovib_market_comparables;
CREATE POLICY imovib_market_comparables_delete ON public.imovib_market_comparables
    FOR DELETE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

REVOKE ALL ON TABLE public.imovib_market_comparables FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imovib_market_comparables TO authenticated;

COMMIT;
