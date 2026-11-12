-- ==========================================================================
-- Imovib: estrutura jurídica do estudo e sócios
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, itens 9.1 e 9.2.
--
-- Colunas novas em imovib_studies, opcionais (vazio = não informado):
--   legal_vehicle        'propria' (a própria incorporadora), 'spe' ou 'scp';
--   patrimonio_afetacao  incorporação submetida ao patrimônio de afetação. O motor
--                        lê: RET sem afetação gera aviso; com afetação, a devolução
--                        padrão no distrato (campo vazio) passa de 75% a 50%.
--
-- Tabela imovib_partners: sócios do estudo, com a participação no resultado
-- (share_percent) e nos aportes (capital_percent). company_partner_id guarda de
-- qual sócio da empresa veio a linha ("Importar os sócios da empresa"); o UNIQUE
-- faz o segundo clique não duplicar.
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): não há OR. As quatro policies usam
--      só imovib_unit_instance_org_check(study_id) — membro da organização DONA
--      do estudo, a mesma regra das outras tabelas filhas do Imovib. As colunas
--      novas herdam as policies de imovib_studies.
--   P2 (quem mais executa?): nenhuma função criada nem alterada; a de checagem já
--      existe e não tem EXECUTE para anon. Tabela: REVOKE de anon, GRANT só a
--      authenticated. A função do Portal do Investidor devolve a linha do estudo
--      com row_to_json(s): passam a sair as duas colunas (sem dado de pessoa); os
--      sócios ficam fora dela.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: DROP TABLE public.imovib_partners;
--           ALTER TABLE public.imovib_studies DROP COLUMN legal_vehicle, DROP COLUMN patrimonio_afetacao;

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS legal_vehicle text,
    ADD COLUMN IF NOT EXISTS patrimonio_afetacao boolean;

ALTER TABLE public.imovib_studies DROP CONSTRAINT IF EXISTS imovib_studies_legal_vehicle_check;
ALTER TABLE public.imovib_studies ADD CONSTRAINT imovib_studies_legal_vehicle_check
    CHECK (legal_vehicle IS NULL OR legal_vehicle IN ('propria', 'spe', 'scp'));

CREATE TABLE IF NOT EXISTS public.imovib_partners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    name text NOT NULL,
    share_percent numeric NOT NULL DEFAULT 0 CHECK (share_percent >= 0 AND share_percent <= 100),
    capital_percent numeric NOT NULL DEFAULT 0 CHECK (capital_percent >= 0 AND capital_percent <= 100),
    notes text,
    company_partner_id uuid REFERENCES public.company_partners(id) ON DELETE SET NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    CONSTRAINT imovib_partners_company_partner_unique UNIQUE (study_id, company_partner_id)
);

CREATE INDEX IF NOT EXISTS idx_imovib_partners_study ON public.imovib_partners(study_id);

ALTER TABLE public.imovib_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imovib_partners_select ON public.imovib_partners;
CREATE POLICY imovib_partners_select ON public.imovib_partners
    FOR SELECT TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_partners_insert ON public.imovib_partners;
CREATE POLICY imovib_partners_insert ON public.imovib_partners
    FOR INSERT TO authenticated
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_partners_update ON public.imovib_partners;
CREATE POLICY imovib_partners_update ON public.imovib_partners
    FOR UPDATE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id))
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_partners_delete ON public.imovib_partners;
CREATE POLICY imovib_partners_delete ON public.imovib_partners
    FOR DELETE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

REVOKE ALL ON TABLE public.imovib_partners FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imovib_partners TO authenticated;

COMMIT;
