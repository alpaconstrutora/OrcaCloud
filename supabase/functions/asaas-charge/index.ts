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

function onlyDigits(s: string | null | undefined): string {
    return (s ?? '').replace(/\D/g, '');
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const asaasApiKey    = Deno.env.get('ASAAS_API_KEY') ?? '';
    const asaasEnv       = (Deno.env.get('ASAAS_ENV') ?? 'sandbox').toLowerCase();

    if (!asaasApiKey) {
        return json({ error: 'Integração de cobrança não configurada. Defina ASAAS_API_KEY nas variáveis de ambiente do Supabase.' }, 503);
    }

    const asaasBase = asaasEnv === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://api-sandbox.asaas.com/v3';

    // Valida o usuário (JWT)
    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Token inválido' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({})) as {
        organization_id?: string;
        transaction_id?: string;
        charge_id?: string;
        billing_type?: 'BOLETO' | 'PIX' | 'UNDEFINED';
        action?: 'emit' | 'cancel' | 'resend';
        email?: string;
        // Overrides opcionais por cobrança (senão usa a config da org)
        fine_percent?: number;
        interest_percent_month?: number;
        discount_percent?: number;
        discount_days?: number;
    };

    const { organization_id, transaction_id } = body;
    const billingType = body.billing_type ?? 'BOLETO';
    const action = body.action ?? 'emit';

    if (!organization_id) {
        return json({ error: 'organization_id é obrigatório.' }, 400);
    }

    // ─── action: resend ───────────────────────────────────────
    // Reenvia o boleto por e-mail via Asaas (segunda via).
    if (action === 'resend') {
        const chargeId = body.charge_id;
        if (!chargeId) return json({ error: 'charge_id é obrigatório para resend.' }, 400);

        const { data: ch } = await admin
            .from('client_charges')
            .select('asaas_payment_id,billing_type,party_email,status')
            .eq('id', chargeId)
            .eq('organization_id', organization_id)
            .maybeSingle();

        if (!ch?.asaas_payment_id) return json({ error: 'Cobrança não encontrada ou sem ID Asaas.' }, 404);
        if (ch.status === 'CANCELLED') return json({ error: 'Cobrança cancelada — não é possível reenviar.' }, 422);

        const sendBody: Record<string, unknown> = {};
        const emailOverride = body.email ?? ch.party_email;
        if (emailOverride) sendBody.emails = [emailOverride];

        const res = await fetch(`${asaasBase}/payments/${ch.asaas_payment_id}/sendByMail`, {
            method: 'POST',
            headers: asaasHeadersBase,
            body: JSON.stringify(sendBody),
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            const msg = d?.errors?.[0]?.description ?? `HTTP ${res.status}`;
            return json({ error: `Asaas (reenvio): ${msg}`, detail: d }, 502);
        }
        return json({ ok: true, email: emailOverride ?? null });
    }

    if (!transaction_id) {
        return json({ error: 'transaction_id é obrigatório.' }, 400);
    }

    const asaasHeadersBase = {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey,
        'User-Agent': 'OrcaCloud',
    };

    // ─── action: cancel ───────────────────────────────────────
    // Cancela a(s) cobrança(s) ativa(s) do recebível no Asaas e
    // reverte o recebível para PREVISTO, liberando reemissão.
    if (action === 'cancel') {
        const { data: charges, error: chListErr } = await admin
            .from('client_charges')
            .select('id,asaas_payment_id,status')
            .eq('organization_id', organization_id)
            .eq('transaction_id', transaction_id)
            .neq('status', 'CANCELLED');
        if (chListErr) return json({ error: 'Falha ao buscar cobranças', detail: chListErr.message }, 500);

        for (const ch of charges ?? []) {
            if (ch.asaas_payment_id) {
                const delRes = await fetch(`${asaasBase}/payments/${ch.asaas_payment_id}`, {
                    method: 'DELETE',
                    headers: asaasHeadersBase,
                });
                // 404 = já removido no Asaas; trata como sucesso idempotente
                if (!delRes.ok && delRes.status !== 404) {
                    const delData = await delRes.json().catch(() => ({}));
                    const msg = delData?.errors?.[0]?.description ?? `HTTP ${delRes.status}`;
                    return json({ error: `Asaas (cancelamento): ${msg}`, detail: delData }, 502);
                }
            }
            await admin
                .from('client_charges')
                .update({ status: 'CANCELLED' })
                .eq('id', ch.id);
        }

        // Reverte o recebível para PREVISTO (só se ainda não foi recebido/cancelado)
        await admin
            .from('internal_transactions')
            .update({ business_status: 'PREVISTO', updated_at: new Date().toISOString() })
            .eq('id', transaction_id)
            .eq('organization_id', organization_id)
            .in('business_status', ['EMITIDO', 'ENVIADO']);

        return json({ ok: true, cancelled: (charges ?? []).length });
    }

    // 1. Carrega o recebível
    const { data: tx, error: txErr } = await admin
        .from('internal_transactions')
        .select('id,organization_id,amount,description,party_id,party_name,party_email,due_date,project_id,reference_id')
        .eq('id', transaction_id)
        .eq('organization_id', organization_id)
        .single();
    if (txErr || !tx) return json({ error: 'Recebível não encontrado.' }, 404);

    // 2. Resolve o cliente (document/email/phone):
    //    (a) por party_id (vínculo direto) → (b) por nome exato → (c) por nome normalizado
    type ClientRow = { id?: string; name?: string; email?: string; document?: string; phone?: string; asaas_customer_id?: string };
    let client: ClientRow | null = null;
    const clientCols = 'id,name,email,document,phone,asaas_customer_id';

    if (tx.party_id) {
        const { data: c } = await admin
            .from('clients').select(clientCols).eq('id', tx.party_id).maybeSingle();
        client = c;
    }
    if (!client && tx.party_name) {
        const { data: c } = await admin
            .from('clients').select(clientCols)
            .eq('organization_id', organization_id)
            .ilike('name', tx.party_name.trim())
            .limit(1).maybeSingle();
        client = c;
    }
    if (!client && tx.party_name) {
        // fallback: match parcial (caso o nome tenha sufixos/diferenças)
        const { data: c } = await admin
            .from('clients').select(clientCols)
            .eq('organization_id', organization_id)
            .ilike('name', `%${tx.party_name.trim()}%`)
            .limit(1).maybeSingle();
        client = c;
    }

    if (!client) {
        return json({ error: `Cliente "${tx.party_name ?? '—'}" não encontrado no cadastro de clientes. Vincule o recebível a um cliente cadastrado.` }, 422);
    }
    const cpfCnpj = onlyDigits(client.document);
    if (!cpfCnpj) {
        return json({ error: `Cliente "${client.name ?? tx.party_name ?? '—'}" sem CPF/CNPJ cadastrado. O Asaas exige documento para emitir cobrança.` }, 422);
    }

    const asaasHeaders = asaasHeadersBase;

    // 3. Garante o customer no Asaas (cache em clients.asaas_customer_id)
    let customerId = client?.asaas_customer_id ?? null;
    if (!customerId) {
        const custRes = await fetch(`${asaasBase}/customers`, {
            method: 'POST',
            headers: asaasHeaders,
            body: JSON.stringify({
                name: client?.name ?? tx.party_name ?? 'Cliente',
                cpfCnpj,
                email: client?.email ?? tx.party_email ?? undefined,
                phone: onlyDigits(client?.phone) || undefined,
                externalReference: client?.id ?? undefined,
            }),
        });
        const custData = await custRes.json();
        if (!custRes.ok) {
            const msg = custData?.errors?.[0]?.description ?? JSON.stringify(custData);
            return json({ error: `Asaas (cliente): ${msg}`, detail: custData }, 502);
        }
        customerId = custData.id;
        if (client?.id && customerId) {
            await admin.from('clients').update({ asaas_customer_id: customerId }).eq('id', client.id);
        }
    }

    // 4. Resolve multa/juros/desconto: override do body → config da org → padrão
    const { data: cfg } = await admin
        .from('asaas_charge_config')
        .select('fine_percent,interest_percent_month,discount_percent,discount_days')
        .eq('organization_id', organization_id)
        .maybeSingle();

    const finePercent     = body.fine_percent             ?? cfg?.fine_percent             ?? 2;
    const interestPercent = body.interest_percent_month   ?? cfg?.interest_percent_month   ?? 1;
    const discountPercent = body.discount_percent         ?? cfg?.discount_percent         ?? 0;
    const discountDays    = body.discount_days            ?? cfg?.discount_days            ?? 0;

    // 5. Cria a cobrança (payment) com multa/juros/desconto
    const dueDate = tx.due_date ?? new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const paymentBody: Record<string, unknown> = {
        customer: customerId,
        billingType,
        value: Number(tx.amount),
        dueDate,
        description: tx.description ?? 'Cobrança ORÇACLOUD',
        externalReference: tx.id,
    };
    // Multa (% fixa sobre o valor, aplicada após o vencimento)
    if (finePercent > 0)     paymentBody.fine     = { value: finePercent, type: 'PERCENTAGE' };
    // Juros de mora (% ao mês)
    if (interestPercent > 0) paymentBody.interest = { value: interestPercent };
    // Desconto (% até N dias antes do vencimento)
    if (discountPercent > 0) paymentBody.discount = { value: discountPercent, dueDateLimitDays: discountDays, type: 'PERCENTAGE' };

    const payRes = await fetch(`${asaasBase}/payments`, {
        method: 'POST',
        headers: asaasHeaders,
        body: JSON.stringify(paymentBody),
    });
    const payData = await payRes.json();
    if (!payRes.ok) {
        const msg = payData?.errors?.[0]?.description ?? JSON.stringify(payData);
        return json({ error: `Asaas (cobrança): ${msg}`, detail: payData }, 502);
    }

    // 5. Busca o copia-e-cola do PIX (endpoint separado), se aplicável
    let pixPayload: string | null = null;
    if (billingType === 'PIX' || billingType === 'UNDEFINED') {
        const pixRes = await fetch(`${asaasBase}/payments/${payData.id}/pixQrCode`, { headers: asaasHeaders });
        if (pixRes.ok) {
            const pix = await pixRes.json();
            pixPayload = pix.payload ?? null;
        }
    }

    // 6. Persiste em client_charges
    const { data: charge, error: chErr } = await admin
        .from('client_charges')
        .insert({
            organization_id,
            transaction_id: tx.id,
            client_id: client?.id ?? null,
            provider: 'asaas',
            asaas_customer_id: customerId,
            asaas_payment_id: payData.id,
            billing_type: billingType,
            value: Number(tx.amount),
            due_date: dueDate,
            status: payData.status ?? 'PENDING',
            invoice_url: payData.invoiceUrl ?? null,
            bank_slip_url: payData.bankSlipUrl ?? null,
            pix_payload: pixPayload,
            description: tx.description ?? null,
            party_name: tx.party_name ?? null,
            party_email: client?.email ?? tx.party_email ?? null,
        })
        .select('id,invoice_url,bank_slip_url,pix_payload,status,billing_type,value,due_date')
        .single();
    if (chErr) return json({ error: 'Cobrança criada no Asaas mas falhou ao salvar localmente', detail: chErr.message }, 500);

    // 7. Atualiza o recebível para EMITIDO
    await admin
        .from('internal_transactions')
        .update({ business_status: 'EMITIDO', updated_at: new Date().toISOString() })
        .eq('id', tx.id)
        .eq('business_status', 'PREVISTO');

    return json({
        ok: true,
        charge,
        invoice_url: payData.invoiceUrl,
        bank_slip_url: payData.bankSlipUrl,
        pix_payload: pixPayload,
    });
});
