// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: { env: { get(key: string): string | undefined } };

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Compara dois segredos em tempo constante.
 *
 * O `!==` sai no primeiro byte diferente, então o tempo de resposta revela
 * quantos caracteres o palpite acertou — dá para descobrir o token byte a byte.
 * Aqui o laço percorre o comprimento inteiro sempre, acumulando as diferenças
 * em XOR. A diferença de tamanho é tratada antes, e vazá-la é inofensivo.
 */
function comparaSegredo(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diferenca = 0;
    for (let i = 0; i < a.length; i++) {
        diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diferenca === 0;
}

// Eventos do Asaas que confirmam recebimento (cobrança ao cliente — client_charges)
const PAID_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'];
const CANCEL_EVENTS = ['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'];
// Status (payment.status / client_charges.status) que indicam cobrança já paga
const PAID_STATUSES = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

// Eventos de pagamento de título a fornecedor (Fase 1 — supplier_payments/boletos).
// Payload usa a chave top-level "bill", não "payment".
const BILL_DONE_EVENT   = 'BILL_PAID';
const BILL_FAILED_EVENTS = ['BILL_FAILED', 'BILL_CANCELLED', 'BILL_REFUNDED'];
const BILL_DONE_STATUSES = ['DONE', 'CANCELLED', 'FAILED']; // já processado — idempotência

serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
    const webhookToken   = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '';

    // Achado C3-04 — a guarda era `if (webhookToken && incoming !== webhookToken)`.
    // Começando por `webhookToken &&`, ela CURTO-CIRCUITAVA quando a variável de
    // ambiente não estava definida (ou estava vazia, ou sumia numa troca de
    // ambiente): a validação inteira era pulada e a function aceitava qualquer
    // POST anônimo. Daí em diante o corpo era processado com service_role —
    // PAYMENT_RECEIVED dá baixa em recebível, BILL_PAID marca boleto como pago.
    // O modo inseguro era o default, e silencioso.
    //
    // Agora falha FECHADO: sem segredo configurado, ninguém passa.
    if (!webhookToken) {
        console.error('[asaas-webhook] ASAAS_WEBHOOK_TOKEN não configurada — recusando tudo.');
        return json({ error: 'Webhook não configurado no servidor.' }, 503);
    }

    const incoming = req.headers.get('asaas-access-token') ?? '';

    // Comparação em tempo constante: comparar segredo com `!==` vaza, pelo tempo
    // de resposta, quantos caracteres iniciais o palpite acertou.
    if (!comparaSegredo(incoming, webhookToken)) {
        // Sem mask() do token esperado: a versão anterior logava prefixo, sufixo
        // e comprimento do segredo a cada requisição — inclusive nas do atacante,
        // que assim recebia o gabarito parcial pelos logs.
        console.warn('[asaas-webhook] token inválido; requisição recusada.');
        return json({ error: 'Invalid webhook token' }, 401);
    }

    const payload = await req.json().catch(() => null) as {
        event?: string;
        payment?: {
            id?: string;
            status?: string;
            paymentDate?: string;
            clientPaymentDate?: string;
            value?: number;
            netValue?: number;
        };
        bill?: {
            id?: string;
            status?: string;
            value?: number;
            fee?: number;
            paymentDate?: string;
            transactionReceiptUrl?: string;
            failReasons?: unknown;
        };
    } | null;

    if (!payload?.event) {
        return json({ error: 'Payload inválido' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const event = payload.event;

    // ─── Ramo: pagamento de título a fornecedor (BILL_*) ───────────────────
    if (event.startsWith('BILL_') && payload.bill?.id) {
        const billId = payload.bill.id;
        const billStatus = payload.bill.status ?? null;

        const { data: sp } = await admin
            .from('supplier_payments')
            .select('id,boleto_id,organization_id,status')
            .eq('asaas_bill_id', billId)
            .maybeSingle();

        if (!sp) return json({ ok: true, ignored: true });

        // Idempotência: Asaas pode reenviar o mesmo evento.
        if (BILL_DONE_STATUSES.includes(sp.status)) {
            return json({ ok: true, ignored: 'already_processed' });
        }

        if (event === BILL_DONE_EVENT) {
            const hoje = new Date().toISOString().slice(0, 10);
            const fee = payload.bill.fee ?? 0;

            await admin.from('supplier_payments').update({
                status: 'DONE',
                receipt_url: payload.bill.transactionReceiptUrl ?? null,
                fee: fee || null,
                updated_at: new Date().toISOString(),
            }).eq('id', sp.id);

            if (sp.boleto_id) {
                const { data: boletoRow } = await admin
                    .from('boletos')
                    .select('invoice_id,project_id,cost_center_id')
                    .eq('id', sp.boleto_id)
                    .maybeSingle();
                await admin.from('boletos').update({ status: 'pago' }).eq('id', sp.boleto_id);
                if (boletoRow?.invoice_id) {
                    await admin.from('invoices').update({ status: 'paid' }).eq('id', boletoRow.invoice_id);
                }
                await admin.from('internal_transactions').update({
                    business_status: 'PAGO',
                    status: 'CONCILIATED',
                    payment_date: hoje,
                    updated_at: new Date().toISOString(),
                }).eq('organization_id', sp.organization_id)
                  .eq('source_system', 'BOLETO')
                  .eq('reference_id', sp.boleto_id);

                // Taxa da Asaas pelo pagamento do boleto — registrada como despesa própria
                // (mesmo padrão da taxa gateway de cobrança na Fase 6).
                if (fee > 0) {
                    await admin.from('internal_transactions').insert({
                        organization_id: sp.organization_id,
                        source_system:   'ASAAS_FEE',
                        direction:       'DEBIT',
                        amount:          fee,
                        transaction_date: hoje,
                        due_date:         hoje,
                        description:     `Taxa Gateway Asaas (pagamento de boleto) — ${billId}`,
                        category:        'Taxa Gateway',
                        business_status: 'PAGO',
                        status:          'CONCILIATED',
                        project_id:      boletoRow?.project_id     ?? null,
                        cost_center_id:  boletoRow?.cost_center_id ?? null,
                        party_name:      'Asaas Tecnologia',
                    });
                }
            }
            return json({ ok: true, action: 'bill_paid' });
        }

        if (BILL_FAILED_EVENTS.includes(event)) {
            const newStatus = event === 'BILL_CANCELLED' ? 'CANCELLED' : 'FAILED';
            await admin.from('supplier_payments').update({
                status: newStatus,
                failure_reason: billStatus ?? event,
                updated_at: new Date().toISOString(),
            }).eq('id', sp.id);

            // Reverte o boleto para 'aprovado' (libera nova tentativa de pagamento)
            if (sp.boleto_id) {
                await admin.from('boletos').update({ status: 'aprovado' }).eq('id', sp.boleto_id)
                    .eq('status', 'programado');
            }
            return json({ ok: true, action: 'bill_failed' });
        }

        // Outros eventos (BILL_CREATED/PENDING/BANK_PROCESSING) — apenas ack, sem mudar status.
        return json({ ok: true, action: 'bill_status_ack' });
    }

    // ─── Ramo: cobrança ao cliente (PAYMENT_*) — inalterado ────────────────
    if (!payload.payment?.id) {
        return json({ error: 'Payload inválido' }, 400);
    }

    const paymentId = payload.payment.id;
    const asaasStatus = payload.payment.status ?? null;

    // Localiza a cobrança pelo asaas_payment_id
    const { data: charge } = await admin
        .from('client_charges')
        .select('id,transaction_id,organization_id,status')
        .eq('asaas_payment_id', paymentId)
        .maybeSingle();

    if (!charge) {
        // Não é nossa cobrança (ou ainda não persistida) — ack para evitar reenvio
        return json({ ok: true, ignored: true });
    }

    if (PAID_EVENTS.includes(event)) {
        // Idempotência: o Asaas reenvia/duplica eventos (retry, CONFIRMED+RECEIVED
        // para a mesma cobrança). Se a cobrança já está marcada como paga, não
        // reprocessa — evita duplicar a despesa de taxa gateway.
        if (PAID_STATUSES.includes(charge.status)) {
            return json({ ok: true, ignored: 'already_paid' });
        }

        const paidAt = payload.payment.paymentDate ?? payload.payment.clientPaymentDate ?? new Date().toISOString();
        const txDate = paidAt.split('T')[0]; // YYYY-MM-DD

        await admin.from('client_charges').update({
            status: asaasStatus ?? 'RECEIVED',
            paid_at: paidAt,
            updated_at: new Date().toISOString(),
        }).eq('id', charge.id);

        // Baixa automática do recebível
        if (charge.transaction_id) {
            await admin.from('internal_transactions').update({
                business_status: 'RECEBIDO',
                status: 'CONCILIATED',
                updated_at: new Date().toISOString(),
            }).eq('id', charge.transaction_id);

            // Registra taxa gateway como despesa financeira
            const grossValue = payload.payment.value  ?? 0;
            const netValue   = payload.payment.netValue ?? grossValue;
            const fee        = Math.round((grossValue - netValue) * 100) / 100;

            if (fee > 0) {
                const { data: parentTx } = await admin
                    .from('internal_transactions')
                    .select('project_id,cost_center_id')
                    .eq('id', charge.transaction_id)
                    .maybeSingle();

                await admin.from('internal_transactions').insert({
                    organization_id: charge.organization_id,
                    source_system:   'ASAAS_FEE',
                    direction:       'DEBIT',
                    amount:          fee,
                    transaction_date: txDate,
                    due_date:         txDate,
                    description:     `Taxa Gateway Asaas — ${paymentId}`,
                    category:        'Taxa Gateway',
                    business_status: 'PAGO',
                    status:          'CONCILIATED',
                    project_id:      parentTx?.project_id      ?? null,
                    cost_center_id:  parentTx?.cost_center_id  ?? null,
                    party_name:      'Asaas Tecnologia',
                });
            }
        }
        return json({ ok: true, action: 'paid' });
    }

    if (CANCEL_EVENTS.includes(event)) {
        await admin.from('client_charges').update({
            status: asaasStatus ?? 'CANCELLED',
            updated_at: new Date().toISOString(),
        }).eq('id', charge.id);
        return json({ ok: true, action: 'cancelled' });
    }

    // Outros eventos (ex.: PAYMENT_OVERDUE) — apenas reflete o status
    if (asaasStatus) {
        await admin.from('client_charges').update({
            status: asaasStatus,
            updated_at: new Date().toISOString(),
        }).eq('id', charge.id);
    }
    return json({ ok: true, action: 'status_updated' });
});
