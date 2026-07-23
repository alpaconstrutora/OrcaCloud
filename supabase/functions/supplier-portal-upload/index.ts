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

const MAX_SIZE = 5 * 1024 * 1024; // mesmo limite do InvoiceManager.tsx

// Recebe uma NFe/recibo do acesso via link público do Portal do Fornecedor (sessão anon) e
// faz o upload + grava a linha em `invoices` usando o service role -- a policy de RLS de
// storage.objects do bucket `invoices` exige sessão authenticated do fornecedor logado, que
// uma sessão anon/token nunca tem. Aqui a validação do token substitui essa checagem.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const formData = await req.formData();
    const token = formData.get('token') as string | null;
    const file = formData.get('file') as File | null;
    const orderId = (formData.get('orderId') as string | null) || null;

    if (!token || !file) {
        return json({ error: 'token e file são obrigatórios' }, 400);
    }
    if (file.size > MAX_SIZE) {
        return json({ error: 'Arquivo excede o limite de 5MB' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: tok, error: tokError } = await admin
        .from('supplier_portal_tokens')
        .select('id, supplier_id, is_active, expires_at')
        .eq('token', token)
        .maybeSingle();

    if (tokError || !tok || !tok.is_active || new Date(tok.expires_at) < new Date()) {
        return json({ error: 'Link inválido ou expirado' }, 403);
    }

    // Se um orderId foi informado, confirma que o pedido é mesmo deste fornecedor antes de vincular.
    let safeOrderId: string | null = null;
    if (orderId) {
        const { data: order } = await admin
            .from('purchase_orders')
            .select('id')
            .eq('id', orderId)
            .eq('supplier_id', tok.supplier_id)
            .maybeSingle();
        safeOrderId = order?.id ?? null;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
    const path = `${tok.supplier_id}/${Date.now()}_${safeName}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
        .from('invoices')
        .upload(path, bytes, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
        });

    if (uploadError) {
        console.error('[supplier-portal-upload] erro ao enviar arquivo:', uploadError);
        return json({ error: 'Erro ao enviar arquivo' }, 500);
    }

    const { data: invoice, error: dbError } = await admin
        .from('invoices')
        .insert({
            supplier_id: tok.supplier_id,
            order_id: safeOrderId,
            file_path: path,
            file_name: file.name,
            status: 'pending',
        })
        .select()
        .single();

    if (dbError) {
        await admin.storage.from('invoices').remove([path]);
        console.error('[supplier-portal-upload] erro ao gravar registro:', dbError);
        return json({ error: 'Erro ao registrar documento' }, 500);
    }

    await admin.from('supplier_portal_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tok.id);

    return json({ invoice });
});
