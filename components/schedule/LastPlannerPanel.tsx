import React, { useState, useEffect, useCallback } from 'react';
import {
    CalendarDays,
    CheckCircle2,
    XCircle,
    Clock,
    TrendingUp,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Loader2,
    RefreshCw,
    Plus,
    X,
} from 'lucide-react';
import { HierarchyNode, WeeklyCommitment, PpcWeek, ScheduleConstraint } from '../../types';
import {
    weeklyCommitmentsService,
    scheduleConstraintsService,
} from '../../services/scheduleConstraintsService';

// ─── Helpers ──────────────────────────────────────────────────

const FAILURE_REASONS = [
    'Falta de material',
    'Problema de equipamento',
    'Mão de obra insuficiente',
    'Chuva / intempérie',
    'Projeto não aprovado',
    'Dependência de outra atividade',
    'Outro',
];

function getMonday(d: Date): Date {
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const result = new Date(d);
    result.setUTCDate(result.getUTCDate() + diff);
    result.setUTCHours(0, 0, 0, 0);
    return result;
}

function isoDate(d: Date): string {
    return d.toISOString().split('T')[0];
}

function addWeeks(d: Date, n: number): Date {
    const r = new Date(d);
    r.setUTCDate(r.getUTCDate() + n * 7);
    return r;
}

function fmtWeek(iso: string): string {
    const [y, m, day] = iso.split('-').map(Number);
    const end = new Date(Date.UTC(y, m - 1, day + 6));
    return `${day.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')} – ${end.getUTCDate().toString().padStart(2, '0')}/${(end.getUTCMonth() + 1).toString().padStart(2, '0')}`;
}

function flattenLeafItems(nodes: HierarchyNode[]): HierarchyNode[] {
    const acc: HierarchyNode[] = [];
    const walk = (n: HierarchyNode) => {
        if (n.type === 'item') acc.push(n);
        (n.children || []).forEach(walk);
    };
    nodes.forEach(walk);
    return acc;
}

function itemsInWeek(items: HierarchyNode[], weekStart: string): HierarchyNode[] {
    const start = weekStart;
    const end = isoDate(addWeeks(new Date(weekStart + 'T00:00:00Z'), 1));
    return items.filter(item => {
        const s = item.earlyStart ?? item.schedule?.startDate;
        const e = item.earlyFinish ?? item.schedule?.endDate;
        if (!s || !e) return false;
        return s < end && e >= start;
    });
}

// ─── Types ────────────────────────────────────────────────────

interface Props {
    organizationId: string;
    projectId: string;
    hierarchy: HierarchyNode[];
}

// ─── Component ────────────────────────────────────────────────

