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

function render(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function fmtBRL(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function fmtDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey   = Deno.env.get('RESEND_API_KEY') ?? '';
    const fromEmail      = Deno.env.get('REPORT_FROM_EMAIL') ?? 'cobranca@opura.com.br';
    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!resendApiKey) return json({ error: 'RESEND_API_KEY não configurada.' }, 503);

    const authHeader = req.headers.get('Authorization') ?? '';
    const isCron     = authHeader === `Bearer ${serviceRoleKey}`;

    // Admin client sempre com service_role para as queries
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Modo manual (JWT do usuário via supabase.functions.invoke):
    // valida o token e restringe ao org_id do body
    let manualOrgId: string | null = null;
    if (!isCron) {
        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: authErr } = await userClient.auth.getUser();
        if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

        // Lê organization_id do body
        try {
            const body = await req.json();
            manualOrgId = body?.organization_id ?? null;
        } catch { /* body vazio */ }

        if (!manualOrgId) return json({ error: 'organization_id obrigatório no modo manual.' }, 400);
    } else {
        // Cron: aceita org_id opcional para filtrar
        try {
            const body = await req.json();
            manualOrgId = body?.organization_id ?? null;
        } catch { /* body vazio */ }
    }

    const now      = new Date();
    const todayBRT = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    // No modo manual, ignora o horário — executa independente da hora
    const hourBRT  = isCron
        ? parseInt(now.toLocaleTimeString('en-US', {
            timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit',
          }))
        : -1; // -1 = ignora filtro de hora

    console.log(`[dunning-notifier] ${todayBRT} hora=${hourBRT} cron=${isCron} org=${manualOrgId ?? 'all'}`);

    // Carrega regras ativas
    let rulesQuery = admin
        .from('dunning_rules')
        .select('id,organization_id,name,days_offset,trigger_hour,channel,subject_template,body_template')
        .eq('is_active', true);
    if (hourBRT >= 0) rulesQuery = rulesQuery.eq('trigger_hour', hourBRT);
    if (manualOrgId) rulesQuery = rulesQuery.eq('organization_id', manualOrgId);

    const { data: rules, error: rulesErr } = await rulesQuery;
    if (rulesErr) return json({ error: rulesErr.message }, 500);
    if (!rules || rules.length === 0) {
        return json({ message: 'Nenhuma regra ativa encontrada.', todayBRT, hourBRT });
    }

    // Agrupa por days_offset
    const offsetMap: Record<number, typeof rules> = {};
    for (const r of rules) {
        if (!offsetMap[r.days_offset]) offsetMap[r.days_offset] = [];
        offsetMap[r.days_offset].push(r);
    }

    let totalSent = 0, totalSkipped = 0, totalFailed = 0;

    for (const [offsetStr, ruleGroup] of Object.entries(offsetMap)) {
        const offset = parseInt(offsetStr);

        const targetDate = new Date(todayBRT + 'T12:00:00');
        targetDate.setDate(targetDate.getDate() - offset);
        const targetDateStr = targetDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        const { data: receivables, error: rxErr } = await admin
            .from('internal_transactions')
            .select('id,organization_id,amount,description,party_name,party_email,project_id,due_date,business_status')
            .eq('direction', 'CREDIT')
            .eq('due_date', targetDateStr)
            .not('status', 'eq', 'CANCELLED')
            .not('business_status', 'in', '(RECEBIDO,CANCELADO,RENEGOCIADO)')
            .in('organization_id', ruleGroup.map((r: { organization_id: string }) => r.organization_id));

        if (rxErr) { console.error('[dunning] receivables error:', rxErr); continue; }
        if (!receivables || receivables.length === 0) continue;

        for (const rx of receivables) {
            const orgRules = ruleGroup.filter((r: { organization_id: string }) => r.organization_id === rx.organization_id);
            if (!orgRules.length) continue;

            // Resolve e-mail
            let email = rx.party_email as string | null;
            if (!email && rx.party_name) {
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
                const { data: member } = await admin
                    .from('organization_members')
                    .select('email')
                    .eq('organization_id', rx.organization_id)
                    .limit(1)
                    .maybeSingle();
                email = member?.email ?? null;
            }
            if (!email) { totalSkipped++; continue; }

            let projectName = '';
            if (rx.project_id) {
                const { data: proj } = await admin
                    .from('projects').select('name').eq('id', rx.project_id).maybeSingle();
                projectName = proj?.name ?? '';
            }

            const daysOverdue = Math.max(0, offset);
            const templateVars: Record<string, string> = {
                nome:        rx.party_name ?? 'Cliente',
                valor:       fmtBRL(rx.amount ?? 0),
                vencimento:  rx.due_date ? fmtDate(rx.due_date) : '—',
                descricao:   rx.description ?? 'Parcela',
                projeto:     projectName,
                dias_atraso: String(daysOverdue),
            };

            for (const rule of orgRules) {
                const { data: existing } = await admin
                    .from('dunning_events')
                    .select('id')
                    .eq('transaction_id', rx.id)
                    .eq('rule_id', rule.id)
                    .maybeSingle();

                if (existing) { totalSkipped++; continue; }

                const subject  = render(rule.subject_template, templateVars);
                const htmlBody = render(rule.body_template, templateVars);

                let sendStatus: 'sent' | 'failed' = 'sent';
                let errorMsg: string | null = null;

                try {
                    const res = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${resendApiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ from: fromEmail, to: [email], subject, html: htmlBody }),
                    });
                    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
                    totalSent++;
                } catch (err: unknown) {
                    sendStatus = 'failed';
                    errorMsg   = err instanceof Error ? err.message : String(err);
                    totalFailed++;
                }

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

    return json({ todayBRT, hourBRT, totalSent, totalSkipped, totalFailed });
});
