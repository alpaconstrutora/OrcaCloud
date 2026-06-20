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

// ─── formatting helpers ──────────────────────────────────────

function fmtBRL(n: number): string {
    if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}k`;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function fmtDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

const SEV_COLOR: Record<string, string> = {
    HIGH: '#dc2626', MEDIUM: '#d97706', LOW: '#2563eb',
};
const SEV_LABEL: Record<string, string> = {
    HIGH: 'Alto', MEDIUM: 'Médio', LOW: 'Baixo',
};
const ALERT_LABELS: Record<string, string> = {
    CASHFLOW_RISK: 'Risco de Caixa', OVERDUE_HIGH: 'Inadimplência Crítica',
    OVERDUE_AGING: 'Taxa de Inadimplência', MARGIN_LOW: 'Margem Baixa',
    SUPPLIER_CONCENTRATION: 'Concentração de Fornecedor',
};

// ─── HTML email builder ──────────────────────────────────────

function buildHtml(opts: {
    orgName: string;
    generatedAt: string;
    alerts: { alert_type: string; severity: string; title: string; description: string; amount: number | null }[];
    scorecards: { project_name: string; receita_realizada: number; custo_realizado: number; margem_pct: number; saldo_projetado: number; risco: string }[];
    projection: { data_ref: string; cr_previsto: number; db_previsto: number; saldo_acum: number }[];
    reportTypes: string[];
}): string {
    const { orgName, generatedAt, alerts, scorecards, projection, reportTypes } = opts;

    const high   = alerts.filter(a => a.severity === 'HIGH').length;
    const medium = alerts.filter(a => a.severity === 'MEDIUM').length;
    const avgMargem = scorecards.length > 0
        ? (scorecards.reduce((s, r) => s + r.margem_pct, 0) / scorecards.length).toFixed(1)
        : '—';
    const saldoFinal = projection.length > 0 ? projection[projection.length - 1].saldo_acum : null;
    const obrasRisco = scorecards.filter(s => s.risco !== 'OK').length;

    const kpiRow = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr>
        ${[
            { label: 'Alertas Críticos', value: String(high), sub: `${medium} médios`, color: high > 0 ? '#dc2626' : '#111827' },
            { label: 'Obras em Risco',   value: String(obrasRisco), sub: `de ${scorecards.length} obras`, color: obrasRisco > 0 ? '#d97706' : '#111827' },
            { label: 'Margem Média',     value: `${avgMargem}%`, sub: 'obras ativas', color: Number(avgMargem) < 10 ? '#dc2626' : '#16a34a' },
            { label: 'Saldo Projetado',  value: saldoFinal != null ? fmtBRL(saldoFinal) : '—', sub: '90 dias', color: (saldoFinal ?? 0) < 0 ? '#dc2626' : '#7c3aed' },
        ].map(k => `
          <td width="25%" style="padding:0 6px">
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center">
              <p style="margin:0;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">${k.label}</p>
              <p style="margin:4px 0 0;font-size:20px;font-weight:900;color:${k.color}">${k.value}</p>
              <p style="margin:2px 0 0;font-size:10px;color:#9ca3af">${k.sub}</p>
            </div>
          </td>
        `).join('')}
      </tr>
    </table>`;

    let alertsSection = '';
    if (reportTypes.includes('ALERTS') && alerts.length > 0) {
        alertsSection = `
        <h2 style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#374151;margin:24px 0 10px">
          Alertas (${alerts.length})
        </h2>
        ${alerts.map(a => `
          <div style="border-left:3px solid ${SEV_COLOR[a.severity]};background:#f9fafb;border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:9px;font-weight:900;text-transform:uppercase;color:${SEV_COLOR[a.severity]}">${SEV_LABEL[a.severity]}</span>
              <span style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af">${ALERT_LABELS[a.alert_type] ?? a.alert_type}</span>
            </div>
            <p style="margin:4px 0 2px;font-size:13px;font-weight:700;color:#111827">${a.title}</p>
            <p style="margin:0;font-size:11px;color:#6b7280">${a.description}</p>
            ${a.amount != null ? `<p style="margin:4px 0 0;font-size:12px;font-weight:900;color:${SEV_COLOR[a.severity]}">${fmtBRL(Math.abs(a.amount))}</p>` : ''}
          </div>
        `).join('')}`;
    }

    let scorecardSection = '';
    if (reportTypes.includes('SCORECARD') && scorecards.length > 0) {
        scorecardSection = `
        <h2 style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#374151;margin:24px 0 10px">
          Scorecard de Obras
        </h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:11px">
          <thead>
            <tr style="background:#f3f4f6">
              ${['Obra','Receita Real.','Custo Real.','Margem','Saldo Proj.','Risco'].map(h =>
                  `<th style="padding:8px 10px;text-align:left;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;white-space:nowrap">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${scorecards.map((s, i) => {
                const margemColor = s.margem_pct < 0 ? '#dc2626' : s.margem_pct < 10 ? '#d97706' : '#16a34a';
                const saldoColor  = s.saldo_projetado < 0 ? '#dc2626' : '#16a34a';
                const riscoColor  = s.risco === 'HIGH' ? '#dc2626' : s.risco === 'MEDIUM' ? '#d97706' : '#16a34a';
                return `
                <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};border-top:1px solid #f3f4f6">
                  <td style="padding:8px 10px;font-weight:600;color:#111827;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.project_name}</td>
                  <td style="padding:8px 10px;font-family:monospace;color:#374151">${fmtBRL(s.receita_realizada)}</td>
                  <td style="padding:8px 10px;font-family:monospace;color:#374151">${fmtBRL(s.custo_realizado)}</td>
                  <td style="padding:8px 10px;font-weight:900;color:${margemColor}">${s.margem_pct.toFixed(1)}%</td>
                  <td style="padding:8px 10px;font-weight:700;color:${saldoColor}">${fmtBRL(s.saldo_projetado)}</td>
                  <td style="padding:8px 10px">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${riscoColor}"></span>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`;
    }

    let cashflowSection = '';
    if (reportTypes.includes('CASHFLOW') && projection.length > 0) {
        // Amostra de até 10 pontos espaçados
        const step = Math.max(1, Math.floor(projection.length / 10));
        const sample = projection.filter((_, i) => i % step === 0 || i === projection.length - 1).slice(0, 10);
        const totalIn  = projection.reduce((s, p) => s + p.cr_previsto, 0);
        const totalOut = projection.reduce((s, p) => s + p.db_previsto, 0);

        cashflowSection = `
        <h2 style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#374151;margin:24px 0 10px">
          Projeção de Caixa (90 dias)
        </h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px">
          <tr>
            ${[
                { label: 'Total Previsto Entrar', value: fmtBRL(totalIn),  color: '#16a34a' },
                { label: 'Total Previsto Sair',   value: fmtBRL(totalOut), color: '#ea580c' },
                { label: 'Saldo Final',            value: saldoFinal != null ? fmtBRL(saldoFinal) : '—', color: (saldoFinal ?? 0) < 0 ? '#dc2626' : '#7c3aed' },
            ].map(k => `
              <td width="33%" style="padding:0 4px">
                <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center">
                  <p style="margin:0;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">${k.label}</p>
                  <p style="margin:4px 0 0;font-size:16px;font-weight:900;color:${k.color}">${k.value}</p>
                </div>
              </td>`).join('')}
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:11px">
          <thead>
            <tr style="background:#f3f4f6">
              ${['Data','Entradas','Saídas','Saldo Acum.'].map(h =>
                  `<th style="padding:8px 10px;text-align:left;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${sample.map((p, i) => `
              <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};border-top:1px solid #f3f4f6">
                <td style="padding:8px 10px;font-weight:600;color:#374151">${fmtDate(p.data_ref)}</td>
                <td style="padding:8px 10px;font-family:monospace;color:#16a34a">${fmtBRL(p.cr_previsto)}</td>
                <td style="padding:8px 10px;font-family:monospace;color:#ea580c">${fmtBRL(p.db_previsto)}</td>
                <td style="padding:8px 10px;font-family:monospace;font-weight:700;color:${p.saldo_acum < 0 ? '#dc2626' : '#7c3aed'}">${fmtBRL(p.saldo_acum)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr><td style="background:#7c3aed;padding:24px 32px">
          <p style="margin:0;font-size:18px;font-weight:900;color:#fff">Inteligência Financeira</p>
          <p style="margin:4px 0 0;font-size:12px;color:#ddd6fe">${orgName} · Gerado em ${generatedAt}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:24px 32px">
          ${kpiRow}
          ${alertsSection}
          ${scorecardSection}
          ${cashflowSection}
          <p style="margin:32px 0 0;font-size:10px;color:#9ca3af;text-align:center">
            Relatório automático enviado pelo OrçaCloud · Para cancelar, acesse Inteligência Financeira → Agendamentos
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── main ────────────────────────────────────────────────────

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey   = Deno.env.get('RESEND_API_KEY') ?? '';
    const fromEmail      = Deno.env.get('REPORT_FROM_EMAIL') ?? 'financeiro@opura.com.br';
    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!resendApiKey) return json({ error: 'RESEND_API_KEY não configurada.' }, 503);

    const authHeader = req.headers.get('Authorization') ?? '';
    const isCron     = authHeader === `Bearer ${serviceRoleKey}`;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: Record<string, string> = {};
    try { body = await req.json(); } catch { /* vazio */ }

    // Validação JWT (modo manual)
    if (!isCron) {
        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: authErr } = await userClient.auth.getUser();
        if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
        if (!body.organization_id) return json({ error: 'organization_id obrigatório' }, 400);
    }

    const now      = new Date();
    const nowBRT   = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hourBRT  = isCron ? nowBRT.getHours() : -1;  // -1 = ignora no modo manual
    const dowBRT   = nowBRT.getDay();    // 0=domingo
    const domBRT   = nowBRT.getDate();   // 1-31
    const todayBRT = nowBRT.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Carrega schedules
    let schedulesQuery = admin
        .from('report_schedules')
        .select('id,organization_id,name,frequency,day_of_week,day_of_month,hour,recipients,report_types,last_sent_at')
        .eq('is_active', true);

    if (body.schedule_id) schedulesQuery = schedulesQuery.eq('id', body.schedule_id);
    else if (body.organization_id) schedulesQuery = schedulesQuery.eq('organization_id', body.organization_id);

    const { data: schedules, error: schErr } = await schedulesQuery;
    if (schErr) return json({ error: schErr.message }, 500);
    if (!schedules || schedules.length === 0) return json({ sent: 0, message: 'Nenhum agendamento ativo.' });

    let totalSent = 0;

    for (const sched of schedules) {
        // Verifica se está na hora certa (cron mode)
        if (hourBRT >= 0) {
            if (sched.hour !== hourBRT) continue;
            if (sched.frequency === 'WEEKLY'  && sched.day_of_week  !== dowBRT) continue;
            if (sched.frequency === 'MONTHLY' && sched.day_of_month !== domBRT) continue;
            // Evita reenvio no mesmo dia
            if (sched.last_sent_at && sched.last_sent_at.startsWith(todayBRT)) continue;
        }

        if (!sched.recipients || sched.recipients.length === 0) continue;

        const reportTypes: string[] = sched.report_types ?? ['ALERTS', 'SCORECARD', 'CASHFLOW'];

        // Busca nome da org
        const { data: orgRow } = await admin
            .from('organizations').select('name').eq('id', sched.organization_id).maybeSingle();
        const orgName = orgRow?.name ?? 'Sua empresa';

        // Chama as RPCs conforme report_types
        const [alertsRes, scorecardsRes, projRes] = await Promise.all([
            reportTypes.includes('ALERTS')
                ? admin.rpc('fn_financial_alerts',    { p_organization_id: sched.organization_id })
                : Promise.resolve({ data: [] }),
            reportTypes.includes('SCORECARD')
                ? admin.rpc('fn_project_scorecard',   { p_organization_id: sched.organization_id })
                : Promise.resolve({ data: [] }),
            reportTypes.includes('CASHFLOW')
                ? admin.rpc('fn_cashflow_projection', { p_organization_id: sched.organization_id, p_horizon_days: 90 })
                : Promise.resolve({ data: [] }),
        ]);

        const alerts     = (alertsRes.data     ?? []) as { alert_type: string; severity: string; title: string; description: string; amount: number | null }[];
        const scorecards = (scorecardsRes.data  ?? []) as { project_name: string; receita_realizada: number; custo_realizado: number; margem_pct: number; saldo_projetado: number; risco: string }[];
        const projection = (projRes.data        ?? []) as { data_ref: string; cr_previsto: number; db_previsto: number; saldo_acum: number }[];

        const generatedAt = fmtDate(todayBRT);
        const htmlBody    = buildHtml({ orgName, generatedAt, alerts, scorecards, projection, reportTypes });

        const high = alerts.filter((a: { severity: string }) => a.severity === 'HIGH').length;
        const subject = `[${orgName}] Relatório Financeiro ${generatedAt}${high > 0 ? ` — ${high} alerta${high > 1 ? 's' : ''} crítico${high > 1 ? 's' : ''}` : ''}`;

        // Envia para cada destinatário
        for (const to of sched.recipients) {
            try {
                const res = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from: fromEmail, to: [to], subject, html: htmlBody }),
                });
                if (!res.ok) {
                    const txt = await res.text();
                    console.error(`[financial-report] Resend ${res.status}:`, txt);
                } else {
                    totalSent++;
                }
            } catch (err) {
                console.error('[financial-report] fetch error:', err);
            }
        }

        // Atualiza last_sent_at
        await admin
            .from('report_schedules')
            .update({ last_sent_at: now.toISOString(), updated_at: now.toISOString() })
            .eq('id', sched.id);
    }

    return json({ sent: totalSent, message: `${totalSent} e-mail(s) enviado(s).` });
});
