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

// Baixa o RECIBO DE PAGAMENTO (o credor assina) guardado no bucket privado
// `financial-receipts` (aplicar_20270928000110) para o PORTAL DO FORNECEDOR —
// parcelas de PEDIDO DE COMPRA.
// Plano: docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md (Fase 2, item 9).
//
// Cópia do desenho de `client-portal-recibo-download`, pelo mesmo motivo:
//
// ⚠️ A AUTORIZAÇÃO NÃO É REESCRITA AQUI (REGRA #7, pergunta 3). Quem decide
// quais parcelas são deste fornecedor é o próprio portal. Esta function chama a
// MESMA RPC que a tela chama, com a credencial de QUEM PEDIU, e só aceita a
// parcela se ela estiver na lista que voltou:
//
//   • com `token`   → `supplier_portal_get_financials` (link público, anon);
//   • com `orderId` → `purchase_orders_financeiro`, com o Authorization do
//                     chamador (fornecedor logado ou comprador) — a RPC não é
//                     concedida a anon, então sem sessão ela recusa (42501).
//
// A service_role só entra DEPOIS, para ler o caminho do arquivo (que não vai no
// payload do portal) e assinar a URL.
type Parcela = { id: string };

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    let body: { token?: string; orderId?: string; transactionId?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Corpo inválido' }, 400);
    }
    const { token, orderId, transactionId } = body;
    if (!transactionId || (!token && !orderId)) {
        return json({ error: 'transactionId e (token ou orderId) são obrigatórios' }, 400);
    }

    const comoChamador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    let parcelas: Parcela[] = [];
    if (token) {
        const { data: payload, error } = await comoChamador.rpc('supplier_portal_get_financials', { p_token: token });
        if (error) {
            console.error('[supplier-portal-recibo-download] erro na RPC (token):', error);
            return json({ error: 'Erro ao validar o acesso' }, 500);
        }
        if (!payload?.valid) return json({ error: 'Link inválido ou expirado' }, 403);
        for (const pedido of (payload.data ?? []) as { financeiro?: { parcelas?: Parcela[] } }[]) {
            parcelas.push(...(pedido.financeiro?.parcelas ?? []));
        }
    } else {
        const { data: porPedido, error } = await comoChamador.rpc('purchase_orders_financeiro', { p_order_ids: [orderId] });
        if (error) {
            if (error.code === '42501') return json({ error: 'Entre no portal para baixar o recibo.' }, 403);
            console.error('[supplier-portal-recibo-download] erro na RPC (logado):', error);
            return json({ error: 'Erro ao validar o acesso' }, 500);
        }
        // Pedido que não é do chamador simplesmente não volta no mapa.
        parcelas = ((porPedido ?? {})[orderId as string]?.parcelas ?? []) as Parcela[];
    }

    // A parcela tem de estar na lista deste acesso — é o que impede baixar o
    // recibo de outro credor trocando o id.
    if (!parcelas.some(p => p.id === transactionId)) {
        return json({ error: 'Recibo não disponível para este acesso' }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: recibo, error: erroRecibo } = await admin
        .from('financial_receipts')
        .select('receipt_number, file_path')
        .eq('transaction_id', transactionId)
        .eq('kind', 'PAGAMENTO')
        .is('cancelled_at', null)
        .maybeSingle();

    if (erroRecibo) {
        console.error('[supplier-portal-recibo-download] erro ao ler o recibo:', erroRecibo);
        return json({ error: 'Erro ao localizar o recibo' }, 500);
    }
    if (!recibo) {
        return json({ error: 'O recibo deste pagamento ainda não foi emitido.' }, 404);
    }
    if (!recibo.file_path) {
        return json({ error: 'O recibo foi emitido, mas o arquivo ainda não está disponível. Tente mais tarde.' }, 409);
    }

    const nome = `Recibo_Pagamento_${String(recibo.receipt_number).padStart(6, '0')}.pdf`;
    const { data: assinado, error: erroAssinatura } = await admin.storage
        .from('financial-receipts')
        .createSignedUrl(recibo.file_path, 60 * 15, { download: nome });

    if (erroAssinatura || !assinado) {
        console.error('[supplier-portal-recibo-download] erro ao assinar URL:', erroAssinatura);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    return json({ url: assinado.signedUrl, numero: recibo.receipt_number });
});
