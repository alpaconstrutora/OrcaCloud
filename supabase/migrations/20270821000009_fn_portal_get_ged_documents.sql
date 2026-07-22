-- migration: 20270821000009_fn_portal_get_ged_documents.sql
-- Portal do Cliente — aba "Documentos" passa a ler do GED (opura_documents)
-- em vez do array JSON solto `clientDocuments`. Mesmo padrão de
-- fn_portal_get_contracts: RPC SECURITY DEFINER validada por token, porque o
-- portal acessa como anon e opura_documents só tem policy `TO authenticated`.
-- Só retorna documentos explicitamente compartilhados com o cliente do token
-- via opura_document_portal_shares (audience='cliente') — ver migration
-- 20270821000008 e o botão "Compartilhar" do GED.

CREATE OR REPLACE FUNCTION public.fn_portal_get_ged_documents(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    RETURN json_build_object(
        'valid', TRUE,
        'data', (
            SELECT COALESCE(json_agg(d ORDER BY d.shared_at DESC), '[]'::json)
            FROM (
                SELECT
                    doc.id,
                    doc.nome,
                    doc.descricao,
                    doc.categoria,
                    doc.tipo_documento,
                    doc.data_validade,
                    ver.storage_path,
                    ver.mime_type,
                    ver.tamanho,
                    ver.version_number,
                    sh.shared_at
                FROM public.opura_document_portal_shares sh
                JOIN public.opura_documents doc ON doc.id = sh.document_id
                LEFT JOIN public.opura_document_versions ver ON ver.id = doc.active_version_id
                WHERE sh.audience = 'cliente'
                  AND sh.client_id = v_tok.client_id
                  AND doc.organization_id = v_tok.org_id
            ) d
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_get_ged_documents(TEXT) TO anon, authenticated;
