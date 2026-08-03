-- ==========================================================================
-- Portal do Parceiro: compartilhar uma PASTA passa a ser um fato persistido.
--
-- Antes: só existia `partner_shared_documents`. O botão "Compartilhar toda a
-- pasta" do GED era açúcar de UI — expandia a pasta em N documentos no
-- instante do clique e inseria só isso. Duas consequências:
--   1. subpasta vazia (ou cujos docs não foram compartilhados) era
--      indistinguível de subpasta nunca compartilhada, então a árvore do
--      portal só mostrava subpastas COM documento;
--   2. documento colocado na pasta DEPOIS do compartilhamento nunca chegava
--      ao parceiro — o compartilhamento era um retrato do momento.
--
-- Agora a pasta é a raiz do compartilhamento: o portal mostra a subárvore
-- inteira (inclusive pastas vazias) e todo documento que estiver — ou vier a
-- estar — dentro dela é visível ao parceiro.
--
-- `partner_shared_documents` continua existindo e valendo: compartilhar um
-- documento avulso segue sendo possível. Os dois conjuntos são unidos na
-- leitura.
-- ==========================================================================

-- ─── 1. TABELA ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_shared_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_workspace_id UUID NOT NULL REFERENCES public.partner_workspaces(id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES public.opura_folders(id) ON DELETE CASCADE,
    -- FALSE = só os documentos diretos da pasta; TRUE = pasta e tudo abaixo dela.
    include_subfolders BOOLEAN NOT NULL DEFAULT TRUE,
    shared_by TEXT NOT NULL,
    shared_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (partner_workspace_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_shared_folders_ws
    ON public.partner_shared_folders(partner_workspace_id);

ALTER TABLE public.partner_shared_folders ENABLE ROW LEVEL SECURITY;

-- Espelha shared_docs_select / shared_docs_manage (20261219000001):
-- lê quem é membro da org do workspace OU usuário do parceiro; escreve só o interno.
DROP POLICY IF EXISTS "shared_folders_select" ON public.partner_shared_folders;
CREATE POLICY "shared_folders_select" ON public.partner_shared_folders
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (SELECT public.get_workspaces_for_member(auth.jwt() ->> 'email'))
        OR partner_workspace_id IN (SELECT public.get_user_partner_workspaces(auth.jwt() ->> 'email'))
    );

DROP POLICY IF EXISTS "shared_folders_manage" ON public.partner_shared_folders;
CREATE POLICY "shared_folders_manage" ON public.partner_shared_folders
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (SELECT public.get_workspaces_for_member(auth.jwt() ->> 'email'))
    )
    WITH CHECK (
        partner_workspace_id IN (SELECT public.get_workspaces_for_member(auth.jwt() ->> 'email'))
    );

-- ─── 2. EXPANSÃO DA SUBÁRVORE ───────────────────────────────────────────────
-- LANGUAGE sql (não plpgsql) de propósito: em plpgsql as colunas de RETURNS
-- TABLE viram variáveis OUT e colidem com colunas homônimas (erro 42702).
-- Por isso o OUT chama-se `fid`, e não `folder_id`.

