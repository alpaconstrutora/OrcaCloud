-- ==========================================================================
-- Imovib → investidor: a oportunidade publica uma VERSÃO congelada do estudo
-- ==========================================================================
-- Plano: docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, Fase 2.
-- Decisão do usuário (15/11): o investidor vê a versão congelada que a equipe
-- escolhe publicar — editar o estudo não muda o que ele já recebeu.
--
-- 1. investor_opportunities.imovib_version_id → imovib_study_versions (RESTRICT:
--    versão já não se apaga; a FK só deixa isso explícito).
-- 2. Gatilho BEFORE INSERT/UPDATE: a versão é do estudo vinculado; oportunidade
--    PUBLICADA com estudo exige versão; tirar o estudo limpa a versão.
-- 3. fn_investor_portal_get_study (mesma assinatura): serve o snapshot da versão
--    publicada — não mais o estudo vivo, senão a versão seria contornável chamando
--    a RPC —, sem as chaves internas (parecer, critérios, notas de fonte), mais
--    cenários e listas do relatório (Fase 1), versão e organização (capa do PDF).
--
-- Banco em 15/11: 6 oportunidades, 0 com estudo; 0 versões. Nada a migrar.
--
-- REGRA #7
--   P1: nenhuma policy criada nem alterada.
--   P2: fn_investor_opportunity_versao_valida é de gatilho, SECURITY INVOKER (a
--      leitura da versão segue a RLS de imovib_study_versions: só membro da
--      organização vê — versão de outra organização não passa); EXECUTE revogado
--      de PUBLIC, anon e authenticated. fn_investor_portal_get_study segue
--      SECURITY DEFINER com o token validado dentro, REVOKE de PUBLIC e GRANT a
--      anon/authenticated (é a leitura do portal por link).
--
-- Reverter: aplicar de novo a função de aplicar_20271112980000_imovib_governanca_pendencias.sql;
--   DROP TRIGGER trg_investor_opportunity_versao_valida ON public.investor_opportunities;
--   DROP FUNCTION public.fn_investor_opportunity_versao_valida();
--   ALTER TABLE public.investor_opportunities DROP COLUMN imovib_version_id;
-- ==========================================================================

ALTER TABLE public.investor_opportunities
    ADD COLUMN IF NOT EXISTS imovib_version_id uuid
    REFERENCES public.imovib_study_versions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_investor_opportunities_imovib_version
    ON public.investor_opportunities(imovib_version_id);

COMMENT ON COLUMN public.investor_opportunities.imovib_version_id IS
    'Versão congelada do estudo do Imovib que o investidor vê (dashboard e relatório). Obrigatória para publicar com estudo.';

CREATE OR REPLACE FUNCTION public.fn_investor_opportunity_versao_valida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.imovib_study_id IS NULL THEN
        NEW.imovib_version_id := NULL;
        RETURN NEW;
    END IF;

    IF NEW.imovib_version_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.imovib_study_versions v
        WHERE v.id = NEW.imovib_version_id AND v.study_id = NEW.imovib_study_id
    ) THEN
        RAISE EXCEPTION 'A versão escolhida não é deste estudo do Imovib.'
            USING ERRCODE = '23514';
    END IF;

    IF COALESCE(NEW.is_published, FALSE) AND NEW.imovib_version_id IS NULL THEN
        RAISE EXCEPTION 'Para publicar uma oportunidade com estudo do Imovib, escolha a versão congelada que o investidor vai ver.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_opportunity_versao_valida() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_investor_opportunity_versao_valida ON public.investor_opportunities;
CREATE TRIGGER trg_investor_opportunity_versao_valida
    BEFORE INSERT OR UPDATE ON public.investor_opportunities
    FOR EACH ROW EXECUTE FUNCTION public.fn_investor_opportunity_versao_valida();

-- Portal do Investidor: o estudo é o da VERSÃO publicada.
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_study(p_token text, p_study_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok     public.investor_portal_tokens;
    v_org_id  UUID;
    v_opp     public.investor_opportunities;
    v_ver     public.imovib_study_versions;
    v_org     public.organizations;
    v_study   JSONB;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    v_org_id := v_tok.org_id;

    SELECT * INTO v_opp
    FROM public.investor_opportunities
    WHERE imovib_study_id = p_study_id
      AND organization_id = v_org_id
      AND is_published = TRUE
    ORDER BY created_at DESC
    LIMIT 1;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    IF v_opp.imovib_version_id IS NULL THEN
        RETURN '{"valid":false,"error":"sem_versao"}'::jsonb;
    END IF;

    SELECT * INTO v_ver
    FROM public.imovib_study_versions
    WHERE id = v_opp.imovib_version_id AND study_id = p_study_id;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"not_found"}'::jsonb; END IF;

    -- Parecer, critérios e notas de fonte são internos (Fase 10 do plano 2026-11-11);
    -- cenários e listas do relatório saem em chaves próprias.
    v_study := v_ver.snapshot - ARRAY['premise_notes', 'recommendation', 'recommendation_notes',
           'recommended_by', 'recommended_at', 'hurdle_irr_spread', 'hurdle_margin_percent', 'hurdle_max_exposure',
           'recommendation_snapshot', 'recommended_by_user_id', 'cenarios', 'relatorio'];

    SELECT * INTO v_org FROM public.organizations WHERE id = v_org_id;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'study', v_study,
        'cenarios', COALESCE(v_ver.snapshot -> 'cenarios', '[]'::jsonb),
        'relatorio', COALESCE(v_ver.snapshot -> 'relatorio', '{}'::jsonb),
        'versao', jsonb_build_object('id', v_ver.id, 'label', v_ver.label, 'created_at', v_ver.created_at),
        'organizacao', jsonb_build_object('name', v_org.name, 'logo_url', v_org.logo_url)
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_study(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_study(TEXT, UUID) TO anon, authenticated;
