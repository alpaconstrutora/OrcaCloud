// Cálculos client-side para a aba "Obra/Cronograma" do Portal do Cliente.
// Recebe o payload enxuto de fn_portal_get_planning (sem valores monetários) e
// deriva (1) a timeline de fases e (2) a Curva S física (planejado + ponto de hoje).
import type {
    PortalPlanning,
    PortalPlanningItem,
    PortalPlanningOutlineNode,
} from '../services/clientPortalService';

// Parse seguro de 'YYYY-MM-DD' evitando o bug de fuso (UTC-3 retrocede 1 dia).
const parseDate = (s?: string | null): Date | null => {
    if (!s) return null;
    const datePart = s.length > 10 ? s.slice(0, 10) : s;
    const d = new Date(`${datePart}T12:00:00`);
    return isNaN(d.getTime()) ? null : d;
};

const dayMs = 86400000;

// Mesma granularidade do seletor Dia/Sem/Mês do Planejamento interno (ScheduleHeader.tsx).
export type PlanningScale = 'day' | 'week' | 'month';

// Gera os pontos de amostragem da curva alinhados ao calendário (não mais um
// número fixo de amostras), igual ao timelineColumns do Gantt interno.
const MAX_CURVE_POINTS = 120;
const generatePeriods = (start: Date, end: Date, scale: PlanningScale): Date[] => {
    const points: Date[] = [];
    const cur = new Date(start);
    if (scale === 'week') {
        const day = cur.getDay();
        cur.setDate(cur.getDate() - day + (day === 0 ? -6 : 1));
    } else if (scale === 'month') {
        cur.setDate(1);
    }
    let count = 0;
    while (cur.getTime() <= end.getTime() && count++ < MAX_CURVE_POINTS) {
        points.push(new Date(cur));
        if (scale === 'day') cur.setDate(cur.getDate() + 1);
        else if (scale === 'week') cur.setDate(cur.getDate() + 7);
        else cur.setMonth(cur.getMonth() + 1);
    }
    if (points.length === 0 || points[points.length - 1].getTime() < end.getTime()) {
        points.push(new Date(end));
    }
    return points;
};

const formatPeriodLabel = (d: Date, scale: PlanningScale): string =>
    scale === 'month'
        ? d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

// Índice do período mais próximo de "hoje" (substitui o cálculo por fração fixa).
const closestPeriodIndex = (periods: Date[], at: Date): number => {
    let idx = 0, best = Infinity;
    periods.forEach((p, i) => {
        const diff = Math.abs(p.getTime() - at.getTime());
        if (diff < best) { best = diff; idx = i; }
    });
    return idx;
};

export type PhaseStatus = 'concluida' | 'andamento' | 'futura';

export interface PlanningPhase {
    id: string;
    name: string;
    groupName: string;
    start: Date;
    end: Date;
    progress: number; // 0-100
    status: PhaseStatus;
}

export interface SCurvePoint {
    label: string;       // 'MMM/AA'
    planned: number;     // 0-100 cumulativo
    realized?: number;   // só preenchido no ponto "hoje"
}

export interface SCurveMoneyPoint {
    label: string;       // 'MMM/AA'
    plannedValue: number;   // R$ acumulado planejado
    realizedValue?: number; // R$ acumulado realizado, só no ponto "hoje"
}

export interface FinancialView {
    totalPlanned: number;   // R$ total previsto (soma plannedValue)
    totalRealized: number;  // R$ realizado até hoje
    plannedTodayValue: number; // R$ previsto p/ hoje
    curve: SCurveMoneyPoint[];
}

export interface PlanningView {
    progress: number;            // % geral
    start: Date | null;
    end: Date | null;
    daysRemaining: number | null;
    onSchedule: boolean | null;  // realizado >= planejado p/ hoje
    plannedToday: number;        // % planejado p/ hoje
    phases: PlanningPhase[];
    sCurve: SCurvePoint[];
    financial?: FinancialView;
}

const itemMap = (items: PortalPlanningItem[]): Map<string, PortalPlanningItem> => {
    const m = new Map<string, PortalPlanningItem>();
    items.forEach(i => { if (i?.id) m.set(i.id, i); });
    return m;
};

// Coleta ids de nós tipo 'item' descendentes (folhas com custo/cronograma).
const collectItemIds = (node: PortalPlanningOutlineNode, acc: string[]): void => {
    if (node.type === 'item') acc.push(node.budgetItemId || node.id);
    node.children?.forEach(c => collectItemIds(c, acc));
};

