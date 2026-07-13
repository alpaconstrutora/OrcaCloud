import { supabase } from '../lib/supabase';
import type { ApprovalStep, ApprovalStatus } from '../types/financial';

/** Item acionável da fila unificada (transação, contrato ou compra). */
export interface ActionQueueItem {
    entity: ApprovalEntity;
    id: string;
    title: string;
    party_name?: string;
    project_name?: string;
    amount: number;
    due_date?: string;
    approval_status: ApprovalStatus;
    approval_chain: ApprovalStep[];
    approval_required_levels: number;
}

// ============================================================
// approvalService — primitiva ÚNICA de aprovação multinível.
//
// Colapsa a lógica antes duplicada entre financialApprovalService
// (internal_transactions) e contractService (contracts). Cada serviço
// de domínio mantém um wrapper fino que injeta seus efeitos colaterais
// (ex.: contrato→status 'Ativo', transação→business_status) e preserva
// a assinatura pública atual (Regra de Ouro 12).
//
// Fonte única de "quantos níveis": financial_approval_config via RPC
// fn_resolve_approval_levels(org, amount).
// ============================================================

/** Entidades que participam do fluxo unificado de aprovação. */
export type ApprovalEntity = 'transaction' | 'contract' | 'purchase_order' | 'process_step';

interface EntityMeta {
    /** Tabela no banco. */
    table: string;
    /** Coluna que carrega o valor usado para resolver as faixas. */
    valueField: string;
}

const ENTITY_META: Record<ApprovalEntity, EntityMeta> = {
    transaction:    { table: 'internal_transactions', valueField: 'amount' },
    contract:       { table: 'contracts',             valueField: 'current_value' },
    // Fase 2 — confirmar a coluna de valor real de purchase_orders antes de ligar.
    purchase_order: { table: 'purchase_orders',       valueField: 'total_value' },
    // process_instance_steps não tem organization_id nem valor monetário em coluna
    // simples (o processo pode não ser sobre dinheiro) — o motor de Processos SEMPRE
    // deve chamar submit() passando opts.organizationId e opts.amount explícitos
    // (amount=0 para aprovação não monetária), do mesmo jeito que purchase_order faz.
    process_step:   { table: 'process_instance_steps', valueField: 'amount' },
};

export interface ResolvedLevels {
    required_levels: number;
    level1_label: string;
    level2_label: string;
}

/** Rótulos dos níveis exibidos na cadeia (vêm da faixa em financial_approval_config). */
export interface RoleLabels {
    level1_label: string;
    level2_label?: string;
}

/** Pendências de aprovação por entidade (enforcement soft). */
export interface ApprovalPendingSummary {
    entity: ApprovalEntity;
    qtd: number;
    soma: number;
}

