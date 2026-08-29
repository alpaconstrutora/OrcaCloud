import React from 'react';
import { Plus, FileText, Calendar, Clock, Search, RefreshCw, LayoutDashboard, Table2, ArrowRight, AlertCircle, MoveHorizontal } from 'lucide-react';
import { QuotationRequest } from '../types';
import { quotationService } from '../services/quotationService';
import { empreendimentoService } from '../services/empreendimentoService';
import { useOrgContext } from '../hooks/useOrgContext';
import EmpreendimentoCell from './empreendimento/EmpreendimentoCell';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';

const COLUMNS: ColumnConfig[] = [
    { key: 'number', label: 'Número', sortable: true },
    { key: 'title', label: 'Título / Obra', sortable: true },
    { key: 'empreendimento', label: 'Empreendimento', sortable: true },
    { key: 'deadline', label: 'Prazo Final', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    number: 130, title: 320, empreendimento: 184, deadline: 160, status: 140, actions: 220,
};

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa a
// busca já existente, não a substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'number', label: 'Número', type: 'text' },
    { key: 'title', label: 'Título', type: 'text' },
    { key: 'project', label: 'Obra', type: 'text' },
    { key: 'empreendimento', label: 'Empreendimento', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'Aberta', label: 'Aberta' }, { value: 'Em Análise', label: 'Em Análise' },
        { value: 'Concluída', label: 'Concluída' }, { value: 'Cancelada', label: 'Cancelada' },
    ] },
    { key: 'deadline', label: 'Prazo Final', type: 'date' },
];

