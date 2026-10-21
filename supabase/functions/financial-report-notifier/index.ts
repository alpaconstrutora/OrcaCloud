// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { chamadaDeCron, exigirMembro, exigirUsuario, respostaDeErro } from "../_shared/auth.ts"
import { escapeHtml } from "../_shared/html.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

// Relatório da Inteligência Financeira por e-mail.
// Plano: docs/planos/2026-10-21-inteligencia-financeira-numeros-reais.md (Fase 3).
//
// DUAS portas, e nenhuma depende do gateway (publicada com --no-verify-jwt):
//   • cron do banco  → `chamadaDeCron` (CRON_SECRET). Envia os agendamentos ATIVOS
//                      cuja hora/dia em Brasília é agora e que ainda não saíram hoje.
//   • "Enviar agora" → `exigirMembro` na organização DO AGENDAMENTO (não na que o
//                      corpo diz). Envia aquele agendamento, ativo ou pausado.
// Os dados vêm das mesmas RPCs da tela (fn_fi_ledger), chamadas como service_role
// com a organização explícita — fn_fi_targets aceita isso desde
// aplicar_20271021950000. Se QUALQUER consulta falhar, o e-mail NÃO sai: antes o
// erro era engolido (`data ?? []`) e o relatório chegava dizendo que estava tudo bem.

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

// ─── tipos (espelham services/financialIntelligenceService.ts) ───────────────

interface Alerta { alert_type: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; title: string; description: string; amount: number | null }
interface Obra {
    project_name: string; receita_realizada: number; custo_realizado: number; margem_pct: number;
    saldo_projetado: number; risco: 'HIGH' | 'MEDIUM' | 'OK'; ar_vencido: number; ap_vencido: number; tem_receita: boolean;
}
interface Ponto { data_ref: string; cr_previsto: number; db_previsto: number; saldo_acum: number }
interface Posicao {
    saldo_bancario: number; contas: number; contas_sem_saldo_inicial: number; extrato_ate: string | null;
    vencido_receber: number; vencido_receber_qtd: number; vencido_pagar: number; vencido_pagar_qtd: number;
}
interface Locacao { empreendimento_nome: string; recebido: number; vencido: number }
interface Agendamento {
    id: string; organization_id: string; name: string; frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    day_of_week: number | null; day_of_month: number | null; hour: number; recipients: string[] | null;
    report_types: string[] | null; is_active: boolean; last_sent_at: string | null;
}

// ─── formatação ─────────────────────────────────────────────────────────────

const n = (v: unknown) => (v == null ? 0 : Number(v));
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const dataBR = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const plural = (q: number, um: string, muitos: string) => `${q.toLocaleString('pt-BR')} ${q === 1 ? um : muitos}`;

/** Hora, dia e data em Brasília — por Intl, sem reconverter string em Date. */
function emBrasilia(d: Date) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(d).map(x => [x.type, x.value]));
    const semana: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), diaSemana: semana[p.weekday], diaMes: Number(p.day) };
}

const COR_SEV: Record<string, string> = { HIGH: '#dc2626', MEDIUM: '#b45309', LOW: '#2563eb' };
const ROTULO_SEV: Record<string, string> = { HIGH: 'Alto', MEDIUM: 'Médio', LOW: 'Baixo' };
const TIPO_ALERTA: Record<string, string> = {
    OVERDUE_HIGH: 'Inadimplência', PAYABLE_OVERDUE: 'Contas a pagar vencidas',
    CASHFLOW_RISK: 'Risco de caixa', MARGIN_LOW: 'Margem baixa',
};
const RISCO: Record<string, [string, string]> = { HIGH: ['Alto', '#dc2626'], MEDIUM: ['Médio', '#b45309'], OK: ['Sem risco', '#15803d'] };

const H2 = 'font-size:15px;font-weight:600;color:#111827;margin:28px 0 10px';
const TH = 'padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;white-space:nowrap';
const THR = TH.replace('text-align:left', 'text-align:right');
const TD = 'padding:8px 10px;font-size:13px;color:#374151;border-top:1px solid #f3f4f6';
const TDR = `${TD};text-align:right;white-space:nowrap`;

