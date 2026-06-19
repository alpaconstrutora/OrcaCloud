import { supabase } from '../lib/supabase';
import type {
    FinancialApprovalConfig,
    ApprovalStep,
    ApprovalQueueItem,
} from '../types/financial';

export const financialApprovalService = {

    // ── Configuração de faixas ────────────────────────────────

    async listConfig(organizationId: string): Promise<FinancialApprovalConfig[]> {
        const { data, error } = await supabase
            .from('financial_approval_config')
            .select('id,organization_id,faixa_min,faixa_max,required_levels,level1_label,level2_label,is_active,sort_order,created_at')
            .eq('organization_id', organizationId)
            .order('faixa_min', { ascending: true });
        if (error) throw error;
        return (data || []) as FinancialApprovalConfig[];
    },

    async upsertConfig(item: FinancialApprovalConfig): Promise<FinancialApprovalConfig> {
        const payload = {
            organization_id:  item.organization_id,
            faixa_min:        item.faixa_min,
            faixa_max:        item.faixa_max ?? null,
            required_levels:  item.required_levels,
            level1_label:     item.level1_label,
            level2_label:     item.level2_label ?? null,
            is_active:        item.is_active,
            sort_order:       item.sort_order,
        };
        const { data, error } = item.id
            ? await supabase.from('financial_approval_config').update(payload).eq('id', item.id).select().single()
            : await supabase.from('financial_approval_config').insert(payload).select().single();
        if (error) throw error;
        return data as FinancialApprovalConfig;
    },

    async deleteConfig(id: string): Promise<void> {
        const { error } = await supabase.from('financial_approval_config').delete().eq('id', id);
        if (error) throw error;
    },

    async resolveRequiredLevels(organizationId: string, amount: number): Promise<{ required_levels: number; level1_label: string; level2_label: string } | null> {
        const { data, error } = await supabase.rpc('fn_resolve_approval_levels', {
            p_organization_id: organizationId,
            p_amount:          amount,
        });
        if (error) throw error;
        return (data as { required_levels: number; level1_label: string; level2_label: string }[])?.[0] ?? null;
    },

    // ── Fila de aprovação ─────────────────────────────────────

    async listPendingQueue(organizationId: string): Promise<ApprovalQueueItem[]> {
        const { data, error } = await supabase
            .from('internal_transactions')
            .select('id,organization_id,transaction_date,due_date,amount,description,party_name,project_id,approval_status,approval_chain,approval_required_levels,business_status,created_at')
            .eq('organization_id', organizationId)
            .eq('direction', 'DEBIT')
            .eq('approval_status', 'PENDENTE')
            .order('due_date', { ascending: true, nullsFirst: false });
        if (error) throw error;

        const rows = (data || []) as (ApprovalQueueItem & { project_id?: string })[];

        // Enriquecer com project_name
        const projectIds = [...new Set(rows.map(r => r.project_id).filter(Boolean))] as string[];
        let projectMap: Record<string, string> = {};
        if (projectIds.length) {
            const { data: projs } = await supabase
                .from('projects')
                .select('id,name')
                .in('id', projectIds);
            (projs || []).forEach((p: { id: string; name: string }) => { projectMap[p.id] = p.name; });
        }

        return rows.map(r => ({
            ...r,
            project_name: r.project_id ? (projectMap[r.project_id] ?? undefined) : undefined,
            approval_chain: (r.approval_chain as unknown as ApprovalStep[]) ?? [],
        }));
    },

    // ── Ações de aprovação ────────────────────────────────────

    async submitForApproval(transactionId: string, organizationId: string): Promise<void> {
        // Resolve required_levels a partir do valor da transação
        const { data: tx, error: txErr } = await supabase
            .from('internal_transactions')
            .select('amount,approval_status')
            .eq('id', transactionId)
            .single();
        if (txErr) throw txErr;
        if (tx.approval_status === 'PENDENTE') return; // já submetida

        const config = await this.resolveRequiredLevels(organizationId, tx.amount);
        const levels = config?.required_levels ?? 1;

        const { error } = await supabase
            .from('internal_transactions')
            .update({
                approval_status:          'PENDENTE',
                approval_required_levels: levels,
                approval_chain:           [],
                business_status:          'AGUARDANDO_APROVACAO',
                updated_at:               new Date().toISOString(),
            })
            .eq('id', transactionId);
        if (error) throw error;
    },

    async approve(
        transactionId: string,
        level: 1 | 2,
        approvedBy: string,
        config: { level1_label: string; level2_label?: string },
        notes?: string,
    ): Promise<void> {
        const { data: tx, error: fetchErr } = await supabase
            .from('internal_transactions')
            .select('approval_chain,approval_required_levels,approval_status')
            .eq('id', transactionId)
            .single();
        if (fetchErr) throw fetchErr;
        if (tx.approval_status !== 'PENDENTE') throw new Error('Transação não está pendente de aprovação.');

        const chain: ApprovalStep[] = (tx.approval_chain as unknown as ApprovalStep[]) ?? [];
        chain.push({
            level,
            role:        level === 1 ? config.level1_label : (config.level2_label ?? 'Financeiro / Diretoria'),
            action:      'APROVADO',
            approved_by: approvedBy,
            approved_at: new Date().toISOString(),
            ...(notes ? { notes } : {}),
        });

        const required = tx.approval_required_levels ?? 1;
        const approvedLevels = chain.filter(s => s.action === 'APROVADO').map(s => s.level);
        const allApproved = required === 1
            ? approvedLevels.includes(1)
            : approvedLevels.includes(1) && approvedLevels.includes(2);

        const { error } = await supabase
            .from('internal_transactions')
            .update({
                approval_chain:  chain,
                approval_status: allApproved ? 'APROVADO' : 'PENDENTE',
                business_status: allApproved ? 'APROVADO' : 'AGUARDANDO_APROVACAO',
                updated_at:      new Date().toISOString(),
            })
            .eq('id', transactionId);
        if (error) throw error;
    },

    async reject(
        transactionId: string,
        rejectedBy: string,
        reason: string,
    ): Promise<void> {
        const { data: tx, error: fetchErr } = await supabase
            .from('internal_transactions')
            .select('approval_chain')
            .eq('id', transactionId)
            .single();
        if (fetchErr) throw fetchErr;

        const chain: ApprovalStep[] = (tx.approval_chain as unknown as ApprovalStep[]) ?? [];
        chain.push({
            level:       1,
            role:        'Rejeição',
            action:      'REJEITADO',
            approved_by: rejectedBy,
            approved_at: new Date().toISOString(),
            notes:       reason,
        });

        const { error } = await supabase
            .from('internal_transactions')
            .update({
                approval_chain:  chain,
                approval_status: 'REJEITADO',
                business_status: 'BLOQUEADO',
                updated_at:      new Date().toISOString(),
            })
            .eq('id', transactionId);
        if (error) throw error;
    },
};
