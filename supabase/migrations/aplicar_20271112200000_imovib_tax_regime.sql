-- ==========================================================================
-- Imovib: regime tributário do estudo e as alíquotas da hipótese
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, item 6.2
-- (decisão D4 de 11/11/2026: padrões do plano, editáveis por estudo, com aviso de
-- confirmar com a contabilidade).
--
-- Colunas novas em imovib_studies, opcionais:
--   tax_regime      'manual' (vazio = manual: o cálculo de antes — rubricas da
--                   categoria 7 ou o imposto da Dinâmica), 'ret', 'ret_his',
--                   'presumido' ou 'real';
--   tax_hypotheses  alíquotas da hipótese, ex. {"retPct": 4, "presumidoPct": 6.73};
--                   chave ausente = padrão de constants/imovibDefaults.ts
--                   (HIPOTESES_TRIBUTARIAS).
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): nenhuma policy criada nem alterada;
--      as colunas herdam as policies de imovib_studies.
--   P2 (quem mais executa?): nenhuma função criada nem alterada. A função do
--      Portal do Investidor devolve a linha inteira com row_to_json(s): as
--      colunas novas saem nela para quem tem link válido de oportunidade
--      publicada — premissas do mesmo estudo que o portal já calcula.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: ALTER TABLE public.imovib_studies DROP COLUMN tax_regime, DROP COLUMN tax_hypotheses;

BEGIN;

ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS tax_regime text,
    ADD COLUMN IF NOT EXISTS tax_hypotheses jsonb;

ALTER TABLE public.imovib_studies DROP CONSTRAINT IF EXISTS imovib_studies_tax_regime_check;
ALTER TABLE public.imovib_studies ADD CONSTRAINT imovib_studies_tax_regime_check
    CHECK (tax_regime IS NULL OR tax_regime IN ('manual', 'ret', 'ret_his', 'presumido', 'real'));

COMMIT;
