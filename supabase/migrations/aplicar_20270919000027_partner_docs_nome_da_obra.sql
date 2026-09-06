-- ==========================================================================
-- Portal do Parceiro > Documentos: a coluna "Obra Vinculada" passa a mostrar
-- a obra.
--
-- --- O defeito -----------------------------------------------------------
--
-- A tabela do parceiro declara a coluna `project_id` com o rotulo "Obra
-- Vinculada" (PartnerPortal.tsx e PartnerWorkspaceManager.tsx), mas as duas
-- telas passavam `resolveProjectName={() => '-'}` fixo. Os 74 documentos hoje
-- compartilhados TEM obra (`project_id` preenchido e existente em `projects`,
-- nos 3 workspaces com link ativo) -- a coluna simplesmente nunca perguntava.
--
-- --- Por que o nome vem daqui, e nao de uma consulta na tela --------------
--
-- Pelo LINK publico a sessao e anon: ela nao le `projects`, e nao deve passar
-- a ler -- seria abrir o cadastro de obras da organizacao inteira para
-- descobrir um nome. O documento, esse sim, ja esta autorizado (foi
-- compartilhado). Entao o nome viaja junto do documento, resolvido aqui
-- dentro, onde a autorizacao ja aconteceu.
--
-- E como `partner_ws_shared_documents` e a fonte unica desde
-- 20270919000026, um LEFT JOIN resolve os TRES modos de uma vez: link
-- publico, portal do parceiro autenticado e a aba Documentos GED do lado
-- interno (PartnerWorkspaceManager). Era exatamente para isso que a
-- unificacao servia.
--
-- Unica mudanca: `'project_name', pr.name` no objeto `document`. O restante do
-- corpo e identico a 20270919000026 -- `CREATE OR REPLACE` substitui a funcao
-- inteira, entao ela vai completa, e nao so o trecho novo.
-- ==========================================================================

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
                            -- Nome da obra resolvido aqui: pelo link a sessao e anon e nao
                            -- le `projects`. NULL quando o documento aponta para obra de
                            -- fora do alcance -- a tela mostra "Vinculo Externo".
                            'project_name', pr.name,
                            'organization_id', d.organization_id,
                            'discipline_code', d.discipline_code,
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
                    LEFT JOIN public.projects pr ON pr.id = d.project_id
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

-- Nucleo continua nao sendo chamavel direto: so pelas cascas
-- (partner_get_shared_document_tree e partner_portal_get_shared_documents),
-- que sao as unicas que sabem autorizar o workspace pedido.
REVOKE ALL ON FUNCTION public.partner_ws_shared_documents(UUID) FROM PUBLIC, anon, authenticated;
