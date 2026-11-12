-- ==========================================================================
-- Imovib: due diligence do terreno (checklist por estudo)
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, item 5.9.
--
-- Os 14 itens nascem pelo botão "Criar checklist" (constants/imovibDueDiligence.ts),
-- nunca ao abrir a aba. UNIQUE (study_id, item_key): clicar duas vezes não duplica.
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): não há OR. As quatro policies usam
--      só imovib_unit_instance_org_check(study_id) — membro da organização DONA
--      do estudo, a mesma regra de imovib_scenarios, imovib_risks e
--      imovib_funding_sources.
--   P2 (quem mais executa?): nenhuma função criada; a de checagem já existe e
--      não tem EXECUTE para anon. Tabela: REVOKE de anon, GRANT só a authenticated.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: DROP TABLE public.imovib_land_checklist;

BEGIN;

CREATE TABLE IF NOT EXISTS public.imovib_land_checklist (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    item_key text NOT NULL,
    label text NOT NULL,
    status text NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'ok', 'problema', 'nao_se_aplica')),
    notes text,
    sort_order integer NOT NULL DEFAULT 0,
    checked_at timestamptz,
    checked_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT imovib_land_checklist_study_item_key UNIQUE (study_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_imovib_land_checklist_study ON public.imovib_land_checklist(study_id);

ALTER TABLE public.imovib_land_checklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imovib_land_checklist_select ON public.imovib_land_checklist;
CREATE POLICY imovib_land_checklist_select ON public.imovib_land_checklist
    FOR SELECT TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_land_checklist_insert ON public.imovib_land_checklist;
CREATE POLICY imovib_land_checklist_insert ON public.imovib_land_checklist
    FOR INSERT TO authenticated
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_land_checklist_update ON public.imovib_land_checklist;
CREATE POLICY imovib_land_checklist_update ON public.imovib_land_checklist
    FOR UPDATE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id))
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_land_checklist_delete ON public.imovib_land_checklist;
CREATE POLICY imovib_land_checklist_delete ON public.imovib_land_checklist
    FOR DELETE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

REVOKE ALL ON TABLE public.imovib_land_checklist FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imovib_land_checklist TO authenticated;

COMMIT;
