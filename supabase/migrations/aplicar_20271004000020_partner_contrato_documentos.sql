-- ============================================================
-- Migration: aplicar_20271004000020_partner_contrato_documentos.sql
-- Portal do Parceiro — a aba Emissão do contrato chega ao parceiro.
-- Plano: docs/planos/2026-10-04-portal-parceiro-documentos-do-contrato.md
-- Autorizado pelo usuário em 2026-10-04 ("Sim, aplicar a migration";
-- "Ligada nos dois" para os workspaces já configurados).
--
-- 1) O núcleo `partner_ws_contract_detail` (fonte ÚNICA das duas visões: casca
--    do app `partner_get_contract_detail` e casca do link
--    `partner_portal_get_contract_detail`) ganha a coleção `documents`: as
--    versões EMITIDAS de contract_document_versions, do contrato e dos aditivos.
--    Rascunho nunca sai. Campos explícitos — sem signature_token (credencial do
--    ZapSign), storage_path, created_by, template_id, organization_id.
--
--    ⚠️ Corpo partiu da definição VIGENTE no banco (pg_get_functiondef em
--    04/10/2026, 3255 caracteres, 8 coleções), não de migration antiga — ver a
--    memória da "gêmea regredida". As 8 coleções seguem idênticas.
--
-- 2) Os 2 workspaces que já tinham `partnerContractTabs` salvo recebem
--    'documentos' na lista (os outros 8 nunca configuraram → todas as abas).
--
-- REGRA #7: o núcleo continua SEM grant (só as cascas, SECURITY DEFINER, o
-- alcançam) — REVOKE literal abaixo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.partner_ws_contract_detail(p_ws uuid, p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_supplier UUID;
BEGIN
    SELECT supplier_id INTO v_supplier FROM public.partner_workspaces WHERE id = p_ws;
    IF v_supplier IS NULL THEN RETURN NULL; END IF;

    -- O contrato pedido tem de ser DESTE fornecedor.
    IF NOT EXISTS (
        SELECT 1 FROM public.contracts c WHERE c.id = p_contract_id AND c.supplier_id = v_supplier
    ) THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'items', COALESCE((
            SELECT jsonb_agg(row_to_json(i) ORDER BY i.created_at ASC)
            FROM public.contract_items i WHERE i.contract_id = p_contract_id
        ), '[]'::jsonb),
        'addendums', COALESCE((
            SELECT jsonb_agg(row_to_json(a) ORDER BY a.created_at DESC)
            FROM public.contract_addendums a WHERE a.contract_id = p_contract_id
        ), '[]'::jsonb),
        'measurements', COALESCE((
            SELECT jsonb_agg(row_to_json(m) ORDER BY m.number DESC)
            FROM public.contract_measurements m WHERE m.contract_id = p_contract_id
        ), '[]'::jsonb),
        -- Execução & Entrega ───────────────────────────────────────────────
        'precedent_conditions', COALESCE((
            SELECT jsonb_agg(row_to_json(pc) ORDER BY pc.sort_order ASC, pc.created_at ASC)
            FROM public.contract_precedent_conditions pc WHERE pc.contract_id = p_contract_id
        ), '[]'::jsonb),
        'document_requirements', COALESCE((
            SELECT jsonb_agg(row_to_json(dr) ORDER BY dr.phase ASC, dr.created_at ASC)
            FROM public.contract_document_requirements dr
            WHERE dr.contract_id = p_contract_id AND COALESCE(dr.applicable, TRUE)
        ), '[]'::jsonb),
        'acceptances', COALESCE((
            SELECT jsonb_agg(row_to_json(ac) ORDER BY ac.issued_at ASC)
            FROM public.contract_acceptances ac WHERE ac.contract_id = p_contract_id
        ), '[]'::jsonb),
        -- Retenção de Garantia — o ledger é a MESMA função que valida a
        -- liberação do lado interno (`releaseRetention`), então o número que o
        -- parceiro vê é o número contra o qual a construtora libera.
        'retention', (
            SELECT jsonb_build_object(
                'total_retained', l.total_retained,
                'total_released', l.total_released,
                'balance', l.balance,
                'releases', COALESCE((
                    SELECT jsonb_agg(row_to_json(r) ORDER BY r.released_at DESC, r.created_at DESC)
                    FROM public.contract_retention_releases r WHERE r.contract_id = p_contract_id
                ), '[]'::jsonb)
            )
            FROM public.fn_contract_retention_ledger(p_contract_id) l
        ),
        -- Penalidades — inclusive canceladas: a tela mostra o status, e sumir
        -- com uma penalidade cancelada esconderia que ela existiu.
        'penalties', COALESCE((
            SELECT jsonb_agg(row_to_json(p) ORDER BY p.created_at DESC)
            FROM public.contract_penalties p WHERE p.contract_id = p_contract_id
        ), '[]'::jsonb),
        -- Documentos (aba Emissão) — só versões EMITIDAS, do contrato e dos
        -- aditivos, mais recente primeiro. Rascunho é trabalho interno.
        'documents', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', d.id,
                'owner_type', d.owner_type,
                'owner_id', d.owner_id,
                'addendum_number', ad.number,
                'v', d.v,
                'kind', d.kind,
                'name', d.name,
                'notes', d.notes,
                'url', d.url,
                'mime_type', d.mime_type,
                'size_bytes', d.size_bytes,
                'emitted_at', d.emitted_at,
                'created_at', d.created_at,
                'signature_status', d.signature_status,
                'signed_file_url', d.signed_file_url
            ) ORDER BY COALESCE(d.emitted_at, d.created_at) DESC, d.v DESC)
            FROM public.contract_document_versions d
            LEFT JOIN public.contract_addendums ad
                   ON d.owner_type = 'ADDENDUM' AND ad.id = d.owner_id
            WHERE d.contract_id = p_contract_id AND d.emitted
        ), '[]'::jsonb)
    );
