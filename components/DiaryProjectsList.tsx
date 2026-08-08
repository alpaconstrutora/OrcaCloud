import React from 'react';
import {
    BookOpen,
    Search,
    Plus,
    RefreshCw,
    MoveHorizontal,
    Building2,
    CheckCircle2,
    AlertTriangle,
    CalendarClock,
    TrendingUp,
} from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, FileDownloadIcon } from '@hugeicons/core-free-icons';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { useConfirm } from './ui/confirm';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import { onlyDiarios, isObra } from '../utils/projectClassification';
import { projectService } from '../services/projectService';
import { useStore } from '../store/useStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DiaryEntryLike = any;

interface ProjectSummary {
    id: string;
    name: string;
    code?: string;
    updated_at?: string;
    created_at?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings?: any;
}

interface DiaryProjectsListProps {
    /** Lista completa (`allProjects`) — o diário não vive em `projects` (CLAUDE.md regra #3). */
    projects: ProjectSummary[];
    organizations?: { id: string; name: string }[];
    onOpenDiary: (id: string) => void;
    onEditProject: (id: string) => void;
    onNewProject: () => void;
    onDuplicateProject: (id: string) => void;
    onExportProject: (id: string) => void;
    /** Atalho para Engenharia › Análise de Equipes (mesma base de dados do diário). */
    onOpenLaborAnalytics?: () => void;
}

const COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Diário', sortable: true },
    { key: 'obra', label: 'Obra vinculada', sortable: true },
    { key: 'organization', label: 'Organização', sortable: true },
    { key: 'entries', label: 'Registros', sortable: true },
    { key: 'lastEntry', label: 'Último registro', sortable: true },
    { key: 'impediments', label: 'Impedimentos', sortable: true },
    { key: 'status', label: 'Situação', sortable: true },
    { key: 'updated', label: 'Atualização', sortable: true },
];

// §6.1 — larguras padrão; ajustáveis por arraste e por `autoFit()`.
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    code: 118, name: 240, obra: 210, organization: 170, entries: 133,
    lastEntry: 169, impediments: 165, status: 150, updated: 149, actions: 200,
};

/** Dias sem registro a partir dos quais o diário é considerado desatualizado. */
const DIAS_PARA_DESATUALIZADO = 7;

type Situacao = 'Em dia' | 'Desatualizado' | 'Sem registros';

/** §8 — texto colorido simples, sem pílula/fundo/uppercase. */
const StatusBadge = ({ status }: { status: Situacao }) => {
    const colors: Record<Situacao, string> = {
        'Em dia': 'text-green-600',
        'Desatualizado': 'text-amber-600',
        'Sem registros': 'text-gray-600',
    };
    return <span className={`text-sm font-normal ${colors[status]}`}>{status}</span>;
};

/**
 * Data de registro do diário vem como 'YYYY-MM-DD' (sem hora). `new Date()` sobre
 * essa string interpreta como UTC e, em UTC-3, a data volta um dia. Ancorar ao
 * meio-dia local resolve — mesmo cuidado do Gantt do Planejamento.
 */
const parseDiaryDate = (raw?: string): Date | null => {
    if (!raw) return null;
    const d = new Date(`${String(raw).slice(0, 10)}T12:00:00`);
    return isNaN(d.getTime()) ? null : d;
};

const formatDate = (d: Date | null): string => (d ? d.toLocaleDateString('pt-BR') : '-');

interface DiaryRow {
    project: ProjectSummary;
    code: string;
    name: string;
    obra: string;
    organization: string;
    entries: number;
    lastEntry: Date | null;
    impediments: number;
    status: Situacao;
    updated: Date | null;
}

