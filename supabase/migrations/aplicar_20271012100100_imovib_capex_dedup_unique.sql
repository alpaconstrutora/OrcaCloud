-- ============================================================================
-- Estudos de Viabilidade (Imovib) — fim da duplicação do CAPEX + regime tributário
-- Plano: docs/planos/2026-10-12-imovib-viabilidade-correcoes.md, itens 2.3 e 2.6
--
-- Situação medida em 2026-10-12: 218 linhas para 109 rubricas distintas — os 4
-- estudos com TODO o template em dobro. Causa: o "busca ou cria" do
-- ImovibCapexForm rodava 2× (React.StrictMode) sem trava no banco.
--
-- Decisões do usuário (2026-10-12; os 4 estudos são de teste):
--   D2 — apagar as duplicatas, guardando cópia numa tabela de reversão.
--   D3 — regime NORMAL: "PIS/COFINS/IRPJ/CSLL (Normal)" fica; RET vai a 0.
--
-- Qual cópia fica: a criada PRIMEIRO. Nenhuma rubrica foi editada depois de
-- criada (updated_at = created_at em todas — a tabela não tem trigger de
-- updated_at), e nos 3 pares com valor divergente quem tem o valor fora do
-- template é sempre a mais antiga:
--   Bruninho · ITBI na Aquisição               4%  (template 3%)
--   Bruninho · Comissão Imobiliária (Terreno)  4%  (template 6%)
--   Córrego do Bom Jesus · Projeto Arquitetônico  R$ 60.000 (template 0)
--
-- "Juros SFH / Construção" sai: os juros vêm do financiamento (Receitas &
-- Capital), e a rubrica contaria duas vezes. Valor 0 nos 4 estudos.
--
-- REGRA #7: não cria policy nem função. A tabela de reversão fica com RLS
-- ligada e SEM policy (mesmo padrão de boleto_backfill_competencia_20270924):
-- ninguém lê pela API; só conexão administrativa.
--
-- ⚠️ NÃO apagar public.imovib_capex_items_reversao_20271012 — é o único
-- registro das linhas removidas/alteradas. Script de volta no fim do arquivo.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (nunca db push)
-- ============================================================================

BEGIN;

-- 1) Tabela de reversão --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.imovib_capex_items_reversao_20271012 (
    acao        text        NOT NULL,           -- 'apagada' | 'alterada'
    motivo      text        NOT NULL,
    registrado_em timestamptz NOT NULL DEFAULT now(),
    id          uuid        NOT NULL,
    study_id    uuid        NOT NULL,
    category    varchar     NOT NULL,
    subcategory varchar,
    name        text        NOT NULL,
    value_type  varchar     NOT NULL,
    value       numeric     NOT NULL,
    base        text,
    created_at  timestamptz,
    updated_at  timestamptz
);
ALTER TABLE public.imovib_capex_items_reversao_20271012 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imovib_capex_items_reversao_20271012 FROM anon, authenticated;

-- 2) Duplicatas: guarda e apaga todas menos a criada primeiro -------------------
CREATE TEMP TABLE _dup ON COMMIT DROP AS
SELECT id FROM (
    SELECT id, row_number() OVER (
        PARTITION BY study_id, category, name
        ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
    FROM public.imovib_capex_items
) x WHERE rn > 1;

INSERT INTO public.imovib_capex_items_reversao_20271012
    (acao, motivo, id, study_id, category, subcategory, name, value_type, value, base, created_at, updated_at)
SELECT 'apagada', 'duplicata do seed do template (fica a cópia criada primeiro)',
       c.id, c.study_id, c.category, c.subcategory, c.name, c.value_type, c.value, c.base, c.created_at, c.updated_at
FROM public.imovib_capex_items c JOIN _dup d ON d.id = c.id;

DELETE FROM public.imovib_capex_items c USING _dup d WHERE d.id = c.id;

-- 3) Rubrica de juros (contaria em dobro com o financiamento) ------------------
INSERT INTO public.imovib_capex_items_reversao_20271012
    (acao, motivo, id, study_id, category, subcategory, name, value_type, value, base, created_at, updated_at)
