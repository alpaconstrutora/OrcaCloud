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

// Baixa o RECIBO DE RECEBIMENTO guardado (bucket privado `financial-receipts`,
// migration aplicar_20270926000110) para o Portal do Cliente.
// Plano: docs/planos/2026-09-26-contas-receber-recibo-na-baixa.md (item 13).
//
// Mesmo desenho de `client-portal-condominio-download`, e pelo mesmo motivo:
//
// ⚠️ A AUTORIZAÇÃO NÃO É REESCRITA AQUI (REGRA #7, pergunta 3). Quem decide
// quais recebíveis são deste cliente é `fn_portal_receivables_payload` (party_id
// + co-comprador por contrato). Esta function chama a MESMA RPC que o portal
// chama, com a credencial de QUEM PEDIU, e só aceita o título se ele estiver na
// lista que voltou:
//
//   • com `token`  → `fn_portal_get_receivables` (concedida a anon);
//   • sem `token`  → `fn_portal_get_receivables_for_client`, com o
//                    Authorization do chamador, para `auth.uid()` e a checagem
//                    de e-mail/org valerem lá dentro.
//
// A service_role só entra DEPOIS, para ler o caminho do arquivo (que não vai no
// payload do portal) e assinar a URL.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    let body: { token?: string; clientId?: string; transactionId?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Corpo inválido' }, 400);
    }
    const { token, clientId, transactionId } = body;
    if (!transactionId || (!token && !clientId)) {
        return json({ error: 'transactionId e (token ou clientId) são obrigatórios' }, 400);
    }

    const comoChamador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const { data: payload, error: erroPayload } = token
        ? await comoChamador.rpc('fn_portal_get_receivables', { p_token: token })
        : await comoChamador.rpc('fn_portal_get_receivables_for_client', { p_client_id: clientId });

    if (erroPayload) {
        // Sem sessão pedindo pelo clientId: a RPC _for_client nem é concedida a
        // anon (42501). É recusa, não falha do servidor.
        if (erroPayload.code === '42501') {
            return json({ error: 'Entre no portal para baixar o recibo.' }, 403);
        }
        console.error('[client-portal-recibo-download] erro na RPC:', erroPayload);
        return json({ error: 'Erro ao validar o acesso' }, 500);
    }
    if (!payload?.ok) {
        return json({ error: payload?.motivo || 'Link inválido ou expirado' }, 403);
    }

    // O título tem de estar na lista deste cliente — é o que impede baixar o
    // recibo de outra pessoa trocando o id.
    const titulo = (payload.recebiveis ?? []).find((r: { id: string }) => r.id === transactionId);
    if (!titulo) {
        return json({ error: 'Recibo não disponível para este acesso' }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: recibo, error: erroRecibo } = await admin
        .from('financial_receipts')
        .select('receipt_number, file_path')
        .eq('transaction_id', transactionId)
        .is('cancelled_at', null)
        .maybeSingle();

    if (erroRecibo) {
        console.error('[client-portal-recibo-download] erro ao ler o recibo:', erroRecibo);
        return json({ error: 'Erro ao localizar o recibo' }, 500);
    }
    if (!recibo) {
        return json({ error: 'O recibo deste pagamento ainda não foi emitido.' }, 404);
    }
    if (!recibo.file_path) {
        return json({ error: 'O recibo foi emitido, mas o arquivo ainda não está disponível. Tente mais tarde.' }, 409);
    }

    const nome = `Recibo_${String(recibo.receipt_number).padStart(6, '0')}.pdf`;
    const { data: assinado, error: erroAssinatura } = await admin.storage
        .from('financial-receipts')
        .createSignedUrl(recibo.file_path, 60 * 15, { download: nome });

    if (erroAssinatura || !assinado) {
        console.error('[client-portal-recibo-download] erro ao assinar URL:', erroAssinatura);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    return json({ url: assinado.signedUrl, numero: recibo.receipt_number });
});
