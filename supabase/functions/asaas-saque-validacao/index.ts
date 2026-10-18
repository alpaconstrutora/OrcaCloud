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
// utils/asaasSaque.ts (testada). Cada decisão fica em `asaas_saque_decisoes`
// (18/10/2026 — a doc pede "mantenha logs das decisões").
//
// Reserva (pedido chegou antes de o OrçaCloud gravar o id da Asaas), endurecida
// em 18/10/2026: o pedido oficial de PIX vem com `pixAddressKey: null`, e a
// reserva aprovava só pelo valor. Agora exige CPF/CNPJ do favorecido (PIX) ou a
// linha digitável (boleto), e AMARRA o id da Asaas ao registro na aprovação —
// um registro nunca aprova duas operações diferentes.
//
// REGRA #7, pergunta 3: gate no código — header `asaas-access-token` comparado
// em tempo constante com ASAAS_SAQUE_TOKEN; sem o segredo configurado, recusa
// tudo (falha fechado). Sem JWT (`verify_jwt = false`).

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decidirSaque, idDoPedido, escolherReserva, type PedidoDeSaque, type PagamentoRegistrado, type DecisaoDeSaque } from "../../../utils/asaasSaque.ts"

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
const COLS = 'id,organization_id,payment_type,status,value,pix_key,identification_field,beneficiary_document,favorecido_documento_esperado,titular_diferente_autorizado,asaas_transfer_id,asaas_bill_id';

type Registro = PagamentoRegistrado & { id: string; organization_id: string | null; asaas_transfer_id: string | null; asaas_bill_id: string | null };

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
    let registro: Registro | null = null;
    let viaReserva = false;
    if (alvo) {
        // A asaas-payment grava o id da Asaas logo DEPOIS da resposta do POST.
        // Se a pergunta chegar antes dessa gravação, tenta de novo em seguida.
        for (let tentativa = 0; tentativa < 3 && !registro; tentativa++) {
            if (tentativa > 0) await espera(1500);
            const { data } = await admin.from('supplier_payments').select(COLS).eq(alvo.coluna, alvo.id).maybeSingle();
            registro = (data as Registro | null) ?? null;
        }
        // Reserva: a ordem APPROVED recém-criada, ainda sem o id da Asaas, que bate
        // em CPF/CNPJ + valor (PIX) ou linha digitável (boleto). Ambíguo = nenhuma.
        if (!registro) {
            const dezMin = new Date(Date.now() - 10 * 60_000).toISOString();
            const { data } = await admin.from('supplier_payments').select(COLS)
                .eq('payment_type', pedido.type === 'TRANSFER' ? 'PIX_TRANSFER' : 'BILL')
                .eq('status', 'APPROVED').is(alvo.coluna, null)
                .gte('created_at', dezMin).order('created_at', { ascending: false }).limit(20);
            registro = escolherReserva(pedido, (data ?? []) as Registro[]);
            viaReserva = !!registro;
        }
    }

    let decisao: DecisaoDeSaque = decidirSaque(pedido, registro);

    // Aprovou pela reserva: amarra o id da Asaas ao registro AGORA (só se ainda vazio).
    // Se outro pedido já o amarrou a outra operação, recusa.
    if (decisao.status === 'APPROVED' && viaReserva && registro && alvo) {
        const { data: amarrou } = await admin.from('supplier_payments')
            .update({ [alvo.coluna]: alvo.id }).eq('id', registro.id).is(alvo.coluna, null).select('id');
        if (!amarrou?.length) {
            const { data: atual } = await admin.from('supplier_payments').select(alvo.coluna).eq('id', registro.id).maybeSingle();
            if ((atual as Record<string, string | null> | null)?.[alvo.coluna] !== alvo.id) {
                decisao = { status: 'REFUSED', refuseReason: 'Pagamento do OrçaCloud já ligado a outra operação da Asaas.' };
            }
        }
    }

    console.log('[asaas-saque-validacao]', pedido.type, alvo?.id ?? '-', viaReserva ? '(reserva)' : '', '→', decisao.status, decisao.refuseReason ?? '');

    // Registro durável da decisão. Falhar aqui não muda a resposta à Asaas.
    const valor = pedido.type === 'TRANSFER' ? pedido.transfer?.value : pedido.type === 'BILL' ? pedido.bill?.value : null;
    const { error: erroRegistro } = await admin.from('asaas_saque_decisoes').insert({
        organization_id: registro?.organization_id ?? null,
        supplier_payment_id: registro?.id ?? null,
        tipo: pedido.type,
        asaas_id: alvo?.id ?? null,
        valor: valor == null ? null : Number(valor),
        decisao: decisao.status,
        motivo: decisao.refuseReason ?? null,
        via_reserva: viaReserva,
        favorecido_documento: pedido.transfer?.bankAccount?.cpfCnpj ?? null,
        payload: pedido,
    });
    if (erroRegistro) console.error('[asaas-saque-validacao] falha ao registrar a decisão:', erroRegistro.message);

    return json(decisao);
});
