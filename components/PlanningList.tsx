import React from 'react';
import { projectService } from '../services/projectService';
import { FolderOpen, Calendar, Search, Loader2, FileSpreadsheet, Edit2, LayoutDashboard, Clock, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { ProjectSchedule } from '../types';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import Button from './ui/Button';

const COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Planejamento', sortable: true },
    { key: 'budgets', label: 'Orçamentos', sortable: false },
    { key: 'client', label: 'Cliente', sortable: true },
    { key: 'start', label: 'Início', sortable: true },
    { key: 'end', label: 'Prazo', sortable: true },
    { key: 'duration', label: 'Duração', sortable: false },
    { key: 'status', label: 'Status', sortable: false },
    { key: 'actions', label: 'Ações', sortable: false },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica fora (coluna estrutural fixa fora do drag).
const PLANNING_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    name: { label: 'Planejamento', className: 'px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em]' },
    budgets: { label: 'Orçamentos', sortable: false, className: 'px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em]' },
    client: { label: 'Cliente', className: 'px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em]' },
    start: { label: 'Início', className: 'px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em] text-center' },
    end: { label: 'Prazo', className: 'px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em] text-center' },
    duration: { label: 'Duração', sortable: false, className: 'px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em] text-center' },
    status: { label: 'Status', sortable: false, className: 'px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em]' },
};

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa a
// busca já existente, não a substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'name', label: 'Planejamento', type: 'text' },
    { key: 'client', label: 'Cliente', type: 'text' },
    { key: 'start', label: 'Início', type: 'date' },
    { key: 'end', label: 'Prazo', type: 'date' },
];

