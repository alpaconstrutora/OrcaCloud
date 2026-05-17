import React from 'react';

interface SimulationBannerProps {
    isSimulationMode: boolean;
    originalScheduleBackup: any;
    schedule: any;
    handleToggleSimulation: () => void;
    handleSaveSimulation: () => void;
}

const SimulationBanner: React.FC<SimulationBannerProps> = ({
    isSimulationMode,
    originalScheduleBackup,
    schedule,
    handleToggleSimulation,
    handleSaveSimulation
}) => {
    if (!isSimulationMode) return null;

    return (
        <div className="bg-purple-50 border-2 border-purple-500 rounded-xl p-4 shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-4 z-40 sticky top-4">
            <div className="flex items-center gap-4">
                <div className="bg-purple-100 p-2 rounded-lg">
                    <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-purple-900 font-bold text-sm">Modo Simulação (What-If) Ativo</h3>
                    <p className="text-purple-700 text-xs mt-0.5">Arraste as barras das tarefas no Gantt para simular atrasos e ver o impacto em tempo real nas datas subsequentes.</p>

                    {(() => {
                        if (!originalScheduleBackup || !schedule.itemSchedules || !originalScheduleBackup.itemSchedules) return null;
                        const origMaxEnd = originalScheduleBackup.itemSchedules.reduce((max: number, s: any) => {
                            if (!s.endDate) return max;
                            const d = new Date(s.endDate).getTime();
                            if (isNaN(d)) return max; // Bug 2: guard against Invalid Date
                            return d > max ? d : max;
                        }, 0);
                        const currentMaxEnd = schedule.itemSchedules.reduce((max: number, s: any) => {
                            if (!s.endDate) return max;
                            const d = new Date(s.endDate).getTime();
                            if (isNaN(d)) return max; // Bug 2: guard against Invalid Date
                            return d > max ? d : max;
                        }, 0);

                        if (origMaxEnd === 0 || currentMaxEnd === 0) return null;

                        const valDiffMs = currentMaxEnd - origMaxEnd;
                        const diffDays = Math.round(valDiffMs / (1000 * 60 * 60 * 24));

                        if (diffDays === 0) {
                            return <div className="mt-2 text-xs font-bold text-gray-600 bg-white/60 px-2 py-1 rounded inline-block">Projeção Término: Sem Impacto</div>;
                        } else if (diffDays > 0) {
                            return <div className="mt-2 text-xs font-bold text-red-600 bg-red-100/80 px-2 py-1 rounded inline-block border border-red-200">⚠ Previsão Término Atrasado em {diffDays} dias</div>;
                        } else {
                            return <div className="mt-2 text-xs font-bold text-green-700 bg-green-100/80 px-2 py-1 rounded inline-block border border-green-200">✨ Previsão Término Adiantado em {Math.abs(diffDays)} dias</div>;
                        }
                    })()}

                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={handleToggleSimulation}
                    className="px-4 py-2 text-xs font-bold text-purple-600 bg-white hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                >
                    Descartar Simulação
                </button>
                <button
                    onClick={handleSaveSimulation}
                    className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md rounded-lg transition-colors flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Confirmar Alterações
                </button>
            </div>
        </div>
    );
};

export default SimulationBanner;
