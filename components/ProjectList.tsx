import React from 'react';
import { projectService, ProjectData } from '../services/projectService';
import { FolderOpen, Calendar, Trash2, Search, Loader2, Settings, Plus, Copy, FileSpreadsheet, Edit2, LayoutDashboard, Table2, Lock, Unlock, BookOpen, Link2, Pencil, SquareDashedKanban } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, FileDownloadIcon } from '@hugeicons/core-free-icons';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';

import ExcelImportModal from './ExcelImportModal';
import { BudgetEntry, ProjectSettings } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SettingsLike = any;
interface ProjectSummary {
    id: string;
    name: string;
    updated_at?: string;
    created_at?: string;
    settings?: SettingsLike;
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
    const [searchTerm, setSearchTerm] = React.useState('');
    const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('list');
    const [activeTab, setActiveTab] = React.useState<'budgets' | 'templates'>(
        classificationFilter === 'OBRA' ? 'templates' : 'budgets'
    );
    const isObraContext = classificationFilter === 'OBRA' || (!classificationFilter && activeTab === 'templates');
    const isPlanejamentoContext = classificationFilter === 'PLANEJAMENTO';
    const isDiarioContext = classificationFilter === 'DIARIO' || isDiaryView;
    const isDiaryContext = isDiarioContext;

