-- ==========================================================================
-- Portal do Parceiro: a aba Documentos passa a espelhar a árvore
-- Pasta -> Disciplina -> Documentos do GED (antes agrupava por categoria).
--
-- A RPC de link público (anon, SECURITY DEFINER) é a única fonte de dados
-- nesse modo, então precisa devolver, além dos documentos:
--   - folder_id e discipline_code em cada documento;
--   - `folders`: o fecho recursivo das pastas que contêm docs compartilhados
--     MAIS todas as pastas-pai até a raiz (para reconstruir a hierarquia);
--   - `disciplines`: code -> name das disciplinas das orgs dos docs, para
--     exibir o nome completo (não só o código).
--
-- Muda a forma de retorno de {valid,data} para {valid,data,folders,disciplines}.
-- getSharedDocuments (client) continua lendo `.data`, então o dashboard não
-- quebra. CREATE OR REPLACE — idempotente, mesma assinatura.
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
                        'project_id', d.project_id, 'folder_id', d.folder_id,
                        'discipline_code', d.discipline_code,
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
        ), '[]'::jsonb),
        -- Fecho recursivo: pastas dos docs compartilhados + toda a cadeia de pais.
        'folders', COALESCE((
            WITH RECURSIVE shared_folders AS (
                SELECT DISTINCT d.folder_id AS fid
                FROM public.partner_shared_documents psd
                JOIN public.opura_documents d ON d.id = psd.document_id
                WHERE psd.partner_workspace_id = v_ws AND d.folder_id IS NOT NULL
            ),
            tree AS (
                SELECT f.id, f.name, f.parent_id, f.naming_mask
                FROM public.opura_folders f
                WHERE f.id IN (SELECT fid FROM shared_folders)
                UNION
                SELECT p.id, p.name, p.parent_id, p.naming_mask
                FROM public.opura_folders p
                JOIN tree tt ON p.id = tt.parent_id
            )
            SELECT jsonb_agg(jsonb_build_object(
                'id', id, 'name', name, 'parent_id', parent_id, 'naming_mask', naming_mask
            ))
            FROM tree
        ), '[]'::jsonb),
        -- Disciplinas das organizações dos documentos compartilhados (code -> name).
        'disciplines', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('code', dis.code, 'name', dis.name))
            FROM public.opura_dms_disciplines dis
            WHERE dis.organization_id IN (
                SELECT DISTINCT d.organization_id
                FROM public.partner_shared_documents psd
                JOIN public.opura_documents d ON d.id = psd.document_id
                WHERE psd.partner_workspace_id = v_ws
            )
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_get_shared_documents(TEXT) TO anon, authenticated;
