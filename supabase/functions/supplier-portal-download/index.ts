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

// Buckets que esta function aceita assinar. Lista fechada de propósito: o
// `bucket` vem do corpo da requisição, e sem esta lista qualquer bucket privado
// do projeto (incluindo os que nada têm a ver com fornecedor) viraria alvo.
const BUCKETS_PERMITIDOS = ['invoices', 'receipts'] as const;
type BucketPermitido = typeof BUCKETS_PERMITIDOS[number];

// Gera link assinado para uma NFe/recibo do próprio fornecedor, para uso pelo acesso via
// link público (anon) do Portal do Fornecedor -- as policies de RLS de storage.objects
// dos buckets `invoices` e `receipts` exigem sessão authenticated, que uma sessão
// anon/token nunca tem. Esta function valida o token e o vínculo do arquivo com o
// fornecedor antes de assinar, usando o service role (que ignora RLS) só depois dessa
// checagem manual.
//
// O vínculo é conferido por bucket, porque o caminho de cada um significa coisa
// diferente: em `invoices` o arquivo é a linha (`invoices.file_path`); em
// `receipts` o arquivo é `<order_id>/receipt_...`, então o vínculo é o pedido.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const { token, storagePath, bucket } = await req.json() as {
        token?: string;
        storagePath?: string;
        bucket?: string;
    };
    if (!token || !storagePath) {
        return json({ error: 'token e storagePath são obrigatórios' }, 400);
    }

    // Sem `bucket` é a chamada antiga (NFe) -- mantida para não quebrar quem já
    // chama assim.
    const bucketAlvo = (bucket ?? 'invoices') as BucketPermitido;
    if (!BUCKETS_PERMITIDOS.includes(bucketAlvo)) {
        return json({ error: 'bucket não permitido' }, 400);
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

    if (bucketAlvo === 'invoices') {
        const { data: invoice, error: invoiceError } = await admin
            .from('invoices')
            .select('id')
            .eq('file_path', storagePath)
            .eq('supplier_id', tok.supplier_id)
            .maybeSingle();

        if (invoiceError || !invoice) {
            return json({ error: 'Documento não pertence a este fornecedor' }, 403);
        }
    } else {
        // O comprovante não guarda supplier_id: o vínculo é o pedido dono dele.
        // Casamos pelo photo_path exato (e não pela pasta do caminho) para que um
        // caminho forjado do tipo `<order_id>/qualquer-coisa` não seja assinado.
        const { data: recibo, error: reciboError } = await admin
            .from('purchase_receipts')
            .select('id, purchase_orders!inner(supplier_id)')
            .eq('photo_path', storagePath)
            .eq('purchase_orders.supplier_id', tok.supplier_id)
            .maybeSingle();

        if (reciboError || !recibo) {
            return json({ error: 'Comprovante não pertence a este fornecedor' }, 403);
        }
    }

    const { data: signed, error: signError } = await admin.storage
        .from(bucketAlvo)
        .createSignedUrl(storagePath, 60 * 15);

    if (signError || !signed) {
        console.error('[supplier-portal-download] erro ao assinar URL:', signError);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    return json({ signedUrl: signed.signedUrl });
});
