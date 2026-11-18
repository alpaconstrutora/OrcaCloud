import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { BIExecutiveSummary } from '../types/bi';
import { montarRelatorioBI } from '../supabase/functions/send-bi-report/relatorio';

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

/** Resumo de IA gerado pela bi-narrative: o texto da tela e o id do texto guardado. */
export interface NarrativaGerada {
    /** id em `bi_narrativas`; null = não foi guardado (o e-mail sai sem o resumo). */
    id: string | null;
    texto: string;
    /** Para qual organização e período foi gerado — o e-mail só o inclui se forem os do envio. */
    organizationId: string | null;
    dateFrom: string;
    dateTo: string;
}

/**
 * A Edge responde 4xx/5xx com `{ error, recusados? }`; o invoke embrulha isso em
 * FunctionsHttpError e a mensagem útil fica no corpo. Sem isto, a tela mostrava
 * "Edge Function returned a non-2xx status code" e ninguém sabia quem foi recusado.
 */
async function mensagemDaEdge(error: { message?: string }, padrao: string): Promise<string> {
    let mensagem = error.message || padrao;
    if (error instanceof FunctionsHttpError) {
        try {
            const j = (await error.context.json()) as { error?: string; recusados?: unknown };
            if (j.error) mensagem = j.error;
            if (Array.isArray(j.recusados) && j.recusados.length) {
                mensagem += ` Recusados: ${j.recusados.map(String).join(', ')}.`;
            }
        } catch {
            // corpo não era JSON: fica a mensagem genérica
        }
    }
    return mensagem;
}

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
    /**
     * Gera o resumo de IA. A bi-narrative GUARDA o texto e devolve o id: é por
     * ele que o e-mail inclui o resumo (a send-bi-report não aceita texto vindo
     * do cliente — F11/F55). `id` null = não deu para guardar; o resumo aparece
     * na tela, mas o e-mail sai sem ele.
     */
    async generateNarrative(
        kpis: BIExecutiveSummary['kpis'],
        dateFrom: string,
        dateTo: string,
        organizationId?: string | null,
    ): Promise<NarrativaGerada> {
        const { data, error } = await supabase.functions.invoke('bi-narrative', {
            body: { kpis, dateFrom, dateTo, organization_id: organizationId || null },
        });
        if (error) throw new Error(await mensagemDaEdge(error, 'Erro ao gerar narrativa'));
        if (data?.error) throw new Error(data.error);
        return {
            id: typeof data?.narrativeId === 'string' ? data.narrativeId : null,
            texto: (data?.narrative as string) ?? '',
            organizationId: organizationId || null,
            dateFrom,
            dateTo,
        };
    },

    // ── HTML do relatório ─────────────────────────────────────────────────────
    /**
     * "Baixar HTML": o MESMO molde do e-mail (`send-bi-report/relatorio.ts`),
     * com tudo escapado. O e-mail não usa isto — o servidor monta o dele.
     */
    generateReportHtml(
        summary: BIExecutiveSummary,
        dateFrom: string,
        dateTo: string,
        organizationName: string,
        narrative?: string,
    ): string {
        return montarRelatorioBI({
            nomeOrganizacao: organizationName,
            dateFrom,
            dateTo,
            geradoEm: new Date(),
            kpis: summary.kpis,
            tendencia: summary.trend,
            narrativa: narrative ?? null,
        }).html;
    },

    /**
     * E-mails dos membros da organização — só para AVISAR na tela quem não vai
     * receber. Quem decide é o servidor (send-bi-report), na hora do envio.
     */
    async listMemberEmails(orgId: string): Promise<string[]> {
        const { data, error } = await supabase
            .from('organization_members')
            .select('email')
            .eq('organization_id', orgId);
        if (error) throw error;
        return ((data ?? []) as { email: string | null }[])
            .map(m => (m.email ?? '').trim().toLowerCase())
            .filter(Boolean);
    },

    // ── Enviar relatório agora (chama Edge Function) ──────────────────────────
    /**
     * O cliente diz QUAL relatório — organização, período, destinatários e o id
     * da narrativa guardada. Assunto e HTML são montados no servidor com os dados
     * do banco; só membros da organização recebem (F11/F55).
     */
    async sendNow(input: {
        organizationId: string;
        recipients: string[];
        dateFrom: string;
        dateTo: string;
        narrativeId?: string | null;
        scheduleId?: string | null;
    }): Promise<{ recipients: string[]; incluiuResumo: boolean }> {
        const { data, error } = await supabase.functions.invoke('send-bi-report', {
            body: {
                organizationId: input.organizationId,
                recipients: input.recipients,
                dateFrom: input.dateFrom,
                dateTo: input.dateTo,
                narrativeId: input.narrativeId ?? null,
                scheduleId: input.scheduleId ?? null,
            },
        });
        if (error) throw new Error(await mensagemDaEdge(error, 'Erro ao enviar relatório'));
        if (data?.error) throw new Error(data.error);
        return {
            recipients: Array.isArray(data?.recipients) ? (data.recipients as string[]) : input.recipients,
            incluiuResumo: !!data?.incluiuResumo,
        };
    },
};