// Fração planejada concluída de um item numa data (0-1) pelo tempo decorrido.
const itemFraction = (item: PortalPlanningItem, at: Date): number => {
    const s = parseDate(item.startDate);
    const e = parseDate(item.endDate);
    if (!s || !e) return 0;
    if (at <= s) return 0;
    if (at >= e) return 1;
    const span = e.getTime() - s.getTime();
    if (span <= 0) return 1;
    return (at.getTime() - s.getTime()) / span;
};

const plannedAt = (items: PortalPlanningItem[], at: Date): number => {
    let wSum = 0, wFrac = 0;
    for (const it of items) {
        const s = parseDate(it.startDate);
        const e = parseDate(it.endDate);
        if (!s || !e) continue;
        const w = Math.max((e.getTime() - s.getTime()) / dayMs, 1); // peso = duração em dias
        wSum += w;
        wFrac += w * itemFraction(it, at);
    }
    return wSum > 0 ? (wFrac / wSum) * 100 : 0;
};

const cleanLabel = (s: string) => s.replace(/^[\d.]+\s+/, '');

// R$ planejado acumulado até uma data (soma de plannedValue ponderado pela fração decorrida).
const plannedValueAt = (items: PortalPlanningItem[], at: Date): number => {
    let sum = 0;
    for (const it of items) {
        const v = it.plannedValue ?? 0;
        if (v <= 0) continue;
        sum += v * itemFraction(it, at);
    }
    return sum;
};

// R$ realizado por item: valor real medido, ou estimado pelo % de avanço manual sobre o previsto.
const realizedValue = (it: PortalPlanningItem): number => {
    if (typeof it.actualValue === 'number') return it.actualValue;
    const v = it.plannedValue ?? 0;
    const pct = Math.max(0, Math.min(100, it.manualRealPct ?? 0));
    return v * (pct / 100);
};

const buildFinancialCurve = (
    items: PortalPlanningItem[], start: Date, end: Date, now: Date, scale: PlanningScale,
): FinancialView | null => {
    const totalPlanned = items.reduce((s, it) => s + (it.plannedValue ?? 0), 0);
    if (totalPlanned <= 0 || end <= start) return null;

    const periods = generatePeriods(start, end, scale);
    const todayClamped = new Date(Math.min(Math.max(now.getTime(), start.getTime()), end.getTime()));
    const curve: SCurveMoneyPoint[] = periods.map(at => ({
        label: formatPeriodLabel(at, scale),
        plannedValue: Math.round(plannedValueAt(items, at) * 100) / 100,
    }));

    const totalRealized = items.reduce((s, it) => s + realizedValue(it), 0);
    const plannedTodayValue = plannedValueAt(items, todayClamped);
    const idx = closestPeriodIndex(periods, todayClamped);
    if (curve[idx]) {
        curve[idx] = { ...curve[idx], realizedValue: Math.round(totalRealized * 100) / 100 };
    }

    return {
        totalPlanned: Math.round(totalPlanned * 100) / 100,
        totalRealized: Math.round(totalRealized * 100) / 100,
        plannedTodayValue: Math.round(plannedTodayValue * 100) / 100,
        curve,
    };
};

// Calcula uma fase a partir de um conjunto de ids de itens.
const computePhase = (
    id: string, name: string, groupName: string,
    ids: string[], map: Map<string, PortalPlanningItem>, now: Date,
): PlanningPhase | null => {
    let start: Date | null = null;
    let end: Date | null = null;
    let pctSum = 0, pctCount = 0;
    for (const itId of ids) {
        const it = map.get(itId);
        if (!it) continue;
        const s = parseDate(it.startDate);
        const e = parseDate(it.endDate);
        if (s && (!start || s < start)) start = s;
        if (e && (!end || e > end)) end = e;
        pctSum += Math.max(0, Math.min(100, it.manualRealPct ?? 0));
        pctCount++;
    }
    if (!start || !end) return null;
    const progress = pctCount > 0 ? Math.round(pctSum / pctCount) : 0;
    const status: PhaseStatus =
        progress >= 100 ? 'concluida'
        : start <= now ? 'andamento'
        : 'futura';
    return { id, name: cleanLabel(name), groupName: cleanLabel(groupName), start, end, progress, status };
};

