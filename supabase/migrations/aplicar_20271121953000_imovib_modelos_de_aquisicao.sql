-- ==========================================================================
-- Imovib: modelos de aquisição do terreno moram no estudo
-- ==========================================================================
-- Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 1.4.
--
-- "Modelos de Aquisição" era aba da Oportunidade (land_deal_scenarios, por
-- opportunity_id) e calculava fora do motor (diferença do terreno no mês 0, VPL a
-- 1% a.m. fixo). Agora é cartão de Premissas › Terreno do estudo e o cálculo é do
-- motor (utils/imovibModelosDeAquisicao.ts). A tabela guarda só as PREMISSAS de cada
-- modelo; VPL/TIR/exposição são recalculados na tela (não ficam velhos no banco).
--
-- land_deal_scenarios sai aqui, se vazia (0 linhas em 21/11/2026). Com linha, a
-- migration PARA: migrar antes, à mão, pelo imovib_study_id da oportunidade.
--
-- REGRA #7
--   P1: as quatro policies usam só imovib_unit_instance_org_check(study_id), sem OR
--       (a mesma checagem das outras tabelas filhas do estudo).
--   P2: nenhuma função criada. Tabela: REVOKE de anon (e TRUNCATE de authenticated,
--       que o default privilege dá), GRANT só do necessário a authenticated.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: DROP TABLE public.imovib_land_deals; recriar land_deal_scenarios por
--   20270716000008_land_deal_scenarios.sql.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.land_deal_scenarios') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.land_deal_scenarios) THEN
        RAISE EXCEPTION 'land_deal_scenarios tem linhas: migre para imovib_land_deals antes de apagar.';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.imovib_land_deals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    name text NOT NULL,
    deal_type text NOT NULL
        CHECK (deal_type IN ('compra_direta', 'permuta_fisica', 'permuta_financeira', 'opcao_compra', 'sociedade')),
    premises_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_imovib_land_deals_study ON public.imovib_land_deals(study_id);

ALTER TABLE public.imovib_land_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imovib_land_deals_select ON public.imovib_land_deals;
CREATE POLICY imovib_land_deals_select ON public.imovib_land_deals
    FOR SELECT TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_land_deals_insert ON public.imovib_land_deals;
CREATE POLICY imovib_land_deals_insert ON public.imovib_land_deals
    FOR INSERT TO authenticated
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_land_deals_update ON public.imovib_land_deals;
CREATE POLICY imovib_land_deals_update ON public.imovib_land_deals
    FOR UPDATE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id))
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_land_deals_delete ON public.imovib_land_deals;
CREATE POLICY imovib_land_deals_delete ON public.imovib_land_deals
    FOR DELETE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

REVOKE ALL ON TABLE public.imovib_land_deals FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.imovib_land_deals FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imovib_land_deals TO authenticated;

DROP TABLE IF EXISTS public.land_deal_scenarios;

COMMIT;
