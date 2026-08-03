-- ==========================================================================
-- Corrige 3 defeitos introduzidos por 20270861000000. Eu reescrevi as policies
-- a partir de 20261219000001, sem notar que DUAS delas já tinham sido
-- substituídas depois — então a versão "nova" era, na prática, um retrocesso.
--
-- 1. BUG REPORTADO (erro 42501 ao compartilhar pasta):
--    `shared_folders_manage` usa get_workspaces_for_member(), que filtra
--    `pw.organization_id IN (orgs do usuário)`. Workspace de fornecedor GLOBAL
--    tem organization_id NULL, e `NULL IN (...)` é NULL → insert negado.
--    Foi exatamente por isso que 20270124000000 trocou o dialeto de
--    shared_docs_manage para `organization_id IS NULL OR is_org_member(...)`.
--    Aqui as policies de pasta passam a usar o mesmo dialeto.
--
-- 2. REGRESSÃO DE SEGURANÇA em storage_docs_select_partner: a versão vigente
--    (20270124000000) casava o objeto pedido contra o storage_path das versões
--    do documento compartilhado. Eu troquei por um EXISTS solto que só perguntava
--    "este parceiro tem ALGUM compartilhamento?" — o que liberava o bucket
--    'opura-docs' INTEIRO, de todas as organizações, para qualquer parceiro com
--    um único documento compartilhado. Restaurada a checagem por storage_path.
--
-- 3. REGRESSÃO em docs_select_partner: a versão vigente (20261219000002) exigia
--    `pw.is_active = TRUE`. get_user_partner_workspaces() só filtra pu.is_active,
--    então um workspace DESATIVADO continuava entregando documentos. Restaurado.
-- ==========================================================================

-- ─── 1. EXPANSÃO DA SUBÁRVORE: exigir workspace ativo ──────────────────────
-- Concentra aqui o filtro pu.is_active + pw.is_active, para as duas policies
-- abaixo herdarem a mesma regra sem repetir join.
CREATE OR REPLACE FUNCTION public.partner_user_visible_folder_ids(p_email TEXT)
RETURNS TABLE (fid UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
    WITH RECURSIVE roots AS (
        SELECT psf.folder_id AS id, psf.include_subfolders AS deep
        FROM public.partner_shared_folders psf
        JOIN public.partner_workspaces pw ON pw.id = psf.partner_workspace_id
        JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
        WHERE pu.email = p_email
          AND pu.is_active = TRUE
          AND pw.is_active = TRUE
    ),
    tree AS (
        SELECT r.id, r.deep FROM roots r
        UNION
        SELECT f.id, t.deep
        FROM public.opura_folders f
        JOIN tree t ON f.parent_id = t.id
        WHERE t.deep
    )
    SELECT DISTINCT t.id FROM tree t;
$X$;

-- ─── 2. POLICIES DA TABELA DE PASTAS ───────────────────────────────────────
-- Mesmo dialeto de shared_docs_select / shared_docs_manage (20270124000000):
-- tolera workspace global (organization_id IS NULL).
DROP POLICY IF EXISTS "shared_folders_select" ON public.partner_shared_folders;
CREATE POLICY "shared_folders_select" ON public.partner_shared_folders
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT pw.id FROM public.partner_workspaces pw
            WHERE pw.organization_id IS NULL OR public.is_org_member(pw.organization_id)
        )
        OR partner_workspace_id IN (
            SELECT pu.partner_workspace_id FROM public.partner_users pu
            WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE
        )
    );

DROP POLICY IF EXISTS "shared_folders_manage" ON public.partner_shared_folders;
CREATE POLICY "shared_folders_manage" ON public.partner_shared_folders
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT pw.id FROM public.partner_workspaces pw
            WHERE pw.organization_id IS NULL OR public.is_org_member(pw.organization_id)
        )
    );

-- ─── 3. DOCUMENTO VISÍVEL AO PARCEIRO ──────────────────────────────────────
-- Restaura pw.is_active/pu.is_active do vínculo avulso (20261219000002) e
-- acrescenta o ramo da pasta, que já carrega os mesmos filtros via a função.
DROP POLICY IF EXISTS "docs_select_partner" ON public.opura_documents;
CREATE POLICY "docs_select_partner" ON public.opura_documents
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT psd.document_id FROM public.partner_shared_documents psd
      JOIN public.partner_workspaces pw ON pw.id = psd.partner_workspace_id
      JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
      WHERE pu.email = auth.jwt() ->> 'email'
        AND pu.is_active = TRUE
        AND pw.is_active = TRUE
    )
    OR (
      folder_id IS NOT NULL
      AND folder_id IN (
        SELECT f.fid FROM public.partner_user_visible_folder_ids(auth.jwt() ->> 'email') f
      )
    )
  );

