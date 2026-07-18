import { supabase } from '../lib/supabase';

export type ReportFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ReportType = 'ALERTS' | 'SCORECARD' | 'CASHFLOW';

export interface ReportSchedule {
    id: string;
    organization_id: string;
    name: string;
    frequency: ReportFrequency;
    day_of_week?: number | null;
    day_of_month?: number | null;
    hour: number;
    recipients: string[];
    report_types: ReportType[];
    is_active: boolean;
    last_sent_at?: string | null;
    created_at: string;
}

const COLS = 'id,organization_id,name,frequency,day_of_week,day_of_month,hour,recipients,report_types,is_active,last_sent_at,created_at';

export const reportScheduleService = {

    async list(organizationId?: string): Promise<ReportSchedule[]> {
        let query = supabase
            .from('report_schedules')
            .select(COLS)
            .order('created_at', { ascending: true });
        if (organizationId) query = query.eq('organization_id', organizationId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as ReportSchedule[];
    },

    async save(payload: Partial<ReportSchedule> & { organization_id: string }): Promise<ReportSchedule> {
        const isNew = !payload.id;
        const row = { ...payload, updated_at: new Date().toISOString() };

        if (isNew) {
            const { data, error } = await supabase
                .from('report_schedules')
                .insert(row)
                .select(COLS)
                .single();
            if (error) throw error;
            return data as ReportSchedule;
        }

        const { id, ...fields } = row;
        const { data, error } = await supabase
            .from('report_schedules')
            .update(fields)
            .eq('id', id!)
            .select(COLS)
            .single();
        if (error) throw error;
        return data as ReportSchedule;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('report_schedules').delete().eq('id', id);
        if (error) throw error;
    },

    async toggleActive(id: string, isActive: boolean): Promise<void> {
        const { error } = await supabase
            .from('report_schedules')
            .update({ is_active: isActive, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async sendNow(organizationId: string, scheduleId: string): Promise<{ sent: number; message: string }> {
        const { data, error } = await supabase.functions.invoke('financial-report-notifier', {
            body: { organization_id: organizationId, schedule_id: scheduleId },
        });
        if (error) {
            let detail = '';
            const ctx = (error as { context?: Response }).context;
            if (ctx && typeof ctx.json === 'function') {
                try { const b = await ctx.json(); detail = b?.error || ''; } catch { /* noop */ }
            }
            throw new Error(detail || error.message);
        }
        if (data?.error) throw new Error(data.error);
        return data as { sent: number; message: string };
    },
};
