import React, { useState } from 'react';
import {
    FlaskConical,
    Trash2,
    CheckCircle2,
    Clock,
    DollarSign,
    GitBranch,
    ArrowRight,
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Minus,
} from 'lucide-react';
import { ScheduleScenario, ProjectSchedule } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────

const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

function daysBetween(a: string, b: string): number {
    return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}

function scenarioEndDate(s: ScheduleScenario): string {
    return s.result.endDate;
}

// ─── Props ────────────────────────────────────────────────────

interface Props {
    schedule: ProjectSchedule;
    onApplyScenario: (scenario: ScheduleScenario) => void;
    onDeleteScenario: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────

export const ScenariosPanel: React.FC<Props> = ({ schedule, onApplyScenario, onDeleteScenario }) => {
    const [confirmApply, setConfirmApply] = useState<ScheduleScenario | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const scenarios = schedule.scenarios ?? [];

    // Current schedule stats (base)
    const baseEndDate = schedule.itemSchedules?.reduce((max, s) => {
        if (!s.endDate) return max;
        return !max || s.endDate > max ? s.endDate : max;
    }, '') ?? schedule.endDate ?? '';

    const baseCost = schedule.itemSchedules?.reduce((sum, s) => sum + (s.plannedValue ?? 0), 0) ?? 0;
    const baseCriticalCount = schedule.itemSchedules?.filter(s => s.isCritical).length ?? 0;

    const toggleSelect = (id: string) =>
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else { if (next.size < 3) next.add(id); }
            return next;
        });

    const displayScenarios = selected.size > 0
        ? scenarios.filter(s => selected.has(s.id))
        : scenarios.slice(0, 3);

    if (scenarios.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center">
                    <FlaskConical className="w-8 h-8 text-purple-500" />
                </div>
                <div>
                    <p className="text-sm font-bold text-gray-700">Nenhum cenário salvo</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-xs">
                        Ative o Modo What-If (···), ajuste as datas arrastando no Gantt, e clique em
                        <strong> "Salvar como Cenário"</strong> para comparar alternativas.
                    </p>
                </div>
                <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-xl px-4 py-2.5 text-xs text-purple-700 font-medium">
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    Menu ··· → Modo What-If → arraste → Salvar como Cenário
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-purple-500" />
                    <h2 className="text-sm font-bold text-gray-800">Cenários salvos</h2>
                    <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                        {scenarios.length}
                    </span>
                </div>
                {scenarios.length > 1 && (
                    <p className="text-xs text-gray-400">
                        {selected.size > 0
                            ? `${selected.size} selecionados para comparar`
                            : 'Clique nos cenários para selecionar até 3 para comparar'}
                    </p>
                )}
            </div>

            {/* Comparison table */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-4 py-3 font-bold text-gray-500 w-48 sticky left-0 bg-gray-50">Métrica</th>

                                {/* Base column */}
                                <th className="text-center px-4 py-3 min-w-[160px]">
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-xs font-black text-gray-400 uppercase tracking-wide">Planejamento Atual</span>
                                        <span className="text-xs text-gray-400">{fmtDate(baseEndDate)}</span>
                                    </div>
                                </th>

                                {/* Scenario columns */}
                                {displayScenarios.map(s => (
                                    <th
                                        key={s.id}
                                        className={`text-center px-4 py-3 min-w-[160px] cursor-pointer transition-colors ${selected.has(s.id) ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                                        onClick={() => toggleSelect(s.id)}
                                    >
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-1.5">
                                                {selected.has(s.id) && <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />}
                                                <span className={`text-xs font-black ${selected.has(s.id) ? 'text-purple-700' : 'text-gray-700'}`}>
                                                    {s.name}
                                                </span>
                                            </div>
                                            <span className="text-xs text-gray-400">
                                                {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                                            </span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-50">
                            {/* Término */}
                            <MetricRow
                                icon={<Clock className="w-3.5 h-3.5 text-gray-400" />}
                                label="Término"
                                base={<span className="font-bold text-gray-700">{fmtDate(baseEndDate)}</span>}
                                scenarios={displayScenarios}
                                render={s => {
                                    const delta = baseEndDate ? daysBetween(baseEndDate, scenarioEndDate(s)) : 0;
                                    return (
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className="font-bold text-gray-700">{fmtDate(scenarioEndDate(s))}</span>
                                            <DeltaBadge days={delta} />
                                        </div>
                                    );
                                }}
                            />

                            {/* Duração */}
                            <MetricRow
                                icon={<GitBranch className="w-3.5 h-3.5 text-gray-400" />}
                                label="Duração (dias)"
                                base={
                                    <span className="font-bold text-gray-700">
                                        {baseEndDate && schedule.startDate ? daysBetween(schedule.startDate, baseEndDate) : '—'}
                                    </span>
                                }
                                scenarios={displayScenarios}
                                render={s => {
                                    const dur = s.result.durationDays;
                                    const baseDur = baseEndDate && schedule.startDate ? daysBetween(schedule.startDate, baseEndDate) : 0;
                                    const delta = baseDur ? dur - baseDur : 0;
                                    return (
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className="font-bold text-gray-700">{dur}</span>
                                            {!!delta && <DeltaBadge days={delta} />}
                                        </div>
                                    );
                                }}
                            />

                            {/* Custo planejado */}
                            <MetricRow
                                icon={<DollarSign className="w-3.5 h-3.5 text-gray-400" />}
                                label="Custo planejado"
                                base={<span className="font-bold text-gray-700">{fmtCurrency(baseCost)}</span>}
                                scenarios={displayScenarios}
                                render={s => {
                                    const delta = baseCost ? s.result.totalCost - baseCost : 0;
                                    return (
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className="font-bold text-gray-700">{fmtCurrency(s.result.totalCost)}</span>
                                            {!!delta && (
                                                <span className={`text-xs font-bold ${delta > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {delta > 0 ? '+' : ''}{fmtCurrency(delta)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                }}
                            />

                            {/* Caminho crítico */}
                            <MetricRow
                                icon={<AlertTriangle className="w-3.5 h-3.5 text-gray-400" />}
                                label="Atividades críticas"
                                base={<span className="font-bold text-gray-700">{baseCriticalCount}</span>}
                                scenarios={displayScenarios}
                                render={s => {
                                    const n = s.result.criticalPathIds.length;
                                    const delta = n - baseCriticalCount;
                                    return (
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className="font-bold text-gray-700">{n}</span>
                                            {!!delta && (
                                                <span className={`text-xs font-bold ${delta > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                    {delta > 0 ? `+${delta}` : delta}
                                                </span>
                                            )}
                                        </div>
                                    );
                                }}
                            />

                            {/* Actions row */}
                            <tr>
                                <td className="px-4 py-3 sticky left-0 bg-white" />
                                <td className="px-4 py-3 text-center">
                                    <span className="text-xs text-gray-400 italic">planejamento atual</span>
                                </td>
                                {displayScenarios.map(s => (
                                    <td key={s.id} className="px-4 py-3 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <button
                                                onClick={() => setConfirmApply(s)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Aplicar cenário
                                            </button>
                                            <button
                                                onClick={() => setConfirmDelete(s.id)}
                                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                                Excluir
                                            </button>
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Scenario cards (all) */}
            {scenarios.length > 3 && (
                <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Todos os cenários</p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        {scenarios.map(s => (
                            <div
                                key={s.id}
                                onClick={() => toggleSelect(s.id)}
                                className={`border rounded-xl p-3 cursor-pointer transition-all ${selected.has(s.id) ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs font-bold text-gray-800 truncate">{s.name}</p>
                                    {selected.has(s.id) && <CheckCircle2 className="w-4 h-4 text-purple-500 shrink-0" />}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">{new Date(s.createdAt).toLocaleDateString('pt-BR')}</p>
                                <p className="text-xs font-semibold text-gray-700 mt-1">{fmtDate(s.result.endDate)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Confirm apply modal */}
            {confirmApply && (
                <ConfirmModal
                    title="Aplicar cenário"
                    message={`O planejamento atual será substituído pelo cenário "${confirmApply.name}". Esta ação não pode ser desfeita automaticamente (salve um baseline antes se necessário).`}
                    confirmLabel="Aplicar"
                    confirmClass="bg-purple-600 hover:bg-purple-700 text-white"
                    onConfirm={() => { onApplyScenario(confirmApply); setConfirmApply(null); }}
                    onCancel={() => setConfirmApply(null)}
                />
            )}

            {/* Confirm delete modal */}
            {confirmDelete && (
                <ConfirmModal
                    title="Excluir cenário"
                    message="Tem certeza que deseja excluir este cenário? Os dados não poderão ser recuperados."
                    confirmLabel="Excluir"
                    confirmClass="bg-red-600 hover:bg-red-700 text-white"
                    onConfirm={() => { onDeleteScenario(confirmDelete); setConfirmDelete(null); }}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}
        </div>
    );
};

// ─── Sub-components ───────────────────────────────────────────

const MetricRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    base: React.ReactNode;
    scenarios: ScheduleScenario[];
    render: (s: ScheduleScenario) => React.ReactNode;
}> = ({ icon, label, base, scenarios, render }) => (
    <tr className="hover:bg-gray-50/50">
        <td className="px-4 py-3 sticky left-0 bg-white hover:bg-gray-50/50">
            <div className="flex items-center gap-2 text-gray-600">
                {icon}
                <span className="font-semibold">{label}</span>
            </div>
        </td>
        <td className="px-4 py-3 text-center text-gray-700">{base}</td>
        {scenarios.map(s => (
            <td key={s.id} className="px-4 py-3 text-center">{render(s)}</td>
        ))}
    </tr>
);

const DeltaBadge: React.FC<{ days: number }> = ({ days }) => {
    if (!days) return <span className="text-xs text-gray-400">sem impacto</span>;
    if (days > 0) return (
        <span className="text-xs font-bold text-red-600 flex items-center gap-0.5">
            <TrendingUp className="w-3 h-3" />
            +{days}d
        </span>
    );
    return (
        <span className="text-xs font-bold text-emerald-600 flex items-center gap-0.5">
            <TrendingDown className="w-3 h-3" />
            {days}d
        </span>
    );
};

const ConfirmModal: React.FC<{
    title: string;
    message: string;
    confirmLabel: string;
    confirmClass: string;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-96 p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <h3 className="text-sm font-bold text-gray-800">{title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{message}</p>
            <div className="flex justify-end gap-2 pt-1">
                <button onClick={onCancel} className="px-4 py-2 text-button font-medium text-gray-500 hover:bg-gray-100 rounded-lg">
                    Cancelar
                </button>
                <button onClick={onConfirm} className={`px-4 py-2 text-table-body font-bold rounded-lg transition-all ${confirmClass}`}>
                    {confirmLabel}
                </button>
            </div>
        </div>
    </div>
);
