// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: { env: { get(key: string): string | undefined } };

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Eventos do Asaas que confirmam recebimento
const PAID_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'];
const CANCEL_EVENTS = ['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'];

serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
    const webhookToken   = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '';

    // Asaas envia o token configurado no header asaas-access-token
    const incoming = req.headers.get('asaas-access-token') ?? '';
    const mask = (s: string) => s ? `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})` : '(vazio)';
    console.log(`[asaas-webhook] incoming=${mask(incoming)} expected=${mask(webhookToken)} match=${incoming === webhookToken}`);
    if (webhookToken && incoming !== webhookToken) {
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
    } | null;

    if (!payload?.event || !payload.payment?.id) {
        return json({ error: 'Payload inválido' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const event     = payload.event;
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