const buildPhases = (planning: PortalPlanning, map: Map<string, PortalPlanningItem>): PlanningPhase[] => {
    const now = new Date();
    const phases: PlanningPhase[] = [];

    // Fonte primária: budget (id → group/phase). outline costuma estar ausente.
    const budget = planning.budget || [];
    if (budget.length > 0) {
        // Agrupa ids por "group|phase" preservando a ordem de aparição.
        const buckets = new Map<string, { group: string; phase: string; ids: string[] }>();
        for (const b of budget) {
            if (!b?.id) continue;
            const group = b.group || 'Geral';
            const phase = b.phase || group;
            const key = `${group}|||${phase}`;
            if (!buckets.has(key)) buckets.set(key, { group, phase, ids: [] });
            buckets.get(key)!.ids.push(b.id);
        }
        let i = 0;
        for (const [, bk] of buckets) {
            const ph = computePhase(`bg-${i++}`, bk.phase, bk.group, bk.ids, map, now);
            if (ph) phases.push(ph);
        }
        return phases.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    // Fallback: hierarquia explícita (outline) quando presente.
    const outline = planning.outline || [];
    const addPhase = (node: PortalPlanningOutlineNode, groupName: string) => {
        const ids: string[] = [];
        collectItemIds(node, ids);
        const ph = computePhase(node.id, node.name, groupName, ids, map, now);
        if (ph) phases.push(ph);
    };
    for (const top of outline) {
        const childPhases = (top.children || []).filter(c => c.type === 'phase');
        if (childPhases.length > 0) {
            childPhases.forEach(ph => addPhase(ph, top.name));
        } else {
            addPhase(top, top.name);
        }
    }
    return phases.sort((a, b) => a.start.getTime() - b.start.getTime());
};

export const buildPlanningView = (planning: PortalPlanning, scale: PlanningScale = 'month'): PlanningView => {
    const items = planning.itemSchedules || [];
    const map = itemMap(items);
    const phases = buildPhases(planning, map);

    // Datas globais: do payload, ou min/max dos itens.
    let start = parseDate(planning.startDate);
    let end = parseDate(planning.endDate);
    if (!start || !end) {
        for (const it of items) {
            const s = parseDate(it.startDate);
            const e = parseDate(it.endDate);
            if (s && (!start || s < start)) start = s;
            if (e && (!end || e > end)) end = e;
        }
    }

    // Avanço geral REAL: média de manualRealPct ponderada por duração sobre os itens
    // de orçamento (não usa settings.obraProgress, que é um default fixo nunca recalculado).
    const progressIds = (planning.budget && planning.budget.length > 0)
        ? planning.budget.map(b => b.id)
        : items.map(i => i.id);
    let pSum = 0, pWeight = 0;
    for (const id of progressIds) {
        const it = map.get(id);
        if (!it) continue;
        const s = parseDate(it.startDate);
        const e = parseDate(it.endDate);
        const w = s && e ? Math.max((e.getTime() - s.getTime()) / dayMs, 1) : 1;
        pSum += Math.max(0, Math.min(100, it.manualRealPct ?? 0)) * w;
        pWeight += w;
    }
    const progress = pWeight > 0
        ? Math.round(pSum / pWeight)
        : Math.max(0, Math.min(100, Math.round(planning.progress ?? 0)));
    const now = new Date();

    // Curva S planejada: amostrada na mesma granularidade do seletor (dia/semana/mês).
    const sCurve: SCurvePoint[] = [];
    let plannedToday = 0;
    if (start && end && end > start) {
        const periods = generatePeriods(start, end, scale);
        const todayClamped = new Date(Math.min(Math.max(now.getTime(), start.getTime()), end.getTime()));
        plannedToday = Math.round(plannedAt(items, todayClamped));
        periods.forEach(at => {
            sCurve.push({
                label: formatPeriodLabel(at, scale),
                planned: Math.round(plannedAt(items, at)),
            });
        });
        // Injeta o ponto "hoje" com o realizado (progresso geral).
        const idx = closestPeriodIndex(periods, todayClamped);
        if (sCurve[idx]) {
            sCurve[idx] = { ...sCurve[idx], realized: progress };
        }
    }

    const daysRemaining = end ? Math.ceil((end.getTime() - now.getTime()) / dayMs) : null;
    const onSchedule = start && end ? progress >= plannedToday : null;

    // Curva financeira: só quando o servidor liberou valores (cliente Serviços).
    const financial = (planning.financialEnabled && start && end)
        ? buildFinancialCurve(items, start, end, now, scale) ?? undefined
        : undefined;

    return { progress, start, end, daysRemaining, onSchedule, plannedToday, phases, sCurve, financial };
};
