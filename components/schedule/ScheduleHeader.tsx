import React from 'react';
import {
    ArrowLeft,
    Calendar,
    ChevronRight,
    CheckCircle2,
    TrendingUp,
    FileDown,
    Users,
    ChevronsUpDown,
    ChevronsDownUp,
    Trash2,
    Loader2,
    ShieldAlert
} from 'lucide-react';
import { ProjectSchedule, ProjectSettings, ItemScheduleDetails } from '../../types';
import ModernDateInput from '../ModernDateInput';

interface ScheduleHeaderProps {
    onBack?: () => void;
    settings: ProjectSettings;
    isProjectSelectorOpen: boolean;
    setIsProjectSelectorOpen: (open: boolean) => void;
    projects: any[];
    onLoadProject: (id: string, view: string) => void;
    viewMode: 'table' | 'gantt' | 's-curve' | 'resources' | 'risks';
    setViewMode: (mode: 'table' | 'gantt' | 's-curve' | 'resources' | 'risks') => void;
    timeScale: 'day' | 'week' | 'month' | 'year';
    setTimeScale: (scale: 'day' | 'week' | 'month' | 'year') => void;
    schedule: ProjectSchedule;
    setIsBaselineModalOpen: (open: boolean) => void;
    isSimulationMode: boolean;
    handleToggleSimulation: () => void;
    handleExportPDF: () => void;
    isExportingPDF: boolean;
    setIsConfigModalOpen: (open: boolean) => void;
    handleLevelResources: () => void;
    handleRecalculate: (currentSchedules?: ItemScheduleDetails[], newStartDate?: string) => void;
    onUpdateSettings: (settings: ProjectSettings) => void;
    handleExpandAll: () => void;
    handleCollapseAll: () => void;
    handleApplyAutoAllItems: () => void;
    handleDisableAutoAllItems: () => void;
    budgetLength: number;
    autoCount: number;
    allAuto: boolean;
    onClearAll: () => void;
}

