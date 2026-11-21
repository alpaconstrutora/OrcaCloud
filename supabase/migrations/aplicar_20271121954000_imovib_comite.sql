-- ==========================================================================
-- Imovib: Comitê & Gates mora no estudo, cada decisão ligada a uma VERSÃO
-- ==========================================================================
-- Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 1.5
-- (decisão D5 de 21/11/2026).
--
-- O comitê (6 gates: triagem → lançamento) era aba da Oportunidade
-- (investment_committee_decisions, por opportunity_id). Agora é aba "Comitê" do
-- estudo. Uma decisão que não seja "pendente" registra a versão congelada que o
-- comitê avaliou (os números que embasaram a decisão não mudam depois). O Parecer
-- do estudo continua sendo a recomendação do analista.
--
-- Quem decidiu e quando: o gatilho grava (auth.uid(), nome do membro, now()), como
-- o parecer (aplicar_20271112980000). A tela não manda esses campos.
--
-- investment_committee_decisions sai aqui, se vazia (0 linhas em 21/11/2026).
--
-- REGRA #7
--   P1: leitura = imovib_unit_instance_org_check(study_id) (a das tabelas filhas do
--       estudo). Escrita = o estudo é de uma org em que EU sou owner/admin
--       (minhas_orgs_gestor), o mesmo "só owner/admin decide gate" de antes. Sem OR.
--   P2: uma função de gatilho, SECURITY INVOKER (lê imovib_study_versions e
--       organization_members com a RLS de quem grava). Gatilho não se chama por
--       RPC; mesmo assim REVOKE EXECUTE de PUBLIC.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: DROP TABLE public.imovib_committee_decisions;
--   DROP FUNCTION public.fn_imovib_comite_preparar();
--   recriar investment_committee_decisions por 20270716000009_investment_committee_gates.sql.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.investment_committee_decisions') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.investment_committee_decisions) THEN
        RAISE EXCEPTION 'investment_committee_decisions tem linhas: migre para imovib_committee_decisions antes de apagar.';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.imovib_committee_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    -- Versão avaliada. RESTRICT: versão com decisão do comitê não se apaga.
    version_id uuid REFERENCES public.imovib_study_versions(id) ON DELETE RESTRICT,
    gate smallint NOT NULL CHECK (gate BETWEEN 1 AND 6),
    -- 1 Triagem, 2 Viabilidade preliminar, 3 Negociação, 4 Aquisição, 5 Desenvolvimento, 6 Lançamento
    decision text NOT NULL DEFAULT 'pendente'
        CHECK (decision IN ('pendente', 'aprovado', 'aprovado_condicionantes', 'reprovado', 'devolvido', 'suspenso', 'arquivado')),
    condicionantes text,
    parecer text,
    decided_by uuid,
    decided_by_nome text,
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (study_id, gate),
    CONSTRAINT imovib_committee_decisao_com_versao CHECK (decision = 'pendente' OR version_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_imovib_committee_study ON public.imovib_committee_decisions(study_id);
CREATE INDEX IF NOT EXISTS idx_imovib_committee_version ON public.imovib_committee_decisions(version_id);

CREATE OR REPLACE FUNCTION public.fn_imovib_comite_preparar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
    v_org  uuid;
    v_nome text;
BEGIN
    IF NEW.version_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.imovib_study_versions v WHERE v.id = NEW.version_id AND v.study_id = NEW.study_id
    ) THEN
        RAISE EXCEPTION 'A versão escolhida não é deste estudo.' USING ERRCODE = '23514';
    END IF;

    NEW.updated_at := now();

    -- Quem decidiu e quando: só quando a decisão muda (ou nasce já decidida).
    IF TG_OP = 'INSERT' OR NEW.decision IS DISTINCT FROM OLD.decision OR NEW.version_id IS DISTINCT FROM OLD.version_id THEN
        IF NEW.decision = 'pendente' THEN
            NEW.decided_by := NULL;
            NEW.decided_by_nome := NULL;
            NEW.decided_at := NULL;
        ELSE
            SELECT s.organization_id INTO v_org FROM public.imovib_studies s WHERE s.id = NEW.study_id;
            SELECT COALESCE(NULLIF(trim(om.name), ''), NULLIF(trim(om.email), ''))
              INTO v_nome
              FROM public.organization_members om
             WHERE om.user_id = auth.uid() AND om.organization_id = v_org
             LIMIT 1;
            NEW.decided_by := auth.uid();
            NEW.decided_by_nome := v_nome;
            NEW.decided_at := now();
        END IF;
    ELSE
        -- Ninguém reescreve o autor de uma decisão que não mudou.
        NEW.decided_by := OLD.decided_by;
        NEW.decided_by_nome := OLD.decided_by_nome;
        NEW.decided_at := OLD.decided_at;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_imovib_comite_preparar() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_imovib_comite_preparar ON public.imovib_committee_decisions;
CREATE TRIGGER trg_imovib_comite_preparar
    BEFORE INSERT OR UPDATE ON public.imovib_committee_decisions
    FOR EACH ROW EXECUTE FUNCTION public.fn_imovib_comite_preparar();

ALTER TABLE public.imovib_committee_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imovib_committee_select ON public.imovib_committee_decisions;
CREATE POLICY imovib_committee_select ON public.imovib_committee_decisions
    FOR SELECT TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_committee_insert ON public.imovib_committee_decisions;
CREATE POLICY imovib_committee_insert ON public.imovib_committee_decisions
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.imovib_studies s
                        WHERE s.id = study_id AND s.organization_id IN (SELECT public.minhas_orgs_gestor())));

DROP POLICY IF EXISTS imovib_committee_update ON public.imovib_committee_decisions;
CREATE POLICY imovib_committee_update ON public.imovib_committee_decisions
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.imovib_studies s
                   WHERE s.id = study_id AND s.organization_id IN (SELECT public.minhas_orgs_gestor())))
    WITH CHECK (EXISTS (SELECT 1 FROM public.imovib_studies s
                        WHERE s.id = study_id AND s.organization_id IN (SELECT public.minhas_orgs_gestor())));

DROP POLICY IF EXISTS imovib_committee_delete ON public.imovib_committee_decisions;
CREATE POLICY imovib_committee_delete ON public.imovib_committee_decisions
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.imovib_studies s
                   WHERE s.id = study_id AND s.organization_id IN (SELECT public.minhas_orgs_gestor())));

REVOKE ALL ON TABLE public.imovib_committee_decisions FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.imovib_committee_decisions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imovib_committee_decisions TO authenticated;

DROP TABLE IF EXISTS public.investment_committee_decisions;

COMMIT;
