-- ==========================================================================
-- Data Room da Oportunidade pelo GED; fotos da vitrine = imagens do empreendimento
-- ==========================================================================
-- Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 3 (decisão D1:
-- documentos moram no Imovib/Empreendimento — o arquivo, no GED).
--
-- 1. opura_document_portal_shares ganha a audiência 'investidor' (molde do credor,
--    aplicar_20270920000002): opportunity_id com FK CASCADE; índice único NÃO parcial
--    (o upsert do PostgREST não casa índice parcial — aplicar_20270920000004).
-- 2. fn_investor_portal_get_dataroom: MESMA assinatura e checagens (token ativo; oportunidade
--    publicada de uma org do investidor); a lista vem dos compartilhamentos + versão ATIVA do
--    GED, só documento da org DA OPORTUNIDADE. Chaves de saída as mesmas de antes (file_path =
--    storage_path no bucket opura-docs) para o DataRoomPanel mudar pouco.
-- 3. fn_oportunidade_na_vitrine: 'fotos' = decorado + plantas + vistas do empreendimento
--    (bucket público empreendimento-midia, imagem_url); sai 'gallery_urls'.
-- 4. get_public_marketplace: fotos da vitrine (não mais opportunity_documents).
-- 5. Saem opportunity_documents e investor_opportunities.gallery_urls — guardas param se
--    houver linha/galeria. Os buckets opportunity-dataroom/opportunity-photos ficam: têm 4
--    objetos sem linha (sobras da conferência de 16/11), a apagar pela API depois de conferidos.
--
-- REGRA #7
--   P1: nenhuma policy nova; as de opura_document_portal_shares herdam o acesso de
--       opura_documents (o investidor NÃO ganha policy: entra pela função do token).
--   P2: fn_investor_portal_get_dataroom e get_public_marketplace: SECURITY DEFINER, search_path
--       fixo, REVOKE PUBLIC, GRANT anon/authenticated (portal por link e página pública).
--       fn_oportunidade_na_vitrine: interna, REVOKE de PUBLIC/anon/authenticated.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>  (DEPOIS da 961000)
-- NUNCA supabase db push.
-- Reverter: tirar 'investidor' das CHECKs, DROP COLUMN opportunity_id; reaplicar as três
--   funções de aplicar_20271116200000 / aplicar_20271121960000; recriar opportunity_documents
--   por 20261107000003 (sem dados: não havia).

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.opportunity_documents) THEN
        RAISE EXCEPTION 'opportunity_documents tem linhas: leve os arquivos ao GED antes.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.investor_opportunities WHERE COALESCE(array_length(gallery_urls, 1), 0) > 0) THEN
        RAISE EXCEPTION 'Há oportunidade com galeria própria: leve as imagens ao empreendimento antes.';
    END IF;
END $$;

-- ── 1. Audiência 'investidor' ──────────────────────────────────────────────
ALTER TABLE public.opura_document_portal_shares
    ADD COLUMN IF NOT EXISTS opportunity_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opura_portal_shares_opportunity_fk') THEN
        ALTER TABLE public.opura_document_portal_shares
            ADD CONSTRAINT opura_portal_shares_opportunity_fk
            FOREIGN KEY (opportunity_id) REFERENCES public.investor_opportunities(id) ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE public.opura_document_portal_shares
    DROP CONSTRAINT IF EXISTS opura_document_portal_shares_audience_check;
ALTER TABLE public.opura_document_portal_shares
    ADD CONSTRAINT opura_document_portal_shares_audience_check
    CHECK (audience IN ('cliente', 'colaborador', 'credor', 'investidor'));

ALTER TABLE public.opura_document_portal_shares
    DROP CONSTRAINT IF EXISTS opura_document_portal_shares_target_chk;
