import { supabase } from '../lib/supabase';
import type { Receivable, ReceivableBusinessStatus, InadimplenciaFaixa } from '../types/financial';

export interface ReceivableFilters {
    search?: string;
    status?: ReceivableBusinessStatus | 'VENCIDO' | 'all';
    dueFrom?: string;
    dueTo?: string;
    projectId?: string;
}

export const receivableService = {

    async list(organizationId: string, filters?: ReceivableFilters): Promise<Receivable[]> {
        let q = supabase
            .from('vw_receivables')
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,description,category,status,business_status,effective_status,party_name,party_type,project_id,project_name,created_at,updated_at')
            .eq('organization_id', organizationId)
            .order('due_date', { ascending: true, nullsFirst: false });

        if (filters?.dueFrom)    q = q.gte('due_date', filters.dueFrom);
        if (filters?.dueTo)      q = q.lte('due_date', filters.dueTo);
        if (filters?.projectId)  q = q.eq('project_id', filters.projectId);

        const { data, error } = await q;
        if (error) throw error;

        let rows = (data || []) as Receivable[];

        if (filters?.status && filters.status !== 'all') {
            rows = rows.filter(r => r.effective_status === filters.status);
        }

        if (filters?.search) {
            const q2 = filters.search.toLowerCase();
            rows = rows.filter(r =>
                (r.party_name ?? '').toLowerCase().includes(q2) ||
                (r.description ?? '').toLowerCase().includes(q2) ||
                (r.project_name ?? '').toLowerCase().includes(q2) ||
                (r.reference_id ?? '').toLowerCase().includes(q2),
            );
        }

        return rows;
    },

    async updateStatus(
        id: string,
        newStatus: ReceivableBusinessStatus,
    ): Promise<void> {
        const updates: Record<string, unknown> = {
            business_status: newStatus,
            updated_at: new Date().toISOString(),
        };
        // Sincroniza status de conciliação quando confirmado
        if (newStatus === 'RECEBIDO') updates.status = 'CONCILIATED';
        if (newStatus === 'CANCELADO') updates.status = 'CANCELLED';

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', id);
        if (error) throw error;
    },

    async create(
        organizationId: string,
        data: {
            due_date: string;
            amount: number;
            description: string;
            party_name?: string;
            party_type?: string;
            project_id?: string;
            category?: string;
        },
    ): Promise<Receivable> {
        const { data: row, error } = await supabase
            .from('internal_transactions')
            .insert({
                organization_id: organizationId,
                source_system:   'MANUAL',
                direction:       'CREDIT',
                transaction_date: data.due_date,
                due_date:        data.due_date,
                amount:          data.amount,
                description:     data.description,
                party_name:      data.party_name ?? null,
                party_type:      data.party_type ?? 'CLIENT',
                project_id:      data.project_id ?? null,
                category:        data.category ?? null,
                status:          'PENDING',
                business_status: 'PREVISTO',
            })
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,description,category,status,business_status,party_name,party_type,project_id,created_at,updated_at')
            .single();
        if (error) throw error;
        return { ...row, direction: 'CREDIT', effective_status: 'PREVISTO' } as Receivable;
    },

    async getInadimplencia(organizationId: string): Promise<InadimplenciaFaixa[]> {
        const { data, error } = await supabase.rpc('fn_inadimplencia', {
            p_organization_id: organizationId,
        });
        if (error) throw error;
        return (data || []) as InadimplenciaFaixa[];
    },
};