function getAdvancedFilterValue(p: ProjectSummary, key: string): unknown {
    switch (key) {
        case 'name': return p.name ?? '';
        case 'client': return p.settings?.client ?? '';
        case 'start': return p.settings?.startDate ?? p.settings?.schedule?.startDate ?? null;
        case 'end': return p.settings?.endDate ?? p.settings?.schedule?.endDate ?? null;
        default: return null;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProjectSummarySettings = any;

interface ProjectSummary {
    id: string;
    name: string;
    updated_at?: string;
    created_at?: string;
    settings?: ProjectSummarySettings;
}

interface PlanningListProps {
    onLoadProject: (id: string, targetView?: string) => void;
    onEditProject: (id: string) => void;
    onDuplicateProject: (id: string) => void;
    onDeleteProject: (item: ProjectSummary) => void;
    onAddPlanning?: () => void;
    projects?: ProjectSummary[];
}

const PlanningList: React.FC<PlanningListProps> = ({
    onLoadProject,
    onEditProject,
    onDuplicateProject,
    onDeleteProject,
    onAddPlanning,
    projects: projectsProp
}) => {
    const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('planningListFilters:search', '');
    const [viewMode, setViewMode] = usePersistedState<'list' | 'grid'>('planningListFilters:viewMode', 'list');
    const tableColumns = useTableColumns(COLUMNS, 'planningListColumns');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'planningListFilters:advanced');

    const loadProjects = async () => {
        setIsLoading(true);
        try {
            // Tela de Planejamento: precisa dos PLANEJAMENTOS, não das obras.
            const data = await projectService.listProjects({ includeOrphans: true, classifications: 'ALL' });
            setProjects((data as ProjectSummary[]) || []);
        } catch (error) {
            console.error("Erro ao listar projetos para planejamento:", error);
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        if (projectsProp) {
            setProjects(projectsProp);
            setIsLoading(false);
        } else {
            loadProjects();
        }
    }, [projectsProp]);

    const getLinkedBudgets = (planningId: string) => {
        const planning = projects.find(p => p.id === planningId);
        const linkedId = planning?.settings?.linkedProjectId;
        if (!linkedId) return [];

        // Check for direct budget link
        const directLinkedBudget = projects.find(p => p.id === linkedId && p.settings?.classification === 'ORCAMENTO');

        // Check for sibling budgets (linked to the same parent Obra)
        const siblingBudgets = projects.filter(p => p.settings?.linkedProjectId === linkedId && p.settings?.classification === 'ORCAMENTO');

        const uniqueBudgets: ProjectSummary[] = [];
        if (directLinkedBudget) uniqueBudgets.push(directLinkedBudget);
        siblingBudgets.forEach(b => {
            if (!uniqueBudgets.some(ub => ub.id === b.id)) {
                uniqueBudgets.push(b);
            }
        });

        return uniqueBudgets;
    };

    const filteredProjects = React.useMemo(() => {
        let base = projects.filter(p =>
            p.settings?.classification === 'PLANEJAMENTO' && (
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.settings?.client?.toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
        base = applyFilterRules(base, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);
        if (tableColumns.sortColumn) {
            return [...base].sort((a, b) => {
                const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                if (tableColumns.sortColumn === 'name') return a.name.localeCompare(b.name) * dir;
                if (tableColumns.sortColumn === 'client') return ((a.settings?.client ?? '').localeCompare(b.settings?.client ?? '')) * dir;
                if (tableColumns.sortColumn === 'start') {
                    const sa = a.settings?.startDate ?? a.settings?.schedule?.startDate ?? '';
                    const sb = b.settings?.startDate ?? b.settings?.schedule?.startDate ?? '';
                    return sa.localeCompare(sb) * dir;
                }
                if (tableColumns.sortColumn === 'end') {
                    const ea = a.settings?.endDate ?? a.settings?.schedule?.endDate ?? '';
                    const eb = b.settings?.endDate ?? b.settings?.schedule?.endDate ?? '';
                    return ea.localeCompare(eb) * dir;
                }
                return 0;
            });
        }
        return base.sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime());
    }, [projects, searchTerm, advancedFilters.rules, tableColumns.sortColumn, tableColumns.sortDirection]);

    const formatDate = (dateString?: string) => {
        if (!dateString) return '-';
        // Split to avoid timezone shift on new Date(string)
        const parts = dateString.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${day}/${month}/${year.slice(-4)}`;
        }
        return new Date(dateString).toLocaleDateString('pt-BR');
    };

    const getStatusBadge = (project: ProjectSummary) => {
        const schedule = project.settings?.schedule as ProjectSchedule;
        const startDate = project.settings?.startDate || schedule?.startDate;
        const endDateRaw = project.settings?.endDate || schedule?.endDate;

        if (!startDate) return (
            <span className="px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-gray-100 text-gray-500">
                Sem Cronograma
            </span>
        );

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let endDate = null;
        if (endDateRaw) {
            const parts = endDateRaw.split('-');
            if (parts.length === 3) {
                const y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
                endDate = (!isNaN(y) && !isNaN(m) && !isNaN(d)) ? new Date(y, m - 1, d) : null;
            } else {
                endDate = new Date(endDateRaw);
            }
        }

        const obraStatus = project.settings?.obraStatus;

        const isDelayed = endDate && today > endDate && obraStatus !== 'Finalizado';

        if (obraStatus === 'Finalizado') {
            return (
                <span className="px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-blue-100 text-blue-700 flex items-center gap-1 w-fit">
                    <CheckCircle2 className="w-3 h-3" />
                    Finalizado
                </span>
            );
        }

        return isDelayed ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-red-100 text-red-700 flex items-center gap-1 w-fit">
                <AlertCircle className="w-3 h-3" />
                Atrasado
            </span>
        ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit">
                <CheckCircle2 className="w-3 h-3" />
                Em Dia
            </span>
        );
    };

    // Conteúdo de cada <td> por coluna — extraído para função pura (fecha sobre helpers e
    // estado do componente) para que o <tbody> possa mapear `orderedVisibleColumns` (ordem
    // arrastável) em vez de repetir um bloco condicional fixo por coluna. `ctx` carrega
    // start/end/duration já calculados por linha (evita recalcular por coluna).
    const renderPlanningCell = (key: string, project: ProjectSummary, ctx: { startDate?: string; endDate?: string; duration?: number }): React.ReactNode => {
        switch (key) {
            case 'name':
                return (
                    <div className="flex items-center">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 mr-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-gray-900">{project.name}</div>
                            <div className="text-xs text-blue-600 font-bold uppercase tracking-tight">
                                {project.settings?.linkedProjectName || 'Obra não vinculada'}
                            </div>
                            <div className="text-xs text-gray-400 font-medium uppercase tracking-tight">
                                Modificado em {formatDate(project.updated_at)}
                            </div>
                        </div>
                    </div>
                );
            case 'budgets':
                return getLinkedBudgets(project.id).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {getLinkedBudgets(project.id).map(budget => (
                            <span key={budget.id} className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100/50">
                                {budget.name}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-xs text-gray-400 italic pl-2">-</span>
                );
            case 'client':
                return (
                    <div className="text-sm text-gray-600 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">
                        {project.settings?.client || '-'}
                    </div>
                );
            case 'start':
                return (
                    <div className="flex justify-center">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 text-gray-700 rounded-md border border-gray-100 text-xs font-bold">
                            <Clock className="w-3 h-3 text-gray-400" />
                            {formatDate(ctx.startDate)}
                        </div>
                    </div>
                );
            case 'end':
                return (
                    <div className="flex justify-center">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 text-gray-700 rounded-md border border-gray-100 text-xs font-bold">
                            <Clock className="w-3 h-3 text-gray-400" />
                            {formatDate(ctx.endDate)}
                        </div>
                    </div>
                );
            case 'duration':
                return (
                    <div className="flex justify-center">
                        <span className="text-sm font-bold text-gray-700">
                            {ctx.duration || '-'} <span className="text-xs text-gray-400 uppercase">Meses</span>
                        </span>
                    </div>
                );
            case 'status':
                return getStatusBadge(project);
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestão de Planejamento</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Controle cronogramas e prazos das obras em tempo real com infraestrutura premium.</p>
                </div>
                <Button
                    variant="primary"
                    size="lg"
                    onClick={onAddPlanning}
                    className="gap-3 rounded-[1.25rem] text-button tracking-widest shadow-xl shadow-blue-900/20 active:scale-95"
                >
                    <Calendar className="w-5 h-5" />
                    <span>Novo Planejamento</span>
                </Button>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por planejamento ou cliente..."
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                    {viewMode === 'list' && (
                        <ColumnConfigButton
                            columns={COLUMNS}
                            visibleColumns={tableColumns.visibleColumns}
                            showColumnConfig={tableColumns.showColumnConfig}
                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                            onToggleColumn={tableColumns.toggleColumn}
                            onReset={tableColumns.resetColumns}
                        />
                    )}
                    <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <LayoutDashboard className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <Calendar className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
            ) : filteredProjects.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 border-dashed">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-900">Nenhum planejamento encontrado</h3>
                    <p className="text-gray-500">Tente buscar por outro termo ou selecione uma obra.</p>
                </div>
            ) : (
                viewMode === 'list' ? (
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = PLANNING_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className} />
                                        );
                                    })}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em] text-right">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredProjects.map(project => {
                                    const schedule = project.settings?.schedule as ProjectSchedule;
                                    const startDate = project.settings?.startDate || schedule?.startDate;
                                    const endDate = project.settings?.endDate || schedule?.endDate;

                                    // Calculate duration in months if not present in schedule
                                    let duration = schedule?.duration;
                                    if (!duration && startDate && endDate) {
                                        const startParts = startDate.split('-');
                                        const endParts = endDate.split('-');
                                        if (startParts.length === 3 && endParts.length === 3) {
                                            const startYear = parseInt(startParts[0], 10);
                                            const startMonth = parseInt(startParts[1], 10);
                                            const endYear = parseInt(endParts[0], 10);
                                            const endMonth = parseInt(endParts[1], 10);
                                            if (!isNaN(startYear) && !isNaN(startMonth) && !isNaN(endYear) && !isNaN(endMonth)) {
                                                duration = (endYear - startYear) * 12 + (endMonth - startMonth);
                                            }
                                        } else {
                                            const start = new Date(startDate);
                                            const end = new Date(endDate);
                                            duration = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                                        }
                                        if (duration < 0) duration = 0;
                                    }

                                    return (
                                        <tr
                                            key={project.id}
                                            onClick={() => onLoadProject(project.id, 'schedule')}
                                            className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                                        >
                                            {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                                <td key={key} className="px-6 py-4">
                                                    {renderPlanningCell(key, project, { startDate, endDate, duration })}
                                                </td>
                                            ))}
                                            {tableColumns.visibleColumns.includes('actions') && (
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => onLoadProject(project.id, 'schedule')}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 group/btn"
                                                        >
                                                            <LayoutDashboard className="w-4 h-4" />
                                                            <span className="text-xs font-black uppercase hidden lg:inline">Abrir Gantt</span>
                                                            <ChevronRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                                                        </button>
                                                        <ActionIconButton kind="duplicate" title="Duplicar Planejamento" onClick={() => onDuplicateProject(project.id)} />
                                                        <ActionIconButton kind="settings" title="Configurações" onClick={() => onEditProject(project.id)} />
                                                        <ActionIconButton kind="delete" title="Excluir Planejamento" onClick={() => onDeleteProject(project)} />
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects.map(project => {
                            const schedule = project.settings?.schedule as ProjectSchedule;
                            const startDate = project.settings?.startDate || schedule?.startDate;
                            const endDate = project.settings?.endDate || schedule?.endDate;

                            // Calculate duration in months if not present in schedule
                            let duration = schedule?.duration;
                            if (!duration && startDate && endDate) {
                                const startParts = startDate.split('-');
                                const endParts = endDate.split('-');
                                if (startParts.length === 3 && endParts.length === 3) {
                                    const startYear = parseInt(startParts[0], 10);
                                    const startMonth = parseInt(startParts[1], 10);
                                    const endYear = parseInt(endParts[0], 10);
                                    const endMonth = parseInt(endParts[1], 10);
                                    if (!isNaN(startYear) && !isNaN(startMonth) && !isNaN(endYear) && !isNaN(endMonth)) {
                                        duration = (endYear - startYear) * 12 + (endMonth - startMonth);
                                    }
                                } else {
                                    const start = new Date(startDate);
                                    const end = new Date(endDate);
                                    duration = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                                }
                                if (duration < 0) duration = 0;
                            }

                            return (
                                <div
                                    key={project.id}
                                    onClick={() => onLoadProject(project.id, 'schedule')}
                                    className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group flex flex-col overflow-hidden"
                                >
                                    <div className="p-5 flex-1">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                                                <Calendar className="w-6 h-6" />
                                            </div>
                                            {getStatusBadge(project)}
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                                            {project.name}
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1 mb-4 font-medium line-clamp-1">
                                            {project.settings?.client || 'Cliente não definido'}
                                        </p>

                                        {getLinkedBudgets(project.id).length > 0 && (
                                            <div className="mb-4">
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Orçamentos</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {getLinkedBudgets(project.id).slice(0, 2).map(budget => (
                                                        <span key={budget.id} className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100/50 truncate max-w-[100px]">
                                                            {budget.name}
                                                        </span>
                                                    ))}
                                                    {getLinkedBudgets(project.id).length > 2 && (
                                                        <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                                            +{getLinkedBudgets(project.id).length - 2}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-50">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Início</span>
                                                <span className="text-xs font-bold text-gray-700">{formatDate(startDate)}</span>
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Prazos</span>
                                                <span className="text-xs font-bold text-gray-700">{duration || '-'} Meses</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <ActionIconButton kind="duplicate" title="Duplicar" onClick={(e) => { e.stopPropagation(); onDuplicateProject(project.id); }} />
                                        <ActionIconButton kind="settings" title="Configurações" onClick={(e) => { e.stopPropagation(); onEditProject(project.id); }} />
                                        <ActionIconButton kind="delete" className="ml-auto" onClick={(e) => { e.stopPropagation(); onDeleteProject(project); }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}
        </div>
    );
};

export default PlanningList;