END;
$function$;

-- Núcleo sem grant: só as cascas (SECURITY DEFINER) o executam.
REVOKE EXECUTE ON FUNCTION public.partner_ws_contract_detail(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2) Workspaces com lista de abas do contrato já salva: liga 'documentos'.
UPDATE public.partner_workspaces
   SET settings = jsonb_set(settings, '{partnerContractTabs}',
                            (settings->'partnerContractTabs') || '["documentos"]'::jsonb)
 WHERE jsonb_typeof(settings->'partnerContractTabs') = 'array'
   AND NOT (settings->'partnerContractTabs') ? 'documentos';

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_def text := pg_get_functiondef('public.partner_ws_contract_detail'::regproc);
    v_acl text;
    v_sem int;
BEGIN
    IF v_def NOT LIKE '%''documents''%' OR v_def NOT LIKE '%''penalties''%' OR v_def NOT LIKE '%''precedent_conditions''%' THEN
        RAISE EXCEPTION 'núcleo sem as 9 coleções esperadas';
    END IF;
    IF v_def LIKE '%signature_token%' THEN
        RAISE EXCEPTION 'núcleo não pode expor signature_token';
    END IF;
    SELECT proacl::text INTO v_acl FROM pg_proc WHERE oid = 'public.partner_ws_contract_detail'::regproc;
    IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=X%' THEN
        RAISE EXCEPTION 'núcleo ficou executável fora das cascas: %', v_acl;
    END IF;
    SELECT count(*) INTO v_sem FROM public.partner_workspaces
     WHERE jsonb_typeof(settings->'partnerContractTabs') = 'array'
       AND NOT (settings->'partnerContractTabs') ? 'documentos';
    IF v_sem > 0 THEN RAISE EXCEPTION '% workspace(s) configurado(s) sem documentos', v_sem; END IF;
    RAISE NOTICE 'OK — núcleo com documents, ACL %', v_acl;
END $$;