ALTER TABLE public.opura_document_portal_shares
    ADD CONSTRAINT opura_document_portal_shares_target_chk CHECK (
        (audience = 'cliente'     AND client_id IS NOT NULL AND employee_id IS NULL AND credit_room_id IS NULL AND opportunity_id IS NULL) OR
        (audience = 'colaborador' AND employee_id IS NOT NULL AND client_id IS NULL AND credit_room_id IS NULL AND opportunity_id IS NULL) OR
        (audience = 'credor'      AND credit_room_id IS NOT NULL AND client_id IS NULL AND employee_id IS NULL AND opportunity_id IS NULL) OR
        (audience = 'investidor'  AND opportunity_id IS NOT NULL AND client_id IS NULL AND employee_id IS NULL AND credit_room_id IS NULL)
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_opura_portal_shares_investidor
    ON public.opura_document_portal_shares (document_id, opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opura_portal_shares_opportunity
    ON public.opura_document_portal_shares (opportunity_id) WHERE opportunity_id IS NOT NULL;

-- ── 2. Data Room pelo link: compartilhamentos do GED ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_dataroom(p_token text, p_opportunity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok  public.investor_portal_tokens;
    v_opp  public.investor_opportunities;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    SELECT * INTO v_opp
    FROM public.investor_opportunities o
    WHERE o.id = p_opportunity_id
      AND o.organization_id = ANY(public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id)
      AND o.is_published = TRUE;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'documents', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', doc.id, 'opportunity_id', sh.opportunity_id, 'name', doc.nome, 'description', doc.descricao,
                'file_path', ver.storage_path, 'file_size', ver.tamanho, 'mime_type', ver.mime_type,
                'category', doc.categoria, 'created_at', sh.shared_at) ORDER BY sh.shared_at DESC)
            FROM public.opura_document_portal_shares sh
            JOIN public.opura_documents doc ON doc.id = sh.document_id
            JOIN public.opura_document_versions ver ON ver.id = doc.active_version_id
            WHERE sh.audience = 'investidor'
              AND sh.opportunity_id = p_opportunity_id
              AND doc.organization_id = v_opp.organization_id   -- documento da org DA OPORTUNIDADE, nunca de outra
        ), '[]'::jsonb)
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_dataroom(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_dataroom(TEXT, UUID) TO anon, authenticated;

-- ── 3. Vitrine com as fotos do empreendimento ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_oportunidade_na_vitrine(o public.investor_opportunities)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
    SELECT jsonb_build_object(
        'id', o.id,
        'organization_id', o.organization_id,
        'title', o.title,
        'subtitle', o.subtitle,
        'open_date', o.open_date,
        'link', o.link,
        'status', o.status,
        'opportunity_type', o.opportunity_type,
        'thumbnail_url', o.thumbnail_url,
        'ticket_min', o.ticket_min,
        'is_published', o.is_published,
        'imovib_study_id', o.imovib_study_id,
        'imovib_version_id', o.imovib_version_id,
        'distances_json', o.distances_json,
        'team_json', o.team_json,
        'created_at', o.created_at,
        'indicadores_da_versao', v.snapshot -> 'calculo' -> 'investidor' -> 'indicadores',
        'resultados_da_versao', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
            'duracao', v.results -> 'duracao', 'custoObra', v.results -> 'custoObra', 'terreno', v.results -> 'terreno') END,
        'local', CASE WHEN emp.id IS NULL THEN NULL ELSE jsonb_build_object(
            'cidade', emp.endereco_city, 'uf', emp.endereco_state, 'obra_id', emp.project_id) END,
        'fotos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('url', f.url, 'legenda', f.legenda) ORDER BY f.grupo, f.ordem)
            FROM (
                SELECT 1 AS grupo, d.ordem, d.imagem_url AS url, COALESCE(d.legenda, d.tipologia) AS legenda
                FROM public.empreendimento_tipologia_decorado d WHERE d.empreendimento_id = emp.id
                UNION ALL
                SELECT 2, 0, p.imagem_url, 'Planta — ' || p.tipologia
                FROM public.empreendimento_tipologia_plantas p WHERE p.empreendimento_id = emp.id
                UNION ALL
                SELECT 3, vi.andar_de, vi.imagem_url, COALESCE(vi.legenda, 'Vista — ' || t.name)
                FROM public.empreendimento_tower_vistas vi
                JOIN public.empreendimento_towers t ON t.id = vi.tower_id
                WHERE t.empreendimento_id = emp.id
            ) f
        ), '[]'::jsonb)
    )
    FROM (SELECT 1) AS um
    LEFT JOIN public.imovib_study_versions v ON v.id = o.imovib_version_id AND v.study_id = o.imovib_study_id
    LEFT JOIN LATERAL (
        SELECT e.id, e.endereco_city, e.endereco_state, e.project_id
        FROM public.empreendimentos e
        WHERE o.imovib_study_id IS NOT NULL
          AND e.imovib_study_id = o.imovib_study_id
          AND e.organization_id = o.organization_id
        ORDER BY e.created_at
        LIMIT 1
    ) emp ON TRUE;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_oportunidade_na_vitrine(public.investor_opportunities) FROM PUBLIC, anon, authenticated;

-- ── 4. Marketplace: as fotos da vitrine ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_marketplace(p_slug text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_org_id   uuid;
    v_org_info json;
    v_opps     json;
BEGIN
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE lower(slug) = lower(p_slug)
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RETURN json_build_object('error', 'organization_not_found');
    END IF;

    SELECT json_build_object('id', id, 'name', name, 'logo_url', logo_url, 'website', website)
    INTO v_org_info
    FROM public.organizations
    WHERE id = v_org_id;

    SELECT coalesce(json_agg(item ORDER BY item->>'created_at' DESC), '[]'::json)
    INTO v_opps
    FROM (
        SELECT (public.fn_oportunidade_na_vitrine(o) - ARRAY['team_json', 'distances_json', 'imovib_study_id', 'imovib_version_id', 'link'])::json AS item
        FROM public.investor_opportunities o
        WHERE o.organization_id = v_org_id
          AND o.is_published = true
    ) sub;

    RETURN json_build_object('organization', v_org_info, 'opportunities', v_opps);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_marketplace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_marketplace(text) TO anon, authenticated;

-- ── 5. Sai o Data Room próprio e a galeria própria ─────────────────────────
DROP TABLE IF EXISTS public.opportunity_documents;
ALTER TABLE public.investor_opportunities DROP COLUMN IF EXISTS gallery_urls;

COMMIT;
