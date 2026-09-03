-- ============================================================
-- Migration: aplicar_20270918000012_rls_competitors_escopo.sql
-- SEGURANÇA — fecha a ressalva deixada por escrito na 20270208000002
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md
--
-- A migration 20270208000002 removeu 81 policies `anon` e preservou quatro de
-- propósito. Sobre duas delas, ela mesma escreveu, nas linhas 30-32:
--
--     ⚠️ Ressalva: as policies de invoices (SELECT) e
--        investor_opportunity_competitors usam qual=true (sem escopo real)
--        → possível superexposição; avaliar à parte.
--
-- `invoices` foi corrigida na aplicar_20270917000006 (achado C1-02: 829 notas
-- fiscais legíveis sem login). Esta migration fecha a segunda metade da
-- ressalva — a única que restou de pé.
--
-- POR QUE ESTA NÃO É "PÚBLICA DE PROPÓSITO"
-- A tabela guarda inteligência de mercado da concorrência de cada empreendimento:
-- `name`, `price_per_m2`, `sales_velocity_pct`, `appreciation_pct`,
-- `distance_km`. É análise proprietária — o oposto de dado que se publica. E,
-- diferente das outras preservadas, ela TEM `organization_id`: o recorte é
-- trivial, só nunca foi escrito.
--
-- POR QUE É SEGURO
--   • A tabela está vazia (0 linhas) — não há o que sumir da tela.
--   • Todos os consumidores são telas internas, autenticadas:
--     components/investor/OpportunitiesTab.tsx, OpportunityDetail.tsx e
--     OpportunityForm.tsx, todas via investorPortalService.listCompetitors().
--   • O marketplace público NÃO expõe competidores: a RPC
--     `get_public_marketplace` não referencia a tabela (verificado em
--     pg_get_functiondef). As telas públicas leem por RPC, nunca a tabela
--     direto — é o que a própria 20270208000002 documenta.
--
-- `sinapi_items` continua pública de propósito e NÃO entra aqui: é catálogo de
-- preços de referência do SINAPI (15.867 itens), dado público por natureza.
-- ============================================================

DROP POLICY IF EXISTS "Public read for competitors" ON public.investor_opportunity_competitors;

CREATE POLICY "competitors_org_select" ON public.investor_opportunity_competitors
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR public.is_superadmin());

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_anon int;
    v_leitura int;
BEGIN
    SELECT count(*) INTO v_anon
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'investor_opportunity_competitors'
       AND 'anon' = ANY(roles);

    SELECT count(*) INTO v_leitura
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'investor_opportunity_competitors'
       AND cmd IN ('SELECT','ALL')
       AND 'authenticated' = ANY(roles);

    IF v_anon > 0 THEN
        RAISE EXCEPTION 'competitors: ainda existe policy para anon';
    END IF;
    IF v_leitura = 0 THEN
        RAISE EXCEPTION 'competitors: ficaria sem leitura para authenticated — as telas de investidor quebrariam';
    END IF;

    RAISE NOTICE 'OK: competitors recortado por organizacao; ressalva da 20270208000002 fechada.';
END $$;
