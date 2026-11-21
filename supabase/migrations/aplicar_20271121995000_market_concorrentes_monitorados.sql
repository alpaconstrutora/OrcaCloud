-- Fase 7.7 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md
--
-- opura_market_monitored_competitors ganha tela (Market › Estudos salvos ›
-- Concorrentes) e vira fonte do "Importar do Market" dos comparáveis do Imovib.
-- 0 linhas hoje: nada a migrar.
--
-- Pergunta 1 (REGRA #7): a policy antiga (FOR ALL) só conferia a org da LINHA —
-- dava para gravar um concorrente com organization_id da minha org apontando
-- para o estudo de terreno ou o anúncio de OUTRA org. Agora cada perna é
-- conferida: a linha é da minha org E o estudo é da mesma org E o anúncio
-- (se houver) é da mesma org. Lançamento (developments) é catálogo global de
-- leitura, sem org.
-- Pergunta 2: sem função nova.
--
-- Reversão: recriar a policy org_access_monitored_competitors da
-- 20261124000000 (USING/WITH CHECK só por organization_id).

DROP POLICY IF EXISTS org_access_monitored_competitors ON public.opura_market_monitored_competitors;

CREATE POLICY org_access_monitored_competitors ON public.opura_market_monitored_competitors
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()))
    WITH CHECK (
        organization_id IN (SELECT public.minhas_orgs_membro())
        AND EXISTS (
            SELECT 1 FROM public.opura_market_terrain_studies s
             WHERE s.id = study_id AND s.organization_id = opura_market_monitored_competitors.organization_id
        )
        AND (listing_id IS NULL OR EXISTS (
            SELECT 1 FROM public.opura_market_listings l
             WHERE l.id = listing_id AND l.organization_id = opura_market_monitored_competitors.organization_id
        ))
    );

CREATE INDEX IF NOT EXISTS idx_market_monitored_competitors_study
    ON public.opura_market_monitored_competitors (study_id);

REVOKE ALL ON public.opura_market_monitored_competitors FROM anon;