-- ─── 4. DOWNLOAD (storage.objects) ─────────────────────────────────────────
-- Volta a casar o OBJETO PEDIDO contra o storage_path das versões do documento
-- — não basta o parceiro ter algum compartilhamento. Duas origens, mesma regra.
DROP POLICY IF EXISTS "storage_docs_select_partner" ON storage.objects;
CREATE POLICY "storage_docs_select_partner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'opura-docs'
    AND (
      EXISTS (
        SELECT 1 FROM public.partner_shared_documents psd
        JOIN public.partner_workspaces pw ON pw.id = psd.partner_workspace_id
        JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
        JOIN public.opura_document_versions v ON v.document_id = psd.document_id
        WHERE pu.email = auth.jwt() ->> 'email'
          AND pu.is_active = TRUE
          AND pw.is_active = TRUE
          AND v.storage_path = name
      )
      OR EXISTS (
        SELECT 1
        FROM public.opura_documents d
        JOIN public.opura_document_versions v ON v.document_id = d.id
        WHERE v.storage_path = name
          AND d.folder_id IS NOT NULL
          AND d.folder_id IN (
            SELECT f.fid FROM public.partner_user_visible_folder_ids(auth.jwt() ->> 'email') f
          )
      )
    )
  );

-- ─── 5. RPC DA ÁRVORE: mesma armadilha do workspace global ─────────────────
-- A checagem de autorização usava get_workspaces_for_member(), então o preview
-- do admin sobre um workspace GLOBAL caía no ramo "não autorizado" e devolvia
-- árvore vazia — sem erro visível, só uma tela sem nada. Só o predicado muda;
-- o corpo é o de 20270861000000.
CREATE OR REPLACE FUNCTION public.partner_get_shared_document_tree(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_email TEXT := auth.jwt() ->> 'email';
    v_allowed BOOLEAN;
BEGIN
    IF v_email IS NULL OR p_workspace_id IS NULL THEN
        RETURN jsonb_build_object('documents', '[]'::jsonb, 'folders', '[]'::jsonb, 'shared_folder_ids', '[]'::jsonb, 'disciplines', '[]'::jsonb);
    END IF;

    -- Mesmo dialeto de 20270124000000: workspace GLOBAL (organization_id NULL)
    -- nao pertence a nenhuma org, entao get_workspaces_for_member() nunca o
    -- devolve e o preview do admin voltava arvore vazia.
    SELECT
        p_workspace_id IN (SELECT public.get_user_partner_workspaces(v_email))
     OR EXISTS (
            SELECT 1 FROM public.partner_workspaces pw
            WHERE pw.id = p_workspace_id
              AND (pw.organization_id IS NULL OR public.is_org_member(pw.organization_id))
        )
    INTO v_allowed;

    IF NOT COALESCE(v_allowed, FALSE) THEN
        RETURN jsonb_build_object('documents', '[]'::jsonb, 'folders', '[]'::jsonb, 'shared_folder_ids', '[]'::jsonb, 'disciplines', '[]'::jsonb);
    END IF;

    RETURN (
        WITH visible_folders AS (
            SELECT vf.fid, vf.root_id FROM public.partner_workspace_visible_folder_ids(p_workspace_id) vf
        ),
        -- Documentos: avulsos (partner_shared_documents) UNIDOS aos que vivem
        -- dentro de uma pasta compartilhada. DISTINCT ON evita duplicar quem é
        -- as duas coisas; o vínculo avulso ganha, por ser o mais específico.
        docs AS (
            SELECT DISTINCT ON (src.document_id)
                src.id, src.document_id, src.shared_by, src.shared_at, src.origin
            FROM (
                SELECT psd.id, psd.document_id, psd.shared_by, psd.shared_at, 0 AS origin
                FROM public.partner_shared_documents psd
                WHERE psd.partner_workspace_id = p_workspace_id
                UNION ALL
                -- Documentos que chegam pela PASTA: cada um herda o vínculo da raiz
                -- compartilhada de onde ele descende (nada de produto cartesiano).
                SELECT psf.id, d2.id AS document_id, psf.shared_by, psf.shared_at, 1 AS origin
                FROM visible_folders vf2
                JOIN public.opura_documents d2 ON d2.folder_id = vf2.fid
                JOIN public.partner_shared_folders psf
                  ON psf.partner_workspace_id = p_workspace_id
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
                        p_workspace_id AS partner_workspace_id,
                        docs.document_id, docs.shared_by, docs.shared_at,
                        jsonb_build_object(
                            'id', d.id, 'nome', d.nome, 'descricao', d.descricao, 'categoria', d.categoria,
                            'tipo_documento', d.tipo_documento, 'status', d.status, 'autor', d.autor,
                            'data_emissao', d.data_emissao, 'data_validade', d.data_validade,
                            'project_id', d.project_id, 'folder_id', d.folder_id,
                            'organization_id', d.organization_id,
                            'discipline_code', d.discipline_code,
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
                    -- subárvore das pastas compartilhadas (mesmo sem documento)
                    SELECT vf3.fid AS id FROM visible_folders vf3
                    UNION
                    -- pastas dos documentos avulsos, que podem estar fora daquelas
                    SELECT d3.folder_id
                    FROM public.partner_shared_documents psd3
                    JOIN public.opura_documents d3 ON d3.id = psd3.document_id
                    WHERE psd3.partner_workspace_id = p_workspace_id AND d3.folder_id IS NOT NULL
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

REVOKE ALL ON FUNCTION public.partner_get_shared_document_tree(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_get_shared_document_tree(UUID) TO authenticated;
