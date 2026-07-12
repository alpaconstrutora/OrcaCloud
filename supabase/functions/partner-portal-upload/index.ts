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

const MAX_SIZE = 50 * 1024 * 1024; // mesmo limite do bucket opura-docs

// Recebe um arquivo do acesso via link público do Portal do Parceiro (sessão anon) e faz o
// upload usando o service role -- a policy de RLS de storage.objects para upload de parceiro
// (storage_docs_insert_partner) exige sessão authenticated com partner_users correspondente,
// que uma sessão anon/token nunca tem. Aqui a validação do token substitui essa checagem.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const formData = await req.formData();
    const token = formData.get('token') as string | null;
    const file = formData.get('file') as File | null;

    if (!token || !file) {
        return json({ error: 'token e file são obrigatórios' }, 400);
    }
    if (file.size > MAX_SIZE) {
        return json({ error: 'Arquivo excede o limite de 50MB' }, 400);
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

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
    const path = `partner-uploads/${tok.workspace_id}/${Date.now()}_${safeName}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
        .from('opura-docs')
        .upload(path, bytes, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
        });

    if (uploadError) {
        console.error('[partner-portal-upload] erro ao enviar arquivo:', uploadError);
        return json({ error: 'Erro ao enviar arquivo' }, 500);
    }

    return json({ storagePath: path });
});
