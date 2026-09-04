-- ============================================================================
-- Coluna `name` (nome da regra) em rental_pricing_rules — aba "Inteligência"
-- (Comercial › Gestão de Locações › Gestão de Unidades).
--
-- Pedido do usuário (2026-09-03): "criar coluna com o nome da regra".
--
-- Até aqui a regra só se identificava pela característica + validação
-- ("Área privativa > 15 m²"). Com duas faixas na mesma característica
-- (> 15 m² → 5%, > 30 m² → 10%) as linhas ficam quase idênticas na tabela;
-- o nome é o rótulo humano que separa uma da outra.
--
-- NULLABLE de propósito: a coluna nasce depois das regras já cadastradas, e um
-- NOT NULL exigiria inventar valor para linha existente. O backfill abaixo dá
-- um nome de partida (o rótulo da característica) — editável na tela —, e a UI
-- exige o nome só no cadastro novo.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ, no SQL Editor do Supabase.
--    JÁ APLICADA em 2026-09-03 (BLOCO 3: coluna=1, sem_nome=0, total_regras=4).
-- ============================================================================

-- ═══ BLOCO 1 — a coluna ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.rental_pricing_rules
    ADD COLUMN IF NOT EXISTS name TEXT;

COMMENT ON COLUMN public.rental_pricing_rules.name IS
  'Nome humano da regra, exibido como primeira coluna da aba Inteligencia. '
  'Nullable: a coluna nasceu depois das regras existentes (backfill = attribute_label).';

-- ═══ BLOCO 2 — backfill das regras já cadastradas ═══════════════════════════
-- Só quem está sem nome; roda quantas vezes precisar sem estragar edição feita
-- na tela depois da aplicação.
SET lock_timeout = '5s';

UPDATE public.rental_pricing_rules
   SET name = attribute_label
 WHERE name IS NULL OR btrim(name) = '';

-- ═══ BLOCO 3 — conferência ═════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: coluna=1, sem_nome=0 (todas as regras existentes com nome).

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rental_pricing_rules'
      AND column_name='name')                                        AS coluna,
  (SELECT count(*) FROM public.rental_pricing_rules
    WHERE name IS NULL OR btrim(name) = '')                          AS sem_nome,
  (SELECT count(*) FROM public.rental_pricing_rules)                 AS total_regras;

-- FIM: aplicar_20270918000028_rental_pricing_rules_nome.sql
