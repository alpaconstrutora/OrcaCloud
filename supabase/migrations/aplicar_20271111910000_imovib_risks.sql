-- ==========================================================================
-- Imovib: matriz de riscos do estudo
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, item 3.5.
--
-- Um risco por linha: categoria, descrição, probabilidade e impacto de 1 a 5,
-- mitigação, responsável e situação. O texto livre que já existe
-- (imovib_studies.swot_analysis.risks) continua como "Notas gerais de risco",
-- sem conversão.
--
-- REGRA #7
--   P1: não há OR; as quatro policies usam só imovib_unit_instance_org_check(study_id).
--   P2: nenhuma função criada. Tabela: REVOKE de anon, GRANT só a authenticated.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: DROP TABLE public.imovib_risks;

BEGIN;

CREATE TABLE IF NOT EXISTS public.imovib_risks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    category text NOT NULL DEFAULT 'outro'
        CHECK (category IN ('legal', 'mercado', 'construcao', 'financeiro', 'ambiental', 'outro')),
    description text NOT NULL,
    probability smallint NOT NULL DEFAULT 3 CHECK (probability BETWEEN 1 AND 5),
    impact smallint NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
    mitigation text,
    owner text,
    status text NOT NULL DEFAULT 'aberto'
        CHECK (status IN ('aberto', 'mitigado', 'aceito', 'encerrado')),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_imovib_risks_study ON public.imovib_risks(study_id);

ALTER TABLE public.imovib_risks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imovib_risks_select ON public.imovib_risks;
CREATE POLICY imovib_risks_select ON public.imovib_risks
    FOR SELECT TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_risks_insert ON public.imovib_risks;
CREATE POLICY imovib_risks_insert ON public.imovib_risks
    FOR INSERT TO authenticated
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_risks_update ON public.imovib_risks;
CREATE POLICY imovib_risks_update ON public.imovib_risks
    FOR UPDATE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id))
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_risks_delete ON public.imovib_risks;
CREATE POLICY imovib_risks_delete ON public.imovib_risks
    FOR DELETE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

REVOKE ALL ON TABLE public.imovib_risks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imovib_risks TO authenticated;

COMMIT;
