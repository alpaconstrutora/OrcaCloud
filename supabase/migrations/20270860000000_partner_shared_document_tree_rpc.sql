-- ==========================================================================
-- Portal do Parceiro (modo AUTENTICADO): a aba Documentos não conseguia
-- montar a árvore Pasta -> Disciplina, então uma pasta compartilhada
-- aparecia achatada em "Sem pasta".
--
-- Causa: `partnerService.listSharedDocumentTree` lê `opura_folders` e
-- `opura_dms_disciplines` direto das tabelas, e a RLS dessas duas só libera
-- SELECT para quem está em `organization_members`
-- (`folders_select_org` / `disciplines_select_org`,
--  migrations 20261227000000 e 20270110000001). Um `partner_user` NÃO é
-- membro da organização — logo as duas leituras voltavam vazias, o
-- `folderById` ficava vazio e TODO documento caía no bucket NO_FOLDER do
-- PartnerPortal. Como o admin (que é membro) enxerga tudo, a pré-visualização
-- interna parecia correta e só o parceiro real via a tela errada.
--
-- Correção: mesma estratégia já usada no modo token
-- (`partner_portal_get_shared_documents`, migration 20270823000005) — uma RPC
-- SECURITY DEFINER que devolve APENAS o fecho recursivo das pastas que contêm
-- documentos compartilhados com aquele workspace (mais a cadeia de pais, para
-- reconstruir a hierarquia) e as disciplinas das orgs desses documentos.
-- Não expõe a árvore inteira da organização.
--
-- Autorização (dentro da função, já que SECURITY DEFINER ignora RLS):
--   - `partner_user` ativo do workspace  -> get_user_partner_workspaces(email)
--   - membro da org do workspace (admin / pré-visualização)
--                                        -> get_workspaces_for_member(email)
-- Qualquer outro caller recebe listas vazias.
-- ==========================================================================
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
        RETURN jsonb_build_object('folders', '[]'::jsonb, 'disciplines', '[]'::jsonb);
    END IF;

    SELECT
        p_workspace_id IN (SELECT public.get_user_partner_workspaces(v_email))
     OR p_workspace_id IN (SELECT public.get_workspaces_for_member(v_email))
    INTO v_allowed;

    IF NOT COALESCE(v_allowed, FALSE) THEN
        RETURN jsonb_build_object('folders', '[]'::jsonb, 'disciplines', '[]'::jsonb);
    END IF;

    RETURN jsonb_build_object(
        -- Fecho recursivo: pastas dos docs compartilhados + toda a cadeia de pais.
        'folders', COALESCE((
            WITH RECURSIVE shared_folders AS (
                SELECT DISTINCT d.folder_id AS fid
                FROM public.partner_shared_documents psd
                JOIN public.opura_documents d ON d.id = psd.document_id
                WHERE psd.partner_workspace_id = p_workspace_id
                  AND d.folder_id IS NOT NULL
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
                WHERE psd.partner_workspace_id = p_workspace_id
            )
        ), '[]'::jsonb)
    );
END;
$X$;

-- GRANT authenticated sozinho não tira o EXECUTE que PUBLIC ganha por padrão.
REVOKE ALL ON FUNCTION public.partner_get_shared_document_tree(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_get_shared_document_tree(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.partner_get_shared_document_tree(UUID) TO authenticated;
