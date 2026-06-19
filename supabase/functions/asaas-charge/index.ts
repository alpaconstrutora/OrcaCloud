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
        billing_type?: 'BOLETO' | 'PIX' | 'UNDEFINED';
    };

    const { organization_id, transaction_id } = body;
    const billingType = body.billing_type ?? 'BOLETO';

    if (!organization_id || !transaction_id) {
        return json({ error: 'organization_id e transaction_id são obrigatórios.' }, 400);
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

    const asaasHeaders = {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey,
        'User-Agent': 'OrcaCloud',
    };

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
            return json({ error: 'Erro ao criar cliente no Asaas', detail: custData }, 502);
        }
        customerId = custData.id;
        if (client?.id && customerId) {
            await admin.from('clients').update({ asaas_customer_id: customerId }).eq('id', client.id);
        }
    }

    // 4. Cria a cobrança (payment)
    const dueDate = tx.due_date ?? new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const payRes = await fetch(`${asaasBase}/payments`, {
        method: 'POST',
        headers: asaasHeaders,
        body: JSON.stringify({
            customer: customerId,
            billingType,
            value: Number(tx.amount),
            dueDate,
            description: tx.description ?? 'Cobrança ORÇACLOUD',
            externalReference: tx.id,
        }),
    });
    const payData = await payRes.json();
    if (!payRes.ok) {
        return json({ error: 'Erro ao criar cobrança no Asaas', detail: payData }, 502);
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
