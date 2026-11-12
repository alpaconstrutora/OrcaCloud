-- ==========================================================================
-- Imovib: estudo de mercado de origem (Ópura Market) e origem da VSO da região
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, itens 7.2 e 7.3.
--
-- Colunas novas em imovib_studies, opcionais:
--   opura_terrain_study_id  estudo de terreno do Ópura Market de onde a
--                           viabilidade nasceu (gravado na criação, quando o
--                           estudo de terreno já está salvo); apagar o estudo de
--                           terreno deixa o campo vazio;
--   vso_regional_source     de onde veio a VSO da região: 'digitada',
--                           'comparaveis' ou 'market' (vazio = digitada).
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): nenhuma policy criada nem alterada;
--      as colunas herdam as policies de imovib_studies. A FK não abre leitura do
--      estudo de terreno: quem lê segue as policies de opura_market_terrain_studies.
--   P2 (quem mais executa?): nenhuma função criada nem alterada. A função do
--      Portal do Investidor devolve a linha com row_to_json(s): sai o uuid do
--      estudo de terreno (sem os dados dele) e a origem da VSO.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: ALTER TABLE public.imovib_studies DROP COLUMN opura_terrain_study_id, DROP COLUMN vso_regional_source;

BEGIN;

ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS opura_terrain_study_id uuid
        REFERENCES public.opura_market_terrain_studies(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS vso_regional_source text;

ALTER TABLE public.imovib_studies DROP CONSTRAINT IF EXISTS imovib_studies_vso_regional_source_check;
ALTER TABLE public.imovib_studies ADD CONSTRAINT imovib_studies_vso_regional_source_check
    CHECK (vso_regional_source IS NULL OR vso_regional_source IN ('digitada', 'comparaveis', 'market'));

CREATE INDEX IF NOT EXISTS idx_imovib_studies_opura_terrain_study ON public.imovib_studies(opura_terrain_study_id);

COMMIT;