function getAdvancedFilterValue(
    req: QuotationRequest,
    key: string,
    empreendimentoByProject: Record<string, { name: string }> = {},
): unknown {
    switch (key) {
        case 'number': return req.number;
        case 'title': return req.title;
        case 'project': return req.projectName ?? '';
        case 'empreendimento': return (req.projectId ? empreendimentoByProject[req.projectId]?.name : '') ?? '';
        case 'status': return req.status;
        case 'deadline': return req.deadline ?? null;
        default: return null;
    }
}

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica de fora: é renderizada fixa fora do drag.
const QUOTATION_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    number: { label: 'Número', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    title: { label: 'Título / Obra', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    empreendimento: { label: 'Empreendimento', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    deadline: { label: 'Prazo Final', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

// Badge de status — sem estado próprio, movida para escopo de módulo para poder
// ser usada dentro de renderQuotationCell (função pura, fora do componente) e
// também na visão em blocos.
const QuotationStatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
        'Aberta': 'text-blue-700',
        'Em Análise': 'text-amber-700',
        'Concluída': 'text-emerald-700',
        'Cancelada': 'text-gray-700',
    };
    return (
        <span className={`text-sm font-normal ${colors[status] || 'text-gray-600'}`}>
            {status}
        </span>
    );
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderQuotationCell(
    key: string,
    req: QuotationRequest,
    ctx: { empreendimentoByProject: Record<string, { id: string; name: string; towerName?: string }> },
): React.ReactNode {
    switch (key) {
        case 'number':
            return <span className="text-sm font-normal text-gray-600">{req.number || req.id.slice(0, 8)}</span>;
        case 'title':
            return (
                <div className="flex flex-col">
                    <span className="text-sm font-normal text-gray-700">{req.title}</span>
                    <span className="text-xs font-normal text-gray-400">{req.projectName}</span>
                </div>
            );
        case 'empreendimento':
            return <EmpreendimentoCell value={req.projectId ? ctx.empreendimentoByProject[req.projectId] : undefined} />;
        case 'deadline':
            return (
                <div className="flex items-center gap-2 text-sm font-normal text-gray-600">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {new Date(req.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}
                </div>
            );
        case 'status':
            return <QuotationStatusBadge status={req.status} />;
        default:
            return null;
    }
}

interface SupplyChainQuotationListProps {
    onCreateNew: () => void;
    onViewDetails: (id: string) => void;
    onViewComparison: (id: string) => void;
}

const SupplyChainQuotationList: React.FC<SupplyChainQuotationListProps> = ({ onCreateNew, onViewDetails, onViewComparison }) => {
    const [requests, setRequests] = React.useState<QuotationRequest[]>([]);
    // A tela não recebe organização por prop — `useOrgContext` é a fonte oficial
    // (CLAUDE.md regra #5). `orgId` nulo = "Todas": não bloqueia, a RLS recorta.
    const { orgId } = useOrgContext();
    // Obra → empreendimento: a cotação não tem FK para empreendimento.
    const [empreendimentoByProject, setEmpreendimentoByProject] = React.useState<Record<string, { id: string; name: string; towerName?: string }>>({});
    const [loading, setLoading] = React.useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('supplyChainQuotationFilters:search', '');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('supplyChainQuotationFilters:viewMode', 'list');
    const tableColumns = useTableColumns(COLUMNS, 'supplyChainQuotationColumns');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'supplyChainQuotationFilters:advanced');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'supplyChainQuotationColWidths');
    // Largura total = soma exata das colunas visíveis. NUNCA w-full/100% junto com
    // table-layout:fixed (§6.1).
    const tableTotalWidth = COLUMNS.filter(c => c.key !== 'actions')
        .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0)
        + cols.getWidth('actions');
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const data = await quotationService.listRequests();
                if (!cancelled) setRequests(data);
            } catch (err) {
                console.error("Error loading quotations:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    React.useEffect(() => {
        let cancelled = false;
        empreendimentoService.mapObrasToEmpreendimentos(orgId)
            .then(map => { if (!cancelled) setEmpreendimentoByProject(map); })
            .catch(() => { if (!cancelled) setEmpreendimentoByProject({}); });
        return () => { cancelled = true; };
    }, [orgId]);

    const loadRequests = async () => {
        try {
            setLoading(true);
            const data = await quotationService.listRequests();
            setRequests(data);
        } catch (err) {
            console.error("Error loading quotations:", err);
        } finally {
            setLoading(false);
        }
    };

    // Concluída já gerou Pedido de Compra (selectWinner) — excluir a cotação nesse
    // ponto deixaria o pedido órfão de sua origem.
    const canDelete = (status: string) => status !== 'Concluída';

    const handleDelete = async (id: string) => {
        try {
            await quotationService.deleteRequest(id);
            await loadRequests();
            notify('Cotação excluída com sucesso!');
        } catch (err: any) {
            console.error('Error deleting quotation:', err);
            notify(`Erro ao excluir cotação: ${err.message || 'Erro desconhecido'}`, 'error');
        }
    };

    const filteredRequests = React.useMemo(() => {
        let filtered = requests.filter(req =>
            req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (req.projectName && req.projectName.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        filtered = applyFilterRules(filtered, advancedFilters.rules, ADVANCED_FILTER_FIELDS,
            (req, key) => getAdvancedFilterValue(req, key, empreendimentoByProject));

        if (tableColumns.sortColumn) {
            const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
            const empName = (r: QuotationRequest) => (r.projectId ? empreendimentoByProject[r.projectId]?.name : '') ?? '';
            return [...filtered].sort((a, b) => {
                if (tableColumns.sortColumn === 'number') return a.number.localeCompare(b.number) * dir;
                if (tableColumns.sortColumn === 'title') return a.title.localeCompare(b.title) * dir;
                if (tableColumns.sortColumn === 'empreendimento') return empName(a).localeCompare(empName(b)) * dir;
                if (tableColumns.sortColumn === 'deadline') return a.deadline.localeCompare(b.deadline) * dir;
                return 0;
            });
        }
        return filtered;
    }, [requests, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection, advancedFilters.rules, empreendimentoByProject]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Cotações de Suprimentos</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie solicitações de preço e mapas comparativos com visão estratégica.</p>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <KpiCard shadow={false} size="sm" label="Total" value={requests.length} sub="Cotações registradas" icon={<FileText className="w-4 h-4" />} color="blue" />
                <KpiCard shadow={false} size="sm" label="Abertas" value={requests.filter(r => r.status === 'Aberta').length} sub="Aguardando respostas" icon={<Clock className="w-4 h-4" />} color="amber" pulse />
                <KpiCard shadow={false} size="sm" label="Em Análise" value={requests.filter(r => r.status === 'Em Análise').length} sub="Comparando propostas" icon={<Search className="w-4 h-4" />} color="indigo" />
                <KpiCard shadow={false} size="sm" label="Concluídas" value={requests.filter(r => r.status === 'Concluída').length} sub="Pedidos gerados" icon={<Plus className="w-4 h-4" />} color="emerald" />
            </div>

            {/* Toolbar de botões (§4) — sem controles de escopo (conta/competência/período)
                nesta tela, então só a ação primária, alinhada à direita. */}
            <div className="flex items-center justify-end bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <button
                    onClick={onCreateNew}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Nova cotação
                </button>
            </div>

            {/* Toolbar acoplada à tabela (§5.2, padrão OpuraDocsModule/GED) — toolbar e
                conteúdo dividem um único card (border/rounded/shadow só no container
                pai); a costura visível entre os dois é o border-b da toolbar. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex flex-col md:flex-row gap-2.5 items-center p-2 border-b border-gray-100 bg-white">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por título, número ou obra..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>

                <button
                    onClick={loadRequests}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>

                <div className="flex items-center h-9">
                    <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                </div>

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
                    {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                        Duplo clique no divisor segue "restaurar padrão". Só em modo
                        lista: no modo blocos não há coluna para ajustar. */}
                    {viewMode === 'list' && (
                        <button
                            onClick={() => cols.autoFit()}
                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                            title="Ajustar largura das colunas ao conteúdo"
                        >
                            <MoveHorizontal className="w-4 h-4" />
                        </button>
                    )}
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

            {/* List / Grid — sem bg/border/rounded próprios: já está dentro do card
                acoplado toolbar+conteúdo (ver abertura acima) */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando cotações...</p>
                </div>
            ) : filteredRequests.length > 0 ? (
                viewMode === 'list' ? (
                    <div>
                        <div className="overflow-x-auto">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                    borda de "Ações" não andar a cada redimensionamento. */}
                                <col />
                                {tableColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
                            </colgroup>
                            {/* thead em sentence case (§6.2) — escala compacta; uppercase={false} porque
                                SortableHeader força uppercase internamente por padrão. */}
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = QUOTATION_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredRequests.map(req => (
                                    <tr
                                        key={req.id}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                        onClick={() => onViewDetails(req.id)}
                                    >
                                        {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {renderQuotationCell(key, req, { empreendimentoByProject })}
                                            </td>
                                        ))}
                                        {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                        <td aria-hidden="true" className="border-r border-gray-100"></td>
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onViewDetails(req.id); }}
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        Ver Detalhes
                                                    </button>
                                                    <ActionIconButton
                                                        kind="view"
                                                        title="Ver mapa comparativo"
                                                        icon={<Table2 className="w-4 h-4" />}
                                                        onClick={(e) => { e.stopPropagation(); onViewComparison(req.id); }}
                                                    />
                                                    <ActionIconButton
                                                        kind="edit"
                                                        title="Editar cotação"
                                                        onClick={(e) => { e.stopPropagation(); onViewDetails(req.id); }}
                                                    />
                                                    <InlineDisclosureMenu
                                                        showDelete
                                                        onDelete={() => handleDelete(req.id)}
                                                        deleteDisabled={!canDelete(req.status)}
                                                        deleteDisabledTitle={!canDelete(req.status) ? `Cotação "${req.status}" não pode ser excluída` : undefined}
                                                    />
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                        {filteredRequests.map(req => (
                            <div
                                key={req.id}
                                className="bg-white p-5 rounded-[10px] border border-gray-100 shadow-sm hover:shadow-md transition-all group overflow-hidden relative cursor-pointer"
                                onClick={() => onViewDetails(req.id)}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-[6px] group-hover:bg-blue-600 group-hover:text-white transition-all">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <QuotationStatusBadge status={req.status} />
                                </div>

                                <h3 className="text-sm font-bold text-gray-900 mb-1">
                                    #{req.number}
                                </h3>
                                <p className="text-sm font-normal text-gray-700 mb-1">{req.title}</p>
                                <p className="text-xs text-gray-400 font-medium mb-1">
                                    Obra: {req.projectName}
                                </p>
                                <p className="text-xs text-gray-400 font-medium mb-4">
                                    Empreendimento: {(req.projectId ? empreendimentoByProject[req.projectId]?.name : null) ?? '—'}
                                </p>

                                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                    <div className="flex flex-col">
                                        <p className="text-xs text-gray-400 font-medium mb-1">Prazo final</p>
                                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                                            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                                            {new Date(req.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        <ActionIconButton
                                            kind="view"
                                            title="Ver mapa comparativo"
                                            icon={<Table2 className="w-4 h-4" />}
                                            onClick={() => onViewComparison(req.id)}
                                        />
                                        <ActionIconButton
                                            kind="edit"
                                            title="Editar cotação"
                                            onClick={() => onViewDetails(req.id)}
                                        />
                                        <InlineDisclosureMenu
                                            showDelete
                                            onDelete={() => handleDelete(req.id)}
                                            deleteDisabled={!canDelete(req.status)}
                                            deleteDisabledTitle={!canDelete(req.status) ? `Cotação "${req.status}" não pode ser excluída` : undefined}
                                        />
                                        <button
                                            onClick={() => onViewDetails(req.id)}
                                            className="flex items-center gap-1.5 h-9 px-3 bg-gray-50 text-gray-700 rounded-[6px] text-[13px] font-medium hover:bg-gray-100 transition-all active:scale-95"
                                        >
                                            Detalhes <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma cotação encontrada</h3>
                    <p className="text-sm text-gray-500 mb-6">Comece criando uma nova solicitação de cotação para suas obras.</p>
                    <button
                        onClick={onCreateNew}
                        className="text-blue-600 font-bold hover:underline"
                    >
                        Criar minha primeira cotação
                    </button>
                </div>
            )}
            </div>

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default SupplyChainQuotationList;
