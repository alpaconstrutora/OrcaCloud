-- ==========================================================================
-- Imovib: matriz de riscos completa (recebe o que a Oportunidade tinha)
-- ==========================================================================
-- Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 1.1.
--
-- O risco do NEGÓCIO mora no estudo (decisão D1 de 21/11/2026). A aba Riscos da
-- Oportunidade (opportunity_risks) tinha campos que o Imovib não tinha: causa,
-- consequência, tendência, contingência, prazo, 13 categorias e as situações
-- "em mitigação" e "materializado". Esta migration os traz para imovib_risks;
-- opportunity_risks sai na Fase 2 (item 2.7), depois de recontada (0 linhas em 21/11).
--
-- Categoria: 'legal' vira 'juridico' (mesmo significado). Versões congeladas
-- antigas continuariam com 'legal' no snapshot; em 21/11 as 2 versões têm 0 riscos, então a
-- restauração (fn_imovib_substituir_filhos) nunca reinsere 'legal'. O relatório rotula as duas.
--
-- REGRA #7
--   P1: nenhuma policy criada ou alterada.
--   P2: nenhuma função criada.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter (linhas com valor novo voltam ao mais próximo do conjunto antigo):
--   ALTER TABLE imovib_risks DROP CONSTRAINT imovib_risks_category_check, DROP CONSTRAINT imovib_risks_status_check,
--       DROP CONSTRAINT imovib_risks_tendencia_check;
--   UPDATE imovib_risks SET category='legal' WHERE category IN ('juridico','fundiario','urbanistico','tributario','societario');
--   UPDATE imovib_risks SET category='mercado' WHERE category IN ('vendas','reputacional');
--   UPDATE imovib_risks SET category='construcao' WHERE category IN ('tecnico','prazo');
--   UPDATE imovib_risks SET status='aberto' WHERE status IN ('em_mitigacao','materializado');
--   (recriar as duas CHECKs antigas de aplicar_20271111910000)
--   ALTER TABLE imovib_risks DROP COLUMN causa, DROP COLUMN consequencia, DROP COLUMN tendencia,
--       DROP COLUMN contingencia, DROP COLUMN prazo;

BEGIN;

ALTER TABLE public.imovib_risks
    ADD COLUMN IF NOT EXISTS causa text,
    ADD COLUMN IF NOT EXISTS consequencia text,
    ADD COLUMN IF NOT EXISTS tendencia text,
    ADD COLUMN IF NOT EXISTS contingencia text,
    ADD COLUMN IF NOT EXISTS prazo date;

ALTER TABLE public.imovib_risks DROP CONSTRAINT IF EXISTS imovib_risks_category_check;
UPDATE public.imovib_risks SET category = 'juridico' WHERE category = 'legal';
ALTER TABLE public.imovib_risks ADD CONSTRAINT imovib_risks_category_check
    CHECK (category IN ('fundiario', 'juridico', 'ambiental', 'urbanistico', 'tecnico', 'mercado', 'financeiro',
                        'tributario', 'societario', 'reputacional', 'prazo', 'vendas', 'construcao', 'outro'));

ALTER TABLE public.imovib_risks DROP CONSTRAINT IF EXISTS imovib_risks_status_check;
ALTER TABLE public.imovib_risks ADD CONSTRAINT imovib_risks_status_check
    CHECK (status IN ('aberto', 'em_mitigacao', 'mitigado', 'aceito', 'materializado', 'encerrado'));

ALTER TABLE public.imovib_risks DROP CONSTRAINT IF EXISTS imovib_risks_tendencia_check;
ALTER TABLE public.imovib_risks ADD CONSTRAINT imovib_risks_tendencia_check
    CHECK (tendencia IS NULL OR tendencia IN ('subindo', 'estavel', 'descendo'));

COMMIT;
