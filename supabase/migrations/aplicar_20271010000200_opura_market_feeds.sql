-- ============================================================================
-- aplicar_20271010000200_opura_market_feeds
-- ÒPURA Market — feed salvo por organização + cidade, importado todo dia.
-- Plano: docs/planos/2026-10-10-opura-market-pendencias.md, item 1.
--
-- APLICAR COM `npx supabase db query --linked -f` (nunca `db push`). Idempotente.
--
-- ─── Por quê ────────────────────────────────────────────────────────────────
-- Até aqui o link do feed era só digitado na tela e esquecido. O item 3 (meses
-- de estoque do bairro) precisa de demanda MEDIDA, e o único sinal que temos é
-- o anúncio que some do feed (vendido ou retirado). Para isso o feed precisa ser
-- lido de novo com regularidade e cada anúncio precisa saber de qual feed veio.
--
-- ─── REGRA #7 ───────────────────────────────────────────────────────────────
-- 1. Quem lê/grava `opura_market_feeds`? Só membros da organização dona da
--    linha (mesmo molde de `opura_market_city_configs`). Nenhuma policy anon.
-- 2. Nenhuma função nova SECURITY DEFINER. O cron chama a Edge Function com o
--    CRON_SECRET (`fn_cron_secret()`, já revogada de PUBLIC/anon/authenticated);
--    a function valida com `chamadaDeCron` e escreve com service_role, sempre
--    com a organização tirada da própria linha do feed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.opura_market_feeds (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    city_id          uuid NOT NULL REFERENCES public.opura_market_cities(id) ON DELETE CASCADE,
    url              text NOT NULL CHECK (url ~* '^https://'),
    ativo            boolean NOT NULL DEFAULT true,
    ultima_execucao  timestamptz,
    ultimo_resultado jsonb,
    ultimo_erro      text,
    created_by       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_opura_market_feeds_org_cidade UNIQUE (organization_id, city_id)
);

COMMENT ON TABLE public.opura_market_feeds IS
  'Feed VRSync salvo por organização+cidade; o cron diário (opura-market-feeds-diario) reimporta e marca as saídas. Plano 2026-10-10-opura-market-pendencias, item 1.';

ALTER TABLE public.opura_market_feeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opura_market_feeds FROM anon;

DROP POLICY IF EXISTS opura_market_feeds_membros ON public.opura_market_feeds;
CREATE POLICY opura_market_feeds_membros ON public.opura_market_feeds
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

-- De qual feed salvo o anúncio veio, e quando saiu dele.
ALTER TABLE public.opura_market_listings
    ADD COLUMN IF NOT EXISTS feed_id uuid REFERENCES public.opura_market_feeds(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS removed_at timestamptz;

COMMENT ON COLUMN public.opura_market_listings.removed_at IS
  'Quando o anúncio deixou de vir no feed salvo (listing_status passa a inactive). Medida de demanda do item 3; volta a NULL se o anúncio reaparecer.';

CREATE INDEX IF NOT EXISTS idx_opura_market_listings_feed_ativos
    ON public.opura_market_listings (feed_id) WHERE listing_status = 'active';
CREATE INDEX IF NOT EXISTS idx_opura_market_listings_removed_at
    ON public.opura_market_listings (city_id, removed_at) WHERE removed_at IS NOT NULL;

-- ── Cron diário: 09:20 UTC (06:20 em Brasília) ───────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'opura-market-feeds-diario') THEN
        PERFORM cron.unschedule('opura-market-feeds-diario');
    END IF;
    PERFORM cron.schedule('opura-market-feeds-diario', '20 9 * * *', $cmd$SELECT net.http_post(
        url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/opura-market-import',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || public.fn_cron_secret()
        ),
        body    := '{"modo": "agendado"}'::jsonb,
        timeout_milliseconds := 150000
    );$cmd$);
END $$;
