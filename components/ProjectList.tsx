import React from 'react';
import { projectService, ProjectData } from '../services/projectService';
import { FolderOpen, Calendar, Trash2, Search, Loader2, Plus, Copy, FileSpreadsheet, LayoutDashboard, Table2, Lock, Unlock, Link2, RefreshCw, Clock, CheckCircle2 } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { TipoObra } from '../types/project';

const TIPO_OBRA_LABELS: Record<TipoObra, string> = {
    residencial_multifamiliar: 'Residencial',
    casa: 'Casa',
    loja: 'Loja',
    sala: 'Sala/Escritório',
    galpao: 'Galpão',
    reforma: 'Reforma',
    outro: 'Outro',
};
const TIPO_OBRA_COLORS: Record<TipoObra, string> = {
    residencial_multifamiliar: 'bg-blue-100 text-blue-700 border-blue-200',
    casa: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    loja: 'bg-orange-100 text-orange-700 border-orange-200',
    sala: 'bg-purple-100 text-purple-700 border-purple-200',
    galpao: 'bg-amber-100 text-amber-700 border-amber-200',
    reforma: 'bg-rose-100 text-rose-700 border-rose-200',
    outro: 'bg-gray-100 text-gray-600 border-gray-200',
};
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, FileDownloadIcon } from '@hugeicons/core-free-icons';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';

import ExcelImportModal from './ExcelImportModal';
import { BudgetEntry } from '../types';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { useConfirm } from './ui/confirm';
import { KpiCard } from './ui/KpiCard';

interface ProjectSettings {
    classification?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO' | string;
    linkedProjectId?: string;
    linkedProjectName?: string;
    client?: string;
    obraPropria?: boolean;
    code?: string;
    status?: string;
    obraStatus?: string;
    diaryStatus?: string;
    diaryEntries?: any[]; // using any[] to quickly fix the weatherMorning missing property
    startDate?: string;
    endDate?: string;
    schedule?: {
        startDate?: string;
        endDate?: string;
        duration?: number;
    };
    [key: string]: any;
}

interface ProjectSummary {
    id: string;
    name: string;
    updated_at?: string;
    created_at?: string;
    settings?: ProjectSettings;
    code?: string;
}

interface ProjectListProps {
    onLoadProject: (id: string, targetView?: string) => void;
    onEditProject: (id: string) => void;
    onNewProject: (classification?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO') => void;
    onDuplicateProject: (id: string) => void;
    onImportProject: (data: { name: string, budget: BudgetEntry[] }) => void;
    onExportProject: (id: string) => void;
    onRowClick?: (id: string) => void;
    clientId?: string;
    hideHeader?: boolean;
    projects?: ProjectSummary[];
    classificationFilter?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO';
    organizationId?: string;
    organizations?: { id: string; name: string }[];
    isDiaryView?: boolean;
    isExternalLoading?: boolean; // sinaliza que o pai ainda está carregando os projetos
}

const COLUMNS: ColumnConfig[] = [
    { key: 'code',          label: 'Código',      sortable: true },
    { key: 'name',          label: 'Nome',        sortable: true },
    { key: 'organization',  label: 'Organização', sortable: true },
    // Vinculado = obra/orçamento/planejamento ligado (ou sugestão) — sem valor único
    // comparável entre os contextos (Obra/Orçamento/Planejamento/Diário), ver §6.3.
    { key: 'linked',        label: 'Vinculado',   sortable: false },
    { key: 'client',        label: 'Cliente',     sortable: true },
    { key: 'updated',       label: 'Atualização', sortable: true },
    { key: 'status-budget', label: 'Status',      sortable: true },
    { key: 'status-obra',   label: 'Status Obra', sortable: true },
    { key: 'lock',          label: 'Bloqueio',    sortable: true },
    { key: 'actions',       label: 'Ações',       sortable: false }
];

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa a
// busca/ordenação/tipo já existentes, não os substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'code', label: 'Código', type: 'text' },
    { key: 'name', label: 'Nome', type: 'text' },
    { key: 'client', label: 'Cliente', type: 'text' },
    { key: 'status-obra', label: 'Status Obra', type: 'select', options: [
        { value: 'Em andamento', label: 'Em andamento' },
        { value: 'Concluída', label: 'Concluída' },
        { value: 'Não Iniciado', label: 'Não Iniciado' },
    ] },
    { key: 'updated', label: 'Atualização', type: 'date' },
];

function getAdvancedFilterValue(project: ProjectSummary, key: string): unknown {
    switch (key) {
        case 'code': return project.code || project.settings?.code || '';
        case 'name': return project.name;
        case 'client': return project.settings?.client ?? '';
        case 'status-obra': return project.settings?.obraStatus ?? '';
        case 'updated': {
            const raw = project.updated_at || project.created_at;
            return raw ? String(raw).slice(0, 10) : null;
        }
        default: return null;
    }
}

const capitalizeStatus = (status: string): string => {
    if (!status) return status;
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};

const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
        'Em andamento': 'text-blue-600',
        'Em Andamento': 'text-blue-600',
        'Concluída':    'text-green-600',
        'Fechado':      'text-green-600',
        'Não Iniciado': 'text-gray-600',
        'Atualizado':   'text-green-600',
        'Sem Registros': 'text-gray-600',
    };
    return (
        <span className={`text-sm font-normal ${colors[status] || 'text-gray-600'}`}>
            {status}
        </span>
    );
};