SELECT 'apagada', 'Juros SFH sai do CAPEX: juros vêm do financiamento (Receitas & Capital)',
       id, study_id, category, subcategory, name, value_type, value, base, created_at, updated_at
FROM public.imovib_capex_items
WHERE name = 'Juros SFH / Construção';

DELETE FROM public.imovib_capex_items WHERE name = 'Juros SFH / Construção';

-- 4) D3 — regime normal: RET vai a 0 (trava pelo valor registrado: linha
--    editada por alguém no meio fica de fora em vez de ser sobrescrita) -------
INSERT INTO public.imovib_capex_items_reversao_20271012
    (acao, motivo, id, study_id, category, subcategory, name, value_type, value, base, created_at, updated_at)
SELECT 'alterada', 'D3: regime normal — RET 4% → 0 (valor registrado = valor anterior)',
       id, study_id, category, subcategory, name, value_type, value, base, created_at, updated_at
FROM public.imovib_capex_items
WHERE name = 'RET (Regime Especial)' AND value = 4;

UPDATE public.imovib_capex_items
SET value = 0, updated_at = now()
WHERE name = 'RET (Regime Especial)' AND value = 4;

-- 5) Trava: uma rubrica por (estudo, categoria, nome) — índice COMPLETO, não
--    parcial (upsert com onConflict em índice parcial dá 42P10) ---------------
ALTER TABLE public.imovib_capex_items
    DROP CONSTRAINT IF EXISTS imovib_capex_items_study_category_name_key;
ALTER TABLE public.imovib_capex_items
    ADD CONSTRAINT imovib_capex_items_study_category_name_key UNIQUE (study_id, category, name);

-- 6) Template aplicado só uma vez por estudo: apagar todas as rubricas não
--    faz o template voltar ---------------------------------------------------
ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS capex_seeded_at timestamptz;

UPDATE public.imovib_studies s
SET capex_seeded_at = COALESCE(
    (SELECT min(c.created_at) FROM public.imovib_capex_items c WHERE c.study_id = s.id),
    now())
WHERE s.capex_seeded_at IS NULL
  AND EXISTS (SELECT 1 FROM public.imovib_capex_items c WHERE c.study_id = s.id);

COMMIT;

-- Conferência (cada uma deve dar 0):
-- SELECT count(*) - count(DISTINCT (study_id, category, name)) FROM public.imovib_capex_items;
-- SELECT count(*) FROM public.imovib_capex_items WHERE name = 'Juros SFH / Construção';
-- SELECT count(*) FROM public.imovib_capex_items WHERE name = 'RET (Regime Especial)' AND value <> 0;
-- SELECT count(*) FROM public.imovib_studies s WHERE capex_seeded_at IS NULL
--   AND EXISTS (SELECT 1 FROM public.imovib_capex_items c WHERE c.study_id = s.id);

-- ── Volta (só se precisar desfazer) ─────────────────────────────────────────
-- BEGIN;
-- ALTER TABLE public.imovib_capex_items DROP CONSTRAINT IF EXISTS imovib_capex_items_study_category_name_key;
-- UPDATE public.imovib_capex_items c SET value = r.value, updated_at = r.updated_at
--   FROM public.imovib_capex_items_reversao_20271012 r WHERE r.acao = 'alterada' AND r.id = c.id;
-- INSERT INTO public.imovib_capex_items (id, study_id, category, subcategory, name, value_type, value, base, created_at, updated_at)
--   SELECT id, study_id, category, subcategory, name, value_type, value, COALESCE(base, 'obra'), created_at, updated_at
--   FROM public.imovib_capex_items_reversao_20271012 WHERE acao = 'apagada'
--   ON CONFLICT (id) DO NOTHING;
-- COMMIT;
