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

// Schema confirmado via OpenAPI oficial da Asaas (2026-07-03):
// POST /v3/bill/simulate → { fee, minimumScheduleDate, bankSlipInfo: { beneficiaryName, beneficiaryCpfCnpj, value, dueDate, isOverdue, companyName, ... } }
// POST /v3/bill (create)  → { id, status, value, fee, companyName, transactionReceiptUrl, canBeCancelled, ... } — NÃO tem beneficiaryName, só companyName.
interface BankSlipInfo {
    beneficiaryName?: string;
    beneficiaryCpfCnpj?: string;
    companyName?: string;
    value?: number;
    dueDate?: string;
    isOverdue?: boolean;
    bank?: string;
}
interface BillSimulateResponse {
    fee?: number;
    minimumScheduleDate?: string;
    bankSlipInfo?: BankSlipInfo;
}
interface BillResponse {
    id?: string;
    status?: string;
    value?: number;
    fee?: number;
    companyName?: string;
    transactionReceiptUrl?: string;
    canBeCancelled?: boolean;
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
        return json({ error: 'Integração de pagamento não configurada. Defina ASAAS_API_KEY nas variáveis de ambiente do Supabase.' }, 503);
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
    const userEmail = user.email ?? null;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({})) as {
        organization_id?: string;
        boleto_id?: string;
        supplier_payment_id?: string;
        action?: 'quote' | 'pay' | 'cancel';
        schedule_date?: string;
    };

    const { organization_id, boleto_id } = body;
    const action = body.action ?? 'quote';

    if (!organization_id) return json({ error: 'organization_id é obrigatório.' }, 400);

    const asaasHeaders = {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey,
        'User-Agent': 'OrcaCloud',
    };

    // ─── action: cancel ───────────────────────────────────────
    if (action === 'cancel') {
        const paymentId = body.supplier_payment_id;
        if (!paymentId) return json({ error: 'supplier_payment_id é obrigatório para cancel.' }, 400);

        const { data: sp } = await admin
            .from('supplier_payments')
            .select('id,asaas_bill_id,status,boleto_id')
            .eq('id', paymentId)
            .eq('organization_id', organization_id)
            .maybeSingle();
        if (!sp) return json({ error: 'Pagamento não encontrado.' }, 404);
        if (sp.status === 'CANCELLED') return json({ ok: true, already_cancelled: true });
        if (sp.status === 'DONE') return json({ error: 'Pagamento já concluído — não pode ser cancelado.' }, 422);

        if (sp.asaas_bill_id) {
            const cancelRes = await fetch(`${asaasBase}/bill/${sp.asaas_bill_id}/cancel`, {
                method: 'POST',
                headers: asaasHeaders,
            });
            if (!cancelRes.ok && cancelRes.status !== 404) {
                const d = await cancelRes.json().catch(() => ({}));
                const msg = d?.errors?.[0]?.description ?? `HTTP ${cancelRes.status}`;
                return json({ error: `Asaas (cancelamento): ${msg}`, detail: d }, 502);
            }
        }

        await admin.from('supplier_payments').update({ status: 'CANCELLED' }).eq('id', sp.id);
        if (sp.boleto_id) {
            await admin.from('boletos').update({ status: 'aprovado' }).eq('id', sp.boleto_id)
                .eq('status', 'programado'); // só reverte se ainda estava programado (não sobrescreve 'pago')
        }
        return json({ ok: true });
    }

    // ─── quote / pay compartilham a resolução do boleto ────────
    if (!boleto_id) return json({ error: 'boleto_id é obrigatório.' }, 400);

    const { data: boleto, error: bErr } = await admin
        .from('boletos')
        .select('id,organization_id,linha_digitavel,valor,vencimento,beneficiario_nome,supplier_id,status,invoice_id')
        .eq('id', boleto_id)
        .eq('organization_id', organization_id)
        .single();
    if (bErr || !boleto) return json({ error: 'Boleto não encontrado.' }, 404);
    if (!boleto.linha_digitavel) return json({ error: 'Boleto sem linha digitável capturada — não é possível pagar via Asaas.' }, 422);
    if (boleto.status !== 'aprovado' && action === 'pay') {
        return json({ error: `Boleto precisa estar aprovado para ser pago (status atual: ${boleto.status}).` }, 422);
    }

    // ─── action: quote ──────────────────────────────────────────
    // Simula o pagamento na Asaas — retorna valor/beneficiário reais para confirmação
    // do usuário ANTES de disparar o pagamento de verdade (mitigação de boleto adulterado).
    if (action === 'quote') {
        const simRes = await fetch(`${asaasBase}/bill/simulate`, {
            method: 'POST',
            headers: asaasHeaders,
            body: JSON.stringify({ identificationField: boleto.linha_digitavel }),
        });
        const simData = await simRes.json().catch(() => ({})) as BillSimulateResponse;
        if (!simRes.ok) {
            const msg = (simData as any)?.errors?.[0]?.description ?? `HTTP ${simRes.status}`;
            return json({ error: `Asaas (simulação): ${msg}`, detail: simData }, 502);
        }

        const info = simData.bankSlipInfo;
        const beneficiaryName = info?.beneficiaryName ?? info?.companyName ?? null;

        // Confere o valor capturado por OCR contra o valor real embutido na linha digitável —
        // divergência pode indicar erro de OCR ou boleto adulterado (ver Seção 6 do PRD).
        const capturedValue = boleto.valor != null ? Number(boleto.valor) : null;
        const realValue = info?.value ?? null;
        const valueMismatch = capturedValue != null && realValue != null
            && Math.abs(capturedValue - realValue) > 0.01;

        return json({
            ok: true,
            simulation: simData,
            fee: simData.fee ?? null,
            beneficiary_name: beneficiaryName ?? boleto.beneficiario_nome ?? null,
            beneficiary_name_source: beneficiaryName ? 'asaas' : 'boleto_capturado',
            beneficiary_cpf_cnpj: info?.beneficiaryCpfCnpj ?? null,
            is_overdue: info?.isOverdue ?? null,
            real_value: realValue,
            captured_value: capturedValue,
            value_mismatch: valueMismatch,
        });
    }

    // ─── action: pay ────────────────────────────────────────────
    if (!boleto.supplier_id) return json({ error: 'Boleto sem fornecedor vinculado.' }, 422);

    // Cria a linha em AWAITING_APPROVAL/APPROVED antes de chamar a Asaas — garante rastro
    // mesmo se a chamada falhar no meio. Gate mínimo (Fase 1): exige boleto já 'aprovado'
    // no fluxo existente (== is_financial_approved implícito). Motor de alçada é Fase 3.
    const { data: spRow, error: spErr } = await admin
        .from('supplier_payments')
        .insert({
            organization_id,
            boleto_id: boleto.id,
            supplier_id: boleto.supplier_id,
            provider: 'asaas',
            payment_type: 'BILL',
            identification_field: boleto.linha_digitavel,
            value: boleto.valor ?? 0, // valor real vem da linha digitável; este é o capturado por OCR, só para exibição local
            scheduled_date: body.schedule_date ?? null,
            status: 'APPROVED',
            approved_by_email: userEmail,
            approved_at: new Date().toISOString(),
            created_by_email: userEmail,
        })
        .select('id')
        .single();
    if (spErr) return json({ error: 'Falha ao registrar ordem de pagamento', detail: spErr.message }, 500);

    // NÃO envia `value`/`dueDate` — a documentação da Asaas é explícita: esses campos são só
    // para contas que NÃO têm essa informação embutida (ex.: fatura de cartão). Um boleto
    // padrão já carrega o valor real na própria linha digitável; enviar um valor divergente
    // (captura por OCR pode ter erro) arriscaria rejeição ou inconsistência.
    const payBody: Record<string, unknown> = {
        identificationField: boleto.linha_digitavel,
        externalReference: boleto.id,
    };
    if (body.schedule_date) payBody.scheduleDate = body.schedule_date;

    const payRes = await fetch(`${asaasBase}/bill`, {
        method: 'POST',
        headers: asaasHeaders,
        body: JSON.stringify(payBody),
    });
    const payData = await payRes.json().catch(() => ({})) as BillResponse;

    if (!payRes.ok) {
        const msg = (payData as any)?.errors?.[0]?.description ?? `HTTP ${payRes.status}`;
        await admin.from('supplier_payments').update({
            status: 'FAILED',
            failure_reason: msg,
            raw_response: payData,
        }).eq('id', spRow.id);
        return json({ error: `Asaas (pagamento): ${msg}`, detail: payData }, 502);
    }

    const asaasBillId = payData.id ?? null;
    const asaasStatus = payData.status ?? null;
    const beneficiaryName = payData.companyName ?? boleto.beneficiario_nome ?? null;

    await admin.from('supplier_payments').update({
        asaas_bill_id: asaasBillId,
        status: body.schedule_date ? 'SCHEDULED' : 'PENDING',
        beneficiary_name: beneficiaryName,
        value: payData.value ?? boleto.valor, // sobrescreve pelo valor real confirmado pela Asaas
        fee: payData.fee ?? null,
        raw_response: payData,
    }).eq('id', spRow.id);

    // Boleto vai para 'programado' — 'pago' só quando o webhook confirmar BILL_PAID.
    await admin.from('boletos').update({ status: 'programado' }).eq('id', boleto.id);
    await admin.from('boletos_auditoria').insert({
        boleto_id: boleto.id,
        organization_id,
        acao: 'pagamento_asaas_disparado',
        metodo: 'usuario',
        usuario_email: userEmail,
        valor_depois: { supplier_payment_id: spRow.id, asaas_bill_id: asaasBillId, status: asaasStatus },
    });

    return json({
        ok: true,
        supplier_payment_id: spRow.id,
        asaas_bill_id: asaasBillId,
        status: asaasStatus,
        beneficiary_name: beneficiaryName,
    });
});