export const LastPlannerPanel: React.FC<Props> = ({ organizationId, projectId, hierarchy }) => {
    const [tab, setTab] = useState<'lookahead' | 'weekly' | 'ppc'>('lookahead');
    const [lookaheadWeeks] = useState(5);
    const [currentWeekOffset, setCurrentWeekOffset] = useState(0); // offset for weekly tab
    const [commitments, setCommitments] = useState<WeeklyCommitment[]>([]);
    const [ppcData, setPpcData] = useState<PpcWeek[]>([]);
    const [constraints, setConstraints] = useState<ScheduleConstraint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<string | null>(null);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const thisMonday = getMonday(today);
    const selectedWeekStart = isoDate(addWeeks(thisMonday, currentWeekOffset));

    const leafItems = flattenLeafItems(hierarchy);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [cmts, ppc, ctrs] = await Promise.all([
                weeklyCommitmentsService.listByProject(organizationId, projectId),
                weeklyCommitmentsService.getPpc(organizationId, projectId),
                scheduleConstraintsService.listByProject(organizationId, projectId),
            ]);
            setCommitments(cmts);
            setPpcData(ppc);
            setConstraints(ctrs);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [organizationId, projectId]);

    useEffect(() => { load(); }, [load]);

    // Open constraints by item
    const openConstraintsByItem: Record<string, number> = {};
    constraints.filter(c => c.status === 'open').forEach(c => {
        openConstraintsByItem[c.scheduleItemId] = (openConstraintsByItem[c.scheduleItemId] ?? 0) + 1;
    });

    // Commitments for selected week
    const weekCommitments = commitments.filter(c => c.weekStart === selectedWeekStart);
    const commitmentByItem: Record<string, WeeklyCommitment> = {};
    weekCommitments.forEach(c => { commitmentByItem[c.scheduleItemId] = c; });

    const itemsThisWeek = itemsInWeek(leafItems, selectedWeekStart);

    const handleToggleCommitment = async (item: HierarchyNode, checked: boolean) => {
        const existing = commitmentByItem[item.id];
        setSaving(item.id);
        try {
            await weeklyCommitmentsService.upsert(organizationId, projectId, {
                scheduleItemId: item.id,
                weekStart: selectedWeekStart,
                isComplete: existing?.isComplete ?? null ?? undefined,
                plannedQty: existing?.plannedQty,
                doneQty: existing?.doneQty,
                failureReason: existing?.failureReason,
                notes: existing?.notes,
                ...(checked ? {} : { isComplete: undefined }),
            });
            // If adding for first time (commit = "planned"), no isComplete yet
            if (!existing) {
                await weeklyCommitmentsService.upsert(organizationId, projectId, {
                    scheduleItemId: item.id,
                    weekStart: selectedWeekStart,
                });
            } else if (!checked) {
                await weeklyCommitmentsService.delete(existing.id);
            }
            await load();
        } finally {
            setSaving(null);
        }
    };

    const handleMarkComplete = async (item: HierarchyNode, isComplete: boolean, failureReason?: string) => {
        setSaving(item.id);
        try {
            await weeklyCommitmentsService.upsert(organizationId, projectId, {
                scheduleItemId: item.id,
                weekStart: selectedWeekStart,
                isComplete,
                failureReason: isComplete ? undefined : failureReason,
            });
            await load();
        } finally {
            setSaving(null);
        }
    };

    // PPC acumulado
    const totalPlanned = ppcData.reduce((s, w) => s + w.plannedCount, 0);
    const totalCompleted = ppcData.reduce((s, w) => s + w.completedCount, 0);
    const ppcGlobal = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : null;
    const lastPpc = ppcData.length > 0 ? ppcData[ppcData.length - 1].ppc : null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-indigo-500" />
                    <h2 className="text-sm font-bold text-gray-800">Last Planner / PPC</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={load} className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                    <div className="text-2xl font-black text-indigo-700">{ppcGlobal !== null ? `${ppcGlobal}%` : '—'}</div>
                    <div className="text-[11px] font-medium text-gray-500 mt-0.5">PPC acumulado</div>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                    <div className="text-2xl font-black text-blue-700">{lastPpc !== null ? `${lastPpc}%` : '—'}</div>
                    <div className="text-[11px] font-medium text-gray-500 mt-0.5">PPC última semana</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <div className="text-2xl font-black text-amber-700">
                        {Object.keys(openConstraintsByItem).length}
                    </div>
                    <div className="text-[11px] font-medium text-gray-500 mt-0.5">Atividades bloqueadas</div>
                </div>
            </div>

            {/* Tab switcher */}
            <div className="flex bg-gray-100/80 p-0.5 rounded-lg border border-gray-200/60 w-fit">
                {([
                    { key: 'lookahead', label: 'Lookahead (4–6 sem.)' },
                    { key: 'weekly', label: 'Semanal' },
                    { key: 'ppc', label: 'Gráfico PPC' },
                ] as const).map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`px-3 py-1.5 rounded-md text-button font-semibold transition-all ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="flex items-center gap-2 text-button text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {loading && commitments.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Carregando…</span>
                </div>
            ) : (
                <>
                    {/* ── LOOKAHEAD ── */}
                    {tab === 'lookahead' && (
                        <LookaheadView
                            thisMonday={thisMonday}
                            weeksCount={lookaheadWeeks}
                            leafItems={leafItems}
                            openConstraintsByItem={openConstraintsByItem}
                        />
                    )}

                    {/* ── WEEKLY ── */}
                    {tab === 'weekly' && (
                        <WeeklyView
                            weekOffset={currentWeekOffset}
                            setWeekOffset={setCurrentWeekOffset}
                            selectedWeekStart={selectedWeekStart}
                            itemsThisWeek={itemsThisWeek}
                            commitmentByItem={commitmentByItem}
                            openConstraintsByItem={openConstraintsByItem}
                            saving={saving}
                            onToggleCommitment={handleToggleCommitment}
                            onMarkComplete={handleMarkComplete}
                        />
                    )}

                    {/* ── PPC CHART ── */}
                    {tab === 'ppc' && (
                        <PpcChart ppcData={ppcData} />
                    )}
                </>
            )}
        </div>
    );
};

// ─── LookaheadView ────────────────────────────────────────────

const LookaheadView: React.FC<{
    thisMonday: Date;
    weeksCount: number;
    leafItems: HierarchyNode[];
    openConstraintsByItem: Record<string, number>;
}> = ({ thisMonday, weeksCount, leafItems, openConstraintsByItem }) => {
    const weeks = Array.from({ length: weeksCount }, (_, i) => isoDate(addWeeks(thisMonday, i)));

    return (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left px-4 py-3 font-bold text-gray-600 w-64 sticky left-0 bg-gray-50">Atividade</th>
                            {weeks.map((w, i) => (
                                <th key={w} className={`text-center px-3 py-3 font-bold min-w-[120px] ${i === 0 ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-500'}`}>
                                    {i === 0 ? 'Esta semana' : `+${i} sem`}
                                    <div className="font-normal text-[10px] opacity-70">{fmtWeek(w)}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {leafItems
                            .filter(item => weeks.some(w => itemsInWeek([item], w).length > 0))
                            .map(item => {
                                const hasConstraint = (openConstraintsByItem[item.id] ?? 0) > 0;
                                return (
                                    <tr key={item.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-2.5 sticky left-0 bg-white hover:bg-gray-50/50">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-800 truncate max-w-[220px]">{item.name}</span>
                                                {hasConstraint && (
                                                    <span className="shrink-0 flex items-center gap-0.5 text-[9px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full">
                                                        <AlertTriangle className="w-2.5 h-2.5" />
                                                        {openConstraintsByItem[item.id]}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        {weeks.map((w, i) => {
                                            const inWeek = itemsInWeek([item], w).length > 0;
                                            return (
                                                <td key={w} className="px-3 py-2.5 text-center">
                                                    {inWeek && (
                                                        <div className={`mx-auto h-5 rounded-md text-[10px] flex items-center justify-center font-bold ${
                                                            hasConstraint
                                                                ? 'bg-red-100 text-red-600'
                                                                : i === 0
                                                                    ? 'bg-indigo-100 text-indigo-700'
                                                                    : 'bg-blue-50 text-blue-600'
                                                        }`}>
                                                            {hasConstraint ? '🔴' : '●'}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        {leafItems.filter(item => weeks.some(w => itemsInWeek([item], w).length > 0)).length === 0 && (
                            <tr>
                                <td colSpan={weeksCount + 1} className="px-4 py-10 text-center text-gray-400 text-[11px]">
                                    Nenhuma atividade programada para as próximas {weeksCount} semanas.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-100 inline-block" /> Esta semana</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-50 inline-block" /> Lookahead</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-100 inline-block" /> Com restrição</span>
            </div>
        </div>
    );
};

// ─── WeeklyView ───────────────────────────────────────────────

const WeeklyView: React.FC<{
    weekOffset: number;
    setWeekOffset: (n: number) => void;
    selectedWeekStart: string;
    itemsThisWeek: HierarchyNode[];
    commitmentByItem: Record<string, WeeklyCommitment>;
    openConstraintsByItem: Record<string, number>;
    saving: string | null;
    onToggleCommitment: (item: HierarchyNode, checked: boolean) => void;
    onMarkComplete: (item: HierarchyNode, isComplete: boolean, failureReason?: string) => void;
}> = ({
    weekOffset, setWeekOffset, selectedWeekStart, itemsThisWeek,
    commitmentByItem, openConstraintsByItem, saving,
    onToggleCommitment, onMarkComplete,
}) => {
    const [failureModal, setFailureModal] = useState<{ item: HierarchyNode } | null>(null);
    const [failureReason, setFailureReason] = useState('');

    const committed = itemsThisWeek.filter(i => commitmentByItem[i.id]);
    const completedCount = committed.filter(i => commitmentByItem[i.id]?.isComplete === true).length;
    const ppc = committed.length > 0 ? Math.round((completedCount / committed.length) * 100) : null;
    const isPast = weekOffset < 0;

    return (
        <div className="space-y-4">
            {/* Week navigation */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setWeekOffset(weekOffset - 1)}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 text-center">
                    <div className="text-sm font-bold text-gray-800">
                        {weekOffset === 0 ? 'Esta semana' : weekOffset === 1 ? 'Próxima semana' : weekOffset === -1 ? 'Semana passada' : weekOffset > 0 ? `+${weekOffset} semanas` : `${Math.abs(weekOffset)} semanas atrás`}
                    </div>
                    <div className="text-[11px] text-gray-400">{fmtWeek(selectedWeekStart)}</div>
                </div>
                <button
                    onClick={() => setWeekOffset(weekOffset + 1)}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
                {weekOffset !== 0 && (
                    <button
                        onClick={() => setWeekOffset(0)}
                        className="text-[11px] text-indigo-600 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50 transition-all"
                    >
                        Hoje
                    </button>
                )}
            </div>

            {/* PPC badge */}
            {committed.length > 0 && (
                <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
                    <TrendingUp className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div className="text-xs font-bold text-indigo-700">
                        PPC semana: {ppc !== null ? `${ppc}%` : '—'}
                    </div>
                    <div className="text-[11px] text-indigo-500 ml-auto">
                        {completedCount}/{committed.length} compromissos cumpridos
                    </div>
                </div>
            )}

            {/* Items table */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">
                        Atividades da semana ({itemsThisWeek.length})
                    </span>
                    {isPast && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">Semana passada — apontamento permitido</span>
                    )}
                </div>

                {itemsThisWeek.length === 0 ? (
                    <div className="px-4 py-10 text-center text-[11px] text-gray-400">
                        Nenhuma atividade programada para esta semana.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {itemsThisWeek.map(item => {
                            const cmt = commitmentByItem[item.id];
                            const hasConstraint = (openConstraintsByItem[item.id] ?? 0) > 0;
                            const isLoading = saving === item.id;

                            return (
                                <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 group">
                                    {/* Checkbox "comprometido" */}
                                    <input
                                        type="checkbox"
                                        checked={!!cmt}
                                        onChange={e => onToggleCommitment(item, e.target.checked)}
                                        disabled={isLoading}
                                        className="w-4 h-4 rounded accent-indigo-600 shrink-0 cursor-pointer"
                                        title="Marcar como comprometida para a semana"
                                    />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-gray-800 truncate">{item.name}</span>
                                            {hasConstraint && (
                                                <span className="shrink-0 flex items-center gap-0.5 text-[9px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full">
                                                    <AlertTriangle className="w-2.5 h-2.5" />
                                                    {openConstraintsByItem[item.id]} restrição(ões)
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-gray-400 flex items-center gap-2 mt-0.5">
                                            <Clock className="w-3 h-3" />
                                            <span>{item.earlyStart ?? item.schedule?.startDate ?? '—'} → {item.earlyFinish ?? item.schedule?.endDate ?? '—'}</span>
                                        </div>
                                        {cmt?.failureReason && (
                                            <div className="text-[10px] text-red-500 flex items-center gap-1 mt-0.5">
                                                <XCircle className="w-3 h-3" />
                                                {cmt.failureReason}
                                            </div>
                                        )}
                                    </div>

                                    {/* Done / Not done buttons — only when committed */}
                                    {cmt && (
                                        <div className="flex items-center gap-1 shrink-0">
                                            {isLoading ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => onMarkComplete(item, true)}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${cmt.isComplete === true ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400 hover:bg-emerald-50 hover:text-emerald-600'}`}
                                                        title="Concluído"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        {cmt.isComplete === true ? 'Concluído' : 'Concluir'}
                                                    </button>
                                                    <button
                                                        onClick={() => { setFailureModal({ item }); setFailureReason(cmt.failureReason ?? ''); }}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${cmt.isComplete === false ? 'bg-red-100 text-red-700' : 'text-gray-400 hover:bg-red-50 hover:text-red-600'}`}
                                                        title="Não concluído"
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" />
                                                        {cmt.isComplete === false ? 'Não cumprido' : 'Não cumpriu'}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Failure reason modal */}
            {failureModal && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-96 p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-800">Motivo de não cumprimento</h3>
                            <button onClick={() => setFailureModal(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{failureModal.item.name}</p>
                        <div className="space-y-2">
                            {FAILURE_REASONS.map(r => (
                                <button
                                    key={r}
                                    onClick={() => setFailureReason(r)}
                                    className={`w-full text-left text-button px-3 py-2 rounded-lg border transition-all font-medium ${failureReason === r ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    {r}
                                </button>
                            ))}
                            <input
                                type="text"
                                value={failureReason}
                                onChange={e => setFailureReason(e.target.value)}
                                placeholder="Ou descreva o motivo…"
                                className="w-full text-button border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button onClick={() => setFailureModal(null)} className="px-3 py-1.5 text-button font-medium text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
                            <button
                                onClick={async () => {
                                    await onMarkComplete(failureModal.item, false, failureReason || 'Outro');
                                    setFailureModal(null);
                                }}
                                disabled={!failureReason.trim()}
                                className="px-3 py-1.5 bg-red-600 text-white text-button font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all"
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── PpcChart ─────────────────────────────────────────────────

const PpcChart: React.FC<{ ppcData: PpcWeek[] }> = ({ ppcData }) => {
    if (ppcData.length === 0) {
        return (
            <div className="bg-white border border-gray-100 rounded-xl px-4 py-12 text-center text-[11px] text-gray-400">
                Nenhum dado de PPC registrado ainda. Comece a apontar compromissos na aba Semanal.
            </div>
        );
    }

    const maxPpc = 100;
    const recent = ppcData.slice(-12); // last 12 weeks

    // Failure reason Pareto
    const allFailures: Record<string, number> = {};
    // (built from commitments data — simplified for now)

    return (
        <div className="space-y-4">
            {/* Bar chart */}
            <div className="bg-white border border-gray-100 rounded-xl p-4">
                <h3 className="text-xs font-bold text-gray-700 mb-4">PPC Semanal (%)</h3>
                <div className="flex items-end gap-2 h-40">
                    {recent.map(w => {
                        const pct = w.ppc ?? 0;
                        const height = `${(pct / maxPpc) * 100}%`;
                        const color = pct >= 80 ? 'bg-emerald-400' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400';
                        return (
                            <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1">
                                <span className="text-[9px] font-bold text-gray-600">{pct !== null ? `${pct}%` : '—'}</span>
                                <div className="w-full flex items-end justify-center" style={{ height: 100 }}>
                                    <div
                                        className={`w-full rounded-t-sm transition-all ${color}`}
                                        style={{ height }}
                                        title={`${fmtWeek(w.weekStart)}: ${pct}%`}
                                    />
                                </div>
                                <span className="text-[8px] text-gray-400 text-center leading-tight">
                                    {w.weekStart.split('-').slice(1).join('/')}
                                </span>
                            </div>
                        );
                    })}
                </div>
                {/* Meta line */}
                <div className="flex items-center gap-3 mt-3 text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-400 inline-block" /> ≥ 80%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-amber-400 inline-block" /> 60–79%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-400 inline-block" /> &lt; 60%</span>
                </div>
            </div>

            {/* Summary table */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="text-left px-4 py-2.5 font-bold text-gray-600">Semana</th>
                            <th className="text-center px-4 py-2.5 font-bold text-gray-600">Planejados</th>
                            <th className="text-center px-4 py-2.5 font-bold text-gray-600">Cumpridos</th>
                            <th className="text-center px-4 py-2.5 font-bold text-gray-600">PPC</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...ppcData].reverse().map(w => (
                            <tr key={w.weekStart} className="hover:bg-gray-50/50">
                                <td className="px-4 py-2 text-gray-700">{fmtWeek(w.weekStart)}</td>
                                <td className="px-4 py-2 text-center text-gray-600">{w.plannedCount}</td>
                                <td className="px-4 py-2 text-center text-emerald-600 font-bold">{w.completedCount}</td>
                                <td className="px-4 py-2 text-center">
                                    <span className={`font-black ${(w.ppc ?? 0) >= 80 ? 'text-emerald-600' : (w.ppc ?? 0) >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                                        {w.ppc !== null ? `${w.ppc}%` : '—'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
