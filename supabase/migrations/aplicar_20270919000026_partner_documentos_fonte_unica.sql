-- ==========================================================================
-- Portal do Parceiro x Gestao de Documentos (GED): a visao do PARCEIRO
-- (link publico) volta a enxergar o mesmo que a visao do APP.
--
-- --- O defeito, medido em producao (06/09/2026) ---------------------------
--
--   workspace                            avulsos  pastas  docs_na_pasta  via_link
--   16986ea6-7ab7-4dcf-9dd8-1667bb16984a       0       1             65         0
--   2c126174-53d4-4419-b7cc-2aa049828039       0       1              4         0
--   c46457bb-539c-4754-89b7-52aa99511818       5       0              0         5
--
-- Dois parceiros com link ativo abriam a aba Documentos e viam ZERO arquivos,
-- enquanto os mesmos 65 e 4 documentos apareciam normalmente pelo app. O
-- payload do link tambem vinha sem `folders`, sem `disciplines` e sem
-- `shared_folder_ids` -- ou seja, sem a arvore lateral inteira.
--
-- --- Como quebrou --------------------------------------------------------
--
-- 20270861000000 ensinou as DUAS leituras a unir os documentos avulsos
-- (`partner_shared_documents`) com os que chegam por PASTA
-- (`partner_shared_folders`), escrevendo o mesmo corpo duas vezes:
-- `partner_get_shared_document_tree` (app) e `partner_portal_get_shared_documents`
-- (link). Gemeas.
--
-- Depois, `aplicar_20270913000003_opura_docs_num_fornecedor_revisao.sql` -- que
-- so queria acrescentar dois campos novos ao payload do link -- reescreveu a
-- gemea do link a partir da versao ANTERIOR (20270822000016), a que so lia
-- `partner_shared_documents`. O `CREATE OR REPLACE` nao avisa que o corpo
-- regrediu; a outra gemea seguiu correta, e por isso o app continuou certo.
--
-- E o prejuizo foi nos dois sentidos: a gemea do app nunca ganhou
-- `numero_documento_fornecedor` e `revisao`, entao as duas colunas que a tabela
-- do parceiro declara (PartnerPortal.tsx, PARTNER_DOC_COLUMNS) desenhavam "-"
-- pelo app.
--
-- --- A correcao ----------------------------------------------------------
--
-- Mesma forma de 20270863000000, que ja tinha feito isso para Contratos,
-- Financeiro, Solicitacoes e Conversas: UM corpo (`partner_ws_shared_documents`)
-- e duas cascas finas que so diferem em COMO autorizam.
--
--   link  -> partner_portal_workspace_from_token(p_token) -> partner_ws_shared_documents
--   app   -> partner_can_access_workspace(p_ws)           -> partner_ws_shared_documents
--
-- Assim a paridade passa a ser estrutural: a proxima migration que acrescentar
-- um campo mexe num lugar so, e nao tem como acertar um modo e esquecer o outro.
--
-- O nucleo NAO recebe grant: so e alcancavel pelas cascas (SECURITY DEFINER,
-- rodam como o dono). Sem isso qualquer sessao passaria um workspace arbitrario.
-- ==========================================================================