const ProjectList: React.FC<ProjectListProps> = ({
    onLoadProject,
    onEditProject,
    onNewProject,
    onDuplicateProject,
    onImportProject,
    onExportProject,
    onRowClick,
    clientId,
    hideHeader,
    projects: projectsProp,
    classificationFilter,
    organizationId,
    organizations = [],
    isDiaryView,
    isExternalLoading = false,
}) => {
    const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
    const [orderCounts, setOrderCounts] = React.useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = React.useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('projectListFilters:search', '');
    const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
    const [viewMode, setViewMode] = usePersistedState<'list' | 'grid'>('projectListFilters:viewMode', 'list');
    const [activeTab, setActiveTab] = React.useState<'budgets' | 'templates'>(
        classificationFilter === 'OBRA' ? 'templates' : 'budgets'
    );
    const tableColumns = useTableColumns(COLUMNS, 'projectListColumns');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'projectListFilters:advanced');
    const confirm = useConfirm();
    const {
        visibleColumns,
        sortColumn,
        sortDirection,
        showColumnConfig,
        setShowColumnConfig,
        handleColumnSort,
        toggleColumn,
        resetColumns,
    } = tableColumns;

    const isObraContext = classificationFilter === 'OBRA' || (!classificationFilter && activeTab === 'templates');
    const isPlanejamentoContext = classificationFilter === 'PLANEJAMENTO';
    const isDiarioContext = classificationFilter === 'DIARIO' || isDiaryView;
    const isDiaryContext = isDiarioContext;

    const loadProjects = async () => {
        setIsLoading(true);
        try {
            const data = await projectService.listProjects(clientId, organizationId, true);
            const loadedProjects = (data as ProjectSummary[]) || [];
            setProjects(loadedProjects);

            if (loadedProjects.length > 0) {
                const counts = await projectService.getOrderCounts(loadedProjects.map((p: ProjectSummary) => p.id));
                setOrderCounts(counts);
            }
        } catch (error) {
            console.error("Erro ao listar orçamentos:", error);
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        const updateProjects = async () => {
            if (projectsProp) {
                setProjects(projectsProp);
                setIsLoading(true);
                try {
                    if (projectsProp.length > 0) {
                        const counts = await projectService.getOrderCounts(projectsProp.map(p => p.id));
                        setOrderCounts(counts);
                    }
                } catch (error) {
                    console.error("Erro ao carregar contagem de pedidos:", error);
                } finally {
                    setIsLoading(false);
                }
            } else {
                loadProjects();
            }
        };
        updateProjects();
    }, [projectsProp, clientId, organizationId]);

    const handleDelete = async (id: string, name: string) => {
        const effectiveOrders = getEffectiveOrderCount(id);
        if (effectiveOrders > 0) {
            alert(`Não é possível excluir "${name}" pois existem ${effectiveOrders} pedido(s) vinculados a esta obra ou orçamentos relacionados.`);
            return;
        }

        const itemLabel = isObraContext ? 'obra' : (isPlanejamentoContext ? 'planejamento' : 'orçamento');
        const ok = await confirm({
            title: `Excluir ${itemLabel}?`,
            message: `Tem certeza que deseja excluir o ${itemLabel} "${name}"? Essa ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;

        try {
            await projectService.deleteProject(id);
            setProjects(projects.filter(p => p.id !== id));
        } catch (error: unknown) {
            console.error("Erro ao excluir orçamento:", error);
            const err = error as Error;
            alert(err.message || "Erro ao excluir o orçamento.");
        }
    };

    const handleEdit = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        onEditProject(id);
    };

    const handleDuplicate = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        onDuplicateProject(id);
    };

    const handleExport = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        onExportProject(id);
    };

    const [tipoFilter, setTipoFilter] = React.useState<TipoObra | ''>('');

    const filteredProjects = React.useMemo(() => {
        let result = projects
            .filter(p => {
                if (p.name === 'Gestão Comercial') return false;

                const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (p.settings?.client || '').toLowerCase().includes(searchTerm.toLowerCase());

                const matchesTipo = !tipoFilter || p.settings?.tipoObra === tipoFilter;

                const isOrcamento = p.settings?.classification === 'ORCAMENTO' || !p.settings?.classification;
                const isTemplate = p.settings?.classification === 'OBRA';
                const isPlanejamento = p.settings?.classification === 'PLANEJAMENTO';

                const effectiveTab = classificationFilter
                    ? (classificationFilter === 'OBRA' ? 'templates' : (classificationFilter === 'PLANEJAMENTO' ? 'budgets' : (classificationFilter === 'DIARIO' ? 'budgets' : 'budgets')))
                    : activeTab;

                const matchesTab = effectiveTab === 'templates'
                    ? isTemplate
                    : (classificationFilter === 'PLANEJAMENTO'
                        ? isPlanejamento
                        : (classificationFilter === 'DIARIO'
                            ? (p.settings?.classification === 'DIARIO' || (p.settings?.classification === 'OBRA' && (p.settings?.diaryEntries?.length || 0) > 0))
                            : isOrcamento));

                return matchesSearch && matchesTab && matchesTipo;
            });

        result = applyFilterRules(result, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);

        return result.sort((a, b) => {
                if (sortColumn) {
                    let valA: string | number | undefined, valB: string | number | undefined;

                    switch (sortColumn) {
                        case 'code':
                            valA = parseInt((a.code || a.settings?.code || ''), 10);
                            valB = parseInt((b.code || b.settings?.code || ''), 10);
                            if (!isNaN(valA as number) && !isNaN(valB as number)) {
                                return sortDirection === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
                            }
                            break;
                        case 'name':
                            return sortDirection === 'asc'
                                ? a.name.localeCompare(b.name)
                                : b.name.localeCompare(a.name);
                        case 'updated':
                            valA = new Date(a.updated_at || a.created_at || 0).getTime();
                            valB = new Date(b.updated_at || b.created_at || 0).getTime();
                            return sortDirection === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
                        case 'client':
                            valA = a.settings?.client || '';
                            valB = b.settings?.client || '';
                            return sortDirection === 'asc'
                                ? (valA as string).localeCompare(valB as string)
                                : (valB as string).localeCompare(valA as string);
                        case 'status-obra':
                            valA = a.settings?.obraStatus || '';
                            valB = b.settings?.obraStatus || '';
                            return sortDirection === 'asc'
                                ? (valA as string).localeCompare(valB as string)
                                : (valB as string).localeCompare(valA as string);
                        case 'status-budget':
                            valA = a.settings?.budgetStatus || '';
                            valB = b.settings?.budgetStatus || '';
                            return sortDirection === 'asc'
                                ? (valA as string).localeCompare(valB as string)
                                : (valB as string).localeCompare(valA as string);
                        case 'organization': {
                            const orgA = organizations.find(o => o.id === a.settings?.organizationId)?.name || '';
                            const orgB = organizations.find(o => o.id === b.settings?.organizationId)?.name || '';
                            return sortDirection === 'asc' ? orgA.localeCompare(orgB) : orgB.localeCompare(orgA);
                        }
                        case 'lock': {
                            // Aproximação direta (orderCounts), não a contagem em cascata de
                            // getEffectiveOrderCount — suficiente para ordenar bloqueado/livre.
                            const lockA = (orderCounts[a.id] || 0) > 0 ? 1 : 0;
                            const lockB = (orderCounts[b.id] || 0) > 0 ? 1 : 0;
                            return sortDirection === 'asc' ? lockA - lockB : lockB - lockA;
                        }
                    }
                }

                // Sem coluna selecionada: Obras ordenam por código (padrão do módulo);
                // as demais telas ordenam pela mais recentemente atualizada (§6.4).
                if (isObraContext) {
                    const codeA = parseInt((a.code || a.settings?.code || ''), 10);
                    const codeB = parseInt((b.code || b.settings?.code || ''), 10);
                    const hasA = !isNaN(codeA);
                    const hasB = !isNaN(codeB);
                    if (hasA && hasB) return codeA - codeB;
                    if (hasA) return -1;
                    if (hasB) return 1;
                    return a.name.localeCompare(b.name);
                }
                return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
            });
    }, [projects, searchTerm, tipoFilter, activeTab, classificationFilter, sortColumn, sortDirection, advancedFilters.rules, organizations, orderCounts]);

    const stats = React.useMemo(() => {
        const total = filteredProjects.length;
        const inProgress = filteredProjects.filter(p => 
            p.settings?.obraStatus === 'Em andamento' || 
            p.settings?.budgetStatus === 'Em Andamento' || 
            !p.settings?.budgetStatus // assume em andamento if not set yet
        ).length;
        const concluded = filteredProjects.filter(p => 
            p.settings?.obraStatus === 'Concluída' || 
            p.settings?.budgetStatus === 'Fechado'
        ).length;
        const recent = filteredProjects.filter(p => {
            if (!p.created_at) return false;
            const diff = new Date().getTime() - new Date(p.created_at).getTime();
            return diff < 30 * 24 * 60 * 60 * 1000;
        }).length;
        return { total, inProgress, concluded, recent };
    }, [filteredProjects]);

    const getLinkedProjectData = (project: ProjectSummary) => {
        if (project.settings?.linkedProjectId) {
            return projects.find(p => p.id === project.settings?.linkedProjectId);
        }
        if (project.settings?.linkedProjectName) {
            return projects.find(p => p.name === project.settings?.linkedProjectName && p.settings?.classification === 'OBRA');
        }
        return null;
    };

    const getLinkedPlanning = (project: ProjectSummary) => {
        // 1. Helper: recursive discovery of the root Obra ID
        const findObraId = (p: ProjectSummary): string | null => {
            if (p.settings?.classification === 'OBRA') return p.id;
            if (p.settings?.linkedProjectId) {
                const linked = projects.find(op => op.id === p.settings?.linkedProjectId);
                if (linked) return findObraId(linked);
            }
            if (p.settings?.linkedProjectName) {
                const linkedByName = projects.find(op => op.name === p.settings?.linkedProjectName && op.settings?.classification === 'OBRA');
                if (linkedByName) return linkedByName.id;
            }
            return null;
        };

        // 2. Direct manual link to a Planning
        if (project.settings?.linkedProjectId) {
            const target = projects.find(p => p.id === project.settings?.linkedProjectId);
            if (target && target.settings?.classification === 'PLANEJAMENTO') {
                return { project: target, type: 'manual' as const };
            }
        }

        // 3. Recursive Discovery via Obra Root
        const obraId = findObraId(project);
        if (obraId) {
            const rootObra = projects.find(p => p.id === obraId);
            // Collect all sibling IDs under this Obra (the Obra itself + all budgets/diaries linked to it)
            const siblingIds = new Set<string>();
            siblingIds.add(obraId);
            if (rootObra) {
                projects.forEach(p => {
                    if (p.settings?.linkedProjectId === obraId || p.settings?.linkedProjectName === rootObra.name) {
                        siblingIds.add(p.id);
                    }
                });
            }
            // Find any Planning that links to ANY sibling (Obra, Orçamento, etc.)
            const planning = projects.find(p =>
                p.settings?.classification === 'PLANEJAMENTO' &&
                (siblingIds.has(p.settings?.linkedProjectId || '') || (rootObra && p.settings?.linkedProjectName === rootObra.name))
            );
            if (planning) return { project: planning, type: 'auto' as const };
        }

        return null;
    };

    const getLinkedBudgets = (obraId: string) => {
        const obra = projects.find(op => op.id === obraId);
        return projects.filter(p =>
            (p.settings?.linkedProjectId === obraId || p.settings?.linkedProjectName === obra?.name) &&
            (p.settings?.classification === 'ORCAMENTO' || !p.settings?.classification) &&
            !p.code && !p.settings?.code
        );
    };

    // Retorna uma Obra com o mesmo cliente que poderia ser vinculada a este Orçamento (sem link atual)
    const getSuggestedObraForOrcamento = (project: ProjectSummary): ProjectSummary | null => {
        if (project.settings?.classification === 'OBRA') return null;
        if (project.settings?.linkedProjectId || project.settings?.linkedProjectName) return null;
        const client = project.settings?.client?.trim();
        if (!client) return null;
        return projects.find(p =>
            p.settings?.classification === 'OBRA' &&
            p.settings?.client?.trim() === client &&
            p.id !== project.id
        ) || null;
    };

    // Retorna Orçamentos com o mesmo cliente que poderiam ser vinculados a esta Obra (sem link atual)
    const getSuggestedBudgetsForObra = (project: ProjectSummary): ProjectSummary[] => {
        const client = project.settings?.client?.trim();
        if (!client) return [];
        return projects.filter(p =>
            (p.settings?.classification === 'ORCAMENTO' || !p.settings?.classification) &&
            p.settings?.client?.trim() === client &&
            !p.settings?.linkedProjectId &&
            !p.settings?.linkedProjectName &&
            p.id !== project.id
        );
    };

    const getEffectiveOrderCount = (projectId: string) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return 0;

        // 1. Pedidos diretos
        let total = orderCounts[projectId] || 0;

        // 2. Se for uma OBRA, somar pedidos de todos os ORÇAMENTOS vinculados
        if (project.settings?.classification === 'OBRA') {
            const linkedBudgets = getLinkedBudgets(projectId);
            linkedBudgets.forEach(b => {
                total += orderCounts[b.id] || 0;
            });
        }

        // 3. Se for um ORÇAMENTO, somar pedidos da OBRA mestre
        if (project.settings?.classification !== 'OBRA') {
            const masterObraId = project.settings?.linkedProjectId || projects.find(p => p.name === project.settings?.linkedProjectName && p.settings?.classification === 'OBRA')?.id;
            if (masterObraId) {
                total += orderCounts[masterObraId] || 0;
            }
        }

        return total;
    };

    return (
        <div className="space-y-6">
            {!hideHeader && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                            {isObraContext ? 'Obras' : (isPlanejamentoContext ? 'Gestão de Planejamento' : (isDiarioContext ? 'Gestão de Diário de Obras' : 'Orçamentos'))}
                        </h1>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie suas {isObraContext ? 'obras' : (isPlanejamentoContext ? 'planejamentos' : (isDiarioContext ? 'diários' : 'orçamentos'))} com infraestrutura de alta performance.</p>
                    </div>
                    {/* Variante compacta do CTA primário (ui_ux_standard_guide.md §17) */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsImportModalOpen(true)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-[6px] hover:bg-emerald-600 hover:text-white font-medium text-[13px] transition-all active:scale-95"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            Importar Excel
                        </button>
                        <button
                            onClick={() => onNewProject(classificationFilter || (activeTab === 'templates' ? 'OBRA' : 'ORCAMENTO'))}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            {isObraContext ? 'Nova obra' : (isPlanejamentoContext ? 'Novo planejamento' : (isDiarioContext ? 'Novo diário' : 'Novo orçamento'))}
                        </button>
                    </div>
                </div>
            )}

            {!classificationFilter && (
                <div className="flex gap-1 bg-gray-100/50 p-1 rounded-[10px] w-fit">
                    <button
                        onClick={() => setActiveTab('budgets')}
                        className={`flex items-center h-9 px-4 text-sm font-medium rounded-[6px] transition-all ${activeTab === 'budgets'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        <FolderOpen className="w-4 h-4 mr-2" />
                        Orçamentos
                    </button>
                    <button
                        onClick={() => setActiveTab('templates')}
                        className={`flex items-center h-9 px-4 text-sm font-medium rounded-[6px] transition-all ${activeTab === 'templates'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        <Copy className="w-4 h-4 mr-2" />
                        Obras / Modelos
                    </button>
                </div>
            )}

            {/* KPIs genéricos desta tabela — só quando o pai não já mostra seus próprios KPIs
                (Planejamento usa PlanningDashboard, Diário usa DiaryDashboard, ambos com
                hideHeader=true; mostrar os dois juntos duplicava a informação). */}
            {!hideHeader && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard label="Total" value={stats.total} sub="Registros visíveis" icon={<FolderOpen className="w-5 h-5" />} color="blue" />
                    <KpiCard label="Em Andamento" value={stats.inProgress} sub="Ativos no momento" icon={<Clock className="w-5 h-5" />} color="amber" />
                    <KpiCard label="Concluídos" value={stats.concluded} sub="Finalizados / fechados" icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
                    <KpiCard label="Recentes" value={stats.recent} sub="Criados nos últimos 30 dias" icon={<Calendar className="w-5 h-5" />} color="violet" />
                </div>
            )}

            {/* Toolbar acoplada dentro do card da tabela (mesmo padrão do ÒPURA Docs/GED):
                régua de controles §5.1 (escala compacta §16) separada da tabela por border-b. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-gray-100">
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por obra ou cliente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>

                {isObraContext && (
                    <select
                        value={tipoFilter}
                        onChange={(e) => setTipoFilter(e.target.value as TipoObra | '')}
                        className="h-9 text-sm font-normal text-gray-700 bg-white border border-gray-200 rounded-[6px] px-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    >
                        <option value="">Todos os tipos</option>
                        {(Object.keys(TIPO_OBRA_LABELS) as TipoObra[]).map(k => (
                            <option key={k} value={k}>{TIPO_OBRA_LABELS[k]}</option>
                        ))}
                    </select>
                )}

                {/* Dropdown "Ordenar" removido: toda coluna ordenável já ordena pelo próprio
                    cabeçalho (ui_ux_standard_guide.md §6.4); default sem coluna selecionada
                    ficou dentro do .sort() (mais recente primeiro / código para Obras). */}
                <div className="flex items-center h-9">
                    <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                </div>

                <button
                    onClick={loadProjects}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar dados"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>

                <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    <ColumnConfigButton
                        columns={COLUMNS.filter(c => c.key !== 'actions')}
                        visibleColumns={tableColumns.visibleColumns}
                        showColumnConfig={tableColumns.showColumnConfig}
                        onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                        onToggleColumn={tableColumns.toggleColumn}
                        onReset={tableColumns.resetColumns}
                    />
                    <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Grade"
                    >
                        <LayoutDashboard className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Lista"
                    >
                        <Table2 className="w-4 h-4" />
                    </button>
                </div>
                </div>
              </div>

            {(isLoading || isExternalLoading) ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : filteredProjects.length === 0 ? (
                <div className="text-center py-12">
                    <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">
                        {isDiaryContext ? 'Nenhum diário encontrado' : (activeTab === 'budgets' ? 'Nenhum orçamento encontrado' : 'Nenhuma obra encontrada')}
                    </h3>
                    <p className="text-sm text-gray-500">
                        {searchTerm
                            ? 'Tente buscar por outro termo.'
                            : isDiaryContext
                                ? 'Cadastre seu primeiro diário no botão "Novo Diário".'
                                : activeTab === 'budgets'
                                    ? 'Cadastre seu primeiro orçamento no botão "Novo Orçamento".'
                                    : 'Cadastre sua primeira obra para usar como modelo.'}
                    </p>
                </div>
            ) : (
                viewMode === 'list' ? (
                        <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            {/* thead em sentence case (§6.2) — uppercase={false} porque SortableHeader
                                força uppercase internamente por padrão. */}
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {visibleColumns.includes('code') && (
                                        <SortableHeader
                                            label="Código"
                                            colKey="code"
                                            uppercase={false}
                                            sortColumn={sortColumn}
                                            sortDirection={sortDirection}
                                            onSort={handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 w-20 text-center"
                                        />
                                    )}
                                    {visibleColumns.includes('name') && (
                                        <SortableHeader
                                            label={isDiaryContext ? 'Diário' : (isObraContext ? 'Obra' : (isPlanejamentoContext ? 'Planejamento' : 'Orçamento'))}
                                            colKey="name"
                                            uppercase={false}
                                            sortColumn={sortColumn}
                                            sortDirection={sortDirection}
                                            onSort={handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100"
                                        />
                                    )}
                                    {visibleColumns.includes('organization') && (
                                        <SortableHeader
                                            label="Organização"
                                            colKey="organization"
                                            uppercase={false}
                                            sortColumn={sortColumn}
                                            sortDirection={sortDirection}
                                            onSort={handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap"
                                        />
                                    )}
                                    {visibleColumns.includes('linked') && (
                                        // Vinculado = obra/orçamento/planejamento ligado — sem valor único pra ordenar (§6.3).
                                        <SortableHeader
                                            label={isDiaryContext ? 'Último Diário' : (isObraContext ? 'Orçamentos Vinculados' : 'Obra Vinculada')}
                                            colKey="linked"
                                            uppercase={false}
                                            sortColumn={sortColumn}
                                            sortDirection={sortDirection}
                                            onSort={handleColumnSort}
                                            sortable={false}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap"
                                        />
                                    )}
                                    {isDiaryContext && (
                                        <>
                                            <SortableHeader
                                                label="Obra Vinculada"
                                                colKey="obra-vinculada"
                                                uppercase={false}
                                                sortColumn={sortColumn}
                                                sortDirection={sortDirection}
                                                onSort={handleColumnSort}
                                                sortable={false}
                                                className="px-6 py-2 border-r border-gray-100 whitespace-nowrap"
                                            />
                                            <SortableHeader
                                                label="Planejamento Vinculado"
                                                colKey="planejamento-vinculada"
                                                uppercase={false}
                                                sortColumn={sortColumn}
                                                sortDirection={sortDirection}
                                                onSort={handleColumnSort}
                                                sortable={false}
                                                className="px-6 py-2 border-r border-gray-100 whitespace-nowrap"
                                            />
                                        </>
                                    )}
                                    {visibleColumns.includes('client') && (
                                        <SortableHeader
                                            label="Cliente"
                                            colKey="client"
                                            uppercase={false}
                                            sortColumn={sortColumn}
                                            sortDirection={sortDirection}
                                            onSort={handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100"
                                        />
                                    )}
                                    {visibleColumns.includes('updated') && (
                                        <SortableHeader
                                            label={isDiaryContext ? 'Clima' : 'Atualização'}
                                            colKey="updated"
                                            uppercase={false}
                                            sortColumn={sortColumn}
                                            sortDirection={sortDirection}
                                            onSort={handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap"
                                        />
                                    )}
                                    {visibleColumns.includes('status-budget') && (
                                        <SortableHeader
                                            label={isDiaryContext ? 'Status Diário' : 'Status'}
                                            colKey="status-budget"
                                            uppercase={false}
                                            sortColumn={sortColumn}
                                            sortDirection={sortDirection}
                                            onSort={handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100"
                                        />
                                    )}
                                    {visibleColumns.includes('status-obra') && (
                                        <SortableHeader
                                            label={isDiaryContext ? 'Total Registros' : 'Status Obra'}
                                            colKey="status-obra"
                                            uppercase={false}
                                            sortColumn={sortColumn}
                                            sortDirection={sortDirection}
                                            onSort={handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100"
                                        />
                                    )}
                                    {visibleColumns.includes('lock') && (
                                        <SortableHeader
                                            label="Bloqueio"
                                            colKey="lock"
                                            uppercase={false}
                                            sortColumn={sortColumn}
                                            sortDirection={sortDirection}
                                            onSort={handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 text-center"
                                        />
                                    )}
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredProjects.map(project => (
                                    <tr
                                        key={project.id}
                                        onClick={() => onRowClick ? onRowClick(project.id) : onEditProject(project.id)}
                                        className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                                    >
                                        {visibleColumns.includes('code') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center text-sm font-normal text-gray-700">
                                            {project.code || project.settings?.code || '—'}
                                        </td>
                                    )}
                                    {visibleColumns.includes('name') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="flex items-center">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3 shrink-0">
                                                        <FolderOpen className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-normal text-gray-900">
                                                            {project.name}
                                                        </div>
                                                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                                                            <span>CR: {new Date(project.created_at || 0).toLocaleDateString()}</span>
                                                            {project.settings?.tipoObra && (
                                                                <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold tracking-wide ${TIPO_OBRA_COLORS[project.settings.tipoObra as TipoObra] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                                    {TIPO_OBRA_LABELS[project.settings.tipoObra as TipoObra] || project.settings.tipoObra}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        )}
                                        {visibleColumns.includes('organization') && (() => {
                                            const orgId = project.settings?.organizationId;
                                            const org = organizations.find(o => o.id === orgId);
                                            return (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                    {org ? org.name : <span className="text-gray-400 italic">—</span>}
                                                </td>
                                            );
                                        })()}
                                        {visibleColumns.includes('linked') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {isDiaryContext ? (
                                                    <div className="flex flex-col">
                                                        <div className="text-sm font-normal text-gray-900 truncate max-w-[150px]">
                                                            {(project.settings?.diaryEntries && project.settings.diaryEntries.length > 0)
                                                                ? new Date(project.settings.diaryEntries[project.settings.diaryEntries.length - 1].date).toLocaleDateString()
                                                                : '-'}
                                                        </div>
                                                        <span className="text-xs text-gray-400 font-normal lowercase italic">Visto por último</span>
                                                    </div>
                                                ) : (
                                                    isObraContext ? (() => {
                                                    const linked = getLinkedBudgets(project.id);
                                                    const suggested = linked.length === 0 ? getSuggestedBudgetsForObra(project) : [];
                                                    if (linked.length > 0) return (
                                                        <div className="flex flex-col gap-1">
                                                            {linked.map(budget => (
                                                                <span key={budget.id} className="text-sm font-normal text-blue-600 truncate max-w-[200px]">
                                                                    {budget.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    );
                                                    if (suggested.length > 0) return (
                                                        <div className="flex flex-col gap-1">
                                                            {suggested.map(s => (
                                                                <div key={s.id} className="flex items-center gap-1.5 text-sm font-normal text-amber-600" title={`Orçamento "${s.name}" tem o mesmo cliente e pode ser vinculado a esta Obra`}>
                                                                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                                                                    <span className="truncate max-w-[160px]">{s.name}</span>
                                                                    <span className="text-xs text-amber-500">(sugerido)</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                    return <span className="text-sm font-normal text-gray-400">-</span>;
                                                })() : (() => {
                                                    const linked = getLinkedProjectData(project);
                                                    if (linked) return (
                                                        <div className="flex items-center gap-1.5 text-sm font-normal text-blue-600">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></div>
                                                            <span className="truncate max-w-[180px]">{linked.name}</span>
                                                        </div>
                                                    );
                                                    if (project.settings?.linkedProjectName) return (
                                                        <div className="flex items-center gap-1.5 text-sm font-normal text-gray-400">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 opacity-50 shrink-0"></div>
                                                            <span className="truncate max-w-[180px]">{project.settings.linkedProjectName}</span>
                                                        </div>
                                                    );
                                                    const suggested = getSuggestedObraForOrcamento(project);
                                                    if (suggested) return (
                                                        <div className="flex items-center gap-1.5 text-sm font-normal text-amber-600" title={`Obra "${suggested.name}" tem o mesmo cliente e pode ser vinculada a este Orçamento`}>
                                                            <Link2 className="w-3.5 h-3.5 shrink-0" />
                                                            <span className="truncate max-w-[160px]">{suggested.name}</span>
                                                            <span className="text-xs text-amber-500">(sugerido)</span>
                                                        </div>
                                                    );
                                                    return <span className="text-sm font-normal text-gray-400">-</span>;
                                                })()
                                            )}
                                            </td>
                                        )}
                                        {isDiaryContext && (
                                            <>
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {getLinkedProjectData(project) ? (
                                                        <div className="flex items-center gap-1.5 text-sm font-normal text-blue-600">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></div>
                                                            <span className="truncate max-w-[180px]">{getLinkedProjectData(project)?.name}</span>
                                                        </div>
                                                    ) : <span className="text-sm font-normal text-gray-400">-</span>}
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {(() => {
                                                        const linked = getLinkedPlanning(project);
                                                        if (!linked) return <span className="text-sm font-normal text-gray-400">-</span>;

                                                        return (
                                                            <div className={`flex items-center gap-1.5 text-sm font-normal ${linked.type === 'manual' ? 'text-emerald-600' : 'text-blue-600'}`}>
                                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${linked.type === 'manual' ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                                                                <span className="truncate max-w-[180px]">{linked.project.name}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                            </>
                                        )}
                                        {visibleColumns.includes('client') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                                                {project.settings?.obraPropria ? (
                                                    <span className="text-indigo-700">Obra Própria</span>
                                                ) : (activeTab === 'templates' ? project.settings?.client : (getLinkedProjectData(project)?.settings?.client || project.settings?.client)) ? (
                                                    <span className="text-gray-600">
                                                        {activeTab === 'templates' ? project.settings?.client : (getLinkedProjectData(project)?.settings?.client || project.settings?.client)}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 italic">-</span>
                                                )}
                                            </td>
                                        )}
                                        {visibleColumns.includes('updated') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            {isDiaryContext ? (
                                                <div className="flex items-center gap-2 text-sm font-normal text-gray-600">
                                                    {(project.settings?.diaryEntries && project.settings.diaryEntries.length > 0) ? (
                                                        <>
                                                            {project.settings.diaryEntries[project.settings.diaryEntries.length - 1].weatherMorning === 'sunny' ? (
                                                                <>☀ Sol</>
                                                            ) : project.settings.diaryEntries[project.settings.diaryEntries.length - 1].weatherMorning === 'cloudy' ? (
                                                                <>☁ Nublado</>
                                                            ) : (
                                                                <>🌧 Chuva</>
                                                            )}
                                                        </>
                                                    ) : '-'}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1 text-sm font-normal text-gray-600">
                                                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                        {new Date(project.updated_at || project.created_at || 0).toLocaleDateString()}
                                                    </div>
                                                    <span className="text-xs text-gray-400">
                                                        {new Date(project.updated_at || project.created_at || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            )}
                                            </td>
                                        )}
                                        {visibleColumns.includes('status-budget') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {isDiaryContext ? (
                                                    (project.settings?.diaryEntries && project.settings.diaryEntries.length > 0) ? (
                                                        <StatusBadge status="Atualizado" />
                                                    ) : (
                                                        <StatusBadge status="Sem Registros" />
                                                    )
                                                ) : (
                                                    project.settings?.budgetStatus ? (
                                                        <StatusBadge status={capitalizeStatus(project.settings.budgetStatus)} />
                                                    ) : (
                                                        <span className="text-sm text-gray-400 font-normal italic">-</span>
                                                    )
                                                )}
                                            </td>
                                        )}
                                        {visibleColumns.includes('status-obra') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {isDiaryContext ? (
                                                <div className="flex items-center gap-1.5 text-sm font-normal text-gray-900">
                                                    <span>{project.settings?.diaryEntries?.length || 0}</span>
                                                    <span className="text-xs text-gray-400">dias</span>
                                                </div>
                                            ) : (
                                                project.settings?.obraStatus ? (
                                                    <StatusBadge status={project.settings.obraStatus === 'Em andamento' ? 'Em andamento' : project.settings.obraStatus} />
                                                ) : (
                                                    <span className="text-sm text-gray-400 font-normal italic">-</span>
                                                )
                                            )}
                                            </td>
                                        )}
                                        {visibleColumns.includes('lock') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="flex justify-center">
                                                {getEffectiveOrderCount(project.id) > 0 ? (
                                                    <div className="flex items-center gap-1.5 text-amber-600" title={`${getEffectiveOrderCount(project.id)} orçamento(s)/pedido(s) vinculados - Exclusão Bloqueada`}>
                                                        <Lock className="w-4 h-4" />
                                                        <span className="text-sm font-normal">Bloqueado</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-emerald-600" title="Sem pedidos vinculados - Exclusão Permitida">
                                                        <Unlock className="w-4 h-4" />
                                                        <span className="text-sm font-normal">Livre</span>
                                                    </div>
                                                )}
                                                </div>
                                            </td>
                                        )}
                                        <td className="px-6 py-2.5 text-right">
                                            <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-3">
                                                {/* Para Planejamento/Diário, o clique na linha já abre Cronograma/Diário
                                                    (onRowClick) — um botão de texto repetindo a mesma ação duplicaria o
                                                    controle (ui_ux_standard_guide.md §9.1). */}
                                                {(!isPlanejamentoContext && !isDiaryContext) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onEditProject(project.id); }}
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        Ver Detalhes
                                                    </button>
                                                )}
                                                <ActionIconButton kind="edit" className="ml-1" onClick={(e) => { e.stopPropagation(); onEditProject(project.id); }} />
                                                <InlineDisclosureMenu
                                                    menuItems={[
                                                        {
                                                            icon: <HugeiconsIcon icon={FileDownloadIcon} size={18} />,
                                                            label: 'Exportar Excel',
                                                            onClick: () => onExportProject(project.id),
                                                        },
                                                        {
                                                            icon: <HugeiconsIcon icon={Copy01Icon} size={18} />,
                                                            label: isObraContext ? 'Duplicar Obra' : isPlanejamentoContext ? 'Duplicar Planejamento' : isDiaryContext ? 'Duplicar Diário' : 'Duplicar Orçamento',
                                                            onClick: () => onDuplicateProject(project.id),
                                                        },
                                                    ]}
                                                    showDelete
                                                    onDelete={() => handleDelete(project.id, project.name)}
                                                    deleteDisabled={getEffectiveOrderCount(project.id) > 0}
                                                    deleteDisabledTitle={getEffectiveOrderCount(project.id) > 0 ? 'Exclusão Bloqueada (Possui pedidos vinculados)' : undefined}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
                        {filteredProjects.map(project => (
                            <div
                                key={project.id}
                                onClick={() => onRowClick ? onRowClick(project.id) : onEditProject(project.id)}
                                className="bg-white rounded-[10px] border border-gray-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group flex flex-col"
                            >
                                <div className="p-5 flex-1">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                                            <FolderOpen className="w-6 h-6" />
                                        </div>
                                        {/* Badges de status — texto simples colorido, sem pílula/fundo/uppercase (§8) */}
                                        <div className="flex flex-col items-end gap-1">
                                            {!isObraContext && project.settings?.budgetStatus && (
                                                <span className={`text-sm font-normal ${project.settings.budgetStatus === 'Fechado' ? 'text-emerald-700' : 'text-blue-700'}`}>
                                                    {capitalizeStatus(project.settings.budgetStatus)}
                                                </span>
                                            )}
                                            {project.settings?.obraStatus && (
                                                <span className={`text-sm font-normal ${project.settings.obraStatus === 'Concluída' ? 'text-indigo-700' :
                                                        project.settings.obraStatus === 'Não Iniciado' ? 'text-gray-600' :
                                                            'text-sky-700'}`}>
                                                    {project.settings.obraStatus}
                                                </span>
                                            )}
                                            {getEffectiveOrderCount(project.id) > 0 ? (
                                                <span className="flex items-center gap-1 text-sm font-normal text-amber-600">
                                                    <Lock className="w-3.5 h-3.5" />
                                                    Bloqueado
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-sm font-normal text-emerald-600">
                                                    <Unlock className="w-3.5 h-3.5" />
                                                    Livre
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {project.settings?.tipoObra && (
                                        <div className="mb-3">
                                            <span className={`px-2 py-0.5 rounded border text-[9px] font-semibold tracking-wide ${TIPO_OBRA_COLORS[project.settings.tipoObra as TipoObra] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                {TIPO_OBRA_LABELS[project.settings.tipoObra as TipoObra] || project.settings.tipoObra}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-start gap-2">
                                        {(project.code || project.settings?.code) && (
                                            <span className="text-xs font-normal text-blue-700 shrink-0 mt-1">
                                                {project.code || project.settings?.code}
                                            </span>
                                        )}
                                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 flex-1">
                                            {project.name}
                                        </h3>
                                    </div>
                                    {!isObraContext && (
                                        <p className="text-sm font-normal text-gray-500 mt-1 mb-4 flex items-center gap-1.5">
                                            {project.settings?.obraPropria ? (
                                                <span className="text-indigo-700">Obra Própria</span>
                                            ) : (project.settings?.client || 'Cliente não definido')}
                                        </p>
                                    )}

                                    <div className="space-y-2 pt-4 border-t border-gray-50">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-400">Criado em:</span>
                                            <span className="text-gray-600 font-medium">{new Date(project.created_at || 0).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-400">Atualizado em:</span>
                                            <div className="text-right">
                                                <div className="text-gray-600 font-medium">{new Date(project.updated_at || project.created_at || 0).toLocaleDateString()}</div>
                                                <div className="text-xs text-gray-400">{new Date(project.updated_at || project.created_at || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-gray-50 rounded-b-[10px] border-t border-gray-100 flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                        {!isObraContext && !isPlanejamentoContext && !isDiaryContext && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onLoadProject(project.id, 'analytic'); }}
                                                className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                                                title="Orçamento Analítico"
                                            >
                                                <Table2 className="w-4 h-4" />
                                            </button>
                                        )}
                                        {/* Para Planejamento, o clique no card já abre o Cronograma (onRowClick) —
                                            evita duplicar a ação em botão (§9.1). */}
                                    </div>
                                    <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                                        <ActionIconButton kind="edit" title="Editar Dados" onClick={() => onEditProject(project.id)} />
                                        <InlineDisclosureMenu
                                            menuItems={[
                                                {
                                                    icon: <HugeiconsIcon icon={FileDownloadIcon} size={18} />,
                                                    label: 'Exportar Excel',
                                                    onClick: () => onExportProject(project.id),
                                                },
                                                {
                                                    icon: <HugeiconsIcon icon={Copy01Icon} size={18} />,
                                                    label: isObraContext ? 'Duplicar Obra' : isPlanejamentoContext ? 'Duplicar Planejamento' : isDiaryContext ? 'Duplicar Diário' : 'Duplicar Orçamento',
                                                    onClick: () => onDuplicateProject(project.id),
                                                },
                                            ]}
                                            showDelete
                                            onDelete={() => handleDelete(project.id, project.name)}
                                            deleteDisabled={getEffectiveOrderCount(project.id) > 0}
                                            deleteDisabledTitle={getEffectiveOrderCount(project.id) > 0 ? 'Exclusão Bloqueada (Possui pedidos vinculados)' : undefined}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}
            </div>
            <ExcelImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={(data) => {
                    onImportProject(data);
                    setIsImportModalOpen(false);
                }}
            />
        </div>
    );
};

export default ProjectList;
