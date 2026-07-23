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
    FileSpreadsheet,
    FileText,
} from 'lucide-react';
import Button from '../ui/Button';
import { isOrcamentoOuLegado } from '../../utils/projectClassification';
import { ProjectSchedule, ProjectSettings, ItemScheduleDetails } from '../../types';

interface ScheduleHeaderProps {
    onBack?: () => void;
    settings: ProjectSettings;
    isProjectSelectorOpen: boolean;
    setIsProjectSelectorOpen: (open: boolean) => void;
    projects: any[];
    onLoadProject: (id: string, view: string) => void;
    viewMode: 'table' | 'gantt' | 's-curve' | 'resources' | 'risks' | 'constraints' | 'weekly' | 'scenarios' | 'command' | 'supply' | 'eap' | 'network';
    setViewMode: (mode: 'table' | 'gantt' | 's-curve' | 'resources' | 'risks' | 'constraints' | 'weekly' | 'scenarios' | 'command' | 'supply' | 'eap' | 'network') => void;
    timeScale: 'day' | 'week' | 'month' | 'year';
    setTimeScale: (scale: 'day' | 'week' | 'month' | 'year') => void;
    schedule: ProjectSchedule;
    setIsBaselineModalOpen: (open: boolean) => void;
    isSimulationMode: boolean;
    handleToggleSimulation: () => void;
    handleExportPDF: () => void;
    isExportingPDF: boolean;
    handleExportExcel: () => void;
    handleExportCSV: () => void;
    setIsConfigModalOpen: (open: boolean) => void;
    handleLevelResources: () => void;
    handleRecalculate: (currentSchedules?: ItemScheduleDetails[], newStartDate?: string) => void;
    onUpdateSettings: (settings: ProjectSettings) => void;
    handleExpandAll: () => void;
    handleCollapseAll: () => void;
    allExpanded: boolean;
    handleApplyAutoAllItems: () => void;
    handleDisableAutoAllItems: () => void;
    onOpenCrewClassification: () => void;
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

// Abas de navegação da tela (padrão UI UX tabela.md §3 — trilho + botões h-7).
const VIEW_TABS = [
    { key: 'table', label: 'Tabela' },
    { key: 'gantt', label: 'Gantt' },
    { key: 'network', label: 'Rede' },
    { key: 's-curve', label: 'Curva S' },
    { key: 'resources', label: 'Recursos' },
    { key: 'risks', label: 'Riscos' },
    { key: 'constraints', label: 'Restrições' },
    { key: 'weekly', label: 'Last Planner' },
    { key: 'scenarios', label: 'Cenários' },
    { key: 'command', label: '⚡ Comando' },
    { key: 'supply', label: '🛒 Suprimentos' },
    { key: 'eap', label: '🏗️ EAP Física' },
] as const;

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
    handleExportExcel,
    handleExportCSV,
    setIsConfigModalOpen,
    handleLevelResources,
    handleRecalculate,
    onUpdateSettings,
    handleExpandAll,
    handleCollapseAll,
    allExpanded,
    handleApplyAutoAllItems,
    handleDisableAutoAllItems,
    onOpenCrewClassification,
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
        // space-y-3 (12px) entre as barras de cromo — UI UX tabela.md: "12px entre KPIs → abas → botões".
        <div className="space-y-3">
        <div className="bg-white px-5 py-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
            {/* ── Title + Project selector ── */}
            <div className="flex flex-col gap-1 shrink-0">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <Button variant="ghost" size="icon" onClick={onBack} title="Voltar para Gestão de Planejamento" className="group/back -ml-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 bg-white border border-gray-100">
                            <ArrowLeft className="w-5 h-5 group-hover/back:-translate-x-1 transition-transform" />
                        </Button>
                    )}
                    <h1 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-600" />
                        Planejamento Físico-Financeiro
                    </h1>
                </div>
                <div className="flex items-center gap-2 mt-0.5 relative">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Orçamento:</span>
                    <div className="relative">
                        <Button variant="secondary" onClick={() => setIsProjectSelectorOpen(!isProjectSelectorOpen)} className="rounded-full bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100">
                            {settings.name || 'Selecionar Orçamento'}
                            <ChevronRight className={`w-3 h-3 transition-transform ${isProjectSelectorOpen ? 'rotate-90' : ''}`} />
                        </Button>
                        {isProjectSelectorOpen && (
                            <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="px-3 py-2 border-b border-gray-50 mb-1">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Meus Orçamentos</span>
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                    {projects.filter(isOrcamentoOuLegado).map((p) => (
                                        <Button key={p.id} variant="ghost" onClick={() => { onLoadProject(p.id, 'schedule'); setIsProjectSelectorOpen(false); }} className={`w-full text-left px-4 py-2 flex items-center justify-between group rounded-none ${p.id === settings.id ? 'text-blue-600 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50'}`}>
                                            <span className="truncate">{p.name}</span>
                                            {p.id === settings.id && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                                        </Button>
                                    ))}
                                    {projects.length === 0 && (
                                        <div className="px-4 py-8 text-center">
                                            <p className="text-xs font-bold text-gray-400 uppercase">Nenhum orçamento encontrado</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Toolbar de botões — UI UX tabela.md §4 (escopo à esquerda, ações à direita) */}
        <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm">
            {/* Escopo: escala de tempo (só Tabela/Gantt) + período do planejamento */}
            <div className="flex flex-wrap items-center gap-2">
                {(viewMode === 'table' || viewMode === 'gantt') && (
                    <div className="flex items-center h-9 bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
                        {(['day', 'week', 'month', 'year'] as const).map((scale) => (
                            <button key={scale} onClick={() => setTimeScale(scale)} className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all ${timeScale === scale ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                                {{ day: 'Dia', week: 'Sem', month: 'Mês', year: 'Ano' }[scale]}
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-400 whitespace-nowrap">Início</span>
                    <input
                        type="date"
                        value={schedule.startDate ? schedule.startDate.split('T')[0] : ''}
                        onChange={(e) => handleRecalculate(undefined, e.target.value)}
                        className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-400 whitespace-nowrap">Término</span>
                    <input
                        type="date"
                        value={schedule.endDate ? schedule.endDate.split('T')[0] : ''}
                        onChange={(e) => {
                            const next = { ...schedule, endDate: e.target.value };
                            onUpdateSettings({ ...settings, schedule: next, endDate: e.target.value });
                        }}
                        className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                </div>
            </div>

            {/* Ações — utilitárias à esquerda do grupo, ação primária no fim */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button onClick={allExpanded ? handleCollapseAll : handleExpandAll} title={allExpanded ? 'Recolher tudo' : 'Expandir tudo'} className="flex items-center gap-1.5 h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium hover:bg-gray-100 transition-all">
                    {allExpanded ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
                    {allExpanded ? 'Recolher' : 'Expandir'}
                </button>

                <button onClick={onSyncBudget} title={syncDiffCount > 0 ? `${syncDiffCount} alteração(ões) no orçamento pendentes` : 'Planejamento sincronizado com o orçamento'} className={`flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium transition-all ${syncDiffCount > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100' : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                    <RefreshCw className={`w-3.5 h-3.5 ${syncDiffCount > 0 ? 'text-amber-500' : ''}`} />
                    Sincronizar
                    {syncDiffCount > 0 && (
                        <span className="bg-amber-200 text-amber-800 text-[9px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                            {syncDiffCount}
                        </span>
                    )}
                </button>

                <button onClick={onOpenVersions} title="Versões do planejamento" className={`flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium transition-all ${hasNewerBudgetVersion ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100' : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                    <History className={`w-3.5 h-3.5 ${hasNewerBudgetVersion ? 'text-indigo-500' : ''}`} />
                    Versões
                    {planningVersionsCount > 0 && (
                        <span className="bg-indigo-200 text-indigo-800 text-[9px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                            {planningVersionsCount}
                        </span>
                    )}
                </button>

                <button onClick={handleLevelResources} title="Nivelamento Automático de Recursos" className="flex items-center gap-1.5 h-9 px-3 bg-indigo-50 border border-indigo-100 rounded-[6px] text-sm font-medium text-indigo-600 hover:bg-indigo-100 transition-all">
                    <Users className="w-3.5 h-3.5" />
                    Nivelar
                </button>

                <button onClick={() => setIsConfigModalOpen(true)} title="Configurações do cronograma" className="flex items-center gap-1.5 h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium hover:bg-gray-100 transition-all">
                    <Settings className="w-3.5 h-3.5" />
                    Configurações
                </button>

                {/* Overflow menu ··· */}
                <div className="relative" ref={overflowRef}>
                    <button onClick={() => setOverflowOpen(v => !v)} title="Mais opções" className={`flex items-center justify-center h-9 w-9 rounded-[6px] border transition-all ${overflowOpen ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                        <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {overflowOpen && (
                            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                                {/* Baseline */}
                                <Button variant="ghost" onClick={() => { setIsBaselineModalOpen(true); closeOverflow(); }} className={`w-full justify-start rounded-none px-4 py-2 ${schedule.activeBaselineId ? 'text-blue-700 bg-blue-50/60' : 'text-gray-600 hover:bg-gray-50'}`}>
                                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                                    {schedule.activeBaselineId
                                        ? schedule.baselines?.find(b => b.id === schedule.activeBaselineId)?.name || 'Baseline'
                                        : 'Baseline'}
                                    {schedule.activeBaselineId && <span className="ml-auto text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">ativo</span>}
                                </Button>

                                {/* What-If */}
                                <Button variant="ghost" onClick={() => { handleToggleSimulation(); closeOverflow(); }} className={`w-full justify-start rounded-none px-4 py-2 ${isSimulationMode ? 'text-purple-700 bg-purple-50/60' : 'text-gray-600 hover:bg-gray-50'}`}>
                                    <FlaskConical className="w-3.5 h-3.5 shrink-0" />
                                    Modo What-If
                                    {isSimulationMode && <span className="ml-auto text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-bold">ativo</span>}
                                </Button>

                                {/* Exportar */}
                                <Button variant="ghost" onClick={() => { handleExportPDF(); closeOverflow(); }} disabled={isExportingPDF} className="w-full justify-start rounded-none px-4 py-2 text-gray-600 hover:bg-gray-50">
                                    {isExportingPDF ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-blue-500" /> : <FileDown className="w-3.5 h-3.5 shrink-0" />}
                                    Exportar PDF
                                </Button>
                                <Button variant="ghost" onClick={() => { handleExportExcel(); closeOverflow(); }} className="w-full justify-start rounded-none px-4 py-2 text-gray-600 hover:bg-gray-50">
                                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                                    Exportar Excel
                                </Button>
                                <Button variant="ghost" onClick={() => { handleExportCSV(); closeOverflow(); }} className="w-full justify-start rounded-none px-4 py-2 text-gray-600 hover:bg-gray-50">
                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                    Exportar CSV
                                </Button>

                                <div className="h-px bg-gray-100 my-1 mx-3" />

                                {/* Auto Equipe */}
                                <Button variant="ghost" onClick={() => { (allAuto ? handleDisableAutoAllItems : handleApplyAutoAllItems)(); closeOverflow(); }} className={`w-full justify-start rounded-none px-4 py-2 ${allAuto ? 'text-green-700 bg-green-50/60' : 'text-gray-600 hover:bg-gray-50'}`}>
                                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" /></svg>
                                    Auto Equipe
                                    {budgetLength > 0 && <span className="ml-auto text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">{autoCount}/{budgetLength}</span>}
                                </Button>

                                {/* Classificação de Cargos */}
                                <Button variant="ghost" onClick={() => { onOpenCrewClassification(); closeOverflow(); }} className="w-full justify-start rounded-none px-4 py-2 text-gray-600 hover:bg-gray-50">
                                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>
                                    Classificação de Cargos
                                </Button>

                                <div className="h-px bg-gray-100 my-1 mx-3" />

                                {/* Limpar tudo */}
                                <Button variant="ghost" onClick={() => { onClearAll(); closeOverflow(); }} className="w-full justify-start rounded-none px-4 py-2 text-red-500 hover:bg-red-50">
                                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                    Limpar tudo
                                </Button>
                            </div>
                        )}
                    </div>

                <button onClick={onAutoSchedule} title="Recalcula todas as datas com base em predecessores e duração" className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium text-[13px] transition-all active:scale-95 shrink-0">
                    <Wand2 className="w-[15px] h-[15px]" />
                    Auto Programar
                </button>
            </div>
        </div>

        {/* Toolbar de abas — UI UX tabela.md §3 */}
        <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm">
            <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                {VIEW_TABS.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setViewMode(key)}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                            viewMode === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
        </div>
    );
};

export default ScheduleHeader;