const DiaryProjectsList: React.FC<DiaryProjectsListProps> = ({
    projects,
    organizations = [],
    onOpenDiary,
    onEditProject,
    onNewProject,
    onDuplicateProject,
    onExportProject,
    onOpenLaborAnalytics,
}) => {
    const [searchTerm, setSearchTerm] = usePersistedState<string>('diaryProjects:search', '');
    const [situacaoFilter, setSituacaoFilter] = usePersistedState<'all' | Situacao>('diaryProjects:situacao', 'all');
    const tableColumns = useTableColumns(COLUMNS, 'diaryProjectsColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'diaryProjectsColWidths');
    const confirm = useConfirm();

    const fetchProjects = useStore(s => s.fetchProjects);
    const storeOrganizations = useStore(s => s.organizations);
    const projectsLoading = useStore(s => s.projectsLoading);

    const orgList = organizations.length > 0 ? organizations : storeOrganizations;

    const reload = React.useCallback(() => {
        // Sem organização ativa ("Todas as organizações") a leitura NÃO é bloqueada —
        // o service não filtra e a RLS recorta (CLAUDE.md regra #5).
        void fetchProjects(storeOrganizations as never);
    }, [fetchProjects, storeOrganizations]);

    /**
     * Mesmo recorte que a tela usava antes: projetos classificados como DIARIO
     * mais obras que já têm registros de diário pendurados em `settings`.
     */
    const rows = React.useMemo<DiaryRow[]>(() => {
        const diarios = projects.filter(p => onlyDiarios([p]).length > 0 || (isObra(p) && (p.settings?.diaryEntries?.length || 0) > 0));

        return diarios.map(p => {
            const entries: DiaryEntryLike[] = p.settings?.diaryEntries || [];
            let lastEntry: Date | null = null;
            let impediments = 0;

            entries.forEach(e => {
                if (e?.impediments && String(e.impediments).trim() !== '') impediments++;
                const d = parseDiaryDate(e?.date);
                if (d && (!lastEntry || d > lastEntry)) lastEntry = d;
            });

            const last = lastEntry as Date | null;
            const diasSemRegistro = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null;
            const status: Situacao = entries.length === 0
                ? 'Sem registros'
                : (diasSemRegistro !== null && diasSemRegistro > DIAS_PARA_DESATUALIZADO ? 'Desatualizado' : 'Em dia');

            const orgId = p.settings?.organizationId;

            return {
                project: p,
                code: p.code || p.settings?.code || '',
                name: p.name,
                obra: p.settings?.linkedProjectName || '',
                organization: orgList.find(o => o.id === orgId)?.name || '',
                entries: entries.length,
                lastEntry: last,
                impediments,
                status,
                updated: p.updated_at || p.created_at ? new Date(p.updated_at || p.created_at as string) : null,
            };
        });
    }, [projects, orgList]);

    const kpis = React.useMemo(() => {
        const totalEntries = rows.reduce((s, r) => s + r.entries, 0);
        const totalImpediments = rows.reduce((s, r) => s + r.impediments, 0);
        const desatualizados = rows.filter(r => r.status === 'Desatualizado').length;
        const ultima = rows.reduce<Date | null>((acc, r) => (r.lastEntry && (!acc || r.lastEntry > acc) ? r.lastEntry : acc), null);
        const comRegistros = rows.filter(r => r.entries > 0).length;
        return { totalEntries, totalImpediments, desatualizados, ultima, comRegistros };
    }, [rows]);

    const filteredRows = React.useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const result = rows.filter(r => {
            const matchesSearch = !term
                || r.name.toLowerCase().includes(term)
                || r.obra.toLowerCase().includes(term)
                || r.code.toLowerCase().includes(term);
            const matchesSituacao = situacaoFilter === 'all' || r.status === situacaoFilter;
            return matchesSearch && matchesSituacao;
        });

        // §6.4 — sem dropdown de ordenação: o default (mais recente primeiro) vive aqui.
        return result.sort((a, b) => {
            const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
            switch (tableColumns.sortColumn) {
                case 'code': return a.code.localeCompare(b.code, 'pt-BR', { numeric: true }) * dir;
                case 'name': return a.name.localeCompare(b.name) * dir;
                case 'obra': return a.obra.localeCompare(b.obra) * dir;
                case 'organization': return a.organization.localeCompare(b.organization) * dir;
                case 'entries': return (a.entries - b.entries) * dir;
                case 'impediments': return (a.impediments - b.impediments) * dir;
                case 'status': return a.status.localeCompare(b.status) * dir;
                case 'lastEntry': return ((a.lastEntry?.getTime() || 0) - (b.lastEntry?.getTime() || 0)) * dir;
                case 'updated': return ((a.updated?.getTime() || 0) - (b.updated?.getTime() || 0)) * dir;
                default:
                    return (b.lastEntry?.getTime() || 0) - (a.lastEntry?.getTime() || 0);
            }
        });
    }, [rows, searchTerm, situacaoFilter, tableColumns.sortColumn, tableColumns.sortDirection]);

    const handleDelete = async (row: DiaryRow) => {
        const ok = await confirm({
            title: 'Excluir diário?',
            message: `Tem certeza que deseja excluir o diário "${row.name}"${row.entries > 0 ? ` e seus ${row.entries} registro(s)` : ''}? Essa ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await projectService.deleteProject(row.project.id);
            reload();
        } catch (error: unknown) {
            console.error('Erro ao excluir diário:', error);
        }
    };

    // §6.1 — largura da tabela é a SOMA exata das colunas visíveis, nunca w-full.
    const tableTotalWidth = COLUMNS.reduce(
        (sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0),
        0,
    ) + cols.getWidth('actions');

    const headerProps = {
        sortColumn: tableColumns.sortColumn,
        sortDirection: tableColumns.sortDirection,
        onSort: tableColumns.handleColumnSort,
        uppercase: false,
    };

    return (
        <div className="space-y-6">
            {/* §20 — h1 solto + subtítulo mt-1.5 */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestão de Projetos</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    Diários de obra da sua operação: registros, impedimentos e atualização de cada projeto.
                </p>
            </div>

            {/* §4 + §20.1 — grade simétrica, cor semântica por KPI, mb-3 fecha o bloco de cromo */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard
                    label="Diários"
                    value={rows.length}
                    sub={`${kpis.comRegistros} com registros`}
                    icon={<BookOpen className="w-5 h-5" />}
                    color="blue"
                />
                <KpiCard
                    label="Registros totais"
                    value={kpis.totalEntries}
                    icon={<CheckCircle2 className="w-5 h-5" />}
                    color="emerald"
                />
                <KpiCard
                    label="Impedimentos"
                    value={kpis.totalImpediments}
                    sub={`${kpis.desatualizados} diário(s) desatualizado(s)`}
                    icon={<AlertTriangle className="w-5 h-5" />}
                    color="amber"
                    pulse={kpis.desatualizados > 0}
                />
                <KpiCard
                    label="Última atividade"
                    value={formatDate(kpis.ultima)}
                    icon={<CalendarClock className="w-5 h-5" />}
                    color="gray"
                />
            </div>

            {/* §5.3 — barra de escopo (situação) à esquerda, ação primária à direita */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={situacaoFilter}
                        onChange={(e) => setSituacaoFilter(e.target.value as 'all' | Situacao)}
                        className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                    >
                        <option value="all">Todas as situações</option>
                        <option value="Em dia">Em dia</option>
                        <option value="Desatualizado">Desatualizado</option>
                        <option value="Sem registros">Sem registros</option>
                    </select>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {onOpenLaborAnalytics && (
                        <button
                            onClick={onOpenLaborAnalytics}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-blue-600 border border-gray-200 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] transition-all active:scale-95"
                        >
                            <TrendingUp className="w-[15px] h-[15px]" />
                            Análise de equipes
                        </button>
                    )}
                    {/* §17 — variante compacta é a única válida */}
                    <button
                        onClick={onNewProject}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo diário
                    </button>
                </div>
            </div>

            {/* §5.2 — toolbar acoplada: toolbar e tabela em um único card */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por diário, obra vinculada ou código..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        <button
                            onClick={reload}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Atualizar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            {/* §6.1.2 — autofit só sob comando explícito */}
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {projectsLoading && rows.length === 0 ? (
                    /* §11 */
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filteredRows.length === 0 ? (
                    /* §12 — dentro do card acoplado, sem moldura própria */
                    <div className="text-center py-12">
                        <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum diário encontrado</h3>
                        <p className="text-sm text-gray-500">
                            {searchTerm || situacaoFilter !== 'all'
                                ? 'Tente ajustar seus filtros de busca.'
                                : 'Crie o primeiro diário de obra no botão acima.'}
                        </p>
                    </div>
                ) : (
                    /* §6.5 — cabeçalho fixo em tabela longa */
                    <div className="overflow-auto max-h-[70vh]">
                        <table
                            ref={cols.tableRef}
                            className="text-left border-collapse"
                            style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}
                        >
                            <colgroup>
                                {COLUMNS.map(c => (
                                    tableColumns.visibleColumns.includes(c.key) && (
                                        <col key={c.key} data-col-key={c.key} style={{ width: `${cols.getWidth(c.key)}px` }} />
                                    )
                                ))}
                                {/* §6.1.1 — espaçador ANTES de "Ações": absorve a folga no meio
                                    e mantém "Ações" ancorada na borda direita do card. */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.visibleColumns.includes('code') && (
                                        <SortableHeader colKey="code" label="Código" {...headerProps}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="code" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('name') && (
                                        <SortableHeader colKey="name" label="Diário" {...headerProps}
                                            className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="name" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('obra') && (
                                        <SortableHeader colKey="obra" label="Obra vinculada" {...headerProps}
                                            className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="obra" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('organization') && (
                                        <SortableHeader colKey="organization" label="Organização" {...headerProps}
                                            className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="organization" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('entries') && (
                                        <SortableHeader colKey="entries" label="Registros" {...headerProps}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="entries" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('lastEntry') && (
                                        <SortableHeader colKey="lastEntry" label="Último registro" {...headerProps}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="lastEntry" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('impediments') && (
                                        <SortableHeader colKey="impediments" label="Impedimentos" {...headerProps}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="impediments" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader colKey="status" label="Situação" {...headerProps}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="status" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('updated') && (
                                        <SortableHeader colKey="updated" label="Atualização" {...headerProps}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="updated" />
                                        </SortableHeader>
                                    )}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                        Ações
                                        <cols.ResizeHandle colKey="actions" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredRows.map(row => (
                                    <tr
                                        key={row.project.id}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                        onClick={() => onOpenDiary(row.project.id)}
                                    >
                                        {tableColumns.visibleColumns.includes('code') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                {row.code || '-'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('name') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                                        <BookOpen className="w-4 h-4" />
                                                    </div>
                                                    <span className="text-sm font-normal text-gray-900 truncate" title={row.name}>{row.name}</span>
                                                </div>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('obra') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {row.obra ? (
                                                    <div className="flex items-center gap-1.5 text-sm font-normal text-blue-600">
                                                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                                                        <span className="truncate" title={row.obra}>{row.obra}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm font-normal text-gray-400">-</span>
                                                )}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('organization') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 truncate">
                                                {row.organization || '-'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('entries') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {row.entries}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('lastEntry') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                {formatDate(row.lastEntry)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('impediments') && (
                                            <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal ${row.impediments > 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                                                {row.impediments}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('status') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <StatusBadge status={row.status} />
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('updated') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                {row.updated ? row.updated.toLocaleDateString('pt-BR') : '-'}
                                            </td>
                                        )}
                                        <td aria-hidden="true" className="border-r border-gray-100"></td>
                                        {/* §9 — ação primária em texto azul + ícone secundário + kebab */}
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => onOpenDiary(row.project.id)}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all"
                                                >
                                                    Abrir diário
                                                </button>
                                                <ActionIconButton kind="edit" onClick={() => onEditProject(row.project.id)} />
                                                <InlineDisclosureMenu
                                                    menuItems={[
                                                        {
                                                            icon: <HugeiconsIcon icon={Copy01Icon} size={18} />,
                                                            label: 'Duplicar',
                                                            onClick: () => onDuplicateProject(row.project.id),
                                                        },
                                                        {
                                                            icon: <HugeiconsIcon icon={FileDownloadIcon} size={18} />,
                                                            label: 'Exportar',
                                                            onClick: () => onExportProject(row.project.id),
                                                        },
                                                    ]}
                                                    showDelete
                                                    onDelete={() => handleDelete(row)}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DiaryProjectsList;