export const approvalService = {

    /**
     * Resumo de pendências (enforcement soft): itens que caem em uma faixa de
     * aprovação mas ainda não estão APROVADO, por entidade. Read-only — alimenta
     * o indicador/alerta na UI. Não bloqueia nada.
     */
    async getPendingSummary(organizationId: string | null): Promise<ApprovalPendingSummary[]> {
        const { data, error } = await supabase.rpc('fn_approval_pending_summary', {
            p_organization_id: organizationId || null,
        });
        if (error) {
            console.error('[approvalService] getPendingSummary:', error);
            throw new Error(`Erro ao carregar pendências de aprovação: ${error.message}`);
        }
        return (data as ApprovalPendingSummary[]) ?? [];
    },

    /**
     * Fila ACIONÁVEL unificada (transações + contratos + compras): itens acima
     * da faixa que precisam de ação — RASCUNHO (a submeter) ou PENDENTE (a aprovar).
     * Cada item traz `entity` para a UI despachar a ação ao serviço de domínio.
     */
    async listActionQueue(organizationId: string | null): Promise<ActionQueueItem[]> {
        const { data, error } = await supabase.rpc('fn_approval_action_queue', {
            p_organization_id: organizationId || null,
        });
        if (error) {
            console.error('[approvalService] listActionQueue:', error);
            throw new Error(`Erro ao carregar fila de aprovação: ${error.message}`);
        }
        return ((data || []) as ActionQueueItem[]).map(r => ({
            ...r,
            approval_chain: (r.approval_chain as unknown as ApprovalStep[]) ?? [],
        }));
    },

    /** Resolve quantos níveis a faixa de valor exige. Fonte: financial_approval_config. */
    async resolveRequiredLevels(organizationId: string, amount: number): Promise<ResolvedLevels | null> {
        const { data, error } = await supabase.rpc('fn_resolve_approval_levels', {
            p_organization_id: organizationId,
            p_amount:          amount,
        });
        if (error) {
            console.error('[approvalService] resolveRequiredLevels:', error);
            throw new Error(`Erro ao resolver níveis de aprovação: ${error.message}`);
        }
        return (data as ResolvedLevels[])?.[0] ?? null;
    },

    /**
     * Coloca a entidade no fluxo: resolve os níveis pelo valor e marca PENDENTE.
     * `extra` injeta campos específicos da entidade (ex.: business_status).
     * `opts` permite informar organização/valor explicitamente — necessário para
     * entidades cujo escopo/valor não estão em colunas simples (ex.: purchase_orders,
     * escopada por empresa_id e com valor derivado de items[].total).
     * Retorna a linha atualizada.
     */
    async submit(
        entity: ApprovalEntity,
        id: string,
        extra: Record<string, unknown> = {},
        opts: { organizationId?: string; amount?: number } = {},
    ): Promise<any> {
        const meta = ENTITY_META[entity];

        // Só busca no banco o que não foi informado em opts.
        const cols = ['approval_status'];
        if (opts.amount === undefined)         cols.push(meta.valueField);
        if (opts.organizationId === undefined) cols.push('organization_id');

        const { data: row, error: fErr } = await supabase
            .from(meta.table)
            .select(cols.join(', '))
            .eq('id', id)
            .single();
        if (fErr) {
            console.error('[approvalService] submit (fetch):', fErr);
            throw new Error(`Erro ao carregar item para aprovação: ${fErr.message}`);
        }
        if ((row as any).approval_status === 'PENDENTE') return row; // já submetido

        const organizationId = opts.organizationId ?? (row as any).organization_id;
        const amount = opts.amount ?? (Number((row as any)[meta.valueField]) || 0);

        const cfg = await this.resolveRequiredLevels(organizationId, amount);
        const levels = cfg?.required_levels ?? 1;

        const { data, error } = await supabase
            .from(meta.table)
            .update({
                approval_status:          'PENDENTE' as ApprovalStatus,
                approval_required_levels: levels,
                approval_chain:           [],
                ...extra,
            })
            .eq('id', id)
            .select()
            .single();
        if (error) {
            console.error('[approvalService] submit (update):', error);
            throw new Error(`Erro ao enviar para aprovação: ${error.message}`);
        }
        return data;
    },

    /**
     * Registra a aprovação de um nível. Quando todos os níveis exigidos foram
     * aprovados, aplica `extraOnApproved` no mesmo update (efeito específico da
     * entidade). Retorna a linha atualizada.
     */
    async approve(
        entity: ApprovalEntity,
        id: string,
        level: 1 | 2,
        approvedBy: string,
        labels: RoleLabels,
        notes?: string,
        extraOnApproved: Record<string, unknown> = {},
    ): Promise<any> {
        const meta = ENTITY_META[entity];

        const { data: row, error: fErr } = await supabase
            .from(meta.table)
            .select('approval_chain, approval_required_levels, approval_status')
            .eq('id', id)
            .single();
        if (fErr) {
            console.error('[approvalService] approve (fetch):', fErr);
            throw new Error(`Erro ao carregar item: ${fErr.message}`);
        }
        if ((row as any).approval_status !== 'PENDENTE') {
            throw new Error('Item não está pendente de aprovação.');
        }

        const chain: ApprovalStep[] = ((row as any).approval_chain as ApprovalStep[]) ?? [];
        chain.push({
            level,
            role:        level === 1 ? labels.level1_label : (labels.level2_label ?? 'Financeiro / Diretoria'),
            action:      'APROVADO',
            approved_by: approvedBy,
            approved_at: new Date().toISOString(),
            ...(notes ? { notes } : {}),
        });

        const required = (row as any).approval_required_levels ?? 1;
        const approvedLevels = chain.filter(s => s.action === 'APROVADO').map(s => s.level);
        const fullyApproved = required === 1
            ? approvedLevels.includes(1)
            : approvedLevels.includes(1) && approvedLevels.includes(2);

        const { data, error } = await supabase
            .from(meta.table)
            .update({
                approval_chain:  chain,
                approval_status: (fullyApproved ? 'APROVADO' : 'PENDENTE') as ApprovalStatus,
                ...(fullyApproved ? extraOnApproved : {}),
            })
            .eq('id', id)
            .select()
            .single();
        if (error) {
            console.error('[approvalService] approve (update):', error);
            throw new Error(`Erro ao aprovar: ${error.message}`);
        }
        return data;
    },

    /**
     * Rejeita a entidade, registrando o passo de rejeição na cadeia.
     * `extra` injeta campos específicos (ex.: business_status, status).
     * Retorna a linha atualizada.
     */
    async reject(
        entity: ApprovalEntity,
        id: string,
        rejectedBy: string,
        reason: string,
        extra: Record<string, unknown> = {},
    ): Promise<any> {
        const meta = ENTITY_META[entity];

        const { data: row, error: fErr } = await supabase
            .from(meta.table)
            .select('approval_chain')
            .eq('id', id)
            .single();
        if (fErr) {
            console.error('[approvalService] reject (fetch):', fErr);
            throw new Error(`Erro ao carregar item: ${fErr.message}`);
        }

        const chain: ApprovalStep[] = ((row as any).approval_chain as ApprovalStep[]) ?? [];
        chain.push({
            level:       1,
            role:        'Rejeição',
            action:      'REJEITADO',
            approved_by: rejectedBy,
            approved_at: new Date().toISOString(),
            notes:       reason,
        });

        const { data, error } = await supabase
            .from(meta.table)
            .update({
                approval_chain:  chain,
                approval_status: 'REJEITADO' as ApprovalStatus,
                ...extra,
            })
            .eq('id', id)
            .select()
            .single();
        if (error) {
            console.error('[approvalService] reject (update):', error);
            throw new Error(`Erro ao rejeitar: ${error.message}`);
        }
        return data;
    },
};
