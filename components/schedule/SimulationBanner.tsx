import React, { useState } from 'react';
import { BookmarkPlus, X } from 'lucide-react';

interface SimulationBannerProps {
    isSimulationMode: boolean;
    originalScheduleBackup: any;
    schedule: any;
    handleToggleSimulation: () => void;
    handleSaveSimulation: () => void;
    onSaveAsScenario?: (name: string) => void;
}

const SimulationBanner: React.FC<SimulationBannerProps> = ({
    isSimulationMode,
    originalScheduleBackup,
    schedule,
    handleToggleSimulation,
    handleSaveSimulation,
    onSaveAsScenario,
}) => {
    const [namingOpen, setNamingOpen] = useState(false);
    const [scenarioName, setScenarioName] = useState('');

    if (!isSimulationMode) return null;

    const handleConfirmSave = () => {
        if (!scenarioName.trim() || !onSaveAsScenario) return;
        onSaveAsScenario(scenarioName.trim());
        setNamingOpen(false);
        setScenarioName('');
    };

    const diffDays = (() => {
        if (!originalScheduleBackup?.itemSchedules || !schedule?.itemSchedules) return null;
        const origMax = originalScheduleBackup.itemSchedules.reduce((max: number, s: any) => {
            const d = s.endDate ? new Date(s.endDate).getTime() : 0;
            return isNaN(d) ? max : Math.max(max, d);
        }, 0);
        const currMax = schedule.itemSchedules.reduce((max: number, s: any) => {
            const d = s.endDate ? new Date(s.endDate).getTime() : 0;
            return isNaN(d) ? max : Math.max(max, d);
        }, 0);
        if (!origMax || !currMax) return null;
        return Math.round((currMax - origMax) / 86400000);
    })();

    return (
        <div className="bg-purple-50 border-2 border-purple-500 rounded-xl p-4 shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-4 z-40 sticky top-4">
            <div className="flex items-center gap-4">
                <div className="bg-purple-100 p-2 rounded-lg shrink-0">
                    <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-purple-900 font-bold text-sm">Modo Simulação (What-If) Ativo</h3>
                    <p className="text-purple-700 text-xs mt-0.5">Arraste as barras das tarefas no Gantt para simular atrasos e ver o impacto em tempo real.</p>
                    {diffDays !== null && (
                        diffDays === 0
                            ? <div className="mt-1 text-xs font-bold text-gray-600 bg-white/60 px-2 py-0.5 rounded inline-block">Projeção Término: Sem Impacto</div>
                            : diffDays > 0
                                ? <div className="mt-1 text-xs font-bold text-red-600 bg-red-100/80 px-2 py-0.5 rounded inline-block border border-red-200">⚠ Término atrasado em {diffDays} dias</div>
                                : <div className="mt-1 text-xs font-bold text-green-700 bg-green-100/80 px-2 py-0.5 rounded inline-block border border-green-200">✨ Término adiantado em {Math.abs(diffDays)} dias</div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {/* Naming popover */}
                {namingOpen && (
                    <div className="flex items-center gap-2 bg-white border border-purple-200 rounded-xl px-3 py-2 shadow-lg">
                        <input
                            autoFocus
                            type="text"
                            value={scenarioName}
                            onChange={e => setScenarioName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleConfirmSave(); if (e.key === 'Escape') setNamingOpen(false); }}
                            placeholder="Nome do cenário…"
                            className="text-form-input border-none outline-none w-44 text-gray-800 placeholder:text-gray-400"
                        />
                        <button
                            onClick={handleConfirmSave}
                            disabled={!scenarioName.trim()}
                            className="px-2 py-1 text-xs font-bold bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700 transition-all"
                        >
                            Salvar
                        </button>
                        <button onClick={() => setNamingOpen(false)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                <button
                    onClick={handleToggleSimulation}
                    className="px-4 py-2 text-button font-bold text-purple-600 bg-white hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                >
                    Descartar
                </button>

                {onSaveAsScenario && !namingOpen && (
                    <button
                        onClick={() => { setNamingOpen(true); setScenarioName(''); }}
                        className="flex items-center gap-1.5 px-4 py-2 text-button font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 border border-purple-300 rounded-lg transition-colors"
                    >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        Salvar como Cenário
                    </button>
                )}

                <button
                    onClick={handleSaveSimulation}
                    className="px-4 py-2 text-button font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md rounded-lg transition-colors flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Confirmar Alterações
                </button>
            </div>
        </div>
    );
};

export default SimulationBanner;
