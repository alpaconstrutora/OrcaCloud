-- ============================================================================
-- Estudos de Viabilidade (Imovib) — base de cada rubrica do CAPEX detalhado
-- Plano: docs/planos/2026-10-12-imovib-viabilidade-correcoes.md, item 2.1
--
-- Decisão do usuário (2026-10-12): o CAPEX detalhado ENTRA no cálculo de
-- VPL/TIR. Rubrica em R$ entra direto; rubrica em % precisa saber SOBRE O QUÊ
-- incide — antes não havia essa informação e o PDF imprimia "x% do VGV" para
-- todas, inclusive ITBI (que é sobre o terreno) e Administração Local (sobre a
-- obra).
--
--   base = 'terreno' → % sobre o custo do terreno; saída no mês 1
--   base = 'obra'    → % sobre o custo de obra;     saída ao longo da obra
--   base = 'vgv'     → % sobre a receita bruta;     saída junto com a receita
--
-- Backfill pela categoria do template (prefixo numérico). Rubrica criada à mão
-- em categoria nova fica 'obra' (o default) e o usuário troca na tela.
--
-- REGRA #7: não cria policy nem função. Coluna nova herda a RLS da tabela.
-- Aditiva: não altera nem apaga valor existente.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (nunca db push)
-- ============================================================================

BEGIN;

ALTER TABLE public.imovib_capex_items
    ADD COLUMN IF NOT EXISTS base text NOT NULL DEFAULT 'obra';

ALTER TABLE public.imovib_capex_items
    DROP CONSTRAINT IF EXISTS imovib_capex_items_base_check;
ALTER TABLE public.imovib_capex_items
    ADD CONSTRAINT imovib_capex_items_base_check CHECK (base IN ('vgv', 'obra', 'terreno'));

UPDATE public.imovib_capex_items
SET base = CASE
    WHEN category LIKE '1.%' THEN 'terreno'   -- Terreno: ITBI, escritura, comissão do terreno
    WHEN category LIKE '5.%' THEN 'vgv'       -- Marketing e Vendas: mídia, corretagem, house
    WHEN category LIKE '7.%' THEN 'vgv'       -- Impostos: RET / regime normal
    WHEN category LIKE '8.%' THEN 'vgv'       -- Financeiras: estruturação do plano empresário
    ELSE 'obra'                               -- 2 Projetos, 3/4 Construção, 6 Legais, 9 Contingência
END;

COMMIT;

-- Conferência (deve dar 0 linhas com base nula e a distribuição por categoria):
-- SELECT category, base, count(*) FROM public.imovib_capex_items GROUP BY 1, 2 ORDER BY 1;