-- --- 1. IMPLEMENTACAO UNICA ----------------------------------------------
-- Corpo identico ao que 20270862000000 deixou na gemea do app, mais os dois
-- campos de 20270913000003. Sem envelope: quem poe `valid` e a casca, porque
-- so ela sabe se a sessao e valida.
CREATE OR REPLACE FUNCTION public.partner_ws_shared_documents(p_ws UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
BEGIN
    IF p_ws IS NULL THEN
        RETURN jsonb_build_object(
            'documents', '[]'::jsonb, 'folders', '[]'::jsonb,
            'shared_folder_ids', '[]'::jsonb, 'disciplines', '[]'::jsonb
        );
    END IF;

    RETURN (
        WITH visible_folders AS (
            SELECT vf.fid, vf.root_id FROM public.partner_workspace_visible_folder_ids(p_ws) vf
        ),
        -- Documentos: avulsos (partner_shared_documents) UNIDOS aos que vivem
        -- dentro de uma pasta compartilhada. DISTINCT ON evita duplicar quem e
        -- as duas coisas; o vinculo avulso ganha, por ser o mais especifico.
        docs AS (
            SELECT DISTINCT ON (src.document_id)
                src.id, src.document_id, src.shared_by, src.shared_at, src.origin
            FROM (
                SELECT psd.id, psd.document_id, psd.shared_by, psd.shared_at, 0 AS origin
                FROM public.partner_shared_documents psd
                WHERE psd.partner_workspace_id = p_ws
                UNION ALL
                -- Documentos que chegam pela PASTA: cada um herda o vinculo da raiz
                -- compartilhada de onde ele descende (nada de produto cartesiano).
                SELECT psf.id, d2.id AS document_id, psf.shared_by, psf.shared_at, 1 AS origin
                FROM visible_folders vf2
                JOIN public.opura_documents d2 ON d2.folder_id = vf2.fid
                JOIN public.partner_shared_folders psf
                  ON psf.partner_workspace_id = p_ws
                 AND psf.folder_id = vf2.root_id
            ) src
            ORDER BY src.document_id, src.origin
        )
        SELECT jsonb_build_object(
            'documents', COALESCE((
                SELECT jsonb_agg(row_to_json(t) ORDER BY t.shared_at DESC)
                FROM (
                    SELECT
                        docs.id,
                        p_ws AS partner_workspace_id,
                        docs.document_id, docs.shared_by, docs.shared_at,
                        jsonb_build_object(
                            'id', d.id, 'nome', d.nome, 'descricao', d.descricao, 'categoria', d.categoria,
                            'tipo_documento', d.tipo_documento, 'status', d.status, 'autor', d.autor,
                            'data_emissao', d.data_emissao, 'data_validade', d.data_validade,
                            'project_id', d.project_id, 'folder_id', d.folder_id,
                            'organization_id', d.organization_id,
                            'discipline_code', d.discipline_code,
                            -- Colunas que a tabela do parceiro declara e que ate aqui
                            -- so existiam no payload do link (20270913000003).
                            'numero_documento_fornecedor', d.numero_documento_fornecedor,
                            'revisao', d.revisao,
                            'active_version', jsonb_build_object(
                                'id', v.id, 'storage_path', v.storage_path,
                                'mime_type', v.mime_type, 'tamanho', v.tamanho, 'version_number', v.version_number
                            )
                        ) AS document
                    FROM docs
                    JOIN public.opura_documents d ON d.id = docs.document_id
                    LEFT JOIN public.opura_document_versions v ON v.id = d.active_version_id
                ) t
            ), '[]'::jsonb),
            'folders', COALESCE((
                WITH RECURSIVE seeds AS (
                    -- subarvore das pastas compartilhadas (mesmo sem documento)
                    SELECT vf3.fid AS id FROM visible_folders vf3
                    UNION
                    -- pastas dos documentos avulsos, que podem estar fora daquelas
                    SELECT d3.folder_id
                    FROM public.partner_shared_documents psd3
                    JOIN public.opura_documents d3 ON d3.id = psd3.document_id
                    WHERE psd3.partner_workspace_id = p_ws AND d3.folder_id IS NOT NULL
                ),
                tree AS (
                    SELECT f.id, f.name, f.parent_id, f.naming_mask
                    FROM public.opura_folders f
                    WHERE f.id IN (SELECT s.id FROM seeds s)
                    UNION
                    SELECT p.id, p.name, p.parent_id, p.naming_mask
                    FROM public.opura_folders p
                    JOIN tree tt ON p.id = tt.parent_id
                )
                SELECT jsonb_agg(jsonb_build_object(
                    'id', tree.id, 'name', tree.name, 'parent_id', tree.parent_id, 'naming_mask', tree.naming_mask
                ))
                FROM tree
            ), '[]'::jsonb),
            'shared_folder_ids', COALESCE((
                SELECT jsonb_agg(DISTINCT vf4.fid) FROM visible_folders vf4
            ), '[]'::jsonb),
            'disciplines', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('code', dis.code, 'name', dis.name))
                FROM public.opura_dms_disciplines dis
                WHERE dis.organization_id IN (
                    SELECT DISTINCT d4.organization_id
                    FROM docs
                    JOIN public.opura_documents d4 ON d4.id = docs.document_id
                )
            ), '[]'::jsonb)
        )
    );
END;
$X$;

-- Nucleo nao e chamavel direto por ninguem: so pelas cascas, que rodam como o
-- dono da funcao e sao as unicas que sabem autorizar o workspace pedido.
REVOKE ALL ON FUNCTION public.partner_ws_shared_documents(UUID) FROM PUBLIC, anon, authenticated;

-- --- 2. CASCA DO APP (mesma saida de antes: documents/folders/...) --------
-- Nao autorizado devolve as quatro listas vazias, e nao erro -- e o contrato que
-- partnerService.listSharedDocumentTree ja consome desde 20270860000000.
CREATE OR REPLACE FUNCTION public.partner_get_shared_document_tree(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
BEGIN
    IF NOT public.partner_can_access_workspace(p_workspace_id) THEN
        RETURN jsonb_build_object(
            'documents', '[]'::jsonb, 'folders', '[]'::jsonb,
            'shared_folder_ids', '[]'::jsonb, 'disciplines', '[]'::jsonb
        );
    END IF;

    RETURN public.partner_ws_shared_documents(p_workspace_id);
END;
$X$;

REVOKE ALL ON FUNCTION public.partner_get_shared_document_tree(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_get_shared_document_tree(UUID) TO authenticated;

-- --- 3. CASCA DO LINK PUBLICO --------------------------------------------
-- Mantem as chaves {valid, data, folders, disciplines, shared_folder_ids} de
-- 20270861000000: o cliente le `.data` (getSharedDocuments) e o resto no
-- getSharedDocumentsBundle. `documents` vira `data` aqui e em nenhum outro lugar.
CREATE OR REPLACE FUNCTION public.partner_portal_get_shared_documents(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_payload JSONB;
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_payload := public.partner_ws_shared_documents(v_ws);

    RETURN jsonb_build_object('valid', TRUE, 'data', v_payload -> 'documents')
           || (v_payload - 'documents');
END;
$X$;

REVOKE ALL ON FUNCTION public.partner_portal_get_shared_documents(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_get_shared_documents(TEXT) TO anon, authenticated;
