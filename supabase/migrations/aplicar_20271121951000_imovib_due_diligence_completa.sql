-- ==========================================================================
-- Imovib: due diligence do terreno completa (recebe o que a Oportunidade tinha)
-- ==========================================================================
-- Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 1.2.
--
-- A due diligence do NEGÓCIO mora no estudo (decisão D1 de 21/11/2026). A da
-- Oportunidade (due_diligence_items) tinha criticidade, responsável, prazo e a
-- proveniência da leitura de matrícula por IA; os 14 itens fixos do Imovib não.
-- due_diligence_items sai na Fase 2 (item 2.7), depois de recontada (0 linhas em 21/11).
--
-- A criticidade é o que trava gate do comitê (item 1.5): alta/crítica sem "ok"
-- nem "não se aplica" trava. Padrão 'media' para os itens que já existem.
-- Quem conferiu e quando continua só pelo gatilho de aplicar_20271113150000.
--
-- REGRA #7
--   P1: nenhuma policy criada ou alterada.
--   P2: nenhuma função criada.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter:
--   ALTER TABLE imovib_land_checklist DROP COLUMN criticidade, DROP COLUMN responsavel, DROP COLUMN prazo,
--       DROP COLUMN ai_extracted, DROP COLUMN ai_confidence, DROP COLUMN ai_source_excerpt, DROP COLUMN ai_extracted_at;

BEGIN;

ALTER TABLE public.imovib_land_checklist
    ADD COLUMN IF NOT EXISTS criticidade text NOT NULL DEFAULT 'media',
    ADD COLUMN IF NOT EXISTS responsavel text,
    ADD COLUMN IF NOT EXISTS prazo date,
    ADD COLUMN IF NOT EXISTS ai_extracted boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ai_confidence numeric,
    ADD COLUMN IF NOT EXISTS ai_source_excerpt text,
    ADD COLUMN IF NOT EXISTS ai_extracted_at timestamptz;

ALTER TABLE public.imovib_land_checklist DROP CONSTRAINT IF EXISTS imovib_land_checklist_criticidade_check;
ALTER TABLE public.imovib_land_checklist ADD CONSTRAINT imovib_land_checklist_criticidade_check
    CHECK (criticidade IN ('baixa', 'media', 'alta', 'critica'));

ALTER TABLE public.imovib_land_checklist DROP CONSTRAINT IF EXISTS imovib_land_checklist_ai_confidence_check;
ALTER TABLE public.imovib_land_checklist ADD CONSTRAINT imovib_land_checklist_ai_confidence_check
    CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1));

COMMIT;
