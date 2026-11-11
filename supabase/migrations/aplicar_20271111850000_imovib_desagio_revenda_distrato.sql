-- ==========================================================================
-- Imovib: deságio da revenda da unidade distratada
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, Fase 1
-- (revisão). Decisão do usuário em 11/11/2026: a unidade distratada é
-- revendida com deságio editável (padrão 10%, em constants/imovibDefaults.ts)
-- e o distrato acontece no máximo nas chaves. Sem o deságio, a retenção de 25%
-- do que o comprador pagou fazia MAIS distrato dar MAIS lucro.
--
-- Uma coluna anulável em imovib_studies: vazio = padrão. O motor a lê
-- (CAMPOS_DO_MOTOR) e a listagem seleciona por nome: esta migration vai ao
-- banco ANTES do código (senão 42703).
--
-- REGRA #7
--   P1: nenhuma policy criada ou alterada; a coluna herda a RLS de imovib_studies.
--   P2: nenhuma função criada.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: ALTER TABLE public.imovib_studies DROP COLUMN cancellation_resale_discount_percent;

BEGIN;

ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS cancellation_resale_discount_percent numeric;

COMMENT ON COLUMN public.imovib_studies.cancellation_resale_discount_percent IS
    'Deságio da revenda da unidade distratada, % sobre o preço original. Vazio = padrão (10%).';

COMMIT;
