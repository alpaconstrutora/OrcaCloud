-- Fase A (segurança) de docs/planos/2026-11-21-portal-do-investidor-consolidacao.md — itens A1–A9.
--
-- Estado em 21/11: 1 investidor, 1 token (org do token = org do investidor), 0 oportunidades publicadas,
-- 0 interesses, 35 relatórios mensais sem destinatário (gerados para a org inteira), 111 versões do GED
-- todas na pasta da própria organização.
--
-- REGRA #7, pergunta 1 (cada perna do OR basta sozinha?) — respondida item a item abaixo.
-- REGRA #7, pergunta 2 (quem mais executa?) — toda função recriada ou nova leva REVOKE de PUBLIC; as do
-- portal por link ficam com anon/authenticated e conferem o token DENTRO delas.
--
-- Reversão: as definições anteriores estão em aplicar_20271121980000 (marketplace, interesse),
-- aplicar_20271121992000 (Data Room), aplicar_20271110950000 (resumo) e no banco antes desta data
-- (investor_portal_get_data, get_reports, find_investor_by_document, policies). Guardadas em
-- docs/planos/2026-11-21-portal-do-investidor-consolidacao.md §Reversão da Fase A.

-- ═══ A1 (S1) — tokens do portal: só leitura direta; gerar e revogar só por RPC ═════════════════════
-- Antes: policy FOR ALL `investor_portal_can_manage_tokens(org_id)` — conferia só a org do TOKEN. Um admin
-- gravava token para investidor de outra org (o compartilhado) e lia, pelo link, os dados da org dona.
DROP POLICY IF EXISTS investor_tokens_auth_all ON public.investor_portal_tokens;
DROP POLICY IF EXISTS investor_tokens_select ON public.investor_portal_tokens;
CREATE POLICY investor_tokens_select ON public.investor_portal_tokens
    FOR SELECT TO authenticated
    USING (
        public.investor_portal_can_manage_tokens(org_id)
        AND EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.organization_id = org_id)
    );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.investor_portal_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.investor_portal_revoke_token(p_investor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org uuid;
BEGIN
    SELECT i.organization_id INTO v_org FROM public.investors i WHERE i.id = p_investor_id;
    IF v_org IS NULL OR NOT public.investor_portal_can_manage_tokens(v_org) THEN
        RAISE EXCEPTION 'Só o proprietário ou administrador da organização do investidor revoga o link.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.investor_portal_tokens
       SET is_active = false
     WHERE investor_id = p_investor_id AND org_id = v_org;
    RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.investor_portal_revoke_token(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.investor_portal_revoke_token(uuid) TO authenticated;

-- ═══ A4 (S4) — o cadastro do investidor pelo link: só o que a tela usa, sem CPF/CNPJ ═══════════════
CREATE OR REPLACE FUNCTION public.investor_portal_get_data(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok public.investor_portal_tokens;
    v_inv public.investors;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    UPDATE public.investor_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    SELECT * INTO v_inv FROM public.investors WHERE id = v_tok.investor_id;
    IF NOT FOUND THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid',    TRUE,
        'investor', jsonb_build_object(
            'id',              v_inv.id,
            'name',            v_inv.name,
            'email',           v_inv.email,
            'phone',           v_inv.phone,
            'organization_id', v_inv.organization_id,
            -- Só as abas liberadas pelo gestor; o resto de settings é interno.
            'settings',        jsonb_build_object('investorPortalTabs', v_inv.settings -> 'investorPortalTabs')
        ),
        'org_id',   v_tok.org_id
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.investor_portal_get_data(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.investor_portal_get_data(text) TO anon, authenticated;

-- ═══ A3 + A4 (S3/S4) — resumo: settings da obra e aportes só com as chaves que a tela usa ══════════════
-- Antes: 'settings', pr.settings (BDI, wbs, cliente, documentos, versões do orçamento) e row_to_json(ic).
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_summary(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok      public.investor_portal_tokens;
    v_inv_id   UUID;
    v_orgs     UUID[];
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_orgs   := public.fn_orgs_do_investidor(v_inv_id);

    RETURN jsonb_build_object(
        'valid', TRUE,
        'participations', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',               ip.id,
                    'project_id',       ip.project_id,
                    'project_name',     p.name,
                    'ownership_pct',    ip.ownership_pct,
                    'committed_amount', ip.committed_amount,
                    'quota_count',      ip.quota_count
                )
                ORDER BY p.name
             )
             FROM public.investor_participations ip
             JOIN public.projects p ON p.id = ip.project_id
             WHERE ip.investor_id = v_inv_id
               AND ip.organization_id = ANY (v_orgs)
               AND p.organization_id = ip.organization_id),
            '[]'::jsonb
        ),
        'contributions', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                    'id',              ic.id,
                    'organization_id', ic.organization_id,
                    'project_id',      ic.project_id,
                    'investor_id',     ic.investor_id,
                    'type',            ic.type,
                    'amount',          ic.amount,
                    'due_date',        ic.due_date,
                    'paid_date',       ic.paid_date,
                    'status',          ic.status,
                    'description',     ic.description,
                    'payment_method',  ic.payment_method,
                    'receipt_url',     ic.receipt_url,
                    'created_at',      ic.created_at
                ) ORDER BY ic.created_at DESC)
             FROM public.investor_contributions ic
             WHERE ic.investor_id = v_inv_id
               AND ic.organization_id = ANY (v_orgs)),
            '[]'::jsonb
        ),
        'projects', COALESCE(
            (WITH project_ids AS (
                SELECT ip.project_id
                FROM public.investor_participations ip
                WHERE ip.investor_id = v_inv_id
                  AND ip.organization_id = ANY (v_orgs)

                UNION

                SELECT pr_legacy.id AS project_id
                FROM public.projects pr_legacy
                WHERE pr_legacy.investor_id = v_inv_id
                  AND pr_legacy.organization_id = ANY (v_orgs)
            )
             SELECT jsonb_agg(
                jsonb_build_object(
                    'id',              pr.id,
                    'organization_id', pr.organization_id,
                    'name',            pr.name,
                    'investor_id',     pr.investor_id,
                    -- Só o que o portal lê (InvestorDashboard, utils/investidorCarteira, AssetDetailModal):
                    -- valor, área, CUB, avanço, fase, local e as datas/fotos do diário. Nada de orçamento.
                    'settings',        jsonb_strip_nulls(jsonb_build_object(
                        'classification', pr.settings -> 'classification',
                        'investorId',     pr.settings -> 'investorId',
                        'financialInfo',  jsonb_strip_nulls(jsonb_build_object('totalValue', pr.settings -> 'financialInfo' -> 'totalValue')),
                        'area',           pr.settings -> 'area',
                        'cubRate',        pr.settings -> 'cubRate',
                        'obraProgress',   pr.settings -> 'obraProgress',
                        'obraPhase',      pr.settings -> 'obraPhase',
                        'location',       pr.settings -> 'location',
                        'diaryEntries',   (SELECT jsonb_agg(jsonb_build_object('date', e -> 'date', 'images', e -> 'images'))
                                             FROM jsonb_array_elements(
                                                 CASE WHEN jsonb_typeof(pr.settings -> 'diaryEntries') = 'array'
                                                      THEN pr.settings -> 'diaryEntries' ELSE '[]'::jsonb END) e)
                    ))
                )
                ORDER BY pr.name
             )
             FROM public.projects pr
             JOIN project_ids pi ON pi.project_id = pr.id
             WHERE pr.organization_id = ANY (v_orgs)
               AND pr.settings->>'classification' = 'OBRA'),
            '[]'::jsonb
        )
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_summary(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_summary(text) TO anon, authenticated;

-- ═══ A2 + A4 (S2/S4) — relatórios: colunas explícitas; relatório mensal sem destinatário não sai ═════
-- O relatório mensal antigo somava TODOS os investidores da org e era gravado sem investor_id: cada
-- investidor recebia os números dos outros. Documento geral (categoria ≠ 'relatorio') sem destinatário
-- continua indo a todos — é difusão intencional do gestor.
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_reports(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_org_id UUID;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_org_id := v_tok.org_id;

    RETURN jsonb_build_object(
        'valid',   TRUE,
        'reports', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                    'id',              r.id,
                    'organization_id', r.organization_id,
                    'investor_id',     r.investor_id,
                    'project_id',      r.project_id,
                    'name',            r.name,
                    'type',            r.type,
                    'category',        r.category,
                    'url',             r.url,
                    'report_date',     r.report_date,
                    'created_at',      r.created_at
                ) ORDER BY r.created_at DESC)
             FROM public.investor_reports r
             WHERE r.organization_id = v_org_id
               AND (r.investor_id = v_inv_id
                    OR (r.investor_id IS NULL AND r.category IS DISTINCT FROM 'relatorio'))),
            '[]'::jsonb
        )
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_reports(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_reports(text) TO anon, authenticated;

-- ═══ A5 (S5) — Data Room: só versão guardada na pasta da org do documento ═══════════════════════════
-- A Edge Function assina com service_role o caminho que esta RPC lista; um membro podia gravar uma
-- versão com storage_path de outra org. Caminho do GED = '<org>/<documento>/<arquivo>' (documentService).
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
                'version_number', ver.version_number,
                'category', doc.categoria, 'created_at', sh.shared_at) ORDER BY sh.shared_at DESC)
            FROM public.opura_document_portal_shares sh
            JOIN public.opura_documents doc ON doc.id = sh.document_id
            JOIN public.opura_document_versions ver
              ON ver.id = COALESCE(sh.version_id, doc.active_version_id)
             AND ver.document_id = doc.id
            WHERE sh.audience = 'investidor'
              AND sh.opportunity_id = p_opportunity_id
              AND doc.organization_id = v_opp.organization_id
              AND split_part(ver.storage_path, '/', 1) = doc.organization_id::text
        ), '[]'::jsonb)
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_dataroom(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_dataroom(TEXT, UUID) TO anon, authenticated;

-- ═══ A6 (S6) — marketplace público: chave própria e só a vitrine aberta ═════════════════════════════
-- Antes: toda oportunidade publicada para os investidores caía no marketplace (só o slug), com custo de
-- obra, terreno, margem e exposição. Agora: só as marcadas `no_marketplace`, com VGV, TIR e prazo.
ALTER TABLE public.investor_opportunities
    ADD COLUMN IF NOT EXISTS no_marketplace boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.investor_opportunities.no_marketplace IS
    'Aparece no marketplace público (get_public_marketplace, sem login). Independe de is_published (portal do investidor).';

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
        SELECT jsonb_build_object(
                'id',               v.vitrine -> 'id',
                'title',            v.vitrine -> 'title',
                'subtitle',         v.vitrine -> 'subtitle',
                'status',           v.vitrine -> 'status',
                'opportunity_type', v.vitrine -> 'opportunity_type',
                'ticket_min',       v.vitrine -> 'ticket_min',
                'thumbnail_url',    v.vitrine -> 'thumbnail_url',
                'fotos',            v.vitrine -> 'fotos',
                'local',            v.vitrine -> 'local',
                'open_date',        v.vitrine -> 'open_date',
                'created_at',       v.vitrine -> 'created_at',
                'is_published',     v.vitrine -> 'is_published',
                -- Só VGV e TIR do cálculo congelado, e o prazo: o resto do estudo é para quem tem o link.
                'indicadores_da_versao', CASE WHEN v.vitrine -> 'indicadores_da_versao' IS NULL OR v.vitrine -> 'indicadores_da_versao' = 'null'::jsonb THEN NULL
                    ELSE jsonb_strip_nulls(jsonb_build_object(
                        'vgv',      v.vitrine -> 'indicadores_da_versao' -> 'vgv',
                        'tirAnual', v.vitrine -> 'indicadores_da_versao' -> 'tirAnual')) END,
                'resultados_da_versao', CASE WHEN v.vitrine -> 'resultados_da_versao' IS NULL OR v.vitrine -> 'resultados_da_versao' = 'null'::jsonb THEN NULL
                    ELSE jsonb_strip_nulls(jsonb_build_object('duracao', v.vitrine -> 'resultados_da_versao' -> 'duracao')) END
            )::json AS item
        FROM public.investor_opportunities o
        CROSS JOIN LATERAL (SELECT public.fn_oportunidade_na_vitrine(o) AS vitrine) v
        WHERE o.organization_id = v_org_id
          AND o.is_published = true
          AND o.no_marketplace = true
    ) sub;

    RETURN json_build_object('organization', v_org_info, 'opportunities', v_opps);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_marketplace(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_marketplace(text) TO anon, authenticated;

-- ═══ A9 (S9) — interesses: tamanho limitado e um por investidor por oportunidade ════════════════════
-- 0 interesses hoje: as CHECKs e o índice entram sem migrar nada.
ALTER TABLE public.opportunity_interests DROP CONSTRAINT IF EXISTS opportunity_interests_tamanhos_chk;
ALTER TABLE public.opportunity_interests ADD CONSTRAINT opportunity_interests_tamanhos_chk CHECK (
    char_length(contact_name) <= 200
    AND (contact_email IS NULL OR char_length(contact_email) <= 254)
    AND (contact_phone IS NULL OR char_length(contact_phone) <= 40)
    AND (message IS NULL OR char_length(message) <= 2000)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunity_interests_investidor
    ON public.opportunity_interests (opportunity_id, investor_id) WHERE investor_id IS NOT NULL;

-- Pelo link: o segundo "Tenho interesse" do mesmo investidor ATUALIZA o primeiro (sem lead duplicado e sem
-- nova notificação — o gatilho de aviso é de INSERT).
CREATE OR REPLACE FUNCTION public.fn_investor_portal_submit_interest(p_token text, p_opportunity_id uuid, p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT 'investidor'::text, p_message text DEFAULT NULL::text, p_valor numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_opp    public.investor_opportunities;
    v_id     UUID;
    v_role   TEXT;
BEGIN
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'name_required');
    END IF;
    IF char_length(trim(p_name)) > 200 OR char_length(coalesce(p_email, '')) > 254
       OR char_length(coalesce(p_phone, '')) > 40 OR char_length(coalesce(p_message, '')) > 2000 THEN
        RETURN jsonb_build_object('valid', false, 'error', 'texto_longo');
    END IF;
    IF p_valor IS NOT NULL AND p_valor < 0 THEN
        RETURN jsonb_build_object('valid', false, 'error', 'valor_invalido');
    END IF;

    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'token_invalid');
    END IF;

    SELECT * INTO v_opp
    FROM public.investor_opportunities
    WHERE id = p_opportunity_id
      AND organization_id = ANY(public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id)
      AND is_published = TRUE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'opportunity_not_found');
    END IF;

    v_role := CASE
        WHEN p_role IN ('investidor','arquiteto','engenheiro','projetista','consultor','outro')
        THEN p_role
        ELSE 'outro'
    END;

    INSERT INTO public.opportunity_interests (
        organization_id, opportunity_id, investor_id, contact_name, contact_email, contact_phone, role, message, stage, valor_pretendido
    ) VALUES (
        v_opp.organization_id,
        p_opportunity_id,
        v_tok.investor_id,
        trim(p_name),
        nullif(trim(coalesce(p_email, '')), ''),
        nullif(trim(coalesce(p_phone, '')), ''),
        v_role,
        nullif(trim(coalesce(p_message, '')), ''),
        'lead',
        p_valor
    )
    ON CONFLICT (opportunity_id, investor_id) WHERE investor_id IS NOT NULL DO UPDATE
       SET contact_name     = EXCLUDED.contact_name,
           contact_email    = COALESCE(EXCLUDED.contact_email, opportunity_interests.contact_email),
           contact_phone    = COALESCE(EXCLUDED.contact_phone, opportunity_interests.contact_phone),
           message          = COALESCE(EXCLUDED.message, opportunity_interests.message),
           valor_pretendido = COALESCE(EXCLUDED.valor_pretendido, opportunity_interests.valor_pretendido)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'valid', true,
        'id', v_id,
        'organization_id', v_opp.organization_id,
        'opportunity_id', p_opportunity_id
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_submit_interest(text, uuid, text, text, text, text, text, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_submit_interest(text, uuid, text, text, text, text, text, numeric) TO anon, authenticated;

-- Pelo marketplace (sem login): só oportunidade da vitrine pública (A6) e com os mesmos limites.
CREATE OR REPLACE FUNCTION public.submit_public_interest(p_opportunity_id uuid, p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT 'investidor'::text, p_message text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id  uuid;
    v_opp     RECORD;
    v_id      uuid;
    v_role    text;
BEGIN
    IF trim(p_name) = '' OR p_name IS NULL THEN
        RETURN json_build_object('error', 'name_required');
    END IF;
    IF char_length(trim(p_name)) > 200 OR char_length(coalesce(p_email, '')) > 254
       OR char_length(coalesce(p_phone, '')) > 40 OR char_length(coalesce(p_message, '')) > 2000 THEN
        RETURN json_build_object('error', 'texto_longo');
    END IF;

    v_role := CASE
        WHEN p_role IN ('investidor','arquiteto','engenheiro','projetista','consultor','outro')
        THEN p_role
        ELSE 'outro'
    END;

    SELECT id, organization_id INTO v_opp
    FROM public.investor_opportunities
    WHERE id = p_opportunity_id
      AND is_published = true
      AND no_marketplace = true
    LIMIT 1;

    IF v_opp.id IS NULL THEN
        RETURN json_build_object('error', 'opportunity_not_found');
    END IF;

    v_org_id := v_opp.organization_id;

    INSERT INTO public.opportunity_interests (
        organization_id, opportunity_id, contact_name, contact_email, contact_phone, role, message, stage
    ) VALUES (
        v_org_id,
        p_opportunity_id,
        trim(p_name),
        nullif(trim(coalesce(p_email, '')), ''),
        nullif(trim(coalesce(p_phone, '')), ''),
        v_role,
        nullif(trim(coalesce(p_message, '')), ''),
        'lead'
    )
    RETURNING id INTO v_id;

    RETURN json_build_object('id', v_id, 'organization_id', v_org_id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.submit_public_interest(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_public_interest(uuid, text, text, text, text, text) TO anon, authenticated;

-- ═══ A7 (S7) — ciência e voto: só pelo investidor (RPC do link); apagar só o gestor ═════════════════
-- Antes: INSERT de qualquer membro da org (em nome de qualquer investidor) e FOR ALL dos admins. Como o voto
-- é definitivo (ON CONFLICT DO NOTHING na RPC), um voto posto antes bloqueava o investidor.
DROP POLICY IF EXISTS "Authenticated users can acknowledge" ON public.investor_acknowledgments;
DROP POLICY IF EXISTS "Admins can view all acknowledgments" ON public.investor_acknowledgments;
DROP POLICY IF EXISTS investor_ack_delete_gestor ON public.investor_acknowledgments;
CREATE POLICY investor_ack_delete_gestor ON public.investor_acknowledgments
    FOR DELETE TO authenticated
    USING (announcement_id IN (
        SELECT ia.id FROM public.investor_announcements ia
         WHERE ia.organization_id IN (SELECT public.minhas_orgs_gestor())
    ));
REVOKE INSERT, UPDATE, TRUNCATE ON public.investor_acknowledgments FROM anon, authenticated;
ALTER TABLE public.investor_acknowledgments DROP CONSTRAINT IF EXISTS investor_ack_voto_chk;
ALTER TABLE public.investor_acknowledgments ADD CONSTRAINT investor_ack_voto_chk
    CHECK (vote_option IS NULL OR vote_option IN ('sim', 'nao', 'abstencao'));

-- ═══ A8 (S8) — busca por CPF/CNPJ: de outra org, só "existe em <org>" ═══════════════════════════════
-- Antes: nome, código e org do investidor de QUALQUER org, para qualquer authenticated.
CREATE OR REPLACE FUNCTION public.find_investor_by_document(p_document text, p_exclude_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, code text, organization_id uuid, organization_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN visivel THEN i.id END,
         CASE WHEN visivel THEN i.name END,
         CASE WHEN visivel THEN i.code END,
         i.organization_id,
         o.name AS organization_name
    FROM public.investors i
    LEFT JOIN public.organizations o ON o.id = i.organization_id
    CROSS JOIN LATERAL (SELECT i.organization_id IN (SELECT public.minhas_orgs_membro()) AS visivel) v
   WHERE EXISTS (SELECT 1 FROM public.minhas_orgs_membro())   -- só quem é membro de alguma organização
     AND regexp_replace(COALESCE(i.document, ''), '\D', '', 'g') <> ''
     AND regexp_replace(i.document, '\D', '', 'g') = regexp_replace(COALESCE(p_document, ''), '\D', '', 'g')
     AND (p_exclude_id IS NULL OR i.id <> p_exclude_id)
   LIMIT 1;
$function$;
REVOKE EXECUTE ON FUNCTION public.find_investor_by_document(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.find_investor_by_document(text, uuid) TO authenticated;

-- ═══ A9 (S9) — investidor sem organização não é "adotável" ═════════════════════════════════════════
-- Antes: USING (organization_id IS NULL OR …) — a perna IS NULL liberava sozinha qualquer órfão (0 hoje).
DROP POLICY IF EXISTS investors_update ON public.investors;
CREATE POLICY investors_update ON public.investors
    FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT public.investors_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.investors_user_org_ids()));

-- A9 — a trava de execução pública que faltava (todas conferem token ou auth.uid() por dentro).
REVOKE EXECUTE ON FUNCTION public.investors_user_org_ids() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.investors_user_org_ids() TO anon, authenticated;
