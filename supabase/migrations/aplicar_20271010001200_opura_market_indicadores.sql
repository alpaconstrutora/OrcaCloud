-- ============================================================================
-- aplicar_20271010001200_opura_market_indicadores
-- ÒPURA Market — dados para Saturação e Score Potencial do bairro.
-- Plano: docs/planos/2026-10-10-opura-market-pendencias.md, item 3.
--
-- APLICAR COM `npx supabase db query --linked -f` (nunca `db push`). Idempotente.
--
-- A conta (faixas, pesos, janela) mora em utils/opuraMarketIndicadores.ts, com
-- hipóteses editáveis. Aqui só os números medidos, por bairro.
--
-- ─── REGRA #7 ───────────────────────────────────────────────────────────────
-- 1. `get_market_neighborhood_dinamica` é SECURITY INVOKER: conta só os anúncios
--    que a RLS já libera a quem chama. REVOKE de PUBLIC/anon.
-- 2. A coluna nova em `opura_market_city_configs` herda a RLS da tabela (membros).
-- ============================================================================

-- Hipóteses dos indicadores por organização + cidade (o que a tela edita).
ALTER TABLE public.opura_market_city_configs
    ADD COLUMN IF NOT EXISTS hipoteses_indicadores jsonb;

COMMENT ON COLUMN public.opura_market_city_configs.hipoteses_indicadores IS
  'Hipóteses de Saturação e Score Potencial (utils/opuraMarketIndicadores.ts). NULL = padrão.';

-- Por bairro: ativos, saídas na janela, preço por m² atual e no início da janela,
-- e quando começou o histórico de feed salvo na cidade (sem ele, sem número).
CREATE OR REPLACE FUNCTION public.get_market_neighborhood_dinamica(p_city_id uuid, p_meses integer DEFAULT 6)
RETURNS TABLE (
    neighborhood_id   uuid,
    ativos            bigint,
    saidas            bigint,
    preco_m2_atual    numeric,
    preco_m2_inicio   numeric,
    inicio_historico  timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH janela AS (
        SELECT now() - make_interval(months => greatest(coalesce(p_meses, 6), 1)) AS desde
    ),
    historico AS (
        SELECT min(h.captured_at) AS inicio
        FROM public.opura_market_listings h
        WHERE h.city_id = p_city_id AND h.feed_id IS NOT NULL
    )
    SELECT l.neighborhood_id,
           count(*) FILTER (WHERE l.listing_status = 'active'),
           count(*) FILTER (WHERE l.removed_at IS NOT NULL AND l.removed_at >= j.desde),
           avg(l.price_per_m2) FILTER (WHERE l.listing_status = 'active' AND l.price_per_m2 > 0),
           avg(l.price_per_m2) FILTER (WHERE l.price_per_m2 > 0
                                         AND l.captured_at >= j.desde
                                         AND l.captured_at <  j.desde + interval '1 month'),
           (SELECT inicio FROM historico)
    FROM public.opura_market_listings l
    CROSS JOIN janela j
    WHERE l.city_id = p_city_id
      AND l.neighborhood_id IS NOT NULL
      AND l.parent_listing_id IS NULL
    GROUP BY l.neighborhood_id;
$$;

REVOKE ALL ON FUNCTION public.get_market_neighborhood_dinamica(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_market_neighborhood_dinamica(uuid, integer) TO authenticated;
