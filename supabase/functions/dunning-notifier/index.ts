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

// ── Template renderer ──────────────────────────────────────
function render(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

// ── Format helpers ─────────────────────────────────────────
function fmtBRL(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function fmtDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

// ── Main ───────────────────────────────────────────────────
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey   = Deno.env.get('RESEND_API_KEY') ?? '';
    const fromEmail      = Deno.env.get('REPORT_FROM_EMAIL') ?? 'cobranca@opura.com.br';
    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';

    // Auth: apenas cron com service_role pode invocar
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
        return json({ error: 'Unauthorized' }, 401);
    }
    if (!resendApiKey) {
        return json({ error: 'RESEND_API_KEY não configurada.' }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const now       = new Date();
    const todayBRT  = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
    const hourBRT   = parseInt(now.toLocaleTimeString('en-US', {
        timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit',
    }));

    console.log(`[dunning-notifier] ${todayBRT} hora BRT: ${hourBRT}`);

    // Permite forçar org_id via body (para teste manual)
    let filterOrgId: string | null = null;
    if (req.method === 'POST') {
        try {
            const body = await req.json();
            filterOrgId = body?.organization_id ?? null;
        } catch { /* body vazio */ }
    }

    // 1. Carrega regras ativas para o horário atual
    let rulesQuery = admin
        .from('dunning_rules')
        .select('id,organization_id,name,days_offset,trigger_hour,channel,subject_template,body_template')
        .eq('is_active', true)
        .eq('trigger_hour', hourBRT);
    if (filterOrgId) rulesQuery = rulesQuery.eq('organization_id', filterOrgId);

    const { data: rules, error: rulesErr } = await rulesQuery;
    if (rulesErr) return json({ error: rulesErr.message }, 500);
    if (!rules || rules.length === 0) {
        return json({ message: 'Nenhuma regra ativa para este horário.', hour: hourBRT });
    }

    // Agrupa regras por days_offset para query eficiente
    const offsetMap: Record<number, typeof rules> = {};
    for (const r of rules) {
        if (!offsetMap[r.days_offset]) offsetMap[r.days_offset] = [];
        offsetMap[r.days_offset].push(r);
    }

    let totalSent = 0, totalSkipped = 0, totalFailed = 0;

    for (const [offsetStr, ruleGroup] of Object.entries(offsetMap)) {
        const offset = parseInt(offsetStr);

        // Data alvo: se offset = -7, queremos títulos com due_date = today + 7
        // Se offset = +7, queremos títulos com due_date = today - 7
        const targetDate = new Date(todayBRT + 'T12:00:00');
        targetDate.setDate(targetDate.getDate() - offset);
        const targetDateStr = targetDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        // 2. Busca recebíveis com due_date = targetDate, não encerrados
        const { data: receivables, error: rxErr } = await admin
            .from('internal_transactions')
            .select('id,organization_id,amount,description,party_name,party_email,project_id,due_date,business_status')
            .eq('direction', 'CREDIT')
            .eq('due_date', targetDateStr)
            .not('status', 'eq', 'CANCELLED')
            .not('business_status', 'in', '(RECEBIDO,CANCELADO,RENEGOCIADO)')
            .in('organization_id', ruleGroup.map((r: {organization_id: string}) => r.organization_id));

        if (rxErr) { console.error('[dunning] receivables error:', rxErr); continue; }
        if (!receivables || receivables.length === 0) continue;

        for (const rx of receivables) {
            // Filtra regras da mesma org
            const orgRules = ruleGroup.filter((r: {organization_id: string}) => r.organization_id === rx.organization_id);
            if (!orgRules.length) continue;

            // Resolve e-mail do destinatário
            let email = rx.party_email as string | null;
            if (!email && rx.party_name) {
                // Tenta lookup por nome no clients table
                const { data: clientRow } = await admin
                    .from('clients')
                    .select('email')
                    .eq('organization_id', rx.organization_id)
                    .ilike('name', rx.party_name)
                    .limit(1)
                    .maybeSingle();
                email = clientRow?.email ?? null;
            }
            if (!email) {
                // Fallback: e-mail do admin da org (organization_members)
                const { data: member } = await admin
                    .from('organization_members')
                    .select('email')
                    .eq('organization_id', rx.organization_id)
                    .limit(1)
                    .maybeSingle();
                email = member?.email ?? null;
            }
            if (!email) {
                console.warn(`[dunning] sem e-mail para transaction ${rx.id}, skipping`);
                totalSkipped++;
                continue;
            }

            // Busca project_name se existir
            let projectName = '';
            if (rx.project_id) {
                const { data: proj } = await admin
                    .from('projects')
                    .select('name')
                    .eq('id', rx.project_id)
                    .maybeSingle();
                projectName = proj?.name ?? '';
            }

            const daysOverdue = Math.max(0, offset);
            const templateVars: Record<string, string> = {
                nome:         rx.party_name ?? 'Cliente',
                valor:        fmtBRL(rx.amount ?? 0),
                vencimento:   rx.due_date ? fmtDate(rx.due_date) : '—',
                descricao:    rx.description ?? 'Parcela',
                projeto:      projectName,
                dias_atraso:  String(daysOverdue),
            };

            for (const rule of orgRules) {
                // Verifica se já foi enviado (UNIQUE transaction_id + rule_id)
                const { data: existing } = await admin
                    .from('dunning_events')
                    .select('id')
                    .eq('transaction_id', rx.id)
                    .eq('rule_id', rule.id)
                    .maybeSingle();

                if (existing) { totalSkipped++; continue; }

                const subject = render(rule.subject_template, templateVars);
                const htmlBody = render(rule.body_template, templateVars);

                // Envia via Resend
                let sendStatus: 'sent' | 'failed' = 'sent';
                let errorMsg: string | null = null;

                try {
                    const res = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${resendApiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            from:    fromEmail,
                            to:      [email],
                            subject: subject,
                            html:    htmlBody,
                        }),
                    });
                    if (!res.ok) {
                        const errBody = await res.text();
                        throw new Error(`Resend ${res.status}: ${errBody}`);
                    }
                    totalSent++;
                } catch (err: unknown) {
                    console.error(`[dunning] send failed tx=${rx.id} rule=${rule.id}:`, err);
                    sendStatus = 'failed';
                    errorMsg   = err instanceof Error ? err.message : String(err);
                    totalFailed++;
                }

                // Registra evento (ignora conflito de unique caso race condition)
                await admin.from('dunning_events').upsert({
                    organization_id: rx.organization_id,
                    transaction_id:  rx.id,
                    rule_id:         rule.id,
                    channel:         rule.channel ?? 'email',
                    recipient_email: email,
                    party_name:      rx.party_name ?? null,
                    amount:          rx.amount ?? null,
                    due_date:        rx.due_date ?? null,
                    status:          sendStatus,
                    error_message:   errorMsg,
                    sent_at:         new Date().toISOString(),
                }, { onConflict: 'transaction_id,rule_id', ignoreDuplicates: true });
            }
        }
    }

    console.log(`[dunning-notifier] done. sent=${totalSent} skipped=${totalSkipped} failed=${totalFailed}`);
    return json({ todayBRT, hourBRT, totalSent, totalSkipped, totalFailed });
});
