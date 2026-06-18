import React from 'react';
import { X, Clock } from 'lucide-react';
import { ProjectSchedule, ReplanMode } from '../../types';

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

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose, schedule, onUpdate }) => {
    if (!isOpen) return null;

    const workDays = schedule.workSchedule?.workDays ?? DEFAULT_WORK_DAYS;
    const hoursPerDay = schedule.workSchedule?.hoursPerDay ?? DEFAULT_HOURS_PER_DAY;

    const toggleDay = (day: number) => {
        const next = workDays.includes(day)
            ? workDays.filter(d => d !== day)
            : [...workDays, day].sort((a, b) => a - b);
        if (next.length === 0) return; // pelo menos 1 dia
        onUpdate({ workSchedule: { hoursPerDay, workDays: next } });
    };

    const setHours = (val: number) => {
        const clamped = Math.max(1, Math.min(24, val));
        onUpdate({ workSchedule: { hoursPerDay: clamped, workDays } });
    };

    const totalWeeklyHours = workDays.length * hoursPerDay;

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

                        {/* Horas por dia */}
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-sm font-bold text-gray-700">Horas por dia</span>
                                <p className="text-[10px] text-gray-400">Duração da jornada diária</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setHours(hoursPerDay - 1)}
                                    className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold text-sm flex items-center justify-center transition-all"
                                >−</button>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number"
                                        min={1}
                                        max={24}
                                        value={hoursPerDay}
                                        onChange={(e) => setHours(Number(e.target.value))}
                                        className="w-12 text-center text-sm font-bold border border-gray-200 rounded-lg py-1 outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="text-xs text-gray-400 font-medium">h</span>
                                </div>
                                <button
                                    onClick={() => setHours(hoursPerDay + 1)}
                                    className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold text-sm flex items-center justify-center transition-all"
                                >+</button>
                            </div>
                        </div>

                        {/* Dias da semana */}
                        <div className="space-y-2">
                            <span className="text-sm font-bold text-gray-700">Dias trabalhados</span>
                            <div className="flex gap-1.5">
                                {WEEK_DAYS.map(({ value, short }) => {
                                    const active = workDays.includes(value);
                                    const isWeekend = value === 0 || value === 6;
                                    return (
                                        <button
                                            key={value}
                                            onClick={() => toggleDay(value)}
                                            className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all border-2 ${
                                                active
                                                    ? isWeekend
                                                        ? 'bg-amber-500 border-amber-500 text-white'
                                                        : 'bg-blue-600 border-blue-600 text-white'
                                                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                                            }`}
                                        >
                                            {short}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center justify-between pt-1">
                                <span className="text-[10px] text-gray-400">
                                    {workDays.length} dia{workDays.length !== 1 ? 's' : ''}/semana
                                </span>
                                <span className="text-[10px] font-bold text-blue-600">
                                    {totalWeeklyHours}h semanais
                                </span>
                            </div>
                        </div>

                        {/* Presets rápidos */}
                        <div className="flex gap-2 pt-1">
                            {[
                                { label: '5×8h', days: [1,2,3,4,5], hours: 8 },
                                { label: '5×9h', days: [1,2,3,4,5], hours: 9 },
                                { label: '6×8h', days: [1,2,3,4,5,6], hours: 8 },
                                { label: '7×8h', days: [0,1,2,3,4,5,6], hours: 8 },
                            ].map(preset => {
                                const active = JSON.stringify(workDays) === JSON.stringify(preset.days) && hoursPerDay === preset.hours;
                                return (
                                    <button
                                        key={preset.label}
                                        onClick={() => onUpdate({ workSchedule: { hoursPerDay: preset.hours, workDays: preset.days } })}
                                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                                            active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* ── Cálculo ── */}
                    <div className="space-y-4">
                        <span className="text-sm font-black text-gray-700 uppercase tracking-wide">Cálculo</span>

                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-sm font-bold text-gray-700">Dias Úteis</span>
                                <p className="text-[10px] text-gray-400">Duração calculada em dias úteis (conforme jornada acima)</p>
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
                                <p className="text-[10px] text-gray-400">Grupos/etapas seguem mín. início / máx. término das tarefas</p>
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
                                        <div className="text-xs font-bold text-gray-800">{mode.label}</div>
                                        <div className="text-[10px] text-gray-400">{mode.desc}</div>
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
