-- ============================================================================
-- ÒPURA Market Intelligence — Fase 2, desdobramento do item 2.4
-- Plano: docs/planos/2026-10-07-opura-market-intelligence.md
--
-- Decisão do usuário em 07/10/2026: ADIAR o recálculo do "DNA do Bairro" para
-- depois da Fase 4 e, por ora, apagar os números fictícios.
--
-- Por que adiar: o plano mandava recalcular só com anúncios GLOBAIS (a tabela
-- de bairros é lida por qualquer organização). Depois que a seed foi apagada
-- (aplicar_20271007000120) não sobrou nenhum anúncio global — os 357 reais são
-- privados da Alpa. E 296 dos 325 não duplicados estavam marcados como
-- "Centro", porque o robô de captura joga lá todo bairro que não reconhece.
-- Qualquer média por bairro hoje sairia errada.
--
-- O que esta migration faz: zera (NULL) os 9 indicadores que a migration
-- 20261124000000 semeou à mão nos 4 bairros de Cambuí — score, ticket, preço
-- por m², área média, tipologia, padrão, saturação, potencial e contagem de
-- concorrentes. A geometria e o nome dos bairros ficam. A tela passa a dizer
-- "não calculado".
--
-- REGRA #7: sem policy e sem função.
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>. NUNCA db push.
-- ⚠️ Idempotente: UPDATE só onde ainda há valor.
-- ============================================================================

SET lock_timeout = '5s';

UPDATE public.opura_market_neighborhoods
   SET bairro_score         = NULL,
       ticket_medio         = NULL,
       price_per_m2_medio   = NULL,
       area_media           = NULL,
       dominant_typology    = NULL,
       predominant_standard = NULL,
       saturation_level     = NULL,
       potential_score      = NULL,
       competitors_count    = NULL,
       updated_at           = timezone('utc', now())
 WHERE bairro_score IS NOT NULL OR ticket_medio IS NOT NULL OR price_per_m2_medio IS NOT NULL
    OR area_media IS NOT NULL OR dominant_typology IS NOT NULL OR predominant_standard IS NOT NULL
    OR saturation_level IS NOT NULL OR potential_score IS NOT NULL OR competitors_count IS NOT NULL;

RESET lock_timeout;
