import { supabase } from '../lib/supabase';
import type { BIExecutiveSummary } from '../types/bi';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ReportFrequency = 'daily' | 'weekly' | 'monthly';

export interface BIReportSchedule {
    id: string;
    org_id: string;
    name: string;
    frequency: ReportFrequency;
    day_of_week?: number | null;   // 0=dom…6=sab (weekly)
    day_of_month?: number | null;  // 1–28 (monthly)
    hour_utc: number;
    recipients: string[];
    include_dre: boolean;
    include_trend: boolean;
    include_narrative: boolean;
    active: boolean;
    last_sent_at?: string | null;
    next_send_at?: string | null;
    created_at?: string;
}

export type NewSchedule = Omit<BIReportSchedule, 'id' | 'created_at' | 'last_sent_at' | 'next_send_at'>;

// ─── Serviço ─────────────────────────────────────────────────────────────────

export const biReportService = {
    // ── CRUD Agendamentos ──────────────────────────────────────────────────────
    async listSchedules(orgId: string): Promise<BIReportSchedule[]> {
        const { data, error } = await supabase
            .from('bi_report_schedules')
            .select('id, org_id, name, frequency, day_of_week, day_of_month, hour_utc, recipients, include_dre, include_trend, include_narrative, active, last_sent_at, next_send_at, created_at')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as BIReportSchedule[];
    },

    async saveSchedule(schedule: NewSchedule & { id?: string }): Promise<BIReportSchedule> {
        const { id, ...rest } = schedule;
        if (id) {
            const { data, error } = await supabase
                .from('bi_report_schedules')
                .update(rest)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data as BIReportSchedule;
        }
        const { data, error } = await supabase
            .from('bi_report_schedules')
            .insert(rest)
            .select()
            .single();
        if (error) throw error;
        return data as BIReportSchedule;
    },

    async toggleSchedule(id: string, active: boolean): Promise<void> {
        const { error } = await supabase
            .from('bi_report_schedules')
            .update({ active })
            .eq('id', id);
        if (error) throw error;
    },

    async deleteSchedule(id: string): Promise<void> {
        const { error } = await supabase
            .from('bi_report_schedules')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ── IA Narrativa ───────────────────────────────────────────────────────────
    async generateNarrative(
        kpis: BIExecutiveSummary['kpis'],
        dateFrom: string,
        dateTo: string,
        organizationName?: string,
    ): Promise<string> {
        const { data, error } = await supabase.functions.invoke('bi-narrative', {
            body: { kpis, dateFrom, dateTo, organizationName },
        });
        if (error) throw new Error(error.message ?? 'Erro ao gerar narrativa');
        if (data?.error) throw new Error(data.error);
        return (data?.narrative as string) ?? '';
    },

    // ── Geração de HTML do relatório ──────────────────────────────────────────
    generateReportHtml(
        summary: BIExecutiveSummary,
        dateFrom: string,
        dateTo: string,
        organizationName: string,
        narrative?: string,
    ): string {
        const brl = (v: number | null) =>
            v != null
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
                : '—';
        const pct = (v: number | null) => v != null ? `${v.toFixed(1)}%` : '—';

        const dreRows = (summary.kpis.dre ?? [])
            .filter(d => d.realizado != null)
            .map(d => `<tr><td>${d.linha}</td><td style="text-align:right;font-weight:600">${brl(d.realizado)}</td></tr>`)
            .join('');

        const trendRows = (summary.trend ?? [])
            .slice(-6)
            .map(t => `<tr><td>${t.mes}</td><td style="text-align:right">${brl(t.receita)}</td><td style="text-align:right">${brl(t.ebitda)}</td></tr>`)
            .join('');

        const kpi = summary.kpis;
        const com = kpi.comercial;
        const rh  = kpi.rh;

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; }
  .header { background: #1e3a5f; color: white; padding: 24px 32px; }
  .header h1 { margin: 0; font-size: 22px; }
  .header p { margin: 4px 0 0; font-size: 13px; opacity: .8; }
  .body { padding: 32px; }
  h2 { font-size: 14px; font-weight: 700; text-transform: uppercase;
       letter-spacing: .05em; color: #1e3a5f; border-bottom: 2px solid #e5e7eb;
       padding-bottom: 6px; margin: 28px 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  th { background: #f9fafb; font-weight: 600; text-align: left; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 8px; }
  .kpi-box { background: #f9fafb; border-radius: 8px; padding: 14px; }
  .kpi-box .label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
  .kpi-box .value { font-size: 20px; font-weight: 700; color: #1e3a5f; margin-top: 4px; }
  .narrative { background: #eff6ff; border-left: 4px solid #3b82f6;
               padding: 16px 20px; border-radius: 0 8px 8px 0; font-size: 13px;
               line-height: 1.65; color: #1e3a5f; }
  .footer { padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;
            font-size: 11px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<div class="header">
  <h1>${organizationName} — Relatório Executivo BI</h1>
  <p>Período: ${dateFrom} a ${dateTo} &nbsp;·&nbsp; Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
</div>
<div class="body">
${narrative ? `<h2>Resumo Executivo</h2><div class="narrative">${narrative.replace(/\n/g, '<br>')}</div>` : ''}

<h2>Indicadores-Chave</h2>
<div class="kpi-grid">
  <div class="kpi-box"><div class="label">VGV Fechado</div><div class="value">${brl(com?.vgv_fechado ?? null)}</div></div>
  <div class="kpi-box"><div class="label">Conversão</div><div class="value">${pct(com?.taxa_conversao_pct ?? null)}</div></div>
  <div class="kpi-box"><div class="label">Obras Ativas</div><div class="value">${kpi.operacional?.obras_ativas ?? '—'}</div></div>
  <div class="kpi-box"><div class="label">Ticket Médio</div><div class="value">${brl(com?.ticket_medio ?? null)}</div></div>
  <div class="kpi-box"><div class="label">Turnover</div><div class="value">${pct((rh?.periodo as Record<string, unknown> | undefined)?.turnover_pct as number | null ?? null)}</div></div>
  <div class="kpi-box"><div class="label">Headcount Ativo</div><div class="value">${(rh?.headcount as Record<string, unknown> | undefined)?.ativos ?? '—'}</div></div>
</div>

${dreRows ? `<h2>DRE Consolidada</h2>
<table><thead><tr><th>Linha</th><th style="text-align:right">Realizado</th></tr></thead>
<tbody>${dreRows}</tbody></table>` : ''}

${trendRows ? `<h2>Tendência (últimos 6 meses)</h2>
<table><thead><tr><th>Mês</th><th style="text-align:right">Receita</th><th style="text-align:right">EBITDA</th></tr></thead>
<tbody>${trendRows}</tbody></table>` : ''}
</div>
<div class="footer">OPURA &nbsp;·&nbsp; Relatório gerado automaticamente &nbsp;·&nbsp; Dados sigilosos — uso interno</div>
</body>
</html>`;
    },

    // ── Enviar relatório agora (chama Edge Function) ──────────────────────────
    async sendNow(input: {
        recipients: string[];
        subject: string;
        htmlBody: string;
        scheduleId?: string | null;
        organizationId: string;
    }): Promise<void> {
        const { data, error } = await supabase.functions.invoke('send-bi-report', {
            body: input,
        });
        if (error) throw new Error(error.message ?? 'Erro ao enviar relatório');
        if (data?.error) throw new Error(data.error);
    },
};