/** Entradas e saídas somadas por semana — nunca amostra de dias (amostrar sumia com movimento). */
function porSemana(pontos: Ponto[]) {
    const semanas: { inicio: string; entradas: number; saidas: number; saldo: number }[] = [];
    pontos.forEach((p, i) => {
        const k = Math.floor(i / 7);
        if (!semanas[k]) semanas[k] = { inicio: p.data_ref, entradas: 0, saidas: 0, saldo: 0 };
        semanas[k].entradas += p.cr_previsto;
        semanas[k].saidas += p.db_previsto;
        semanas[k].saldo = p.saldo_acum;
    });
    return semanas;
}

function montarHtml(o: {
    orgName: string; geradoEm: string; tipos: string[];
    alertas: Alerta[]; obras: Obra[]; projecao: Ponto[]; posicao: Posicao | null; locacao: Locacao[];
}): string {
    const { orgName, geradoEm, tipos, alertas, obras, projecao, posicao, locacao } = o;
    const criticos = alertas.filter(a => a.severity === 'HIGH').length;
    const saldo90 = projecao.length > 0 ? projecao[projecao.length - 1].saldo_acum : null;

    const kpis = [
        { rotulo: 'Alertas críticos', valor: String(criticos), sub: plural(alertas.length, 'alerta no total', 'alertas no total'), cor: criticos > 0 ? '#dc2626' : '#111827' },
        { rotulo: 'A receber vencido', valor: posicao ? brl(posicao.vencido_receber) : '—', sub: posicao ? plural(posicao.vencido_receber_qtd, 'título', 'títulos') : '', cor: '#c2410c' },
        { rotulo: 'A pagar vencido', valor: posicao ? brl(posicao.vencido_pagar) : '—', sub: posicao ? plural(posicao.vencido_pagar_qtd, 'título', 'títulos') : '', cor: '#be123c' },
        { rotulo: 'Saldo em 90 dias', valor: saldo90 == null ? '—' : brl(saldo90), sub: posicao ? `parte de ${brl(posicao.saldo_bancario)} nos bancos` : '', cor: (saldo90 ?? 0) < 0 ? '#dc2626' : '#15803d' },
    ];

    const linhaKpis = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px"><tr>
      ${kpis.map(k => `
        <td width="25%" style="padding:0 4px;vertical-align:top">
          <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px">
            <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(k.rotulo)}</p>
            <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:${k.cor}">${escapeHtml(k.valor)}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#9ca3af">${escapeHtml(k.sub)}</p>
          </div>
        </td>`).join('')}
    </tr></table>`;

    const avisos: string[] = [];
    if (posicao) {
        if (posicao.contas_sem_saldo_inicial > 0) avisos.push(`${plural(posicao.contas_sem_saldo_inicial, 'conta', 'contas')} sem saldo inicial cadastrado`);
        if (posicao.extrato_ate) avisos.push(`extrato importado até ${dataBR(posicao.extrato_ate)}`);
    }
    const avisoBase = avisos.length
        ? `<p style="margin:6px 4px 0;font-size:12px;color:#b45309">Saldo dos bancos: ${escapeHtml(avisos.join('; '))}.</p>`
        : '';

    let secAlertas = '';
    if (tipos.includes('ALERTS')) {
        secAlertas = `<h2 style="${H2}">Alertas</h2>` + (alertas.length === 0
            ? `<p style="font-size:13px;color:#6b7280">Nenhum alerta: todos os indicadores dentro dos limites.</p>`
            : alertas.map(a => `
              <div style="border-left:3px solid ${COR_SEV[a.severity]};padding:8px 12px;margin-bottom:8px;background:#f9fafb">
                <p style="margin:0;font-size:12px;color:${COR_SEV[a.severity]}">${escapeHtml(ROTULO_SEV[a.severity])} · ${escapeHtml(TIPO_ALERTA[a.alert_type] ?? a.alert_type)}</p>
                <p style="margin:3px 0 2px;font-size:14px;color:#111827">${escapeHtml(a.title)}</p>
                <p style="margin:0;font-size:12px;color:#6b7280">${escapeHtml(a.description)}</p>
              </div>`).join(''));
    }

    let secObras = '';
    if (tipos.includes('SCORECARD')) {
        secObras = `<h2 style="${H2}">Scorecard de obras</h2>` + (obras.length === 0
            ? `<p style="font-size:13px;color:#6b7280">Nenhuma obra com movimento financeiro.</p>`
            : `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px">
                <tr>${['Obra'].map(h => `<th style="${TH}">${h}</th>`).join('')}${['Receita', 'Custo', 'Margem', 'Saldo 90d', 'Vencido a pagar'].map(h => `<th style="${THR}">${h}</th>`).join('')}<th style="${TH}">Risco</th></tr>
                ${obras.map(s => `<tr>
                  <td style="${TD}">${escapeHtml(s.project_name)}</td>
                  <td style="${TDR}">${brl(s.receita_realizada)}</td>
                  <td style="${TDR}">${brl(s.custo_realizado)}</td>
                  <td style="${TDR}">${s.tem_receita ? `${s.margem_pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</td>
                  <td style="${TDR};color:${s.saldo_projetado < 0 ? '#dc2626' : '#374151'}">${brl(s.saldo_projetado)}</td>
                  <td style="${TDR}">${brl(s.ap_vencido)}</td>
                  <td style="${TD};color:${RISCO[s.risco][1]}">${RISCO[s.risco][0]}</td>
                </tr>`).join('')}
              </table>
              <p style="margin:6px 4px 0;font-size:11px;color:#9ca3af">Venda de unidade conta na obra do empreendimento; aluguel fica fora da margem.</p>`);
        if (locacao.length > 0) {
            secObras += `<h2 style="${H2}">Renda de locação</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px">
                <tr><th style="${TH}">Empreendimento</th><th style="${THR}">Recebido</th><th style="${THR}">Vencido</th></tr>
                ${locacao.map(r => `<tr><td style="${TD}">${escapeHtml(r.empreendimento_nome)}</td><td style="${TDR}">${brl(r.recebido)}</td><td style="${TDR}">${brl(r.vencido)}</td></tr>`).join('')}
              </table>`;
        }
    }

    let secCaixa = '';
    if (tipos.includes('CASHFLOW')) {
        const semanas = porSemana(projecao);
        secCaixa = `<h2 style="${H2}">Projeção de caixa — próximos 90 dias</h2>
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280">${posicao
              ? `Parte de ${escapeHtml(brl(posicao.saldo_bancario))} nos bancos. Não entram ${escapeHtml(brl(posicao.vencido_receber))} a receber e ${escapeHtml(brl(posicao.vencido_pagar))} a pagar já vencidos.`
              : 'Parte do saldo dos bancos.'}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px">
            <tr><th style="${TH}">Semana de</th><th style="${THR}">Entradas</th><th style="${THR}">Saídas</th><th style="${THR}">Saldo no fim</th></tr>
            ${semanas.map(w => `<tr>
              <td style="${TD}">${dataBR(w.inicio)}</td>
              <td style="${TDR}">${brl(w.entradas)}</td>
              <td style="${TDR}">${brl(w.saidas)}</td>
              <td style="${TDR};color:${w.saldo < 0 ? '#dc2626' : '#374151'}">${brl(w.saldo)}</td>
            </tr>`).join('')}
          </table>`;
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 0">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;border:1px solid #e5e7eb">
        <tr><td style="padding:22px 28px;border-bottom:1px solid #e5e7eb">
          <p style="margin:0;font-size:18px;font-weight:700;color:#111827">Inteligência Financeira</p>
          <p style="margin:4px 0 0;font-size:13px;color:#6b7280">${escapeHtml(orgName)} · ${escapeHtml(geradoEm)}</p>
        </td></tr>
        <tr><td style="padding:18px 24px 26px">
          ${linhaKpis}
          ${avisoBase}
          ${secAlertas}
          ${secObras}
          ${secCaixa}
          <p style="margin:30px 0 0;font-size:11px;color:#9ca3af;text-align:center">
            Relatório automático do OrçaCloud · Para pausar ou excluir: Financeiro › Inteligência Financeira › Agendamentos
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── dados ──────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function lerDados(admin: any, orgId: string, tipos: string[]) {
    const rpc = async <T>(nome: string, args: Record<string, unknown>): Promise<T> => {
        const { data, error } = await admin.rpc(nome, args);
        if (error) throw new Error(`${nome}: ${error.message}`);
        return data as T;
    };
    const org = { p_organization_id: orgId };
    const precisaPosicao = tipos.length > 0; // os KPIs do topo usam a posição em qualquer combinação
    const [alertas, obras, projecao, posicao, locacao] = await Promise.all([
        tipos.includes('ALERTS') ? rpc<Alerta[]>('fn_financial_alerts', org) : Promise.resolve([] as Alerta[]),
        tipos.includes('SCORECARD') ? rpc<Obra[]>('fn_project_scorecard', org) : Promise.resolve([] as Obra[]),
        rpc<Ponto[]>('fn_cashflow_projection', { ...org, p_days: 90 }),
        precisaPosicao ? rpc<Posicao[]>('fn_cashflow_position', org) : Promise.resolve([] as Posicao[]),
        tipos.includes('SCORECARD') ? rpc<Locacao[]>('fn_rental_income', org) : Promise.resolve([] as Locacao[]),
    ]);
    const p = (posicao ?? [])[0];
    return {
        alertas: (alertas ?? []).map(a => ({ ...a, amount: a.amount == null ? null : n(a.amount) })),
        obras: (obras ?? []).map(s => ({
            ...s, receita_realizada: n(s.receita_realizada), custo_realizado: n(s.custo_realizado), margem_pct: n(s.margem_pct),
            saldo_projetado: n(s.saldo_projetado), ar_vencido: n(s.ar_vencido), ap_vencido: n(s.ap_vencido),
        })),
        projecao: (projecao ?? []).map(x => ({ data_ref: x.data_ref, cr_previsto: n(x.cr_previsto), db_previsto: n(x.db_previsto), saldo_acum: n(x.saldo_acum) })),
        posicao: p ? { ...p, saldo_bancario: n(p.saldo_bancario), vencido_receber: n(p.vencido_receber), vencido_pagar: n(p.vencido_pagar) } : null,
        locacao: (locacao ?? []).map(r => ({ empreendimento_nome: r.empreendimento_nome, recebido: n(r.recebido), vencido: n(r.vencido) })),
    };
}

// ─── principal ──────────────────────────────────────────────────────────────

const COLUNAS = 'id,organization_id,name,frequency,day_of_week,day_of_month,hour,recipients,report_types,is_active,last_sent_at';

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey   = Deno.env.get('RESEND_API_KEY') ?? '';
    const fromEmail      = Deno.env.get('REPORT_FROM_EMAIL') ?? 'financeiro@opura.com.br';

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* vazio */ }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const agora = new Date();
    const br = emBrasilia(agora);
    const cron = chamadaDeCron(req);

    let alvos: Agendamento[];
    if (cron) {
        const { data, error } = await admin.from('report_schedules').select(COLUNAS).eq('is_active', true);
        if (error) return json({ error: error.message }, 500);
        alvos = ((data ?? []) as Agendamento[]).filter(s => {
            if (s.hour !== br.hora) return false;
            if (s.frequency === 'WEEKLY' && s.day_of_week !== br.diaSemana) return false;
            if (s.frequency === 'MONTHLY' && s.day_of_month !== br.diaMes) return false;
            // Já saiu hoje (data de Brasília)? Não reenvia.
            return !(s.last_sent_at && emBrasilia(new Date(s.last_sent_at)).data === br.data);
        });
    } else {
        const scheduleId = typeof body.schedule_id === 'string' ? body.schedule_id : '';
        // Usuário de verdade ANTES de qualquer consulta: sem isto, um token qualquer
        // descobriria se um id de agendamento existe (404 × 403). Sem cabeçalho = 401
        // — é a prova da REGRA #7 depois do deploy com --no-verify-jwt.
        const usuario = await exigirUsuario(req);
        if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);
        if (!scheduleId) return json({ error: 'schedule_id obrigatório' }, 400);
        const { data, error } = await admin.from('report_schedules').select(COLUNAS).eq('id', scheduleId).maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: 'Agendamento não encontrado.' }, 404);
        // Membro da organização DO AGENDAMENTO — não da que o corpo da requisição diz.
        const auth = await exigirMembro(req, (data as Agendamento).organization_id);
        if (!auth.ok) return respostaDeErro(auth, corsHeaders);
        alvos = [data as Agendamento];
    }

    if (alvos.length === 0) return json({ sent: 0, message: 'Nenhum agendamento para enviar agora.' });
    if (!resendApiKey) return json({ error: 'RESEND_API_KEY não configurada.' }, 503);

    let enviados = 0;
    const falhas: { agendamento: string; erro: string }[] = [];

    for (const s of alvos) {
        const destinatarios = (s.recipients ?? []).filter(Boolean);
        if (destinatarios.length === 0) { falhas.push({ agendamento: s.name, erro: 'sem destinatários' }); continue; }
        const tipos = s.report_types?.length ? s.report_types : ['ALERTS', 'SCORECARD', 'CASHFLOW'];

        let dados: Awaited<ReturnType<typeof lerDados>>;
        try {
            dados = await lerDados(admin, s.organization_id, tipos);
        } catch (e) {
            // Sem dados confiáveis, sem e-mail.
            falhas.push({ agendamento: s.name, erro: e instanceof Error ? e.message : String(e) });
            continue;
        }

        const { data: org } = await admin.from('organizations').select('name').eq('id', s.organization_id).maybeSingle();
        const orgName = (org as { name?: string } | null)?.name ?? 'Sua empresa';
        const geradoEm = `${dataBR(br.data)} às ${String(br.hora).padStart(2, '0')}h`;
        const html = montarHtml({ orgName, geradoEm, tipos, ...dados });
        const criticos = dados.alertas.filter(a => a.severity === 'HIGH').length;
        const assunto = `[${orgName}] Relatório financeiro ${dataBR(br.data)}${criticos > 0 ? ` — ${plural(criticos, 'alerta crítico', 'alertas críticos')}` : ''}`;

        let enviadosAqui = 0;
        for (const para of destinatarios) {
            try {
                const res = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from: fromEmail, to: [para], subject: assunto, html }),
                });
                if (res.ok) enviadosAqui++;
                else falhas.push({ agendamento: s.name, erro: `Resend ${res.status} para ${para}: ${(await res.text()).slice(0, 200)}` });
            } catch (e) {
                falhas.push({ agendamento: s.name, erro: `envio para ${para}: ${e instanceof Error ? e.message : String(e)}` });
            }
        }
        enviados += enviadosAqui;
        if (enviadosAqui > 0) {
            await admin.from('report_schedules')
                .update({ last_sent_at: agora.toISOString(), updated_at: agora.toISOString() })
                .eq('id', s.id);
        }
    }

    const message = `${plural(enviados, 'e-mail enviado', 'e-mails enviados')}.` +
        (falhas.length ? ` ${plural(falhas.length, 'falha', 'falhas')}: ${falhas.map(f => `${f.agendamento} — ${f.erro}`).join(' | ')}` : '');
    // "Enviar agora" sem nenhum envio é erro para quem clicou; no cron, o log basta.
    if (!cron && enviados === 0) return json({ error: message, sent: 0, falhas }, 500);
    return json({ sent: enviados, message, falhas });
});
