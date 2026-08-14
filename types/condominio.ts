// types/condominio.ts
// ÒPURA Pós-Entrega — o edifício depois da entrega.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// Um condomínio NÃO é uma entidade nova: é o `Empreendimento` no estado
// EM_OPERACAO. Criar uma árvore Condomínio→Blocos→Unidades ao lado de
// empreendimentos→towers→units criaria divergência permanente entre o
// prédio-que-foi-vendido e o prédio-que-é-operado.

// ── Sistemas prediais (NBR 5674 / 14037) ─────────────────────────────────────
export interface BuildingSystem {
    id: string;
    organization_id: string;
    name: string;
    slug: string;
    description?: string | null;
    /** Norma do sistema (ex.: 'NBR 16083' para elevadores). */
    norm_ref?: string | null;
    is_active: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export type BuildingSystemInsert =
    Omit<BuildingSystem, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'sort_order'>
    & { is_active?: boolean; sort_order?: number };

// ── Plano de manutenção ──────────────────────────────────────────────────────
export type MaintenancePlanStatus = 'RASCUNHO' | 'VIGENTE' | 'SUBSTITUIDO';

export interface MaintenancePlan {
    id: string;
    empreendimento_id: string;
    organization_id: string;
    name: string;
    /** VIGENTE é único por edifício — dois planos vigentes = ninguém sabe qual seguir. */
    status: MaintenancePlanStatus;
    norm_ref: string;
    valid_from?: string | null;
    notes?: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * A unidade da periodicidade. Valor + unidade em vez de enum de rótulos: a NBR
 * vai de semanal a plurianual, e um enum exigiria migration a cada periodicidade
 * nova que um fabricante pedir.
 */
export type PeriodicityUnit = 'DIA' | 'SEMANA' | 'MES' | 'ANO';

export type MaintenanceResponsibleType =
    | 'EQUIPE_LOCAL'
    | 'EMPRESA_ESPECIALIZADA'
    | 'FABRICANTE'
    | 'ORGAO_PUBLICO';

export interface MaintenancePlanItem {
    id: string;
    plan_id: string;
    organization_id: string;
    building_system_id?: string | null;
    /** Nulo = o item vale para o sistema inteiro, não para um equipamento. */
    asset_id?: string | null;
    description: string;
    periodicity_value: number;
    periodicity_unit: PeriodicityUnit;
    last_executed_at?: string | null;
    /** DERIVADO: recalculado pelo trigger ao concluir a OS. Não editar à mão. */
    next_due_date?: string | null;
    responsible_type: MaintenanceResponsibleType;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export type MaintenancePlanItemInsert =
    Omit<MaintenancePlanItem, 'id' | 'organization_id' | 'last_executed_at' | 'next_due_date' | 'created_at' | 'updated_at'>
    & { next_due_date?: string | null };

/** Item já resolvido com o nome do sistema, para a tabela. */
export interface MaintenancePlanItemRow extends MaintenancePlanItem {
    _system_name: string;
    /** Dias até vencer. Negativo = vencido. Nulo = sem próxima data definida. */
    _dias_para_vencer: number | null;
}

// ── Ordem de serviço de manutenção ───────────────────────────────────────────
// Irmã de `work_orders`, deliberadamente SEM project_id obrigatório, phase,
// planned_productivity nem measurement_unit: aquela é OS de produção de obra
// medida; esta é manutenção de edifício entregue.
export type MaintenanceOrderType = 'PREVENTIVA' | 'CORRETIVA' | 'INSPECAO';
export type MaintenanceOrderPriority = 'BAIXA' | 'NORMAL' | 'ALTA' | 'EMERGENCIA';
export type MaintenanceOrderStatus =
    | 'ABERTA' | 'AGENDADA' | 'EM_EXECUCAO' | 'CONCLUIDA' | 'CANCELADA';

export interface MaintenanceOrder {
    id: string;
    empreendimento_id: string;
    organization_id: string;
    /** Nulo em CORRETIVA: quebrou, não estava no plano. */
    plan_item_id?: string | null;
    building_system_id?: string | null;
    asset_id?: string | null;
    /** Nulo quando o serviço é em área comum, não numa unidade. */
    unit_id?: string | null;
    code?: string | null;
    type: MaintenanceOrderType;
    priority: MaintenanceOrderPriority;
    status: MaintenanceOrderStatus;
    description: string;
    scheduled_date?: string | null;
    /** Obrigatória quando CONCLUIDA — é a âncora do próximo vencimento. */
    executed_date?: string | null;
    cost: number;
    supplier_id?: string | null;
    executed_by?: string | null;
    findings?: string | null;
    created_at: string;
    updated_at: string;
}

export type MaintenanceOrderInsert =
    Omit<MaintenanceOrder, 'id' | 'organization_id' | 'cost' | 'created_at' | 'updated_at'>
    & { cost?: number };
export type MaintenanceOrderUpdate = Partial<Omit<MaintenanceOrderInsert, 'empreendimento_id'>>;

export interface MaintenanceOrderRow extends MaintenanceOrder {
    _system_name: string;
}
