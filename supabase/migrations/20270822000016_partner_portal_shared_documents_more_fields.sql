-- ==========================================================================
-- Amplia o payload de `partner_portal_get_shared_documents` com os campos que
-- a nova tabela de Documentos do Portal do Parceiro passou a exibir (mesma
-- <DocumentsTable> da Gestão de Documentos / GED): autor, data_emissao,
-- data_validade e project_id. No modo autenticado esses campos já vinham
-- completos via `partnerService.listSharedDocuments` (join direto em
-- opura_documents); só o modo de link público (RPC, sessão anon) ficava com
-- um subconjunto. CREATE OR REPLACE — idempotente, mesma assinatura.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.partner_portal_get_shared_documents(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(row_to_json(t) ORDER BY t.shared_at DESC)
            FROM (
                SELECT
                    psd.id, psd.partner_workspace_id, psd.document_id, psd.shared_by, psd.shared_at,
                    jsonb_build_object(
                        'id', d.id, 'nome', d.nome, 'descricao', d.descricao, 'categoria', d.categoria,
                        'tipo_documento', d.tipo_documento, 'status', d.status, 'autor', d.autor,
                        'data_emissao', d.data_emissao, 'data_validade', d.data_validade,
                        'project_id', d.project_id,
                        'active_version', jsonb_build_object(
                            'id', v.id, 'storage_path', v.storage_path,
                            'mime_type', v.mime_type, 'tamanho', v.tamanho, 'version_number', v.version_number
                        )
                    ) AS document
                FROM public.partner_shared_documents psd
                JOIN public.opura_documents d ON d.id = psd.document_id
                LEFT JOIN public.opura_document_versions v ON v.id = d.active_version_id
                WHERE psd.partner_workspace_id = v_ws
            ) t
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_get_shared_documents(TEXT) TO anon, authenticated;
