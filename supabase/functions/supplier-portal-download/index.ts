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

// Gera link assinado para uma NFe/recibo do próprio fornecedor, para uso pelo acesso via
// link público (anon) do Portal do Fornecedor -- a policy de RLS de storage.objects do
// bucket `invoices` exige sessão authenticated do fornecedor logado, que uma sessão
// anon/token nunca tem. Esta function valida o token e o vínculo do arquivo com o
// fornecedor antes de assinar, usando o service role (que ignora RLS) só depois dessa
// checagem manual.
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
        .from('supplier_portal_tokens')
        .select('supplier_id, is_active, expires_at')
        .eq('token', token)
        .maybeSingle();

    if (tokError || !tok || !tok.is_active || new Date(tok.expires_at) < new Date()) {
        return json({ error: 'Link inválido ou expirado' }, 403);
    }

    const { data: invoice, error: invoiceError } = await admin
        .from('invoices')
        .select('id')
        .eq('file_path', storagePath)
        .eq('supplier_id', tok.supplier_id)
        .maybeSingle();

    if (invoiceError || !invoice) {
        return json({ error: 'Documento não pertence a este fornecedor' }, 403);
    }

    const { data: signed, error: signError } = await admin.storage
        .from('invoices')
        .createSignedUrl(storagePath, 60 * 15);

    if (signError || !signed) {
        console.error('[supplier-portal-download] erro ao assinar URL:', signError);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    return json({ signedUrl: signed.signedUrl });
});
