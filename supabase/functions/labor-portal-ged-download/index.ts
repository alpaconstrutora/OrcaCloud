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

// Gera link assinado para um documento do GED compartilhado com o colaborador
// no Portal do Colaborador. Mesmo problema do portal-ged-download (cliente):
// a sessão do portal é anon/employeeId (sem token assinado nem login
// Supabase), e a policy de storage.objects do bucket 'opura-docs' só vale
// para authenticated. Esta function valida o vínculo de compartilhamento
// (opura_document_portal_shares, audience='colaborador') antes de assinar,
// usando o service role só depois dessa checagem manual.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const { employeeId, storagePath } = await req.json() as { employeeId?: string; storagePath?: string };
    if (!employeeId || !storagePath) {
        return json({ error: 'employeeId e storagePath são obrigatórios' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: emp, error: empError } = await admin
        .from('employees')
        .select('id')
        .eq('id', employeeId)
        .maybeSingle();

    if (empError || !emp) {
        return json({ error: 'Colaborador não encontrado' }, 403);
    }

    // Confirma que o arquivo pedido é de fato a versão ativa de um documento
    // atualmente compartilhado com este colaborador (não deixa passar path arbitrário).
    const { data: shared, error: sharedError } = await admin
        .from('opura_document_portal_shares')
        .select('document:opura_documents!inner(active_version:opura_document_versions!fk_active_version(storage_path))')
        .eq('audience', 'colaborador')
        .eq('employee_id', employeeId);

    if (sharedError) {
        console.error('[labor-portal-ged-download] erro ao validar vínculo:', sharedError);
        return json({ error: 'Erro ao validar acesso ao documento' }, 500);
    }

    const allowed = (shared || []).some((row: any) => row.document?.active_version?.storage_path === storagePath);
    if (!allowed) {
        return json({ error: 'Documento não compartilhado com este colaborador' }, 403);
    }

    const { data: signed, error: signError } = await admin.storage
        .from('opura-docs')
        .createSignedUrl(storagePath, 60 * 15);

    if (signError || !signed) {
        console.error('[labor-portal-ged-download] erro ao assinar URL:', signError);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    return json({ signedUrl: signed.signedUrl });
});
