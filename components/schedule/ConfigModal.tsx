import React from 'react';
import { X, Clock, Eye, CalendarOff, Plus, Download } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { ProjectSchedule, ReplanMode } from '../../types';
import { getBrazilianHolidays } from '../../utils/brazilianHolidays';
// ProjectSchedule is used for the workSchedule type helper below

interface ConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    schedule: ProjectSchedule;
    onUpdate: (updates: Partial<ProjectSchedule>) => void;
    showGanttFloat?: boolean;
    onToggleGanttFloat?: (value: boolean) => void;
}

const WEEK_DAYS = [
    { value: 0, short: 'Dom' },
    { value: 1, short: 'Seg' },
    { value: 2, short: 'Ter' },
    { value: 3, short: 'Qua' },
    { value: 4, short: 'Qui' },
    { value: 5, short: 'Sex' },
    { value: 6, short: 'Sáb' },
];

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_HOURS_PER_DAY = 8;

function totalWeekHours(workDays: number[], hoursPerDay: number, dayHours?: Record<number, number>): number {
    return workDays.reduce((sum, d) => sum + (dayHours?.[d] ?? hoursPerDay), 0);
}

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose, schedule, onUpdate, showGanttFloat = true, onToggleGanttFloat }) => {
    const [activeTab, setActiveTab] = React.useState<'geral' | 'exibicao'>('geral');
    const [newHoliday, setNewHoliday] = React.useState('');
    const [importYear, setImportYear] = React.useState(new Date().getFullYear());
    if (!isOpen) return null;

    const holidays = schedule.holidays ?? [];

    const addHoliday = (date: string) => {
        if (!date || holidays.includes(date)) return;
        onUpdate({ holidays: [...holidays, date].sort() });
    };

    const removeHoliday = (date: string) => {
        onUpdate({ holidays: holidays.filter(h => h !== date) });
    };

    const importBrazilianHolidays = (year: number) => {
        const merged = new Set(holidays);
        getBrazilianHolidays(year).forEach(h => merged.add(h.date));
        onUpdate({ holidays: Array.from(merged).sort() });
    };

    const workDays = schedule.workSchedule?.workDays ?? DEFAULT_WORK_DAYS;
    const hoursPerDay = schedule.workSchedule?.hoursPerDay ?? DEFAULT_HOURS_PER_DAY;
    const dayHours = schedule.workSchedule?.dayHours ?? {};

    const getHoursForDay = (day: number) => dayHours[day] ?? hoursPerDay;

    const update = (patch: Partial<NonNullable<ProjectSchedule['workSchedule']>>) =>
        onUpdate({ workSchedule: { hoursPerDay, workDays, dayHours, ...patch } });

    const toggleDay = (day: number) => {
        const next = workDays.includes(day)
            ? workDays.filter(d => d !== day)
            : [...workDays, day].sort((a, b) => a - b);
        if (next.length === 0) return;
        update({ workDays: next });
    };

    const setDefaultHours = (val: number) => {
        const clamped = Math.max(1, Math.min(24, val));
        update({ hoursPerDay: clamped });
    };

    const setDayHours = (day: number, val: number) => {
        const clamped = Math.max(1, Math.min(24, val));
        const next = { ...dayHours, [day]: clamped };
        update({ dayHours: next });
    };

    const weeklyTotal = totalWeekHours(workDays, hoursPerDay, dayHours);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-[10px] shadow-xl w-full max-w-lg overflow-hidden flex flex-col border animate-in fade-in zoom-in duration-200 border-gray-200">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-black text-slate-800 text-lg">Definições do Cronograma</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-[6px] text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-3 pb-0">
                    <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 w-fit">
                        {([
                            { id: 'geral' as const, label: 'Geral' },
                            { id: 'exibicao' as const, label: 'Exibição' },
                        ]).map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">

                    {activeTab === 'exibicao' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Eye className="w-4 h-4 text-blue-500" />
                                <span className="text-sm font-semibold text-gray-700">Gantt</span>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-bold text-gray-700">Folga (slack) nas barras</span>
                                    <p className="text-xs text-gray-400">Mostra a caixa tracejada âmbar após o fim da barra, indicando quantos dias a tarefa pode atrasar sem virar caminho crítico</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={showGanttFloat}
                                        onChange={(e) => onToggleGanttFloat?.(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none ring-4 ring-blue-500/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                        </div>
                    )}

                    {activeTab === 'geral' && (
                    <>
                    {/* ── Jornada de Trabalho ── */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-semibold text-gray-700">Jornada de Trabalho</span>
                        </div>

                        {/* Presets rápidos */}
                        <div className="space-y-1.5">
                            <span className="text-xs font-bold text-gray-500">Ajuste rápido</span>
                            <div className="flex gap-2">
                                {[
                                    { label: '5×8h', days: [1,2,3,4,5], hours: 8 },
                                    { label: '5×9h', days: [1,2,3,4,5], hours: 9 },
                                    { label: '6×8h', days: [1,2,3,4,5,6], hours: 8 },
                                    { label: '7×8h', days: [0,1,2,3,4,5,6], hours: 8 },
                                ].map(preset => {
                                    const active = JSON.stringify(workDays) === JSON.stringify(preset.days)
                                        && hoursPerDay === preset.hours
                                        && Object.keys(dayHours).length === 0;
                                    return (
                                        <button
                                            key={preset.label}
                                            onClick={() => onUpdate({ workSchedule: { hoursPerDay: preset.hours, workDays: preset.days, dayHours: {} } })}
                                            className={`flex-1 py-1.5 rounded-[6px] text-xs font-bold border transition-all ${
                                                active ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Dias + horas individuais */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-700">Dias e horas por dia</span>
                                <span className="text-xs font-bold text-blue-600">{weeklyTotal}h semanais</span>
                            </div>

                            <div className="grid grid-cols-7 gap-1.5">
                                {WEEK_DAYS.map(({ value, short }) => {
                                    const active = workDays.includes(value);
                                    const isWeekend = value === 0 || value === 6;
                                    const h = getHoursForDay(value);
                                    const isCustom = dayHours[value] !== undefined;

                                    return (
                                        <div key={value} className="flex flex-col items-center gap-1">
                                            {/* Toggle do dia */}
                                            <button
                                                onClick={() => toggleDay(value)}
                                                className={`w-full py-1.5 rounded-[6px] text-xs font-black transition-all border-2 ${
                                                    active
                                                        ? isWeekend
                                                            ? 'bg-amber-500 border-amber-500 text-white'
                                                            : 'bg-blue-600 border-blue-600 text-white'
                                                        : 'bg-white border-gray-200 text-gray-300 hover:border-gray-300 hover:text-gray-400'
                                                }`}
                                            >
                                                {short}
                                            </button>

                                            {/* Input de horas — só aparece se o dia está ativo */}
                                            {active && (
                                                <div className="w-full flex items-center justify-center relative">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={24}
                                                        value={h}
                                                        onChange={(e) => setDayHours(value, Number(e.target.value))}
                                                        className={`w-full text-center text-xs font-bold border rounded-[6px] py-1 outline-none focus:ring-2 focus:ring-blue-400 transition-all ${
                                                            isCustom
                                                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                                                : 'border-gray-200 text-gray-500'
                                                        }`}
                                                    />
                                                    <span className="absolute right-1.5 text-[9px] text-gray-400 pointer-events-none">h</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex items-center justify-between pt-0.5">
                                <span className="text-xs text-gray-400">
                                    {workDays.length} dia{workDays.length !== 1 ? 's' : ''}/semana
                                </span>
                                {Object.keys(dayHours).length > 0 && (
                                    <button
                                        onClick={() => update({ dayHours: {} })}
                                        className="text-xs text-gray-400 hover:text-red-500 underline transition-colors"
                                    >
                                        Uniformizar horas
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* ── Feriados / Exceções de Calendário ── */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CalendarOff className="w-4 h-4 text-blue-500" />
                                <span className="text-sm font-semibold text-gray-700">Feriados</span>
                            </div>
                            <span className="text-xs font-bold text-gray-400">{holidays.length} data{holidays.length !== 1 ? 's' : ''}</span>
                        </div>
                        <p className="text-xs text-gray-400 -mt-2">Datas tratadas como não úteis pelo cronograma (CPM, folga, nivelamento)</p>

                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={newHoliday}
                                onChange={(e) => setNewHoliday(e.target.value)}
                                className="flex-1 text-sm border border-gray-200 rounded-[6px] px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
                            />
                            <button
                                onClick={() => { addHoliday(newHoliday); setNewHoliday(''); }}
                                disabled={!newHoliday}
                                className="p-2 rounded-[6px] bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Adicionar feriado"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={importYear}
                                onChange={(e) => setImportYear(Number(e.target.value))}
                                className="w-24 text-sm border border-gray-200 rounded-[6px] px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
                            />
                            <button
                                onClick={() => importBrazilianHolidays(importYear)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[6px] text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Importar feriados nacionais BR do ano
                            </button>
                        </div>

                        {holidays.length > 0 && (
                            <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-100 rounded-[6px] p-1.5">
                                {holidays.map(h => (
                                    <div key={h} className="flex items-center justify-between px-2 py-1 rounded-[6px] hover:bg-gray-50 text-xs">
                                        <span className="font-bold text-gray-600">{h.split('-').reverse().join('/')}</span>
                                        <ActionIconButton kind="delete" size="sm" onClick={() => removeHoliday(h)} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* ── Cálculo ── */}
                    <div className="space-y-4">
                        <span className="text-sm font-semibold text-gray-700">Cálculo</span>

                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-sm font-bold text-gray-700">Dias Úteis</span>
                                <p className="text-xs text-gray-400">Duração calculada em dias úteis (conforme jornada acima)</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={schedule.useWorkingDays ?? true}
                                    onChange={(e) => onUpdate({ useWorkingDays: e.target.checked })}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none ring-4 ring-blue-500/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-sm font-bold text-gray-700">Agregação automática de datas</span>
                                <p className="text-xs text-gray-400">Grupos/etapas seguem mín. início / máx. término das tarefas</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={schedule.autoRollupParentDates ?? false}
                                    onChange={(e) => onUpdate({ autoRollupParentDates: e.target.checked })}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none ring-4 ring-blue-500/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="space-y-2">
                            <span className="text-sm font-bold text-gray-700">Modo de Replanejamento</span>
                            <div className="grid grid-cols-1 gap-2">
                                {[
                                    { id: ReplanMode.AFFECTED_TASK, label: 'Cascata (CPM)', desc: 'Propaga apenas em tarefas sucessoras' },
                                    { id: ReplanMode.CURRENT_DATE, label: 'Hoje em Diante', desc: 'Calcula o restante a partir de hoje' },
                                ].map(mode => (
                                    <button
                                        key={mode.id}
                                        onClick={() => onUpdate({ replanMode: mode.id as ReplanMode })}
                                        className={`p-3 rounded-[6px] border-2 text-left transition-all ${schedule.replanMode === mode.id || (!schedule.replanMode && mode.id === ReplanMode.AFFECTED_TASK) ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}
                                    >
                                        <div className="text-button font-bold text-gray-800">{mode.label}</div>
                                        <div className="text-xs text-gray-400">{mode.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    </>
                    )}
                </div>
            </div>
        </div>
    );
};
