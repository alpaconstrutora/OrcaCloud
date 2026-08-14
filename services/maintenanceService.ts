// services/maintenanceService.ts
// Manutenção predial NBR 5674 — ÒPURA Pós-Entrega, F1.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// O ciclo anda no BANCO, não aqui: `trg_maintenance_order_completed` recalcula
// `next_due_date` quando a OS entra em CONCLUIDA. O client não deve tentar
// escrever essa data — se dois lugares calculam o mesmo vencimento, um deles
// vai estar errado em algum momento e ninguém vai saber qual.

import { supabase } from '../lib/supabase';
import type {
    BuildingSystem,
    BuildingSystemInsert,
    MaintenanceOrder,
    MaintenanceOrderInsert,
    MaintenanceOrderRow,
    MaintenanceOrderUpdate,
    MaintenancePlan,
    MaintenancePlanItem,
    MaintenancePlanItemInsert,
    MaintenancePlanItemRow,
    PeriodicityUnit,
} from '../types/condominio';

const SYSTEM_COLS = 'id, organization_id, name, slug, description, norm_ref, is_active, sort_order, created_at, updated_at';
const PLAN_COLS = 'id, empreendimento_id, organization_id, name, status, norm_ref, valid_from, notes, created_at, updated_at';
const ITEM_COLS = 'id, plan_id, organization_id, building_system_id, asset_id, description, periodicity_value, periodicity_unit, last_executed_at, next_due_date, responsible_type, is_active, created_at, updated_at';
const ORDER_COLS = 'id, empreendimento_id, organization_id, plan_item_id, building_system_id, asset_id, unit_id, code, type, priority, status, description, scheduled_date, executed_date, cost, supplier_id, executed_by, findings, created_at, updated_at';

export const PERIODICITY_LABELS: Record<PeriodicityUnit, [string, string]> = {
    DIA: ['dia', 'dias'],
    SEMANA: ['semana', 'semanas'],
    MES: ['mês', 'meses'],
    ANO: ['ano', 'anos'],
};

export function formatarPeriodicidade(valor: number, unidade: PeriodicityUnit): string {
    const [sing, plur] = PERIODICITY_LABELS[unidade];
    return `A cada ${valor} ${valor === 1 ? sing : plur}`;
}

/** Dias até vencer. Negativo = vencido. Comparação em data pura — sem fuso. */
export function diasParaVencer(nextDue?: string | null): number | null {
    if (!nextDue) return null;
    const [a, m, d] = nextDue.slice(0, 10).split('-').map(Number);
    const alvo = Date.UTC(a, m - 1, d);
    const agora = new Date();
    const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
    return Math.round((alvo - hoje) / 86400000);
}

export function traduzirErroManutencao(mensagem: string): string {
    if (mensagem.includes('uidx_maintenance_plans_um_vigente')) {
        return 'Este edifício já tem um plano vigente. Marque o plano atual como substituído antes de colocar outro em vigor.';
    }
    if (mensagem.includes('maintenance_orders_concluida_tem_data')) {
        return 'Informe a data de execução para concluir a ordem — é ela que define o próximo vencimento no plano.';
    }
    if (mensagem.includes('periodicity_value')) {
        return 'A periodicidade tem de ser maior que zero.';
    }
    return mensagem;
}

