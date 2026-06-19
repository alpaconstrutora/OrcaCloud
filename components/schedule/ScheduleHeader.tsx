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
    RefreshCw,
    History,
    Wand2,
    MoreHorizontal,
    Settings,
    FlaskConical,
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
    viewMode: 'table' | 'gantt' | 's-curve' | 'resources' | 'risks' | 'constraints' | 'weekly' | 'scenarios';
    setViewMode: (mode: 'table' | 'gantt' | 's-curve' | 'resources' | 'risks' | 'constraints' | 'weekly' | 'scenarios') => void;
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
    allExpanded: boolean;
    handleApplyAutoAllItems: () => void;
    handleDisableAutoAllItems: () => void;
    budgetLength: number;
    autoCount: number;
    allAuto: boolean;
    onClearAll: () => void;
    syncDiffCount: number;
    onSyncBudget: () => void;
    onOpenVersions: () => void;
    planningVersionsCount: number;
    hasNewerBudgetVersion: boolean;
    onAutoSchedule: () => void;
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
    allExpanded,
    handleApplyAutoAllItems,
    handleDisableAutoAllItems,
    budgetLength,
    autoCount,
    allAuto,
    onClearAll,
    syncDiffCount,
    onSyncBudget,
    onOpenVersions,
    planningVersionsCount,
    hasNewerBudgetVersion,
    onAutoSchedule,
}) => {
    const [overflowOpen, setOverflowOpen] = React.useState(false);
    const overflowRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!overflowOpen) return;
        const handler = (e: MouseEvent) => {
            if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
                setOverflowOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [overflowOpen]);

    const closeOverflow = () => setOverflowOpen(false);

    return (
        <div className="bg-white px-5 py-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-3">
            {/* ── Left: Title + Project selector ── */}
            <div className="flex flex-col gap-1 shrink-0">
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
                    <h1 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-600" />
                        Planejamento Físico-Financeiro
                    </h1>
                </div>
                <div className="flex items-center gap-2 mt-0.5 relative">
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
                                            onClick={() => { onLoadProject(p.id, 'schedule'); setIsProjectSelectorOpen(false); }}
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

            {/* ── Right: Controls ── */}
            <div className="flex items-center gap-2 flex-wrap justify-end">

                {/* Group 1: View Mode */}
                <div className="flex bg-gray-100/80 p-0.5 rounded-lg border border-gray-200/60">
                    {([
                        { key: 'table', label: 'Tabela' },
                        { key: 'gantt', label: 'Gantt' },
                        { key: 's-curve', label: 'Curva S' },
                        { key: 'resources', label: 'Recursos' },
                        { key: 'risks', label: 'Riscos' },
                        { key: 'constraints', label: 'Restrições' },
                        { key: 'weekly', label: 'Last Planner' },
                        { key: 'scenarios', label: 'Cenários' },
                    ] as const).map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setViewMode(key)}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Group 2: Time Scale */}
                {(viewMode === 'table' || viewMode === 'gantt') && (
                    <>
                        <div className="h-5 w-px bg-gray-200" />
                        <div className="flex bg-gray-100/80 p-0.5 rounded-lg border border-gray-200/60">
                            {(['day', 'week', 'month', 'year'] as const).map((scale) => (
                                <button
                                    key={scale}
                                    onClick={() => setTimeScale(scale)}
                                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${timeScale === scale ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {{ day: 'Dia', week: 'Sem', month: 'Mês', year: 'Ano' }[scale]}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Group 3: Primary Actions */}
                <div className="h-5 w-px bg-gray-200" />
                <div className="flex items-center gap-1">
                    <button
                        onClick={onAutoSchedule}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-sm"
                        title="Recalcula todas as datas com base em predecessores e duração"
                    >
                        <Wand2 className="w-3.5 h-3.5" />
                        Auto Programar
                    </button>

                    <button
                        onClick={handleLevelResources}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] font-bold transition-all"
                        title="Nivelamento Automático de Recursos"
                    >
                        <Users className="w-3.5 h-3.5" />
                        Nivelar
                    </button>
                </div>

                {/* Group 4: Sync + Versions (with badges) */}
                <div className="h-5 w-px bg-gray-200" />
                <div className="flex items-center gap-1">
                    <button
                        onClick={onSyncBudget}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                            syncDiffCount > 0
                                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-sm'
                                : 'text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700'
                        }`}
                        title={syncDiffCount > 0 ? `${syncDiffCount} alteração(ões) no orçamento pendentes` : 'Planejamento sincronizado com o orçamento'}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncDiffCount > 0 ? 'text-amber-500' : ''}`} />
                        Sincronizar
                        {syncDiffCount > 0 && (
                            <span className="bg-amber-200 text-amber-800 text-[9px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                                {syncDiffCount}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={onOpenVersions}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                            hasNewerBudgetVersion
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 shadow-sm'
                                : 'text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700'
                        }`}
                        title="Versões do planejamento"
                    >
                        <History className={`w-3.5 h-3.5 ${hasNewerBudgetVersion ? 'text-indigo-500' : ''}`} />
                        Versões
                        {planningVersionsCount > 0 && (
                            <span className="bg-indigo-200 text-indigo-800 text-[9px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                                {planningVersionsCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Group 5: Dates */}
                <div className="h-5 w-px bg-gray-200" />
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
                            onUpdateSettings({ ...settings, schedule: next, endDate: val });
                        }}
                        className="w-36"
                    />
                </div>

                {/* Group 6: Utility + Overflow */}
                <div className="h-5 w-px bg-gray-200" />
                <div className="flex items-center gap-1">
                    <button
                        onClick={allExpanded ? handleCollapseAll : handleExpandAll}
                        title={allExpanded ? 'Recolher tudo' : 'Expandir tudo'}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 bg-white transition-all"
                    >
                        {allExpanded ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
                        {allExpanded ? 'Recolher' : 'Expandir'}
                    </button>

                    {/* Overflow menu ··· */}
                    <div className="relative" ref={overflowRef}>
                        <button
                            onClick={() => setOverflowOpen(v => !v)}
                            className={`p-1.5 rounded-lg border transition-all ${overflowOpen ? 'bg-gray-100 border-gray-300 text-gray-700' : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                            title="Mais opções"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {overflowOpen && (
                            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                                {/* Baseline */}
                                <button
                                    onClick={() => { setIsBaselineModalOpen(true); closeOverflow(); }}
                                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold transition-colors ${schedule.activeBaselineId ? 'text-blue-700 bg-blue-50/60' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                                    {schedule.activeBaselineId
                                        ? schedule.baselines?.find(b => b.id === schedule.activeBaselineId)?.name || 'Baseline'
                                        : 'Baseline'}
                                    {schedule.activeBaselineId && <span className="ml-auto text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">ativo</span>}
                                </button>

                                {/* What-If */}
                                <button
                                    onClick={() => { handleToggleSimulation(); closeOverflow(); }}
                                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold transition-colors ${isSimulationMode ? 'text-purple-700 bg-purple-50/60' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <FlaskConical className="w-3.5 h-3.5 shrink-0" />
                                    Modo What-If
                                    {isSimulationMode && <span className="ml-auto text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-bold">ativo</span>}
                                </button>

                                {/* Exportar PDF */}
                                <button
                                    onClick={() => { handleExportPDF(); closeOverflow(); }}
                                    disabled={isExportingPDF}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isExportingPDF ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-blue-500" /> : <FileDown className="w-3.5 h-3.5 shrink-0" />}
                                    Exportar PDF
                                </button>

                                <div className="h-px bg-gray-100 my-1 mx-3" />

                                {/* Auto Equipe */}
                                <button
                                    onClick={() => { (allAuto ? handleDisableAutoAllItems : handleApplyAutoAllItems)(); closeOverflow(); }}
                                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold transition-colors ${allAuto ? 'text-green-700 bg-green-50/60' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" /></svg>
                                    Auto Equipe
                                    {budgetLength > 0 && <span className="ml-auto text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">{autoCount}/{budgetLength}</span>}
                                </button>

                                {/* Configurações */}
                                <button
                                    onClick={() => { setIsConfigModalOpen(true); closeOverflow(); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                    <Settings className="w-3.5 h-3.5 shrink-0" />
                                    Configurações
                                </button>

                                <div className="h-px bg-gray-100 my-1 mx-3" />

                                {/* Limpar tudo */}
                                <button
                                    onClick={() => { onClearAll(); closeOverflow(); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                    Limpar tudo
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleHeader;
