import { supabase } from '../lib/supabase';
import { BudgetEntry, SinapiCategory, SinapiType } from '../types/budget';
import { SchedulePeriod, ItemDistribution, OutlineNode, TaskNature } from '../types/schedule';
import { ProjectSchedule } from '../types/project';
import { resolveProjectBudget, findChildProject } from './budgetResolver';
import { inventoryService } from './inventoryService';
import { quotationService } from './quotationService';
import { orderService } from './orderService';
import {
    ProcurementPlanItem,
    ProcurementStatus,
    ExplodedNeed,
    ProcurementMonthlySpend,
    ProcurementKPIs,
    UpdateProcurementItemInput,
    ConsolidationOpportunity,
    Consolidation,
    ConsolidationItem,
    RiskItem,
    RiskFlag,
    MonthlyBreakdown,
    ScenarioResult,
} from '../types/procurement';

// ─── helpers ──────────────────────────────────────────────────────────────────

function addDays(isoDate: string, days: number): string {
    const d = new Date(isoDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function subtractDays(isoDate: string, days: number): string {
    const d = new Date(isoDate);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}

function toIso(date: Date): string {
    return date.toISOString().slice(0, 10);
}

// Varre o outline (WBS) e mapeia budgetItemId → nature, para folhas marcadas explicitamente.
function buildNatureByBudgetItemId(outline?: OutlineNode[]): Record<string, TaskNature> {
    const map: Record<string, TaskNature> = {};
    const walk = (nodes: OutlineNode[]) => {
        for (const n of nodes) {
            if (n.budgetItemId && n.nature) map[n.budgetItemId] = n.nature;
            if (n.children?.length) walk(n.children);
        }
    };
    if (outline?.length) walk(outline);
    return map;
}

// Converte snake_case row → ProcurementPlanItem camelCase
function rowToItem(row: Record<string, unknown>): ProcurementPlanItem {
    return {
        id:                     row.id as string,
        organizationId:         row.organization_id as string,
        projectId:              row.project_id as string,
        projectName:            row.project_name as string | undefined,
        budgetVersionId:        row.budget_version_id as string | undefined,
        isStale:                row.is_stale as boolean,
        inputCode:              row.input_code as string | undefined,
        inputDescription:       row.input_description as string,
        inputUnit:              row.input_unit as string,
        sourceBudgetItemId:     row.source_budget_item_id as string | undefined,
        sourceBudgetItemDesc:   row.source_budget_item_desc as string | undefined,
        sourceBudgetItemUnit:   row.source_budget_item_unit as string | undefined,
        requiredQty:            Number(row.required_qty ?? 0),
        netRequiredQty:         Number(row.net_required_qty ?? 0),
        lastNetSnapshotAt:      row.last_net_snapshot_at as string | undefined,
        periodId:               row.period_id as string | undefined,
        periodDate:             row.period_date as string | undefined,
        needDate:               row.need_date as string | undefined,
        leadTimeDays:           Number(row.lead_time_days ?? 0),
        suggestedBuyDate:       row.suggested_buy_date as string | undefined,
        suggestedSupplierId:    row.suggested_supplier_id as string | undefined,
        suggestedSupplierName:  row.supplier_name as string | undefined,
        estimatedUnitCost:      Number(row.estimated_unit_cost ?? 0),
        estimatedTotal:         Number(row.estimated_total ?? 0),
        consolidationGroupId:   row.consolidation_group_id as string | undefined,
        status:                 row.status as ProcurementStatus,
        generatedQuotationId:   row.generated_quotation_id as string | undefined,
        generatedOrderId:       row.generated_order_id as string | undefined,
        notes:                  row.notes as string | undefined,
        created_at:             row.created_at as string,
        updated_at:             row.updated_at as string,
    };
}

// Converte row de procurement_consolidations → Consolidation
function pcToConsolidation(row: Record<string, unknown>, items: ConsolidationItem[]): Consolidation {
    return {
        id:                row.id as string,
        organizationId:    row.organization_id as string,
        inputCode:         row.input_code as string | undefined,
        inputDescription:  row.input_description as string,
        inputUnit:         row.input_unit as string,
        periodMonth:       row.period_month as string,
        totalRequiredQty:  Number(row.total_required_qty ?? 0),
        totalEstimated:    Number(row.total_estimated ?? 0),
        status:            row.status as Consolidation['status'],
        generatedQuotationId: row.generated_quotation_id as string | undefined,
        generatedOrderId:     row.generated_order_id as string | undefined,
        notes:             row.notes as string | undefined,
        items,
        created_at:        row.created_at as string,
        updated_at:        row.updated_at as string,
    };
}

// ─── motor de necessidade ─────────────────────────────────────────────────────

/**
 * Explode BudgetEntry[] × schedule → ExplodedNeed[]
 * Fluxo:
 *  1. Para cada BudgetEntry com composição (sinapiItem.composition[])
 *  2. Para cada componente tipo 'M' (material)
 *  3. Multiplica qty componente × qty item × pct de distribuição no período
 *  4. Aplica lead time (do banco, se existir, senão 0)
 *  5. Agrupa por (inputCode, periodDate) em consolidationGroupKey
 */
async function explodeNeeds(
    budget: BudgetEntry[],
    schedule: ProjectSchedule,
    organizationId: string,
    budgetVersionId?: string,
): Promise<ExplodedNeed[]> {
    // Pré-carrega todos os lead times da org para evitar N queries
    const leadTimes = await inventoryService.listLeadTimes(organizationId);

    // Atividades marcadas como Natureza=Compra no outline (WBS) do planejamento.
    const natureByBudgetItemId = buildNatureByBudgetItemId(schedule.outline);

    const periodsById: Record<string, SchedulePeriod> = {};
    for (const p of schedule.periods ?? []) periodsById[p.id] = p;

    const distribsByItemId: Record<string, ItemDistribution[]> = {};
    for (const d of schedule.distributions ?? []) {
        if (!distribsByItemId[d.itemId]) distribsByItemId[d.itemId] = [];
        distribsByItemId[d.itemId].push(d);
    }

    // Suporte a itemSchedules (formato mais novo do planejamento)
    // Converte itemSchedule {id, startDate, endDate} → distribuição sintética de 100% no mês de início
    const itemScheduleById: Record<string, { startDate: string; endDate: string }> = {};
    for (const is of (schedule as any).itemSchedules ?? []) {
        if (is.id && is.startDate) itemScheduleById[is.id] = { startDate: is.startDate, endDate: is.endDate ?? is.startDate };
    }

    // Garante que periodsById também inclui períodos sintéticos a partir de itemSchedules
    for (const is of Object.values(itemScheduleById)) {
        const monthKey = is.startDate.slice(0, 7); // YYYY-MM
        const syntheticId = `synthetic-${monthKey}`;
        if (!periodsById[syntheticId]) {
            periodsById[syntheticId] = { id: syntheticId, name: monthKey, date: is.startDate.slice(0, 10) };
        }
    }

    console.log('[procurement] explodeNeeds', {
        budgetEntries: budget.length,
        periodsCount: Object.keys(periodsById).length,
        distributionItemIds: Object.keys(distribsByItemId).length,
        itemScheduleIds: Object.keys(itemScheduleById).length,
        sampleBudgetIds: budget.slice(0, 3).map(e => e.id),
        sampleDistribItemIds: Object.keys(distribsByItemId).slice(0, 3),
    });

    let skippedNoComposition = 0, skippedNoDistrib = 0, skippedNoMaterial = 0, lumpFromNature = 0;

    const needs: ExplodedNeed[] = [];
    const consolGroupIds: Record<string, string> = {}; // groupKey → UUID

    for (const entry of budget) {
        const comp = entry.sinapiItem?.composition;
        const isPurchaseNature = natureByBudgetItemId[entry.id] === TaskNature.COMPRA;

        // Sem composição SINAPI (ex.: elevador, compra direta): se a atividade do cronograma
        // está marcada com Natureza=Compra, gera a necessidade a partir do próprio item
        // (lump sum), em vez de descartá-lo silenciosamente.
        if ((!comp || comp.length === 0) && !isPurchaseNature) { skippedNoComposition++; continue; }

        // Tenta distribuições explícitas; se vazio, tenta itemSchedule sintético
        let itemDistribs: ItemDistribution[] = distribsByItemId[entry.id] ?? [];
        if (itemDistribs.length === 0 && itemScheduleById[entry.id]) {
            const { startDate } = itemScheduleById[entry.id];
            const monthKey = startDate.slice(0, 7);
            const syntheticPeriodId = `synthetic-${monthKey}`;
            itemDistribs = [{ itemId: entry.id, periodId: syntheticPeriodId, percentage: 100, value: 0 }];
        }
        if (itemDistribs.length === 0) { skippedNoDistrib++; continue; }

        if (!comp || comp.length === 0) {
            // Lump sum: o item de orçamento inteiro é a necessidade (sem quebra em insumos).
            lumpFromNature++;
            for (const dist of itemDistribs) {
                if (dist.percentage <= 0) continue;
                const period = periodsById[dist.periodId];
                if (!period) continue;

                const qtyInPeriod = Number(entry.quantity ?? 0) * (dist.percentage / 100);
                const leadTime = leadTimes.find(lt => !lt.inputCode && lt.organizationId === organizationId);
                const leadTimeDays = leadTime?.leadTimeDays ?? 0;
                const needDate = period.date;
                const suggestedBuyDate = leadTimeDays > 0 ? subtractDays(needDate, leadTimeDays) : needDate;
                const groupKey = `${entry.sinapiItem?.code ?? entry.id}|${period.date}`;
                if (!consolGroupIds[groupKey]) consolGroupIds[groupKey] = crypto.randomUUID();

                needs.push({
                    inputCode:              entry.sinapiItem?.code || undefined,
                    inputDescription:       entry.sinapiItem?.description ?? '',
                    inputUnit:              entry.sinapiItem?.unit ?? '',
                    requiredQty:            qtyInPeriod,
                    sourceBudgetItemId:     entry.id,
                    sourceBudgetItemDesc:   entry.sinapiItem?.description ?? '',
                    sourceBudgetItemUnit:   entry.sinapiItem?.unit ?? '',
                    periodId:               dist.periodId,
                    periodDate:             period.date,
                    needDate,
                    leadTimeDays,
                    suggestedBuyDate,
                    suggestedSupplierId:    leadTime?.supplierId,
                    estimatedUnitCost:      Number(entry.sinapiItem?.price ?? 0),
                    consolidationGroupKey:  groupKey,
                });
            }
            continue;
        }

        for (const component of comp) {
            // Inclui INPUTs (materiais/equipamentos diretos); exclui sub-COMPOSITIONs e Mão de Obra
            const cat = component.category;
            const typ = component.type;
            const isSubComposition = typ === SinapiType.COMPOSITION || (typ as string) === 'COMPOSITION';
            const isLabor = cat === SinapiCategory.MAO_DE_OBRA || cat === 'Mão de Obra';
            if (isSubComposition || isLabor) { skippedNoMaterial++; continue; }

            const componentQtyPerUnit = Number(component.quantity ?? 0);
            if (componentQtyPerUnit <= 0) continue;

            const totalComponentQty = componentQtyPerUnit * Number(entry.quantity ?? 0);

            for (const dist of itemDistribs) {
                if (dist.percentage <= 0) continue;

                const period = periodsById[dist.periodId];
                if (!period) continue;

                const qtyInPeriod = totalComponentQty * (dist.percentage / 100);

                // Lead time: por insumo > por fornecedor > 0
                const leadTime = leadTimes.find(
                    lt => lt.inputCode === component.code && lt.organizationId === organizationId
                ) ?? leadTimes.find(
                    lt => !lt.inputCode && lt.organizationId === organizationId
                );
                const leadTimeDays = leadTime?.leadTimeDays ?? 0;

                const needDate = period.date; // data do período = data de necessidade
                const suggestedBuyDate = leadTimeDays > 0
                    ? subtractDays(needDate, leadTimeDays)
                    : needDate;

                const groupKey = `${component.code ?? component.description}|${period.date}`;
                if (!consolGroupIds[groupKey]) {
                    consolGroupIds[groupKey] = crypto.randomUUID();
                }

                needs.push({
                    inputCode:              component.code || undefined,
                    inputDescription:       component.description,
                    inputUnit:              component.unit,
                    requiredQty:            qtyInPeriod,
                    sourceBudgetItemId:     entry.id,
                    sourceBudgetItemDesc:   entry.sinapiItem?.description ?? '',
                    sourceBudgetItemUnit:   entry.sinapiItem?.unit ?? '',
                    periodId:               dist.periodId,
                    periodDate:             period.date,
                    needDate,
                    leadTimeDays,
                    suggestedBuyDate,
                    suggestedSupplierId:    leadTime?.supplierId,
                    estimatedUnitCost:      Number(component.price ?? 0),
                    consolidationGroupKey:  groupKey,
                });
            }
        }
    }

    console.log('[procurement] explodeNeeds resultado', {
        needs: needs.length,
        skippedNoComposition,
        skippedNoDistrib,
        skippedNoMaterial,
        lumpFromNature,
    });

    return needs;
}

// ─── funções puras exportadas (Fase 4 parcial) ───────────────────────────────

/**
 * Computa scores e flags de risco para cada item do plano.
 * Puramente client-side, sem acesso ao banco.
 */
export function computeRiskItems(items: ProcurementPlanItem[], today: string): RiskItem[] {
    const active = items.filter(i => i.status !== 'cancelled' && i.status !== 'received');
    if (active.length === 0) return [];

    // mediana de estimated_total para detectar alto valor
    const sorted = [...active].map(i => i.estimatedTotal).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

    return active.map(item => {
        const flags: RiskFlag[] = [];
        let score = 0;

        // Atraso
        const todayMs = new Date(today).getTime();
        const buyMs   = item.suggestedBuyDate ? new Date(item.suggestedBuyDate).getTime() : null;
        const daysOverdue = buyMs ? Math.round((todayMs - buyMs) / 86400000) : 0;

        if (item.status === 'pending' && daysOverdue > 0) {
            flags.push('overdue');
            score += Math.min(40, Math.round(40 * Math.min(daysOverdue / 30, 1)));
        }

        // Sem fornecedor
        if (!item.suggestedSupplierId) {
            flags.push('no_supplier');
            score += 20;
        }

        // Sem abatimento de estoque (posição líquida = qty total → sem estoque disponível)
        if (item.requiredQty > 0 && item.netRequiredQty >= item.requiredQty) {
            flags.push('no_stock');
            score += 15;
        }

        // Alto valor
        if (median > 0 && item.estimatedTotal > median * 2) {
            flags.push('high_value');
            score += 15;
        }

        // Plano desatualizado
        if (item.isStale) {
            flags.push('stale');
            score += 10;
        }

        const riskLevel: import('../types/procurement').RiskLevel = score >= 61 ? 'high' : score >= 26 ? 'medium' : 'low';

        return { ...item, riskScore: Math.min(100, score), riskLevel, riskFlags: flags, daysOverdue };
    }).sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Computa curva S 4 séries a partir dos itens carregados.
 * Retorna array ordenado de meses com valores absolutos e acumulados.
 */
export function computeMonthlyBreakdown(items: ProcurementPlanItem[]): MonthlyBreakdown[] {
    const map: Record<string, { planejado: number; comprometido: number; pedido: number; realizado: number }> = {};

    for (const item of items) {
        if (!item.suggestedBuyDate || item.status === 'cancelled') continue;
        const m = item.suggestedBuyDate.slice(0, 7);
        if (!map[m]) map[m] = { planejado: 0, comprometido: 0, pedido: 0, realizado: 0 };
        map[m].planejado += item.estimatedTotal;
        if (item.status === 'quoted')   map[m].comprometido += item.estimatedTotal;
        if (item.status === 'ordered')  map[m].pedido       += item.estimatedTotal;
        if (item.status === 'received') map[m].realizado    += item.estimatedTotal;
    }

    const months = Object.keys(map).sort();
    let accP = 0, accC = 0, accO = 0, accR = 0;

    return months.map(m => {
        accP += map[m].planejado;
        accC += map[m].comprometido;
        accO += map[m].pedido;
        accR += map[m].realizado;
        return {
            month: m,
            planejado:        map[m].planejado,
            comprometido:     map[m].comprometido,
            pedido:           map[m].pedido,
            realizado:        map[m].realizado,
            planejadoAcc:     accP,
            comprometidoAcc:  accC,
            pedidoAcc:        accO,
            realizadoAcc:     accR,
        };
    });
}

/**
 * Simula o impacto de um atraso de N dias no cronograma.
 * Desloca need_date → recalcula suggested_buy_date.
 */
export function simulateScenario(items: ProcurementPlanItem[], delayDays: number): ScenarioResult {
    const today = new Date().toISOString().slice(0, 10);
    let itemsMoved = 0;
    let newOverdueCount = 0;

    const shifted = items
        .filter(i => i.status !== 'cancelled' && i.status !== 'received')
        .map(item => {
            if (!item.suggestedBuyDate) return item;
            itemsMoved++;
            const newBuyDate = addDays(item.suggestedBuyDate, delayDays);
            if (newBuyDate < today) newOverdueCount++;
            return { ...item, suggestedBuyDate: newBuyDate };
        });

    return {
        delayDays,
        monthlyBreakdown: computeMonthlyBreakdown(shifted),
        itemsMoved,
        newOverdueCount,
    };
}

// ─── service público ──────────────────────────────────────────────────────────

export const procurementService = {

    /**
     * Gera (ou regera) o plano de aquisições para um projeto.
     * Apaga os itens 'pending' existentes e insere os novos.
     * Itens em status quoted/ordered/received/cancelled são preservados.
     */
    async generatePlan(
        projectId: string,
        organizationId: string,
    ): Promise<{ inserted: number }> {
        // 1. Carrega projeto
        const { data: project, error: pErr } = await supabase
            .from('projects')
            .select('id, budget, settings')
            .eq('id', projectId)
            .single();
        if (pErr || !project) throw new Error('Projeto não encontrado');

        const settings = (project.settings ?? {}) as Record<string, unknown>;
        let schedule = settings.schedule as ProjectSchedule | undefined;
        let budgetVersionId = settings.activeVersionId as string | undefined;

        // Budget: o campo project.budget raramente é a fonte — ver budgetResolver.
        let budget: BudgetEntry[] = (await resolveProjectBudget(project as any)).budget;

        console.log('[procurement] projeto carregado', {
            projectId,
            classification: settings.classification,
            linkedProjectId: settings.linkedProjectId,
            budgetRows: budget.length,
            hasSchedule: !!schedule,
            schedulePeriodsCount: (schedule as any)?.periods?.length ?? 0,
            scheduleDistributionsCount: (schedule as any)?.distributions?.length ?? 0,
            snapshotRows: ((settings.basedOnBudgetSnapshot as any[]) ?? []).length,
        });

        // Se o projeto não tiver cronograma, busca no projeto PLANEJAMENTO vinculado
        if (!schedule) {
            const planProj = await findChildProject(projectId, 'PLANEJAMENTO');
            if (planProj) {
                const planSettings = (planProj.settings ?? {}) as Record<string, unknown>;
                schedule = planSettings.schedule as ProjectSchedule | undefined;
                if (!budgetVersionId) budgetVersionId = planSettings.activeVersionId as string | undefined;
                // As distribuições do cronograma referenciam os IDs do basedOnBudgetSnapshot,
                // então SEMPRE usamos o orçamento do PLANEJAMENTO quando há um vinculado —
                // o resolver já prioriza o snapshot nesse caso.
                budget = (await resolveProjectBudget(planProj)).budget;
                console.log('[procurement] PLANEJAMENTO vinculado encontrado', {
                    planProjectId: planProj.id,
                    planLinkedProjectId: planSettings.linkedProjectId,
                    snapshotRows: ((planSettings.basedOnBudgetSnapshot as any[]) ?? []).length,
                    planBudgetRows: ((planProj.budget ?? []) as any[]).length,
                    scheduleFound: !!schedule,
                    schedulePeriodsCount: (schedule as any)?.periods?.length ?? 0,
                    scheduleDistributionsCount: (schedule as any)?.distributions?.length ?? 0,
                });
            } else {
                console.warn('[procurement] Nenhum PLANEJAMENTO vinculado encontrado para projectId:', projectId);
            }
        }

        if (!schedule) throw new Error('Projeto não possui cronograma físico-financeiro. Verifique se há um Planejamento vinculado com cronograma definido.');

        // 2. Apaga somente os 'pending' (os demais permanecem para rastreabilidade)
        await supabase
            .from('procurement_plan_items')
            .delete()
            .eq('project_id', projectId)
            .eq('status', 'pending');

        // 3. Explode necessidades
        const needs = await explodeNeeds(budget, schedule, organizationId, budgetVersionId);
        if (needs.length === 0) return { inserted: 0 };

        // 4. Busca posição líquida para subtrair do estoque
        const netPositions = await inventoryService.getNetPositions(organizationId);
        const netMap: Record<string, number> = {};
        for (const np of netPositions) {
            netMap[np.inputCode] = (netMap[np.inputCode] ?? 0) + np.netQty;
        }

        // 5. Constrói rows agrupando por consolidationGroupKey
        const grouped: Record<string, ExplodedNeed & { accQty: number }> = {};
        for (const n of needs) {
            const key = `${n.consolidationGroupKey}|${n.sourceBudgetItemId}`;
            if (!grouped[key]) {
                grouped[key] = { ...n, accQty: 0 };
            }
            grouped[key].accQty += n.requiredQty;
        }

        // 6. Consolida group UUIDs
        const consolGroupUUIDs: Record<string, string> = {};
        for (const n of needs) {
            if (!consolGroupUUIDs[n.consolidationGroupKey]) {
                consolGroupUUIDs[n.consolidationGroupKey] = crypto.randomUUID();
            }
        }

        const now = toIso(new Date());
        const rows = Object.entries(grouped).map(([, need]) => {
            const code = need.inputCode;
            const available = code ? (netMap[code] ?? 0) : 0;
            const netRequired = Math.max(0, need.accQty - Math.max(0, available));

            return {
                organization_id:          organizationId,
                project_id:               projectId,
                budget_version_id:        budgetVersionId ?? null,
                is_stale:                 false,
                input_code:               code ?? null,
                input_description:        need.inputDescription,
                input_unit:               need.inputUnit,
                source_budget_item_id:    need.sourceBudgetItemId,
                source_budget_item_desc:  need.sourceBudgetItemDesc,
                source_budget_item_unit:  need.sourceBudgetItemUnit,
                required_qty:             need.accQty,
                net_required_qty:         netRequired,
                last_net_snapshot_at:     now,
                period_id:                need.periodId,
                period_date:              need.periodDate,
                need_date:                need.needDate,
                lead_time_days:           need.leadTimeDays,
                suggested_buy_date:       need.suggestedBuyDate,
                suggested_supplier_id:    need.suggestedSupplierId ?? null,
                estimated_unit_cost:      need.estimatedUnitCost,
                consolidation_group_id:   consolGroupUUIDs[need.consolidationGroupKey],
                status:                   'pending',
            };
        });

        // 7. Insere em lotes de 200
        const BATCH = 200;
        for (let i = 0; i < rows.length; i += BATCH) {
            const { error } = await supabase
                .from('procurement_plan_items')
                .insert(rows.slice(i, i + BATCH));
            if (error) throw error;
        }

        return { inserted: rows.length };
    },

    async listPlanItems(
        organizationId: string | null,
        projectId?: string,
        status?: ProcurementStatus | ProcurementStatus[],
        onlyStale?: boolean,
    ): Promise<ProcurementPlanItem[]> {
        let q = supabase
            .from('procurement_plan_items')
            .select(`
                id, organization_id, project_id,
                budget_version_id, is_stale,
                input_code, input_description, input_unit,
                source_budget_item_id, source_budget_item_desc, source_budget_item_unit,
                required_qty, net_required_qty, last_net_snapshot_at,
                period_id, period_date, need_date, lead_time_days, suggested_buy_date,
                suggested_supplier_id, estimated_unit_cost, estimated_total,
                consolidation_group_id, status,
                generated_quotation_id, generated_order_id,
                notes, created_at, updated_at
            `)
            .order('suggested_buy_date', { ascending: true });

        if (organizationId) q = q.eq('organization_id', organizationId);
        if (projectId) q = q.eq('project_id', projectId);
        if (onlyStale) q = q.eq('is_stale', true);
        if (status) {
            const statuses = Array.isArray(status) ? status : [status];
            q = q.in('status', statuses);
        }

        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map(r => rowToItem(r as Record<string, unknown>));
    },

    async updateItem(id: string, patch: UpdateProcurementItemInput): Promise<void> {
        const update: Record<string, unknown> = {};
        if (patch.suggestedSupplierId !== undefined) update.suggested_supplier_id = patch.suggestedSupplierId;
        if (patch.estimatedUnitCost    !== undefined) update.estimated_unit_cost   = patch.estimatedUnitCost;
        if (patch.leadTimeDays         !== undefined) {
            update.lead_time_days = patch.leadTimeDays;
            // recalcula suggested_buy_date se needDate existir (feito no SELECT abaixo)
        }
        if (patch.suggestedBuyDate !== undefined) update.suggested_buy_date = patch.suggestedBuyDate;
        if (patch.status           !== undefined) update.status             = patch.status;
        if (patch.notes            !== undefined) update.notes              = patch.notes;

        const { error } = await supabase
            .from('procurement_plan_items')
            .update(update)
            .eq('id', id);
        if (error) throw error;
    },

    async markProjectPlanStale(projectId: string): Promise<void> {
        const { error } = await supabase.rpc('fn_mark_plan_stale', { p_project_id: projectId });
        if (error) throw error;
    },

    async getMonthlySpend(
        organizationId: string | null,
        projectId?: string,
    ): Promise<ProcurementMonthlySpend[]> {
        const { data, error } = await supabase.rpc('fn_procurement_monthly_spend', {
            p_organization_id: organizationId || null,
            p_project_id:      projectId ?? null,
        });
        if (error) throw error;
        return (data ?? []).map((r: Record<string, unknown>) => ({
            monthDate:      r.month_date as string,
            monthLabel:     r.month_label as string,
            estimatedSpend: Number(r.estimated_spend ?? 0),
            pendingCount:   Number(r.pending_count  ?? 0),
            quotedCount:    Number(r.quoted_count   ?? 0),
            orderedCount:   Number(r.ordered_count  ?? 0),
        }));
    },

    async getKPIs(organizationId: string | null, projectId?: string): Promise<ProcurementKPIs> {
        let q = supabase
            .from('procurement_plan_items')
            .select('id, net_required_qty, estimated_total, suggested_buy_date, is_stale, status')
            .neq('status', 'cancelled');

        if (organizationId) q = q.eq('organization_id', organizationId);
        if (projectId) q = q.eq('project_id', projectId);

        const { data, error } = await q;
        if (error) throw error;

        const rows = data ?? [];
        const today = toIso(new Date());
        const in30 = toIso(new Date(Date.now() + 30 * 86400 * 1000));

        let totalEstimated = 0, next30dEstimated = 0;
        let next30dItems = 0, staleItems = 0, backlogItems = 0;

        for (const r of rows) {
            const est = Number(r.estimated_total ?? 0);
            totalEstimated += est;
            if (r.is_stale) staleItems++;
            if (!r.suggested_buy_date) {
                backlogItems++;
            } else if (r.suggested_buy_date >= today && r.suggested_buy_date <= in30) {
                next30dItems++;
                next30dEstimated += est;
            }
        }

        return {
            totalItems:       rows.length,
            totalEstimated,
            next30dItems,
            next30dEstimated,
            staleItems,
            backlogItems,
        };
    },

    /**
     * Gera uma Solicitação de Cotação (RFQ) a partir de itens selecionados do plano.
     * Cria quotation_request com status 'Aberta' e marca os itens como 'quoted'.
     */
    async generateQuotationFromItems(
        itemIds: string[],
        projectId: string,
        organizationId: string,
        options?: { title?: string; deadline?: string; description?: string },
    ): Promise<{ quotationId: string; quotationNumber: string }> {
        // Carrega os itens selecionados
        const { data: rows, error } = await supabase
            .from('procurement_plan_items')
            .select('id, input_code, input_description, input_unit, net_required_qty, estimated_unit_cost')
            .in('id', itemIds)
            .eq('organization_id', organizationId);
        if (error) throw error;
        if (!rows || rows.length === 0) throw new Error('Nenhum item válido selecionado.');

        const qrItems = rows.map(r => ({
            code:        r.input_code ?? '',
            description: r.input_description as string,
            unit:        r.input_unit as string,
            quantity:    Number(r.net_required_qty ?? 0),
            unitPrice:   Number(r.estimated_unit_cost ?? 0),
        }));

        const deadline = options?.deadline ?? toIso(new Date(Date.now() + 7 * 86400000));
        const title    = options?.title ?? `Plano de Aquisições — ${new Date().toLocaleDateString('pt-BR')}`;

        const qr = await quotationService.createRequest({
            projectId,
            title,
            description:        options?.description,
            deadline,
            status:             'Aberta',
            items:              qrItems,
            invitedSupplierIds: [],
        });

        // Marca itens como quoted e grava o ID da cotação
        await supabase
            .from('procurement_plan_items')
            .update({ status: 'quoted', generated_quotation_id: qr.id })
            .in('id', itemIds)
            .eq('organization_id', organizationId);

        return { quotationId: qr.id, quotationNumber: qr.number };
    },

    /**
     * Gera um Pedido de Compra direto (sem cotação) em status Rascunho.
     * Marca os itens como 'ordered'.
     */
    async generateOrderFromItems(
        itemIds: string[],
        projectId: string,
        supplierId: string,
        organizationId: string,
        options?: { deliveryDate?: string; notes?: string },
    ): Promise<{ orderId: string; orderNumber: string }> {
        const { data: rows, error } = await supabase
            .from('procurement_plan_items')
            .select('id, input_code, input_description, input_unit, net_required_qty, estimated_unit_cost')
            .in('id', itemIds)
            .eq('organization_id', organizationId);
        if (error) throw error;
        if (!rows || rows.length === 0) throw new Error('Nenhum item válido selecionado.');

        const poItems = rows.map(r => ({
            code:        r.input_code ?? '',
            description: r.input_description as string,
            unit:        r.input_unit as string,
            quantity:    Number(r.net_required_qty ?? 0),
            unitPrice:   Number(r.estimated_unit_cost ?? 0),
            total:       Number(r.net_required_qty ?? 0) * Number(r.estimated_unit_cost ?? 0),
        }));

        const deliveryDate = options?.deliveryDate ?? toIso(new Date(Date.now() + 14 * 86400000));

        const order = await orderService.createOrder({
            projectId,
            supplierId,
            deliveryDate,
            status:  'Rascunho',
            notes:   options?.notes,
            items:   poItems,
        });

        await supabase
            .from('procurement_plan_items')
            .update({ status: 'ordered', generated_order_id: order.id })
            .in('id', itemIds)
            .eq('organization_id', organizationId);

        return { orderId: order.id, orderNumber: order.number ?? '' };
    },

    // Refresh posição líquida para itens de um projeto sem regenerar todo o plano
    async refreshNetPositions(organizationId: string, projectId: string): Promise<void> {
        const netPositions = await inventoryService.getNetPositions(organizationId);
        const netMap: Record<string, number> = {};
        for (const np of netPositions) {
            netMap[np.inputCode] = (netMap[np.inputCode] ?? 0) + np.netQty;
        }

        const { data: items, error } = await supabase
            .from('procurement_plan_items')
            .select('id, input_code, required_qty')
            .eq('project_id', projectId)
            .eq('status', 'pending');
        if (error) throw error;

        const now = toIso(new Date());
        const updates = (items ?? []).map(item => {
            const available = item.input_code ? (netMap[item.input_code] ?? 0) : 0;
            return {
                id: item.id,
                net_required_qty: Math.max(0, Number(item.required_qty) - Math.max(0, available)),
                last_net_snapshot_at: now,
            };
        });

        const BATCH = 100;
        for (let i = 0; i < updates.length; i += BATCH) {
            const { error: upErr } = await supabase
                .from('procurement_plan_items')
                .upsert(updates.slice(i, i + BATCH), { onConflict: 'id' });
            if (upErr) throw upErr;
        }
    },

    // ── Fase 3: Consolidação Multi-Obra ──────────────────────────────────────

    async getConsolidationOpportunities(organizationId: string): Promise<ConsolidationOpportunity[]> {
        const { data, error } = await supabase.rpc('fn_consolidation_opportunities', {
            p_organization_id: organizationId,
        });
        if (error) throw error;
        return (data ?? []).map((r: Record<string, unknown>) => ({
            inputCode:        r.input_code as string | undefined,
            inputDescription: r.input_description as string,
            inputUnit:        r.input_unit as string,
            periodMonth:      r.period_month as string,
            projectCount:     Number(r.project_count ?? 0),
            totalQty:         Number(r.total_qty ?? 0),
            totalEstimated:   Number(r.total_estimated ?? 0),
            itemIds:          r.item_ids as string[],
        }));
    },

    async createConsolidation(
        organizationId: string,
        opportunity: ConsolidationOpportunity,
        notes?: string,
    ): Promise<Consolidation> {
        // 1. Cria o grupo
        const { data: pc, error: pcErr } = await supabase
            .from('procurement_consolidations')
            .insert({
                organization_id:    organizationId,
                input_code:         opportunity.inputCode ?? null,
                input_description:  opportunity.inputDescription,
                input_unit:         opportunity.inputUnit,
                period_month:       opportunity.periodMonth,
                total_required_qty: opportunity.totalQty,
                total_estimated:    opportunity.totalEstimated,
                status:             'open',
                notes:              notes ?? null,
            })
            .select()
            .single();
        if (pcErr) throw pcErr;

        // 2. Carrega os itens do plano para montar os links com project_name
        const { data: planItems, error: piErr } = await supabase
            .from('procurement_plan_items')
            .select('id, project_id, net_required_qty, estimated_total')
            .in('id', opportunity.itemIds);
        if (piErr) throw piErr;

        // 3. Busca nomes dos projetos
        const projectIds = [...new Set((planItems ?? []).map(i => i.project_id as string))];
        const { data: projects } = await supabase
            .from('projects')
            .select('id, name')
            .in('id', projectIds);
        const nameMap: Record<string, string> = {};
        for (const p of projects ?? []) nameMap[p.id] = p.name;

        // 4. Insere os itens de consolidação
        const ciRows = (planItems ?? []).map(i => ({
            consolidation_id: pc.id,
            plan_item_id:     i.id,
            project_id:       i.project_id,
            project_name:     nameMap[i.project_id as string] ?? '',
            required_qty:     Number(i.net_required_qty ?? 0),
            estimated_total:  Number(i.estimated_total ?? 0),
        }));

        const { error: ciErr } = await supabase
            .from('procurement_consolidation_items')
            .insert(ciRows);
        if (ciErr) throw ciErr;

        return pcToConsolidation(pc, ciRows.map((ci, idx) => ({
            id:              String(idx),
            consolidationId: pc.id,
            planItemId:      ci.plan_item_id,
            projectId:       ci.project_id,
            projectName:     ci.project_name,
            requiredQty:     ci.required_qty,
            estimatedTotal:  ci.estimated_total,
            created_at:      new Date().toISOString(),
        })));
    },

    async listConsolidations(organizationId: string): Promise<Consolidation[]> {
        const { data, error } = await supabase
            .from('procurement_consolidations')
            .select(`
                id, organization_id, input_code, input_description, input_unit,
                period_month, total_required_qty, total_estimated,
                status, generated_quotation_id, generated_order_id,
                notes, created_at, updated_at,
                procurement_consolidation_items (
                    id, consolidation_id, plan_item_id, project_id,
                    project_name, required_qty, estimated_total, created_at
                )
            `)
            .eq('organization_id', organizationId)
            .order('period_month', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(r => pcToConsolidation(r, (r.procurement_consolidation_items ?? []) as any));
    },

    async generateQuotationFromConsolidation(
        consolidationId: string,
        organizationId: string,
        projectId: string,
        options?: { title?: string; deadline?: string },
    ): Promise<{ quotationId: string; quotationNumber: string }> {
        // Busca o grupo e seus itens
        const { data: pc, error } = await supabase
            .from('procurement_consolidations')
            .select('*, procurement_consolidation_items(*)')
            .eq('id', consolidationId)
            .single();
        if (error || !pc) throw new Error('Consolidação não encontrada.');

        const ciItems = (pc.procurement_consolidation_items ?? []) as Record<string, unknown>[];
        const totalQty   = ciItems.reduce((s, i) => s + Number(i.required_qty ?? 0), 0);
        const unitCost   = totalQty > 0 ? Number(pc.total_estimated ?? 0) / totalQty : 0;

        const deadline = options?.deadline ?? toIso(new Date(Date.now() + 7 * 86400000));
        const title    = options?.title
            ?? `Consolidação ${pc.input_description} — ${new Date(pc.period_month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;

        const qrItems = [{
            code:        pc.input_code ?? '',
            description: pc.input_description as string,
            unit:        pc.input_unit as string,
            quantity:    totalQty,
            unitPrice:   unitCost,
        }];

        const qr = await quotationService.createRequest({
            projectId,
            title,
            deadline,
            status: 'Aberta',
            items:  qrItems,
            invitedSupplierIds: [],
        });

        // Atualiza o grupo e os itens do plano
        await supabase
            .from('procurement_consolidations')
            .update({ status: 'quoted', generated_quotation_id: qr.id })
            .eq('id', consolidationId);

        const planItemIds = ciItems.map(i => i.plan_item_id as string);
        await supabase
            .from('procurement_plan_items')
            .update({ status: 'quoted', generated_quotation_id: qr.id })
            .in('id', planItemIds)
            .eq('organization_id', organizationId);

        return { quotationId: qr.id, quotationNumber: qr.number };
    },

    async generateOrderFromConsolidation(
        consolidationId: string,
        supplierId: string,
        organizationId: string,
        projectId: string,
        options?: { deliveryDate?: string; notes?: string },
    ): Promise<{ orderId: string; orderNumber: string }> {
        const { data: pc, error } = await supabase
            .from('procurement_consolidations')
            .select('*, procurement_consolidation_items(*)')
            .eq('id', consolidationId)
            .single();
        if (error || !pc) throw new Error('Consolidação não encontrada.');

        const ciItems = (pc.procurement_consolidation_items ?? []) as Record<string, unknown>[];
        const totalQty  = ciItems.reduce((s, i) => s + Number(i.required_qty ?? 0), 0);
        const unitCost  = totalQty > 0 ? Number(pc.total_estimated ?? 0) / totalQty : 0;
        const deliveryDate = options?.deliveryDate ?? toIso(new Date(Date.now() + 14 * 86400000));

        const order = await orderService.createOrder({
            projectId,
            supplierId,
            deliveryDate,
            status: 'Rascunho',
            notes:  options?.notes,
            items:  [{
                code:        pc.input_code ?? '',
                description: pc.input_description as string,
                unit:        pc.input_unit as string,
                quantity:    totalQty,
                unitPrice:   unitCost,
                total:       Number(pc.total_estimated ?? 0),
            }],
        });

        await supabase
            .from('procurement_consolidations')
            .update({ status: 'ordered', generated_order_id: order.id })
            .eq('id', consolidationId);

        const planItemIds = ciItems.map(i => i.plan_item_id as string);
        await supabase
            .from('procurement_plan_items')
            .update({ status: 'ordered', generated_order_id: order.id })
            .in('id', planItemIds)
            .eq('organization_id', organizationId);

        return { orderId: order.id, orderNumber: order.number ?? '' };
    },

    async cancelConsolidation(consolidationId: string): Promise<void> {
        const { error } = await supabase
            .from('procurement_consolidations')
            .update({ status: 'cancelled' })
            .eq('id', consolidationId);
        if (error) throw error;
    },
};
