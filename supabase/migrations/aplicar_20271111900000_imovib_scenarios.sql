-- ==========================================================================
-- Imovib: cenários salvos do estudo (pessimista, otimista, personalizados)
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, item 3.3.
--
-- Um cenário é um conjunto de choques sobre as premissas do estudo (mesmas
-- variáveis do tornado: preço, custo de obra, terreno, prazos, juros, índice da
-- obra, distrato), guardado em `choques` (jsonb, {variavel: delta}). O cenário
-- Base é o próprio estudo e não é gravado. UNIQUE (study_id, name): clicar duas
-- vezes em "Criar cenários padrão" não duplica.
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): não há OR. As quatro policies usam
--      só imovib_unit_instance_org_check(study_id) — membro da organização DONA
--      do estudo, a mesma regra de imovib_unit_instances.
--   P2 (quem mais executa?): nenhuma função criada; a de checagem já existe e
--      não tem EXECUTE para anon. Tabela: REVOKE de anon, GRANT só a authenticated.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: DROP TABLE public.imovib_scenarios;

BEGIN;

CREATE TABLE IF NOT EXISTS public.imovib_scenarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    name text NOT NULL,
    kind text NOT NULL DEFAULT 'personalizado'
        CHECK (kind IN ('pessimista', 'otimista', 'personalizado')),
    choques jsonb NOT NULL DEFAULT '{}'::jsonb,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    CONSTRAINT imovib_scenarios_study_name_key UNIQUE (study_id, name)
);

CREATE INDEX IF NOT EXISTS idx_imovib_scenarios_study ON public.imovib_scenarios(study_id);

ALTER TABLE public.imovib_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imovib_scenarios_select ON public.imovib_scenarios;
CREATE POLICY imovib_scenarios_select ON public.imovib_scenarios
    FOR SELECT TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_scenarios_insert ON public.imovib_scenarios;
CREATE POLICY imovib_scenarios_insert ON public.imovib_scenarios
    FOR INSERT TO authenticated
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_scenarios_update ON public.imovib_scenarios;
CREATE POLICY imovib_scenarios_update ON public.imovib_scenarios
    FOR UPDATE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id))
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_scenarios_delete ON public.imovib_scenarios;
CREATE POLICY imovib_scenarios_delete ON public.imovib_scenarios
    FOR DELETE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

REVOKE ALL ON TABLE public.imovib_scenarios FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imovib_scenarios TO authenticated;

COMMIT;
