import React from 'react';
import { X, Clock } from 'lucide-react';
import { ProjectSchedule, ReplanMode } from '../../types';
// ProjectSchedule is used for the workSchedule type helper below

interface ConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    schedule: ProjectSchedule;
    onUpdate: (updates: Partial<ProjectSchedule>) => void;
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

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose, schedule, onUpdate }) => {
    if (!isOpen) return null;

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
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col border animate-in fade-in zoom-in duration-200 border-gray-200">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800">Definições do Cronograma</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">

                    {/* ── Jornada de Trabalho ── */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-black text-gray-700 uppercase tracking-wide">Jornada de Trabalho</span>
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
                                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
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
                                                className={`w-full py-1.5 rounded-lg text-xs font-black transition-all border-2 ${
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
                                                        className={`w-full text-center text-xs font-bold border rounded-lg py-1 outline-none focus:ring-2 focus:ring-blue-400 transition-all ${
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

                    {/* ── Cálculo ── */}
                    <div className="space-y-4">
                        <span className="text-sm font-black text-gray-700 uppercase tracking-wide">Cálculo</span>

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
                                        className={`p-3 rounded-xl border-2 text-left transition-all ${schedule.replanMode === mode.id || (!schedule.replanMode && mode.id === ReplanMode.AFFECTED_TASK) ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}
                                    >
                                        <div className="text-button font-bold text-gray-800">{mode.label}</div>
                                        <div className="text-xs text-gray-400">{mode.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