    const loadProjects = async () => {
        setIsLoading(true);
        try {
            const data = await projectService.listProjects(clientId, organizationId, true);
            const loadedProjects = data as any || [];
            setProjects(loadedProjects);

            if (loadedProjects.length > 0) {
                const counts = await projectService.getOrderCounts(loadedProjects.map((p: any) => p.id));
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

    const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();

        const effectiveOrders = getEffectiveOrderCount(id);
        if (effectiveOrders > 0) {
            alert(`Não é possível excluir "${name}" pois existem ${effectiveOrders} pedido(s) vinculados a esta obra ou orçamentos relacionados.`);
            return;
        }

        if (confirm(`Tem certeza que deseja excluir o ${isObraContext ? 'obra' : (isPlanejamentoContext ? 'planejamento' : 'orçamento')} "${name}"? Essa ação não pode ser desfeita.`)) {
            try {
                await projectService.deleteProject(id);
                setProjects(projects.filter(p => p.id !== id));
            } catch (error: any) {
                console.error("Erro ao excluir orçamento:", error);
                alert(error.message || "Erro ao excluir o orçamento.");
            }
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

    const [sortBy, setSortBy] = React.useState<string>('recent');

    const filteredProjects = React.useMemo(() => {
        return projects
            .filter(p => {
                // Remove Ocultos (Cofre do Gestão Comercial)
                if (p.name === 'Gestão Comercial') return false;

                const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (p.settings?.client || '').toLowerCase().includes(searchTerm.toLowerCase());

                const isOrcamento = p.settings?.classification === 'ORCAMENTO' || !p.settings?.classification; // Orçamento é o padrão
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

                return matchesSearch && matchesTab;
            })
            .sort((a, b) => {
                // Obras: sempre ordenar por código numérico crescente
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
                if (sortBy === 'recent') {
                    return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
                }
                if (sortBy === 'oldest') {
                    return new Date(a.updated_at || a.created_at || 0).getTime() - new Date(b.updated_at || b.created_at || 0).getTime();
                }
                if (sortBy === 'name-asc') {
                    return a.name.localeCompare(b.name);
                }
                if (sortBy === 'name-desc') {
                    return b.name.localeCompare(a.name);
                }
                return 0;
            });
    }, [projects, searchTerm, activeTab, classificationFilter, sortBy, isObraContext]);

    const getLinkedProjectData = (project: ProjectSummary) => {
        if (project.settings?.linkedProjectId) {
            return projects.find(p => p.id === project.settings.linkedProjectId);
        }
        if (project.settings?.linkedProjectName) {
            return projects.find(p => p.name === project.settings.linkedProjectName && p.settings?.classification === 'OBRA');
        }
        return null;
    };

    const getLinkedPlanning = (project: ProjectSummary) => {
        // 1. Helper: recursive discovery of the root Obra ID
        const findObraId = (p: ProjectSummary): string | null => {
            if (p.settings?.classification === 'OBRA') return p.id;
            if (p.settings?.linkedProjectId) {
                const linked = projects.find(op => op.id === p.settings.linkedProjectId);
                if (linked) return findObraId(linked);
            }
            if (p.settings?.linkedProjectName) {
                const linkedByName = projects.find(op => op.name === p.settings.linkedProjectName && op.settings?.classification === 'OBRA');
                if (linkedByName) return linkedByName.id;
            }
            return null;
        };

        // 2. Direct manual link to a Planning
        if (project.settings?.linkedProjectId) {
            const target = projects.find(p => p.id === project.settings.linkedProjectId);
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
                (siblingIds.has(p.settings?.linkedProjectId) || (rootObra && p.settings?.linkedProjectName === rootObra.name))
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
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsImportModalOpen(true)}
                            className="flex items-center gap-3 px-6 py-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-[1.25rem] hover:bg-emerald-600 hover:text-white font-black text-xs uppercase tracking-widest transition-all shadow-sm active:scale-95"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            Importar Excel
                        </button>
                        <button
                            onClick={() => onNewProject(classificationFilter || (activeTab === 'templates' ? 'OBRA' : 'ORCAMENTO'))}
                            className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            {isObraContext ? 'Nova Obra' : (isPlanejamentoContext ? 'Novo Planejamento' : (isDiarioContext ? 'Novo Diário' : 'Novo Orçamento'))}
                        </button>
                    </div>
                </div>
            )}

            {!classificationFilter && (
                <div className="flex space-x-1.5 bg-gray-100/50 p-1.5 rounded-[1.25rem] w-fit">
                    <button
                        onClick={() => setActiveTab('budgets')}
                        className={`flex items-center px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'budgets'
                            ? 'bg-white text-blue-600 shadow-lg shadow-gray-200/50'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        <FolderOpen className="w-4 h-4 mr-2" />
                        Orçamentos
                    </button>
                    <button
                        onClick={() => setActiveTab('templates')}
                        className={`flex items-center px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'templates'
                            ? 'bg-white text-blue-600 shadow-lg shadow-gray-200/50'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        <Copy className="w-4 h-4 mr-2" />
                        Obras / Modelos
                    </button>
                </div>
            )}

            <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por obra ou cliente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Ordenar:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-[1.25rem] px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    >
                        <option value="recent">Mais Recentes</option>
                        <option value="oldest">Mais Antigos</option>
                        <option value="name-asc">Nome (A-Z)</option>
                        <option value="name-desc">Nome (Z-A)</option>
                    </select>
                </div>
                <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Blocos"
                    >
                        <LayoutDashboard className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Linhas"
                    >
                        <Table2 className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {(isLoading || isExternalLoading) ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
            ) : filteredProjects.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border border-gray-200 border-dashed">
                    <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900">
                        {isDiaryContext ? 'Nenhum diário encontrado' : (activeTab === 'budgets' ? 'Nenhum orçamento encontrado' : 'Nenhuma obra encontrada')}
                    </h3>
                    <p className="text-gray-500 font-medium">
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
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    {isObraContext && (
                                        <th className="px-4 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] w-20 text-center">Código</th>
                                    )}
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                        {isDiaryContext ? 'Diário' : (isObraContext ? 'Obra' : (isPlanejamentoContext ? 'Planejamento' : 'Orçamento'))}
                                    </th>
                                    {isObraContext && organizations.length > 1 && (
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Organização</th>
                                    )}
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{isDiaryContext ? 'Último Diário' : (isObraContext ? 'Orçamentos Vinculados' : 'Obra Vinculada')}</th>
                                    {isDiaryContext && (
                                        <>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Obra Vinculada</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Planejamento Vinculado</th>
                                        </>
                                    )}
                                    {!isObraContext && (
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Cliente</th>
                                    )}
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{isDiaryContext ? 'Clima' : 'Atualização'}</th>
                                    {(!isObraContext || isDiaryContext) && (
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{isDiaryContext ? 'Status Diário' : 'Status Orç.'}</th>
                                    )}
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{isDiaryContext ? 'Total Registros' : 'Status Obra'}</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Bloqueio</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredProjects.map(project => (
                                    <tr
                                        key={project.id}
                                        onClick={() => onRowClick ? onRowClick(project.id) : onEditProject(project.id)}
                                        className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                                    >
                                        {isObraContext && (
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-sm font-black font-mono text-blue-700">
                                                    {project.code || project.settings?.code || '—'}
                                                </span>
                                            </td>
                                        )}
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
                                                    <FolderOpen className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">
                                                        {project.name}
                                                    </div>
                                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                                        CR: {new Date(project.created_at || 0).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        {isObraContext && organizations.length > 1 && (() => {
                                            const orgId = project.settings?.organizationId;
                                            const org = organizations.find(o => o.id === orgId);
                                            return (
                                                <td className="px-6 py-4">
                                                    {org ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 text-xs font-bold">
                                                            {org.name}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-300 italic">—</span>
                                                    )}
                                                </td>
                                            );
                                        })()}
                                        <td className="px-6 py-4">
                                            {isDiaryContext ? (
                                                <div className="flex flex-col">
                                                    <div className="text-sm font-bold text-gray-900 truncate max-w-[150px]">
                                                        {(project.settings?.diaryEntries && project.settings.diaryEntries.length > 0)
                                                            ? new Date(project.settings.diaryEntries[project.settings.diaryEntries.length - 1].date).toLocaleDateString()
                                                            : '-'}
                                                    </div>
                                                    <span className="text-[10px] text-gray-400 font-medium lowercase italic">Visto por último</span>
                                                </div>
                                            ) : (
                                                isObraContext ? (() => {
                                                    const linked = getLinkedBudgets(project.id);
                                                    const suggested = linked.length === 0 ? getSuggestedBudgetsForObra(project) : [];
                                                    if (linked.length > 0) return (
                                                        <div className="flex flex-wrap gap-1">
                                                            {linked.map(budget => (
                                                                <span key={budget.id} className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100/50">
                                                                    {budget.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    );
                                                    if (suggested.length > 0) return (
                                                        <div className="flex flex-col gap-1">
                                                            {suggested.map(s => (
                                                                <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded-md border border-amber-200" title={`Orçamento "${s.name}" tem o mesmo cliente e pode ser vinculado a esta Obra`}>
                                                                    <Link2 className="w-3 h-3 shrink-0" />
                                                                    <span className="text-[10px] font-black uppercase tracking-tight">{s.name}</span>
                                                                    <span className="text-[9px] font-bold text-amber-500 ml-0.5">Sugerido</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                    return <span className="text-xs text-gray-400 italic pl-2">-</span>;
                                                })() : (() => {
                                                    const linked = getLinkedProjectData(project);
                                                    if (linked) return (
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_3s_ease-in-out_infinite]"></div>
                                                            <span className="text-xs font-bold text-gray-700 bg-green-50 px-2 py-1 rounded-md border border-green-100/50">
                                                                {linked.name}
                                                            </span>
                                                        </div>
                                                    );
                                                    if (project.settings?.linkedProjectName) return (
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 opacity-50"></div>
                                                            <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-md border border-gray-100/50">
                                                                {project.settings.linkedProjectName}
                                                            </span>
                                                        </div>
                                                    );
                                                    const suggested = getSuggestedObraForOrcamento(project);
                                                    if (suggested) return (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded-md border border-amber-200" title={`Obra "${suggested.name}" tem o mesmo cliente e pode ser vinculada a este Orçamento`}>
                                                            <Link2 className="w-3 h-3 shrink-0" />
                                                            <span className="text-[10px] font-black uppercase tracking-tight">{suggested.name}</span>
                                                            <span className="text-[9px] font-bold text-amber-500 ml-0.5">Sugerido</span>
                                                        </div>
                                                    );
                                                    return <span className="text-xs text-gray-400 italic pl-2">-</span>;
                                                })()
                                            )}
                                        </td>
                                        {isDiaryContext && (
                                            <>
                                                <td className="px-6 py-4">
                                                    {getLinkedProjectData(project) ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                                                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 uppercase tracking-tighter">
                                                                OBRA: {getLinkedProjectData(project)?.name}
                                                            </span>
                                                        </div>
                                                    ) : <span className="text-xs text-gray-400 italic pl-2">-</span>}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {(() => {
                                                        const linked = getLinkedPlanning(project);
                                                        if (!linked) return <span className="text-xs text-gray-400 italic pl-2">-</span>;

                                                        return (
                                                            <div className="flex items-center gap-1.5">
                                                                <div className={`w-1.5 h-1.5 rounded-full ${linked.type === 'manual' ? 'bg-emerald-500' : 'bg-blue-500'} animate-pulse`}></div>
                                                                <span className={`text-[10px] font-bold px-2 py-1 rounded border uppercase tracking-tighter ${linked.type === 'manual'
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                                    : 'bg-blue-50 text-blue-700 border-blue-100'
                                                                    }`}>
                                                                    {linked.project.name}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                            </>
                                        )}
                                        {!isObraContext && (
                                            <td className="px-6 py-4">
                                                {(activeTab === 'templates' ? project.settings?.client : (getLinkedProjectData(project)?.settings?.client || project.settings?.client)) ? (
                                                    <span className="text-sm text-gray-600 font-medium">
                                                        {activeTab === 'templates' ? project.settings?.client : (getLinkedProjectData(project)?.settings?.client || project.settings.client)}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">-</span>
                                                )}
                                            </td>
                                        )}
                                        <td className="px-6 py-4">
                                            {isDiaryContext ? (
                                                <div className="flex items-center gap-2">
                                                    {(project.settings?.diaryEntries && project.settings.diaryEntries.length > 0) ? (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-600 rounded-md border border-blue-100/50 text-xs font-bold">
                                                            {project.settings.diaryEntries[project.settings.diaryEntries.length - 1].weatherMorning === 'sunny' ? (
                                                                <>☀ <span className="text-[10px] font-black uppercase">Sol</span></>
                                                            ) : project.settings.diaryEntries[project.settings.diaryEntries.length - 1].weatherMorning === 'cloudy' ? (
                                                                <>☁ <span className="text-[10px] font-black uppercase">Nublado</span></>
                                                            ) : (
                                                                <>🌧 <span className="text-[10px] font-black uppercase">Chuva</span></>
                                                            )}
                                                        </div>
                                                    ) : '-'}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1 text-sm text-gray-600">
                                                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                        {new Date(project.updated_at || project.created_at || 0).toLocaleDateString()}
                                                    </div>
                                                    <span className="text-xs text-gray-400">
                                                        {new Date(project.updated_at || project.created_at || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        {(!isObraContext || isDiaryContext) && (
                                            <td className="px-6 py-4">
                                                {isDiaryContext ? (
                                                    (project.settings?.diaryEntries && project.settings.diaryEntries.length > 0) ? (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700">
                                                            Atualizado
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-500">
                                                            Sem Registros
                                                        </span>
                                                    )
                                                ) : (
                                                    project.settings?.budgetStatus ? (
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider
                                                    ${project.settings.budgetStatus === 'Fechado' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {project.settings.budgetStatus}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 italic">-</span>
                                                    )
                                                )}
                                            </td>
                                        )}
                                        <td className="px-6 py-4">
                                            {isDiaryContext ? (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm font-bold text-gray-900">{project.settings?.diaryEntries?.length || 0}</span>
                                                    <span className="text-[10px] text-gray-400 font-medium uppercase">Dias</span>
                                                </div>
                                            ) : (
                                                project.settings?.obraStatus ? (
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider
                                                ${project.settings.obraStatus === 'Concluída' ? 'bg-indigo-100 text-indigo-700' :
                                                            project.settings.obraStatus === 'Não Iniciado' ? 'bg-gray-100 text-gray-600' :
                                                                'bg-sky-100 text-sky-700'}`}>
                                                        {project.settings.obraStatus}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">-</span>
                                                )
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center">
                                                {getEffectiveOrderCount(project.id) > 0 ? (
                                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded-md border border-amber-100" title={`${getEffectiveOrderCount(project.id)} orçamento(s)/pedido(s) vinculados - Exclusão Bloqueada`}>
                                                        <Lock className="w-3.5 h-3.5" />
                                                        <span className="text-[10px] font-black uppercase tracking-tight">Bloqueado</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100" title="Sem pedidos vinculados - Exclusão Permitida">
                                                        <Unlock className="w-3.5 h-3.5" />
                                                        <span className="text-[10px] font-black uppercase tracking-tight">Livre</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        {!isObraContext && !isPlanejamentoContext && !isDiaryContext && (
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onLoadProject(project.id, 'dashboard'); }}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5"
                                                    title="Curva ABC"
                                                >
                                                    <LayoutDashboard className="w-4 h-4" />
                                                    <span className="text-[10px] font-bold uppercase hidden lg:inline">Curva ABC</span>
                                                </button>
                                            </td>
                                        )}
                                        {isPlanejamentoContext && (
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onLoadProject(project.id, 'planning-view'); }}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5"
                                                    title="Cronograma"
                                                >
                                                    <Calendar className="w-4 h-4" />
                                                    <span className="text-[10px] font-bold uppercase hidden lg:inline">Cronograma</span>
                                                </button>
                                            </td>
                                        )}
                                        {isDiaryContext && (
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onLoadProject(project.id, 'project-diary'); }}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 group/act"
                                                    title="Abrir Diário"
                                                >
                                                    <BookOpen className="w-4 h-4 group-hover/act:scale-110 transition-transform" />
                                                    <span className="text-[10px] font-bold uppercase hidden lg:inline">Abrir Diário</span>
                                                </button>
                                            </td>
                                        )}
                                        {!isObraContext && !isDiaryContext && (
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onLoadProject(project.id, 'analytic'); }}
                                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1.5"
                                                    title={project.settings?.budgetType === 'PARAMETRIC' ? "Paramétrico" : "Analítico"}
                                                >
                                                    <Table2 className="w-4 h-4" />
                                                    <span className="text-[10px] font-bold uppercase hidden lg:inline">
                                                        {project.settings?.budgetType === 'PARAMETRIC' ? 'Paramétrico' : 'Analítico'}
                                                    </span>
                                                </button>
                                            </td>
                                        )}
                                        <td className="px-6 py-4 text-right">
                                            <div onClick={(e) => e.stopPropagation()}>
                                                <InlineDisclosureMenu
                                                    menuItems={[
                                                        {
                                                            icon: <Pencil className="w-[18px] h-[18px]" />,
                                                            label: 'Editar Dados',
                                                            onClick: () => onEditProject(project.id),
                                                        },
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
                                                    onDelete={() => handleDelete({ stopPropagation: () => {} } as React.MouseEvent, project.id, project.name)}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects.map(project => (
                            <div
                                key={project.id}
                                onClick={() => onRowClick ? onRowClick(project.id) : onEditProject(project.id)}
                                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group flex flex-col"
                            >
                                <div className="p-5 flex-1">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                                            <FolderOpen className="w-6 h-6" />
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {!isObraContext && project.settings?.budgetStatus && (
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider
                                                ${project.settings.budgetStatus === 'Fechado' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {project.settings.budgetStatus}
                                                </span>
                                            )}
                                            {project.settings?.obraStatus && (
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider
                                                ${project.settings.obraStatus === 'Concluída' ? 'bg-indigo-100 text-indigo-700' :
                                                        project.settings.obraStatus === 'Não Iniciado' ? 'bg-gray-100 text-gray-600' :
                                                            'bg-sky-100 text-sky-700'}`}>
                                                    {project.settings.obraStatus}
                                                </span>
                                            )}
                                            {getEffectiveOrderCount(project.id) > 0 ? (
                                                <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                                                    <Lock className="w-2.5 h-2.5" />
                                                    Bloqueado
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                                                    <Unlock className="w-2.5 h-2.5" />
                                                    Livre
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        {(project.code || project.settings?.code) && (
                                            <span className="text-[11px] font-black font-mono text-blue-700 shrink-0 mt-1">
                                                {project.code || project.settings?.code}
                                            </span>
                                        )}
                                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 flex-1">
                                            {project.name}
                                        </h3>
                                    </div>
                                    {!isObraContext && (
                                        <p className="text-sm text-gray-500 mt-1 mb-4 flex items-center gap-1.5 font-medium">
                                            {project.settings?.client || 'Cliente não definido'}
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
                                                <div className="text-[10px] text-gray-400">{new Date(project.updated_at || project.created_at || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-gray-50 rounded-b-[2.5rem] border-t border-gray-100 flex items-center justify-between">
                                    {!isObraContext && !isPlanejamentoContext && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onLoadProject(project.id, 'dashboard'); }}
                                                className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                title="Curva ABC"
                                            >
                                                <LayoutDashboard className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onLoadProject(project.id, 'analytic'); }}
                                                className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                                                title="Orçamento Analítico"
                                            >
                                                <Table2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                    {isPlanejamentoContext && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onLoadProject(project.id, 'planning-view'); }}
                                                className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                title="Cronograma"
                                            >
                                                <Calendar className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                    <div onClick={(e) => e.stopPropagation()}>
                                        <InlineDisclosureMenu
                                            menuItems={[
                                                {
                                                    icon: <Pencil className="w-[18px] h-[18px]" />,
                                                    label: 'Editar Dados',
                                                    onClick: () => onEditProject(project.id),
                                                },
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
                                            onDelete={() => handleDelete({ stopPropagation: () => {} } as React.MouseEvent, project.id, project.name)}
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