-- Todas as pastas visíveis a UM workspace (raízes compartilhadas + descendentes).
-- Devolve também a RAIZ que tornou cada pasta visível, para os documentos herdarem a
-- data/autor do compartilhamento certo quando há mais de uma pasta compartilhada.
CREATE OR REPLACE FUNCTION public.partner_workspace_visible_folder_ids(p_workspace_id UUID)
RETURNS TABLE (fid UUID, root_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
    WITH RECURSIVE roots AS (
        SELECT psf.folder_id AS id, psf.folder_id AS root, psf.include_subfolders AS deep
        FROM public.partner_shared_folders psf
        WHERE psf.partner_workspace_id = p_workspace_id
    ),
    tree AS (
        SELECT r.id, r.root, r.deep FROM roots r
        UNION
        SELECT f.id, t.root, t.deep
        FROM public.opura_folders f
        JOIN tree t ON f.parent_id = t.id
        WHERE t.deep
    )
    SELECT DISTINCT t.id, t.root FROM tree t;
$X$;

-- Idem, para TODOS os workspaces de um usuário parceiro (usado na RLS).
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
        WHERE psf.partner_workspace_id IN (
            SELECT public.get_user_partner_workspaces(p_email)
        )
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

REVOKE ALL ON FUNCTION public.partner_workspace_visible_folder_ids(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.partner_user_visible_folder_ids(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_workspace_visible_folder_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_user_visible_folder_ids(TEXT) TO authenticated;

-- ─── 3. RLS: O DOCUMENTO DENTRO DA PASTA COMPARTILHADA ──────────────────────
-- Sem isto o arquivo apareceria na árvore e não abriria: a linha de
-- opura_documents continuaria invisível para o parceiro.
DROP POLICY IF EXISTS "docs_select_partner" ON public.opura_documents;
CREATE POLICY "docs_select_partner" ON public.opura_documents
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT psd.document_id FROM public.partner_shared_documents psd
      WHERE psd.partner_workspace_id IN (
        SELECT public.get_user_partner_workspaces(auth.jwt() ->> 'email')
      )
    )
    OR (
      folder_id IS NOT NULL
      AND folder_id IN (
        SELECT f.fid FROM public.partner_user_visible_folder_ids(auth.jwt() ->> 'email') f
      )
    )
  );

-- Download: mesma condição de existência já usada antes (20261219000001),
-- estendida para quem só tem pasta compartilhada e nenhum documento avulso —
-- sem isso o parceiro veria o arquivo e o download falharia.
DROP POLICY IF EXISTS "storage_docs_select_partner" ON storage.objects;
CREATE POLICY "storage_docs_select_partner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'opura-docs'
    AND (
      EXISTS (
        SELECT 1 FROM public.partner_shared_documents psd
        WHERE psd.partner_workspace_id IN (
          SELECT public.get_user_partner_workspaces(auth.jwt() ->> 'email')
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.partner_shared_folders psf
        WHERE psf.partner_workspace_id IN (
          SELECT public.get_user_partner_workspaces(auth.jwt() ->> 'email')
        )
      )
    )
  );

-- ─── 4. ÁRVORE DO PORTAL (MODO AUTENTICADO) ────────────────────────────────
-- Substitui a versão de 20270860000000: além de devolver pastas/disciplinas,
-- passa a devolver os DOCUMENTOS (avulsos + os que estão dentro das pastas
-- compartilhadas), porque o cliente não tem como derivar os segundos sozinho.
-- As pastas agora incluem a subárvore das raízes compartilhadas (mesmo vazias)
-- MAIS a cadeia de pais, para a hierarquia fechar até a raiz.
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

    SELECT
        p_workspace_id IN (SELECT public.get_user_partner_workspaces(v_email))
     OR p_workspace_id IN (SELECT public.get_workspaces_for_member(v_email))
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

-- ─── 5. ÁRVORE DO PORTAL (MODO LINK PÚBLICO / TOKEN) ───────────────────────
-- Mesma união, para a RPC anon. Mantém as chaves {valid,data,folders,
-- disciplines} de 20270823000005 (getSharedDocuments do cliente lê `.data`)
-- e acrescenta `shared_folder_ids`.
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

    RETURN (
        WITH visible_folders AS (
            SELECT vf.fid, vf.root_id FROM public.partner_workspace_visible_folder_ids(v_ws) vf
        ),
        docs AS (
            SELECT DISTINCT ON (src.document_id)
                src.id, src.document_id, src.shared_by, src.shared_at, src.origin
            FROM (
                SELECT psd.id, psd.document_id, psd.shared_by, psd.shared_at, 0 AS origin
                FROM public.partner_shared_documents psd
                WHERE psd.partner_workspace_id = v_ws
                UNION ALL
                SELECT psf.id, d2.id AS document_id, psf.shared_by, psf.shared_at, 1 AS origin
                FROM visible_folders vf2
                JOIN public.opura_documents d2 ON d2.folder_id = vf2.fid
                JOIN public.partner_shared_folders psf
                  ON psf.partner_workspace_id = v_ws
                 AND psf.folder_id = vf2.root_id
            ) src
            ORDER BY src.document_id, src.origin
        )
        SELECT jsonb_build_object(
            'valid', TRUE,
            'data', COALESCE((
                SELECT jsonb_agg(row_to_json(t) ORDER BY t.shared_at DESC)
                FROM (
                    SELECT
                        docs.id,
                        v_ws AS partner_workspace_id,
                        docs.document_id, docs.shared_by, docs.shared_at,
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
                    FROM docs
                    JOIN public.opura_documents d ON d.id = docs.document_id
                    LEFT JOIN public.opura_document_versions v ON v.id = d.active_version_id
                ) t
            ), '[]'::jsonb),
            'folders', COALESCE((
                WITH RECURSIVE seeds AS (
                    SELECT vf3.fid AS id FROM visible_folders vf3
                    UNION
                    SELECT d3.folder_id
                    FROM public.partner_shared_documents psd3
                    JOIN public.opura_documents d3 ON d3.id = psd3.document_id
                    WHERE psd3.partner_workspace_id = v_ws AND d3.folder_id IS NOT NULL
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

GRANT EXECUTE ON FUNCTION public.partner_portal_get_shared_documents(TEXT) TO anon, authenticated;

-- ─── 6. DOWNLOAD PELO LINK PÚBLICO ─────────────────────────────────────────
-- A Edge Function partner-portal-download valida o storage_path contra os
-- documentos compartilhados; a RPC de apoio precisa enxergar a mesma união.
DROP FUNCTION IF EXISTS public.partner_portal_can_download(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.partner_portal_can_download(p_token TEXT, p_storage_path TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
BEGIN
    IF v_ws IS NULL OR p_storage_path IS NULL THEN RETURN FALSE; END IF;

    -- Só a versão ATIVA, como fazia a checagem antiga na Edge Function: um path
    -- de versão antiga não vira download só por o documento estar compartilhado.
    RETURN EXISTS (
        SELECT 1
        FROM public.opura_documents d
        JOIN public.opura_document_versions v ON v.id = d.active_version_id
        WHERE v.storage_path = p_storage_path
          AND (
            d.id IN (
                SELECT psd.document_id FROM public.partner_shared_documents psd
                WHERE psd.partner_workspace_id = v_ws
            )
            OR (
                d.folder_id IS NOT NULL
                AND d.folder_id IN (
                    SELECT vf.fid FROM public.partner_workspace_visible_folder_ids(v_ws) vf
                )
            )
          )
    );
END;
$X$;

REVOKE ALL ON FUNCTION public.partner_portal_can_download(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_can_download(TEXT, TEXT) TO anon, authenticated;
