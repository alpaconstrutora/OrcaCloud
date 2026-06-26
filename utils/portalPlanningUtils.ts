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

export interface PlanningView {
    progress: number;            // % geral
    start: Date | null;
    end: Date | null;
    daysRemaining: number | null;
    onSchedule: boolean | null;  // realizado >= planejado p/ hoje
    plannedToday: number;        // % planejado p/ hoje
    phases: PlanningPhase[];
    sCurve: SCurvePoint[];
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

const buildPhases = (planning: PortalPlanning, map: Map<string, PortalPlanningItem>): PlanningPhase[] => {
    const outline = planning.outline || [];
    const now = new Date();
    const phases: PlanningPhase[] = [];

    const addPhase = (node: PortalPlanningOutlineNode, groupName: string) => {
        const ids: string[] = [];
        collectItemIds(node, ids);
        let start: Date | null = null;
        let end: Date | null = null;
        let pctSum = 0, pctCount = 0;
        for (const id of ids) {
            const it = map.get(id);
            if (!it) continue;
            const s = parseDate(it.startDate);
            const e = parseDate(it.endDate);
            if (s && (!start || s < start)) start = s;
            if (e && (!end || e > end)) end = e;
            pctSum += Math.max(0, Math.min(100, it.manualRealPct ?? 0));
            pctCount++;
        }
        if (!start || !end) return;
        const progress = pctCount > 0 ? Math.round(pctSum / pctCount) : 0;
        const status: PhaseStatus =
            progress >= 100 || end < now ? (progress >= 100 ? 'concluida' : 'andamento')
            : start <= now ? 'andamento'
            : 'futura';
        phases.push({
            id: node.id,
            name: node.name.replace(/^[\d.]+\s+/, ''),
            groupName,
            start, end, progress, status,
        });
    };

    // Estrutura esperada: grupos → fases. Fallback: trata grupos como fases.
    for (const top of outline) {
        const childPhases = (top.children || []).filter(c => c.type === 'phase');
        if (childPhases.length > 0) {
            childPhases.forEach(ph => addPhase(ph, top.name.replace(/^[\d.]+\s+/, '')));
        } else {
            addPhase(top, top.name.replace(/^[\d.]+\s+/, ''));
        }
    }
    return phases.sort((a, b) => a.start.getTime() - b.start.getTime());
};

export const buildPlanningView = (planning: PortalPlanning): PlanningView => {
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

    const progress = Math.max(0, Math.min(100, Math.round(planning.progress ?? 0)));
    const now = new Date();

    // Curva S planejada: ~14 amostras entre start e end.
    const sCurve: SCurvePoint[] = [];
    let plannedToday = 0;
    if (start && end && end > start) {
        const total = end.getTime() - start.getTime();
        const steps = 14;
        const todayClamped = new Date(Math.min(Math.max(now.getTime(), start.getTime()), end.getTime()));
        plannedToday = Math.round(plannedAt(items, todayClamped));
        for (let i = 0; i <= steps; i++) {
            const at = new Date(start.getTime() + (total * i) / steps);
            sCurve.push({
                label: at.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                planned: Math.round(plannedAt(items, at)),
            });
        }
        // Injeta o ponto "hoje" com o realizado (progresso geral).
        const todayFrac = (todayClamped.getTime() - start.getTime()) / total;
        const idx = Math.round(todayFrac * steps);
        if (sCurve[idx]) {
            sCurve[idx] = { ...sCurve[idx], realized: progress };
        }
    }

    const daysRemaining = end ? Math.ceil((end.getTime() - now.getTime()) / dayMs) : null;
    const onSchedule = start && end ? progress >= plannedToday : null;

    return { progress, start, end, daysRemaining, onSchedule, plannedToday, phases, sCurve };
};
