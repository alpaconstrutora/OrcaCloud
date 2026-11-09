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

// ── Anexos do pedido (bucket `purchase-order-documents`) ──────────────────
// Mesmas regras de `lib/pedidoDocumentos.ts` (o cliente confere antes; aqui é
// a trava de verdade, porque o link roda com a chave anon).
const BUCKET_DOCUMENTOS = 'purchase-order-documents';
const MAX_SIZE_DOCUMENTO = 10 * 1024 * 1024;
const CATEGORIAS = ['NOTA_FISCAL', 'RECIBO', 'COMPROVANTE', 'BOLETO', 'OUTRO'];
const EXTENSOES = ['pdf', 'xml', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

// deno-lint-ignore no-explicit-any
async function documentoDoPedido(admin: any, supplierId: string, formData: FormData): Promise<Response> {
    const acao = (formData.get('acao') as string | null) || 'enviar';
    const orderId = (formData.get('orderId') as string | null) || '';

    // Excluir: só documento que o FORNECEDOR enviou, de pedido deste fornecedor.
    if (acao === 'excluir') {
        const documentId = (formData.get('documentId') as string | null) || '';
        const { data: doc } = await admin
            .from('purchase_order_documents')
            .select('id, order_id, file_path, enviado_por_lado')
            .eq('id', documentId)
            .maybeSingle();
        if (!doc) return json({ error: 'Documento não encontrado' }, 404);
        const { data: doFornecedor } = await admin.rpc('supplier_portal_pedido_do_fornecedor', {
            p_order_id: doc.order_id, p_supplier_id: supplierId,
        });
        if (!doFornecedor || doc.enviado_por_lado !== 'FORNECEDOR') {
            return json({ error: 'Só é possível excluir documentos enviados pelo fornecedor' }, 403);
        }
        const { error: delError } = await admin.from('purchase_order_documents').delete().eq('id', doc.id);
        if (delError) {
            console.error('[supplier-portal-upload] erro ao excluir documento:', delError);
            return json({ error: 'Erro ao excluir documento' }, 500);
        }
        await admin.storage.from(BUCKET_DOCUMENTOS).remove([doc.file_path]);
        return json({ ok: true });
    }

    const file = formData.get('file') as File | null;
    const categoria = (formData.get('categoria') as string | null) || 'OUTRO';
    const descricao = ((formData.get('descricao') as string | null) || '').trim().slice(0, 500) || null;
    if (!file || !orderId) return json({ error: 'orderId e file são obrigatórios' }, 400);
    if (file.size > MAX_SIZE_DOCUMENTO) return json({ error: 'Arquivo excede o limite de 10 MB' }, 400);
    if (!CATEGORIAS.includes(categoria)) return json({ error: 'Categoria inválida' }, 400);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!EXTENSOES.includes(ext)) return json({ error: 'Tipo de arquivo não aceito (PDF, XML ou imagem)' }, 400);

    const { data: doFornecedor } = await admin.rpc('supplier_portal_pedido_do_fornecedor', {
        p_order_id: orderId, p_supplier_id: supplierId,
    });
    if (!doFornecedor) return json({ error: 'Pedido não encontrado' }, 403);

    const { data: fornecedor } = await admin.from('suppliers').select('name').eq('id', supplierId).maybeSingle();

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
    const path = `${orderId}/${crypto.randomUUID()}_${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
        .from(BUCKET_DOCUMENTOS)
        .upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (uploadError) {
        console.error('[supplier-portal-upload] erro ao enviar documento:', uploadError);
        return json({ error: 'Erro ao enviar arquivo' }, 500);
    }

    const { data: documento, error: dbError } = await admin
        .from('purchase_order_documents')
        .insert({
            order_id: orderId,
            categoria,
            descricao,
            file_path: path,
            file_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
            enviado_por_lado: 'FORNECEDOR',
            enviado_por: fornecedor?.name ?? 'Fornecedor',
        })
        .select('id, order_id, categoria, descricao, file_path, file_name, mime_type, size_bytes, enviado_por_lado, enviado_por, created_at')
        .single();
    if (dbError) {
        await admin.storage.from(BUCKET_DOCUMENTOS).remove([path]);
        console.error('[supplier-portal-upload] erro ao gravar documento:', dbError);
        return json({ error: 'Erro ao registrar documento' }, 500);
    }
    return json({ documento });
}

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
    const destino = (formData.get('destino') as string | null) || null;

    if (!token) {
        return json({ error: 'token é obrigatório' }, 400);
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

    // Anexo do pedido (Recebimento › Documentos). Ramo próprio: não toca
    // `invoices` — o anexo só guarda o arquivo.
    if (destino === 'pedido_documento') {
        const resposta = await documentoDoPedido(admin, tok.supplier_id, formData);
        await admin.from('supplier_portal_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tok.id);
        return resposta;
    }

    if (!file) {
        return json({ error: 'token e file são obrigatórios' }, 400);
    }
    if (file.size > MAX_SIZE) {
        return json({ error: 'Arquivo excede o limite de 5MB' }, 400);
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
