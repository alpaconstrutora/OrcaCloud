import { supabase } from '../lib/supabase';
import type { CalendarEvent, CalendarDayTitle } from '../types/financial';

export const financialCalendarService = {

    async getCalendarEvents(
        organizationId: string,
        dateFrom: string,
        dateTo: string,
    ): Promise<CalendarEvent[]> {
        const { data, error } = await supabase.rpc('fn_calendar_events', {
            p_organization_id: organizationId,
            p_date_from:       dateFrom,
            p_date_to:         dateTo,
        });
        if (error) throw error;
        return (data || []) as CalendarEvent[];
    },

    async getTitlesForDay(
        organizationId: string,
        date: string,
    ): Promise<CalendarDayTitle[]> {
        const { data, error } = await supabase
            .from('internal_transactions')
            .select('id,direction,amount,description,party_name,project_id,business_status,status,due_date,transaction_date')
            .eq('organization_id', organizationId)
            .neq('status', 'CANCELLED')
            .or(`due_date.eq.${date},and(due_date.is.null,transaction_date.eq.${date})`)
            .order('direction', { ascending: false })
            .order('amount', { ascending: false });

        if (error) throw error;

        const rows = (data || []) as (CalendarDayTitle & { project_id?: string })[];

        // Enriquecer com project_name
        const pids = [...new Set(rows.map(r => r.project_id).filter(Boolean))] as string[];
        let pmap: Record<string, string> = {};
        if (pids.length) {
            const { data: ps } = await supabase
                .from('projects')
                .select('id,name')
                .in('id', pids);
            (ps || []).forEach((p: { id: string; name: string }) => { pmap[p.id] = p.name; });
        }

        return rows.map(r => ({
            ...r,
            project_name: r.project_id ? (pmap[r.project_id] ?? undefined) : undefined,
        }));
    },
};
