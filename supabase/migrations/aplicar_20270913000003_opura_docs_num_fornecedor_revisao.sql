-- ==========================================================================
-- Gestão de Documentos (GED): dois campos novos pedidos pelo usuário —
-- "Nº do Documento (Fornecedor)" e "Revisão" — ambos texto livre, preenchidos
-- manualmente no upload/edição do documento (revisão NÃO reaproveita o token
-- [REVISAO] da máscara de nomenclatura de pasta, que é um conceito diferente:
-- aquele é extraído do nome do arquivo só quando a pasta tem naming_mask).
--
-- Também atualiza `partner_portal_get_shared_documents` (RPC do link público
-- do Portal do Parceiro, sessão anon/token) para incluir os 2 campos no
-- payload — mesmo padrão de 20270822000016_partner_portal_shared_documents_more_fields.sql.
-- O modo autenticado (partnerService.listSharedDocuments) já usa select('*'),
-- então não precisa de mudança.
-- ==========================================================================

ALTER TABLE public.opura_documents
  ADD COLUMN IF NOT EXISTS numero_documento_fornecedor TEXT,
  ADD COLUMN IF NOT EXISTS revisao TEXT;

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
                        'numero_documento_fornecedor', d.numero_documento_fornecedor,
                        'revisao', d.revisao,
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
