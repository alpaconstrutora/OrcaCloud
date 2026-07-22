-- migration: 20270821000010_portal_get_ged_documents_colaborador.sql
-- Portal do Colaborador — aba "Documentos" passa a ler do GED (opura_documents)
-- em vez de só `employee_documents`. Mesmo padrão dos outros RPCs
-- `portal_get_*` (20260601000002_portal_security_definer_queries.sql):
-- SECURITY DEFINER, acesso via employeeId (sem sessão Supabase), grant a
-- anon+authenticated. Só retorna documentos explicitamente compartilhados
-- com o colaborador via opura_document_portal_shares (audience='colaborador')
-- — ver migration 20270821000008 e o botão "Compartilhar" do GED.

CREATE OR REPLACE FUNCTION public.portal_get_ged_documents(p_employee_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(t ORDER BY t.shared_at DESC), '[]'::json)
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
            JOIN public.employees emp ON emp.id = sh.employee_id
            WHERE sh.audience = 'colaborador'
              AND sh.employee_id = p_employee_id
              AND doc.organization_id = emp.org_id
        ) t
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.portal_get_ged_documents(UUID) TO anon, authenticated;

-- Download: o bucket 'opura-docs' é privado e este portal é anon/employeeId
-- (sem token assinado nem sessão Supabase), então gerar o signed URL não pode
-- acontecer em SQL puro — precisa de service role, igual ao Portal do Cliente.
-- Ver Edge Function supabase/functions/labor-portal-ged-download.