const ScheduleHeader: React.FC<ScheduleHeaderProps> = ({
    onBack,
    settings,
    isProjectSelectorOpen,
    setIsProjectSelectorOpen,
    projects,
    onLoadProject,
    viewMode,
    setViewMode,
    timeScale,
    setTimeScale,
    schedule,
    setIsBaselineModalOpen,
    isSimulationMode,
    handleToggleSimulation,
    handleExportPDF,
    isExportingPDF,
    setIsConfigModalOpen,
    handleLevelResources,
    handleRecalculate,
    onUpdateSettings,
    handleExpandAll,
    handleCollapseAll,
    handleApplyAutoAllItems,
    handleDisableAutoAllItems,
    budgetLength,
    autoCount,
    allAuto,
    onClearAll
}) => {
    return (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2 -ml-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all group/back shadow-sm bg-white border border-gray-100"
                            title="Voltar para Gestão de Planejamento"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover/back:-translate-x-1 transition-transform" />
                        </button>
                    )}
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-blue-600" />
                        Planejamento Físico-Financeiro
                    </h1>
                </div>
                <div className="flex items-center gap-2 mt-1 relative">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Obra:</span>
                    <div className="relative">
                        <button
                            onClick={() => setIsProjectSelectorOpen(!isProjectSelectorOpen)}
                            className="flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full hover:bg-blue-100 transition-all border border-blue-100"
                        >
                            {settings.name || 'Selecionar Obra'}
                            <ChevronRight className={`w-3 h-3 transition-transform ${isProjectSelectorOpen ? 'rotate-90' : ''}`} />
                        </button>

                        {isProjectSelectorOpen && (
                            <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="px-3 py-2 border-b border-gray-50 mb-1">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Minhas Obras</span>
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                    {projects.filter(p => p.settings?.classification === 'ORCAMENTO' || p.settings?.classification === 'COST_ESTIMATION').map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => {
                                                onLoadProject(p.id, 'schedule');
                                                setIsProjectSelectorOpen(false);
                                            }}
                                            className={`w-full text-left px-4 py-2 text-xs font-bold hover:bg-gray-50 flex items-center justify-between group ${p.id === settings.id ? 'text-blue-600 bg-blue-50/50' : 'text-gray-600'}`}
                                        >
                                            <span className="truncate">{p.name}</span>
                                            {p.id === settings.id && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                                        </button>
                                    ))}
                                    {projects.length === 0 && (
                                        <div className="px-4 py-8 text-center">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Nenhuma obra encontrada</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {/* ── Group 1: View Mode ── */}
                <div className="flex bg-gray-100/80 p-0.5 rounded-lg border border-gray-200/60">
                    {([
                        { key: 'table', label: 'Tabela' },
                        { key: 'gantt', label: 'Gantt' },
                        { key: 's-curve', label: 'Curva S' },
                        { key: 'resources', label: 'Recursos' },
                        { key: 'risks', label: 'Riscos' },
                    ] as const).map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setViewMode(key)}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === key
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* ── Group 2: Time Scale (only table/gantt) ── */}
                {(viewMode === 'table' || viewMode === 'gantt') && (
                    <>
                        <div className="h-5 w-px bg-gray-200"></div>
                        <div className="flex bg-gray-100/80 p-0.5 rounded-lg border border-gray-200/60">
                            {(['day', 'week', 'month', 'year'] as const).map((scale) => (
                                <button
                                    key={scale}
                                    onClick={() => setTimeScale(scale)}
                                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${timeScale === scale
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {{ day: 'Dia', week: 'Sem', month: 'Mês', year: 'Ano' }[scale]}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* ── Group 3: Actions (Baseline, Config, Nivelar) ── */}
                <div className="h-5 w-px bg-gray-200"></div>
                <div className="flex items-center gap-1 bg-gray-50/80 p-1 rounded-lg border border-gray-200/40">
                    <button
                        onClick={() => setIsBaselineModalOpen(true)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all ${schedule.activeBaselineId
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'text-gray-500 hover:bg-white hover:text-gray-700 hover:shadow-sm'
                            }`}
                        title="Gerenciar Baselines"
                    >
                        <TrendingUp className="w-3.5 h-3.5" />
                        {schedule.activeBaselineId
                            ? schedule.baselines?.find(b => b.id === schedule.activeBaselineId)?.name || 'Baseline'
                            : 'Baseline'}
                    </button>

                    {/* What-If Simulation Toggle */}
                    <div className="h-4 w-px bg-gray-300 mx-1"></div>
                    <button
                        onClick={handleToggleSimulation}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all ${isSimulationMode
                            ? 'bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200 shadow-sm animate-pulse'
                            : 'text-gray-500 hover:bg-white hover:text-gray-700 hover:shadow-sm'
                            }`}
                        title="Modo Simulação: Arraste as barras para ver o impacto no prazo final"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        {isSimulationMode ? 'Simulando...' : 'Modo What-If'}
                    </button>
                    <div className="h-4 w-px bg-gray-300 mx-1"></div>

                    {/* Botão de Exportar PDF */}
                    <button
                        onClick={handleExportPDF}
                        disabled={isExportingPDF}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all shadow-sm border ${isExportingPDF
                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                        title="Exportar Relatório PDF"
                    >
                        {isExportingPDF ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                        ) : (
                            <FileDown className="w-3.5 h-3.5 text-gray-500" />
                        )}
                        Exportar PDF
                    </button>
                    <div className="h-4 w-px bg-gray-300 mx-1"></div>

                    <button
                        onClick={() => setIsConfigModalOpen(true)}
                        className="p-1.5 text-gray-400 hover:bg-white hover:text-gray-600 hover:shadow-sm rounded-md transition-all"
                        title="Configurações"
                    >
                        <TrendingUp className="w-3.5 h-3.5 rotate-90" />
                    </button>

                    <button
                        onClick={handleLevelResources}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-indigo-600 hover:bg-indigo-50 hover:shadow-sm rounded-md text-[11px] font-semibold transition-all"
                        title="Nivelamento Automático de Recursos"
                    >
                        <Users className="w-3.5 h-3.5" />
                        Nivelar
                    </button>

                    {/* Auto Equipe (bulk toggle) */}
                    <button
                        onClick={allAuto ? handleDisableAutoAllItems : handleApplyAutoAllItems}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all ${allAuto
                            ? 'bg-green-100 text-green-700 hover:bg-green-200 border-2 border-green-200'
                            : autoCount > 0
                                ? 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-100'
                                : 'text-gray-500 hover:bg-white hover:text-gray-700 hover:shadow-sm'
                            }`}
                        title={allAuto ? 'Desativar cálculo automático em todos' : 'Ativar duração automática por equipe em todos os itens'}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" /></svg>
                        Auto Equipe
                        {budgetLength > 0 && <span className="text-[9px] bg-green-200 text-green-800 px-1 rounded-full">{autoCount}/{budgetLength}</span>}
                    </button>
                </div>

                {/* ── Group 4: Dates ── */}
                <div className="h-5 w-px bg-gray-200"></div>
                <div className="flex items-center gap-2">
                    <ModernDateInput
                        label="Início"
                        value={schedule.startDate ? schedule.startDate.split('T')[0] : ''}
                        onChange={(val) => handleRecalculate(undefined, val)}
                        className="w-36"
                    />
                    <ModernDateInput
                        label="Término"
                        value={schedule.endDate ? schedule.endDate.split('T')[0] : ''}
                        onChange={(val) => {
                            const next = { ...schedule, endDate: val };
                            onUpdateSettings({ ...settings, schedule: next });
                        }}
                        className="w-36"
                    />
                </div>

                {/* ── Group 5: Utility (Expand/Collapse, Clear) ── */}
                <div className="h-5 w-px bg-gray-200"></div>
                <div className="flex items-center gap-0.5 bg-gray-50/80 p-0.5 rounded-lg border border-gray-200/40">
                    <button
                        onClick={handleExpandAll}
                        className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-400 hover:text-blue-600"
                        title="Expandir Tudo"
                    >
                        <ChevronsUpDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleCollapseAll}
                        className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-400 hover:text-gray-600"
                        title="Recolher Tudo"
                    >
                        <ChevronsDownUp className="w-3.5 h-3.5" />
                    </button>
                    <div className="h-4 w-px bg-gray-200 mx-0.5"></div>
                    <button
                        onClick={onClearAll}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                        title="Limpar Tudo"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScheduleHeader;