export const maintenanceService = {
    // ── Sistemas prediais ────────────────────────────────────────────────────
    async listSystems(organizationId?: string | null): Promise<BuildingSystem[]> {
        let q = supabase.from('building_systems').select(SYSTEM_COLS)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });
        // "Todas as organizações" (null) NÃO bloqueia a leitura — a RLS recorta
        // o resto (CLAUDE.md regra #5).
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw new Error(`Falha ao carregar sistemas prediais: ${error.message}`);
        return (data || []) as BuildingSystem[];
    },

    async createSystem(payload: BuildingSystemInsert): Promise<BuildingSystem> {
        const { data, error } = await supabase.from('building_systems')
            .insert(payload).select(SYSTEM_COLS).single();
        if (error) throw new Error(traduzirErroManutencao(error.message));
        return data as BuildingSystem;
    },

    // ── Plano ────────────────────────────────────────────────────────────────
    async listPlans(empreendimentoId: string): Promise<MaintenancePlan[]> {
        const { data, error } = await supabase.from('maintenance_plans').select(PLAN_COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('created_at', { ascending: false });
        if (error) throw new Error(`Falha ao carregar planos: ${error.message}`);
        return (data || []) as MaintenancePlan[];
    },

    async createPlan(payload: {
        empreendimento_id: string; organization_id: string; name: string;
        status?: 'RASCUNHO' | 'VIGENTE'; valid_from?: string | null; notes?: string | null;
    }): Promise<MaintenancePlan> {
        const { data, error } = await supabase.from('maintenance_plans')
            .insert(payload).select(PLAN_COLS).single();
        if (error) throw new Error(traduzirErroManutencao(error.message));
        return data as MaintenancePlan;
    },

    async setPlanStatus(id: string, status: MaintenancePlan['status']): Promise<MaintenancePlan> {
        const { data, error } = await supabase.from('maintenance_plans')
            .update({ status }).eq('id', id).select(PLAN_COLS).single();
        if (error) throw new Error(traduzirErroManutencao(error.message));
        return data as MaintenancePlan;
    },

    // ── Itens do plano ───────────────────────────────────────────────────────
    async listPlanItems(planId: string, sistemas: BuildingSystem[]): Promise<MaintenancePlanItemRow[]> {
        const { data, error } = await supabase.from('maintenance_plan_items').select(ITEM_COLS)
            .eq('plan_id', planId)
            // Vencido primeiro: a tela de manutenção existe para mostrar o que
            // está atrasado, não para listar cadastro em ordem alfabética.
            .order('next_due_date', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true });
        if (error) throw new Error(`Falha ao carregar itens do plano: ${error.message}`);

        const porSistema = new Map(sistemas.map(s => [s.id, s.name]));
        return (data || []).map((i: any) => ({
            ...i,
            _system_name: i.building_system_id ? (porSistema.get(i.building_system_id) || '—') : '—',
            _dias_para_vencer: diasParaVencer(i.next_due_date),
        })) as MaintenancePlanItemRow[];
    },

    async createPlanItem(
        payload: MaintenancePlanItemInsert & { organization_id: string },
    ): Promise<MaintenancePlanItem> {
        const { data, error } = await supabase.from('maintenance_plan_items')
            .insert(payload).select(ITEM_COLS).single();
        if (error) throw new Error(traduzirErroManutencao(error.message));
        return data as MaintenancePlanItem;
    },

    async removePlanItem(id: string): Promise<void> {
        const { error } = await supabase.from('maintenance_plan_items').delete().eq('id', id);
        if (error) throw new Error(traduzirErroManutencao(error.message));
    },

    // ── Ordens de serviço ────────────────────────────────────────────────────
    async listOrders(empreendimentoId: string, sistemas: BuildingSystem[]): Promise<MaintenanceOrderRow[]> {
        const { data, error } = await supabase.from('maintenance_orders').select(ORDER_COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('scheduled_date', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false });
        if (error) throw new Error(`Falha ao carregar ordens: ${error.message}`);

        const porSistema = new Map(sistemas.map(s => [s.id, s.name]));
        return (data || []).map((o: any) => ({
            ...o,
            _system_name: o.building_system_id ? (porSistema.get(o.building_system_id) || '—') : '—',
        })) as MaintenanceOrderRow[];
    },

    async createOrder(payload: MaintenanceOrderInsert & { organization_id: string }): Promise<MaintenanceOrder> {
        const { data, error } = await supabase.from('maintenance_orders')
            .insert(payload).select(ORDER_COLS).single();
        if (error) throw new Error(traduzirErroManutencao(error.message));
        return data as MaintenanceOrder;
    },

    /**
     * Concluir a OS é o que empurra o ciclo: o trigger no banco lê `executed_date`
     * e reescreve `next_due_date` do item do plano. Por isso a data é obrigatória
     * aqui — e o CHECK do banco recusa se vier vazia.
     */
    async concluirOrder(id: string, executedDate: string, extras?: { cost?: number; findings?: string | null }): Promise<MaintenanceOrder> {
        return this.updateOrder(id, { status: 'CONCLUIDA', executed_date: executedDate, ...extras });
    },

    async updateOrder(id: string, patch: MaintenanceOrderUpdate): Promise<MaintenanceOrder> {
        const { data, error } = await supabase.from('maintenance_orders')
            .update(patch).eq('id', id).select(ORDER_COLS).single();
        if (error) throw new Error(traduzirErroManutencao(error.message));
        return data as MaintenanceOrder;
    },

    async removeOrder(id: string): Promise<void> {
        const { error } = await supabase.from('maintenance_orders').delete().eq('id', id);
        if (error) throw new Error(traduzirErroManutencao(error.message));
    },
};
