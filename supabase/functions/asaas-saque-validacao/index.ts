// asaas-saque-validacao — a Asaas pergunta, o OrçaCloud responde.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fase 0, passo 5).
// Configurado no painel da Asaas em Integrações › Mecanismos de segurança
// (URL desta função + token ASAAS_SAQUE_TOKEN). Contrato (doc oficial,
// 17/10/2026): ~5 s depois de criar um saque via API, a Asaas faz POST
// { type, transfer|bill|... } e só efetiva com { status: 'APPROVED' }.
// REFUSED, resposta inválida ou 3 falhas seguidas → a Asaas CANCELA.
//
// Só aprova o que o OrçaCloud disparou: supplier_payments em andamento com o
// mesmo id da Asaas, valor e chave PIX (ou linha digitável). Decisão em
// utils/asaasSaque.ts (testada). Cada decisão vai para o log da função.
//
// REGRA #7, pergunta 3: gate no código — header `asaas-access-token` comparado
// em tempo constante com ASAAS_SAQUE_TOKEN; sem o segredo configurado, recusa
// tudo (falha fechado). Sem JWT (`verify_jwt = false`).

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decidirSaque, idDoPedido, type PedidoDeSaque, type PagamentoRegistrado } from "../../../utils/asaasSaque.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function comparaSegredo(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms));
const COLS = 'id,payment_type,status,value,pix_key,identification_field';

serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const segredo = Deno.env.get('ASAAS_SAQUE_TOKEN') ?? '';
    if (segredo.length < 32) {
        console.error('[asaas-saque-validacao] ASAAS_SAQUE_TOKEN ausente/curto — recusando tudo.');
        return json({ status: 'REFUSED', refuseReason: 'Validação de saque não configurada no OrçaCloud.' }, 503);
    }
    if (!comparaSegredo(req.headers.get('asaas-access-token') ?? '', segredo)) {
        console.warn('[asaas-saque-validacao] token inválido; recusado.');
        return json({ error: 'Invalid token' }, 401);
    }

    const pedido = await req.json().catch(() => null) as PedidoDeSaque | null;
    if (!pedido?.type) return json({ status: 'REFUSED', refuseReason: 'Pedido sem tipo.' });

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const alvo = idDoPedido(pedido);
    let registro: PagamentoRegistrado | null = null;
    if (alvo) {
        // A asaas-payment grava o id da Asaas logo DEPOIS da resposta do POST.
        // Se a pergunta chegar antes dessa gravação, tenta de novo em seguida.
        for (let tentativa = 0; tentativa < 3 && !registro; tentativa++) {
            if (tentativa > 0) await espera(1500);
            const { data } = await admin.from('supplier_payments').select(COLS).eq(alvo.coluna, alvo.id).maybeSingle();
            registro = data ?? null;
        }
        // Última chance para PIX: a ordem APPROVED recém-criada, ainda sem o id
        // da Asaas, com o mesmo valor (a chave é conferida na decisão).
        if (!registro && pedido.type === 'TRANSFER') {
            const dezMin = new Date(Date.now() - 10 * 60_000).toISOString();
            const { data } = await admin.from('supplier_payments').select(COLS)
                .eq('payment_type', 'PIX_TRANSFER').eq('status', 'APPROVED')
                .is('asaas_transfer_id', null).eq('value', Number(pedido.transfer?.value ?? -1))
                .gte('created_at', dezMin).order('created_at', { ascending: false }).limit(2);
            // Duas candidatas iguais = ambíguo: melhor recusar do que aprovar a errada.
            if (data?.length === 1) registro = data[0];
        }
    }

    const decisao = decidirSaque(pedido, registro);
    console.log('[asaas-saque-validacao]', pedido.type, alvo?.id ?? '-', '→', decisao.status, decisao.refuseReason ?? '');
    return json(decisao);
});
