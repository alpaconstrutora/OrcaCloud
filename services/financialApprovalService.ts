import { supabase } from '../lib/supabase';
import type {
    FinancialApprovalConfig,
    ApprovalStep,
    ApprovalQueueItem,
} from '../types/financial';
import { approvalService } from './approvalService';

export const financialApprovalService = {

    // ── Configuração de faixas ────────────────────────────────

    async listConfig(organizationId: string | null): Promise<FinancialApprovalConfig[]> {
        let q = supabase
            .from('financial_approval_config')
            .select('id,organization_id,faixa_min,faixa_max,required_levels,level1_label,level2_label,is_active,sort_order,created_at')
            .order('faixa_min', { ascending: true });
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
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
        return approvalService.resolveRequiredLevels(organizationId, amount);
    },

    // ── Fila de aprovação ─────────────────────────────────────
    // Fila acionável unificada (transações+contratos+compras) vive em
    // approvalService.listActionQueue. Aqui ficam config + ações financeiras.

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

    // Delega à primitiva unificada (approvalService); injeta os efeitos
    // colaterais financeiros (business_status, updated_at). Assinaturas
    // preservadas para não quebrar os chamadores (Regra de Ouro 12).

    async submitForApproval(transactionId: string, _organizationId?: string): Promise<void> {
        // `semFaixa: 'liberar'` — título abaixo do piso da alçada não entra na
        // fila. Ver a explicação em `approvalService.submit`.
        await approvalService.submit('transaction', transactionId, {
            business_status: 'AGUARDANDO_APROVACAO',
            updated_at:      new Date().toISOString(),
        }, { semFaixa: 'liberar' });
    },

    async approve(
        transactionId: string,
        level: 1 | 2,
        approvedBy: string,
        config: { level1_label: string; level2_label?: string },
        notes?: string,
    ): Promise<void> {
        await approvalService.approve(
            'transaction', transactionId, level, approvedBy, config, notes,
            { business_status: 'APROVADO', updated_at: new Date().toISOString() },
        );
    },

    async reject(
        transactionId: string,
        rejectedBy: string,
        reason: string,
    ): Promise<void> {
        await approvalService.reject('transaction', transactionId, rejectedBy, reason, {
            business_status: 'BLOQUEADO',
            updated_at:      new Date().toISOString(),
        });
    },
};
