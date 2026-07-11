// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

// Gera link assinado para um documento do GED compartilhado com um workspace de parceiro,
// para uso pelo acesso via link público (anon) do Portal do Parceiro -- a policy de RLS
// de storage.objects para parceiro (storage_docs_select_partner) exige role authenticated
// com partner_users correspondente, o que uma sessão anon/token nunca tem. Esta function
// valida o token e o vínculo do arquivo com o workspace antes de assinar, usando o service
// role (que ignora RLS) só depois dessa checagem manual.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const { token, storagePath } = await req.json() as { token?: string; storagePath?: string };
    if (!token || !storagePath) {
        return json({ error: 'token e storagePath são obrigatórios' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: tok, error: tokError } = await admin
        .from('partner_portal_tokens')
        .select('workspace_id, is_active, expires_at')
        .eq('token', token)
        .maybeSingle();

    if (tokError || !tok || !tok.is_active || new Date(tok.expires_at) < new Date()) {
        return json({ error: 'Link inválido ou expirado' }, 403);
    }

    // Caso 1: arquivo enviado pelo próprio workspace (partner-uploads/{workspace_id}/...) —
    // usado nos anexos de solicitação/documento enviado pelo parceiro.
    const isOwnUpload = storagePath.startsWith(`partner-uploads/${tok.workspace_id}/`);

    if (!isOwnUpload) {
        // Caso 2: confirma que o arquivo pedido é de fato a versão ativa de um documento
        // atualmente compartilhado com este workspace (não deixa passar path arbitrário).
        const { data: shared, error: sharedError } = await admin
            .from('partner_shared_documents')
            .select('document:opura_documents!inner(active_version:opura_document_versions!fk_active_version(storage_path))')
            .eq('partner_workspace_id', tok.workspace_id);

        if (sharedError) {
            console.error('[partner-portal-download] erro ao validar vínculo:', sharedError);
            return json({ error: 'Erro ao validar acesso ao documento' }, 500);
        }

        const allowed = (shared || []).some((row: any) => row.document?.active_version?.storage_path === storagePath);
        if (!allowed) {
            return json({ error: 'Documento não compartilhado com este parceiro' }, 403);
        }
    }

    const { data: signed, error: signError } = await admin.storage
        .from('opura-docs')
        .createSignedUrl(storagePath, 60 * 15);

    if (signError || !signed) {
        console.error('[partner-portal-download] erro ao assinar URL:', signError);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    return json({ signedUrl: signed.signedUrl });
});
