-- ============================================================================
-- aplicar_20271010003300_opura_market_fontes
-- ÒPURA Market — várias fontes de anúncios por praça, não só um feed VRSync.
-- Plano: docs/planos/2026-10-10-opura-market-fontes.md, Fase A.
--
-- APLICAR COM `npx supabase db query --linked -f` (nunca `db push`). Idempotente.
--
-- ─── O que muda ─────────────────────────────────────────────────────────────
-- * opura_market_feeds vira a tabela de FONTES: `tipo` diz qual conector lê a
--   fonte e `config` guarda o que cada conector precisa. Antes havia um feed por
--   organização + cidade; agora a chave é organização + cidade + tipo + link
--   (várias imobiliárias com feed VRSync na mesma praça, por exemplo).
-- * opura_market_listings.preco_oculto_na_fonte: o site esconde o preço, mas a
--   fonte o entrega (decisão F1).
-- * O cron diário passa a rodar 4 vezes de manhã (09:00, 09:30, 10:00 e 10:30
--   UTC = 06:00 a 07:30 em Brasília). Cada chamada pega só as fontes que ainda
--   não rodaram no dia: o orçamento de ~100 s por chamada se divide entre elas.
--
-- ─── REGRA #7 ───────────────────────────────────────────────────────────────
-- Nenhuma função nova. A RLS de opura_market_feeds (membros da organização) e a
-- revogação de anon continuam as da migration aplicar_20271010000300.
-- ============================================================================

ALTER TABLE public.opura_market_feeds
    ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'vrsync',
    ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.opura_market_feeds DROP CONSTRAINT IF EXISTS opura_market_feeds_tipo_chk;
ALTER TABLE public.opura_market_feeds ADD CONSTRAINT opura_market_feeds_tipo_chk
    CHECK (tipo IN ('vrsync', 'api_conexao381', 'portal_zap', 'portal_olx'));

ALTER TABLE public.opura_market_feeds DROP CONSTRAINT IF EXISTS uq_opura_market_feeds_org_cidade;
ALTER TABLE public.opura_market_feeds DROP CONSTRAINT IF EXISTS uq_opura_market_feeds_org_cidade_tipo_url;
ALTER TABLE public.opura_market_feeds ADD CONSTRAINT uq_opura_market_feeds_org_cidade_tipo_url
    UNIQUE (organization_id, city_id, tipo, url);

COMMENT ON TABLE public.opura_market_feeds IS
  'Fontes de anúncios por organização + cidade (tipo = conector). O cron opura-market-feeds-diario reimporta as ativas e marca as saídas. Planos 2026-10-10-opura-market-pendencias (item 1) e 2026-10-10-opura-market-fontes.';

ALTER TABLE public.opura_market_listings
    ADD COLUMN IF NOT EXISTS preco_oculto_na_fonte boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.opura_market_listings.preco_oculto_na_fonte IS
  'O site do anunciante esconde o preço, mas a fonte (API) o entrega. Decisão F1 do plano 2026-10-10-opura-market-fontes: o preço é usado.';

-- ── Cron: 4 janelas de manhã ────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'opura-market-feeds-diario') THEN
        PERFORM cron.unschedule('opura-market-feeds-diario');
    END IF;
    PERFORM cron.schedule('opura-market-feeds-diario', '*/30 9-10 * * *', $cmd$SELECT net.http_post(
        url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/opura-market-import',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || public.fn_cron_secret()
        ),
        body    := '{"modo": "agendado"}'::jsonb,
        timeout_milliseconds := 150000
    );$cmd$);
END $$;
