import React from 'react';
import { Package, Plus, Search, Filter, LayoutDashboard, Table2, ArrowRight, Clock, Truck, DollarSign, Calendar, Copy, Trash2, AlertCircle, TrendingUp, AlertTriangle, CheckCircle2, FileCheck, X, RefreshCw, MoveHorizontal } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { supabase } from '../lib/supabase';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import { formatMoney, formatDateBR } from './ui/Format';

const COLUMNS: ColumnConfig[] = [
    { key: 'number', label: 'Número', sortable: true },
    { key: 'obra', label: 'Obra', sortable: true },
    { key: 'orcamento', label: 'Orçamento', sortable: true },
    { key: 'supplier', label: 'Fornecedor', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'date', label: 'Data do Pedido', sortable: true },
    { key: 'value', label: 'Valor Total', sortable: true },
    { key: 'items', label: 'Itens', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    number: 120, obra: 160, orcamento: 140, supplier: 200, status: 140, date: 140, value: 140, items: 100, actions: 220,
};

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa a
// busca/filtro "Sem NF-e" já existentes, não os substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'number', label: 'Número', type: 'text' },
    { key: 'supplier', label: 'Fornecedor', type: 'text' },
    { key: 'obra', label: 'Obra', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: [
        'Rascunho', 'Enviado', 'Confirmado', 'Separação', 'Em Trânsito', 'Entregue', 'Recebido', 'Divergência', 'Cancelado',
    ].map(s => ({ value: s, label: s })) },
    { key: 'value', label: 'Valor Total', type: 'number' },
    { key: 'date', label: 'Data do Pedido', type: 'date' },
];

function getAdvancedFilterValue(order: any, key: string): unknown {
    switch (key) {
        case 'number': return order.number ?? '';
        case 'supplier': return order.supplierName ?? '';
        case 'obra': return order.projectClassification === 'ORCAMENTO' ? (order.linkedProjectName || '') : (order.projectName || '');
        case 'status': return order.status;
        case 'value': return order.items?.reduce((sum: number, item: any) => sum + (item.total || 0), 0) || 0;
        case 'date': return order.created_at ? String(order.created_at).slice(0, 10) : null;
        default: return null;
    }
}
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon } from '@hugeicons/core-free-icons';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { orderService } from '../services/orderService';
import { kpiService } from '../services/kpiService';
import { PurchaseOrder } from '../types';

interface SupplyChainOrderListProps {
    onCreateNew: () => void;
    onViewDetails: (orderId: string) => void;
    onViewLogistics: (orderId: string) => void;
    onEdit?: (orderId: string) => void;
    version?: number;
}

const SupplyChainOrderList: React.FC<SupplyChainOrderListProps> = ({ onCreateNew, onViewDetails, onViewLogistics, onEdit, version }) => {
    const [orders, setOrders] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState<string>('supplyChainOrderFilters:search', '');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('supplyChainOrderFilters:viewMode', 'list');
    const tableColumns = useTableColumns(COLUMNS, 'supplyChainOrderColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'supplyChainOrderColWidths');
    // Largura total = soma exata das colunas visíveis. NUNCA w-full/100% junto com
    // table-layout:fixed (§6.1). Checkbox de 40px é largura fixa, não redimensionável
    // — autoFit() já desconta colunas sem data-col-key da distribuição de folga.
    const tableTotalWidth = 40
        + (['number', 'obra', 'orcamento', 'supplier', 'status', 'date', 'value', 'items'] as const)
            .reduce((sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0)
        + cols.getWidth('actions');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'supplyChainOrderFilters:advanced');
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const confirm = useConfirm();
    const [linkedNfeOrderIds, setLinkedNfeOrderIds] = React.useState<Set<string>>(new Set());
    const [nfFilter, setNfFilter] = usePersistedState<'all' | 'sem-nf'>('supplyChainOrderFilters:nf', 'all');
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [lastCheckedIndex, setLastCheckedIndex] = React.useState<number | null>(null);
    const [bulkLoading, setBulkLoading] = React.useState(false);

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const [data, nfeRes] = await Promise.all([
                    orderService.listOrders(),
                    supabase
                        .from('nfe_invoices')
                        .select('purchase_order_id')
                        .not('purchase_order_id', 'is', null),
                ]);
                if (!cancelled) {
                    setOrders(data);
                    const ids = new Set<string>(
                        ((nfeRes.data ?? []) as { purchase_order_id: string }[])
                            .map(r => r.purchase_order_id)
                    );
                    setLinkedNfeOrderIds(ids);
                }
            } catch (error) {
                console.error("Erro ao carregar pedidos:", error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [version]);

    const loadOrders = async () => {
        try {
            setLoading(true);
            const data = await orderService.listOrders();
            setOrders(data);
            setSelectedIds(new Set());
        } catch (error) {
            console.error("Erro ao carregar pedidos:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, number: string) => {
        const ok = await confirm({
            title: `Excluir o pedido ${number}?`,
            message: 'Esta ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            setLoading(true);
            await orderService.deleteOrder(id);
            await loadOrders();
        } catch (error: any) {
            console.error("Erro ao excluir pedido:", error);
            notify(`Erro ao excluir pedido: ${error.message || 'Erro desconhecido'}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const canDeleteOrder = (status: string) =>
        !['Entregue', 'Recebido', 'Divergência'].includes(status);

    const handleDuplicate = async (id: string) => {
        try {
            setLoading(true);
            await orderService.duplicateOrder(id);
            await loadOrders();
            notify("Pedido duplicado com sucesso! O novo pedido está como Rascunho.");
        } catch (error) {
            console.error("Erro ao duplicar pedido:", error);
            // Mensagem crua: quando a obra/empreendimento está sem código, ela
            // explica o que cadastrar — engolir isso deixa o usuário sem saída.
            notify(error instanceof Error ? error.message : "Erro ao duplicar pedido.", "error");
        } finally {
            setLoading(false);
        }
    };

    const StatusBadge = ({ status }: { status: string }) => {
        const colors: Record<string, string> = {
            'Confirmado': 'text-gray-800',
            'Separação': 'text-blue-700',
            'Em Trânsito': 'text-indigo-800',
            'Entregue': 'text-amber-800',
            'Recebido': 'text-green-800',
            'Divergência': 'text-red-600',
            'Rascunho': 'text-gray-600',
            'Enviado': 'text-blue-600',
            'Cancelado': 'text-red-600',
        };
        return (
            <span className={`text-sm font-normal ${colors[status] || 'text-gray-600'}`}>
                {status}
            </span>
        );
    };

    const filteredOrders = React.useMemo(() => {
        const calculateTotal = (order: any) => order.items?.reduce((sum: number, item: any) => sum + (item.total || 0), 0) || 0;

        let filtered = (orders || []).filter(order => {
            const matchSearch =
                order.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.linkedProjectName?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchNf = nfFilter === 'all' || !linkedNfeOrderIds.has(order.id);
            return matchSearch && matchNf;
        });

        filtered = applyFilterRules(filtered, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);

        // TableUtils sort takes priority when set
        if (tableColumns.sortColumn) {
            const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
            return [...filtered].sort((a, b) => {
                if (tableColumns.sortColumn === 'number') return (a.number || '').localeCompare(b.number || '') * dir;
                if (tableColumns.sortColumn === 'obra') {
                    const na = a.projectClassification === 'ORCAMENTO' ? (a.linkedProjectName || '') : a.projectName || '';
                    const nb = b.projectClassification === 'ORCAMENTO' ? (b.linkedProjectName || '') : b.projectName || '';
                    return na.localeCompare(nb) * dir;
                }
                if (tableColumns.sortColumn === 'supplier') return (a.supplierName || '').localeCompare(b.supplierName || '') * dir;
                if (tableColumns.sortColumn === 'date') return (new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()) * dir;
                if (tableColumns.sortColumn === 'value') return (calculateTotal(a) - calculateTotal(b)) * dir;
                if (tableColumns.sortColumn === 'orcamento') {
                    const na = a.projectClassification === 'ORCAMENTO' ? (a.projectName || '') : '-';
                    const nb = b.projectClassification === 'ORCAMENTO' ? (b.projectName || '') : '-';
                    return na.localeCompare(nb) * dir;
                }
                if (tableColumns.sortColumn === 'items') {
                    const ca = a.items?.length || 0;
                    const cb = b.items?.length || 0;
                    return (ca - cb) * dir;
                }
                if (tableColumns.sortColumn === 'status') {
                    const statusOrder = ['Rascunho', 'Enviado', 'Confirmado', 'Separação', 'Em Trânsito', 'Entregue', 'Recebido', 'Divergência', 'Cancelado'];
                    const oa = statusOrder.indexOf(a.status) >= 0 ? statusOrder.indexOf(a.status) : 99;
                    const ob = statusOrder.indexOf(b.status) >= 0 ? statusOrder.indexOf(b.status) : 99;
                    return (oa - ob) * dir;
                }
                return 0;
            });
        }

        return filtered;
    }, [orders, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection, nfFilter, linkedNfeOrderIds, advancedFilters.rules]);

    const selectableVisible = React.useMemo(
        () => filteredOrders.filter(o => canDeleteOrder(o.status)),
        [filteredOrders],
    );
    const selectedVisible = React.useMemo(
        () => selectableVisible.filter(o => selectedIds.has(o.id)),
        [selectableVisible, selectedIds],
    );
    const allVisibleSelected = selectableVisible.length > 0 && selectedVisible.length === selectableVisible.length;

    function toggleRow(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }
    // §10.1: Shift+clique seleciona o intervalo entre a última linha marcada e a atual.
    function handleRowCheck(id: string, index: number, shiftKey: boolean) {
        if (shiftKey && lastCheckedIndex !== null) {
            const [start, end] = lastCheckedIndex < index ? [lastCheckedIndex, index] : [index, lastCheckedIndex];
            const rangeIds = filteredOrders.slice(start, end + 1)
                .filter(o => canDeleteOrder(o.status))
                .map(o => o.id);
            setSelectedIds(prev => new Set([...prev, ...rangeIds]));
        } else {
            toggleRow(id);
            setLastCheckedIndex(index);
        }
    }
    function toggleAllVisible() {
        setSelectedIds(prev => {
            if (allVisibleSelected) {
                const next = new Set(prev);
                selectableVisible.forEach(o => next.delete(o.id));
                return next;
            }
            const next = new Set(prev);
            selectableVisible.forEach(o => next.add(o.id));
            return next;
        });
    }
    const clearSelection = () => setSelectedIds(new Set());

    async function handleBulkDelete() {
        const alvos = selectedVisible;
        if (alvos.length === 0) return;
        const ok = await confirm({
            title: `Excluir ${alvos.length} pedido${alvos.length !== 1 ? 's' : ''}?`,
            message: 'Esta ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        setBulkLoading(true);
        const falhas: string[] = [];
        let okCount = 0;
        for (const o of alvos) {
            try {
                await orderService.deleteOrder(o.id);
                okCount++;
            } catch {
                falhas.push(o.number || o.id);
            }
        }
        setSelectedIds(new Set());
        await loadOrders();
        setBulkLoading(false);
        if (falhas.length) {
            notify(`${okCount} excluído(s). Falha em ${falhas.length}: ${falhas.join(', ')}`, 'error');
        } else {
            notify(`${okCount} pedido(s) excluído(s) com sucesso.`);
        }
    }

    return (
        <>
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pedidos de Compra</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie suas cotações e pedidos de materiais com precisão executiva.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onCreateNew}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo pedido
                    </button>
                </div>
            </div>

            {/* Dashboard Cards */}
            {(() => {
                const kpis = kpiService.compute(orders);
                const valorTotal = orders.reduce((sum, order) => sum + (order.items?.reduce((is: number, i: any) => is + (i.total || 0), 0) || 0), 0);
                const divergenceHigh = kpis.divergenceRate !== null && kpis.divergenceRate > 20;
                return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Total de Pedidos"
                            value={orders.length}
                            sub="Todos os pedidos registrados"
                            icon={<Package className="w-4 h-4" />}
                            color="blue"
                        />
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Valor Total"
                            value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valorTotal)}
                            sub="Soma de todos os pedidos"
                            icon={<DollarSign className="w-4 h-4" />}
                            color="emerald"
                        />
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Em Aberto"
                            value={orders.filter(o => ['Rascunho', 'Enviado'].includes(o.status)).length}
                            sub="Rascunhos e Enviados"
                            icon={<Filter className="w-4 h-4" />}
                            color="amber"
                            pulse
                        />
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Confirmados"
                            value={orders.filter(o => o.status === 'Confirmado').length}
                            sub="Pedidos confirmados/entregues"
                            icon={<Package className="w-4 h-4" />}
                            color="purple"
                        />
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Lead Time Médio"
                            value={kpis.leadTimeDays !== null ? `${kpis.leadTimeDays} dias` : '—'}
                            sub={kpis.receivedCount > 0
                                ? `Baseado em ${kpis.receivedCount + kpis.divergenceCount} pedido(s) concluído(s)`
                                : 'Nenhum pedido concluído ainda'}
                            icon={<TrendingUp className="w-4 h-4" />}
                            color="blue"
                        />
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Taxa de Divergência"
                            value={kpis.divergenceRate !== null ? `${kpis.divergenceRate}%` : '—'}
                            sub={`${kpis.divergenceCount} divergência(s) em ${kpis.divergenceCount + kpis.receivedCount} pedido(s)`}
                            icon={<AlertTriangle className="w-4 h-4" />}
                            color={divergenceHigh ? 'red' : 'amber'}
                        />
                        <KpiCard
                            shadow={false}
                            size="sm"
                            label="Aprovação Financeira"
                            value={kpis.financialApprovalRate !== null ? `${kpis.financialApprovalRate}%` : '—'}
                            sub={`${kpis.approvedCount} de ${kpis.completedCount} pedido(s) aprovado(s)`}
                            icon={<CheckCircle2 className="w-4 h-4" />}
                            color="emerald"
                        />
                    </div>
                );
            })()}

            {/* Toolbar acoplada à tabela (§5.2, padrão OpuraDocsModule/GED) — toolbar e
                conteúdo dividem um único card (border/rounded/shadow só no container
                pai); a costura visível entre os dois é o border-b da toolbar. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex flex-col md:flex-row gap-2.5 items-center p-4 border-b border-gray-100 bg-white">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por número ou fornecedor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>

                <button
                    onClick={() => setNfFilter(f => f === 'sem-nf' ? 'all' : 'sem-nf')}
                    title={nfFilter === 'sem-nf' ? 'Mostrando apenas pedidos sem NF-e — clique para ver todos' : 'Filtrar pedidos sem NF-e vinculada'}
                    className={`flex items-center gap-1.5 h-9 px-3 rounded-[6px] transition-all active:scale-95 text-sm font-medium whitespace-nowrap ${
                        nfFilter === 'sem-nf'
                            ? 'bg-amber-500 text-white'
                            : 'bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white'
                    }`}
                >
                    <FileCheck className="w-4 h-4" />
                    Sem NF-e
                </button>

                <button
                    onClick={loadOrders}
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

            {/* Barra de ação em massa (F3, só na visão em lista) — fixa no rodapé, fora do fluxo (§10) */}
            {viewMode === 'list' && selectedVisible.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">
                        {selectedVisible.length} selecionado{selectedVisible.length !== 1 ? 's' : ''}
                        <span className="ml-2 font-normal opacity-75">
                            · {formatMoney(selectedVisible.reduce((sum, o) => sum + (o.items?.reduce((is: number, i: any) => is + (i.total || 0), 0) || 0), 0))}
                        </span>
                    </span>
                    <button
                        onClick={handleBulkDelete}
                        disabled={bulkLoading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-60 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                    </button>
                    <button
                        onClick={clearSelection}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-blue-400 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                        Desmarcar
                    </button>
                </div>
            )}

            {/* List — sem bg/border/rounded próprios: já está dentro do card acoplado
                toolbar+conteúdo (ver abertura acima) */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando pedidos...</p>
                </div>
            ) : filteredOrders.length > 0 ? (
                viewMode === 'list' ? (
                    <div>
                        <div className="overflow-x-auto">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                <col style={{ width: '40px' }} /> {/* checkbox */}
                                {tableColumns.visibleColumns.includes('number') && <col data-col-key="number" style={{ width: `${cols.getWidth('number')}px` }} />}
                                {tableColumns.visibleColumns.includes('obra') && <col data-col-key="obra" style={{ width: `${cols.getWidth('obra')}px` }} />}
                                {tableColumns.visibleColumns.includes('orcamento') && <col data-col-key="orcamento" style={{ width: `${cols.getWidth('orcamento')}px` }} />}
                                {tableColumns.visibleColumns.includes('supplier') && <col data-col-key="supplier" style={{ width: `${cols.getWidth('supplier')}px` }} />}
                                {tableColumns.visibleColumns.includes('status') && <col data-col-key="status" style={{ width: `${cols.getWidth('status')}px` }} />}
                                {tableColumns.visibleColumns.includes('date') && <col data-col-key="date" style={{ width: `${cols.getWidth('date')}px` }} />}
                                {tableColumns.visibleColumns.includes('value') && <col data-col-key="value" style={{ width: `${cols.getWidth('value')}px` }} />}
                                {tableColumns.visibleColumns.includes('items') && <col data-col-key="items" style={{ width: `${cols.getWidth('items')}px` }} />}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                    borda de "Ações" não andar a cada redimensionamento. */}
                                <col />
                                {tableColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
                            </colgroup>
                            {/* thead em sentence case (§6.2) — escala compacta; uppercase={false} porque
                                SortableHeader força uppercase internamente por padrão. */}
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                            checked={allVisibleSelected}
                                            disabled={selectableVisible.length === 0}
                                            onChange={toggleAllVisible}
                                            title="Selecionar todos (excluíveis)"
                                        />
                                    </th>
                                    {tableColumns.visibleColumns.includes('number') && (
                                        <SortableHeader colKey="number" label="Número" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="number" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('obra') && (
                                        <SortableHeader colKey="obra" label="Obra" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="obra" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('orcamento') && (
                                        <SortableHeader colKey="orcamento" label="Orçamento" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="orcamento" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('supplier') && (
                                        <SortableHeader colKey="supplier" label="Fornecedor" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="supplier" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader colKey="status" label="Status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="status" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('date') && (
                                        <SortableHeader colKey="date" label="Data do Pedido" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="date" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('value') && (
                                        <SortableHeader colKey="value" label="Valor Total" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="value" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('items') && (
                                        <SortableHeader colKey="items" label="Itens" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="items" />
                                        </SortableHeader>
                                    )}
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
                                {filteredOrders.map((order, rowIndex) => (
                                    <tr
                                        key={order.id}
                                        className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${selectedIds.has(order.id) ? 'bg-blue-50/60' : ''}`}
                                        onClick={() => onViewDetails(order.id)}
                                    >
                                        <td className="w-10 px-4 py-2.5 border-r border-gray-100 text-center" onClick={e => e.stopPropagation()}>
                                            {canDeleteOrder(order.status) ? (
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    title="Dica: segure Shift e clique para selecionar um intervalo"
                                                    checked={selectedIds.has(order.id)}
                                                    onChange={(e) => handleRowCheck(order.id, rowIndex, (e.nativeEvent as MouseEvent).shiftKey)}
                                                />
                                            ) : null}
                                        </td>
                                        {tableColumns.visibleColumns.includes('number') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {order.number || order.id.slice(0, 8)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('obra') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {order.projectClassification === 'ORCAMENTO'
                                                    ? (order.linkedProjectName || '-')
                                                    : order.projectName}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('orcamento') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-blue-600">
                                                {order.projectClassification === 'ORCAMENTO' ? order.projectName : '-'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('supplier') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {order.supplierName || '-'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('status') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <StatusBadge status={order.status} />
                                                    {linkedNfeOrderIds.has(order.id) && (
                                                        <span className="inline-flex items-center gap-1 text-sm font-normal text-emerald-600">
                                                            <FileCheck className="w-4 h-4" />NF-e
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('date') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : '-'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('value') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800">
                                                {formatMoney(order.items?.reduce((sum: number, item: any) => sum + (item.total || 0), 0) || 0)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('items') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {order.items?.length || 0} itens
                                            </td>
                                        )}
                                        {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                        <td aria-hidden="true" className="border-r border-gray-100"></td>
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onViewDetails(order.id); }}
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all"
                                                    >
                                                        Ver Detalhes
                                                    </button>
                                                    <ActionIconButton kind="edit" className="ml-1" title="Editar Pedido" onClick={(e) => { e.stopPropagation(); onEdit?.(order.id); }} />
                                                    <InlineDisclosureMenu
                                                        menuItems={[
                                                            {
                                                                icon: <Truck className="w-[18px] h-[18px]" />,
                                                                label: 'Logística',
                                                                onClick: () => onViewLogistics(order.id),
                                                            },
                                                            {
                                                                icon: <HugeiconsIcon icon={Copy01Icon} size={18} />,
                                                                label: 'Duplicar Pedido',
                                                                onClick: () => handleDuplicate(order.id),
                                                            },
                                                        ]}
                                                        showDelete
                                                        onDelete={async () => {
                                                            try {
                                                                setLoading(true);
                                                                await orderService.deleteOrder(order.id);
                                                                await loadOrders();
                                                            } catch (error: any) {
                                                                notify(`Erro ao excluir pedido: ${error.message || 'Erro desconhecido'}`, 'error');
                                                            } finally {
                                                                setLoading(false);
                                                            }
                                                        }}
                                                        deleteDisabled={!canDeleteOrder(order.status)}
                                                        deleteDisabledTitle={!canDeleteOrder(order.status) ? `Pedido "${order.status}" não pode ser excluído` : undefined}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
                        {filteredOrders.map(order => (
                            <div
                                key={order.id}
                                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative cursor-pointer"
                                onClick={() => onViewDetails(order.id)}
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                                        <Package className="w-6 h-6" />
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                        {linkedNfeOrderIds.has(order.id) && (
                                            <span className="inline-flex items-center gap-1 text-sm font-normal text-emerald-600">
                                                <FileCheck className="w-4 h-4" />NF-e
                                            </span>
                                        )}
                                        <StatusBadge status={order.status} />
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-gray-900 mb-1">
                                    {order.number || order.id.slice(0, 8)}
                                </h3>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-6">
                                    Fornecedor: {order.supplierName || 'Não especificado'}
                                </p>

                                <div className="grid grid-cols-2 gap-4 py-4 border-t border-gray-50 mb-6">
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-1">Pedido</p>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                                            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                                            {order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : '-'}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-1">Entrega</p>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                                            {order.deliveryDate ? formatDateBR(order.deliveryDate) : '-'}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-1">Itens</p>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                                            <Package className="w-3.5 h-3.5 text-blue-500" />
                                            {order.items?.length || 0} Materiais
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                                    <div className="flex flex-col">
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-1">Total</p>
                                        <span className="text-base font-bold text-gray-900">
                                            {formatMoney(order.items?.reduce((sum: number, item: any) => sum + (item.total || 0), 0) || 0)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => onViewDetails(order.id)}
                                            className="flex items-center gap-2 bg-gray-50 text-gray-900 px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
                                        >
                                            Ver Detalhes <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                        <ActionIconButton kind="edit" className="ml-2" title="Editar Pedido" onClick={() => onEdit?.(order.id)} />
                                        <InlineDisclosureMenu
                                            menuItems={[
                                                {
                                                    icon: <Truck className="w-[18px] h-[18px]" />,
                                                    label: 'Logística',
                                                    onClick: () => onViewLogistics(order.id),
                                                },
                                                {
                                                    icon: <HugeiconsIcon icon={Copy01Icon} size={18} />,
                                                    label: 'Duplicar Pedido',
                                                    onClick: () => handleDuplicate(order.id),
                                                },
                                            ]}
                                            showDelete
                                            onDelete={async () => {
                                                try {
                                                    setLoading(true);
                                                    await orderService.deleteOrder(order.id);
                                                    await loadOrders();
                                                } catch (error: any) {
                                                    notify(`Erro ao excluir pedido: ${error.message || 'Erro desconhecido'}`, 'error');
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                            deleteDisabled={!canDeleteOrder(order.status)}
                                            deleteDisabledTitle={!canDeleteOrder(order.status) ? `Pedido "${order.status}" não pode ser excluído` : undefined}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                <div className="text-center py-12">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum pedido encontrado</h3>
                    <p className="text-sm text-gray-500 mb-6">Comece criando um novo pedido de compra para suas obras.</p>
                    <button
                        onClick={onCreateNew}
                        className="text-blue-600 font-bold hover:underline"
                    >
                        Criar meu primeiro pedido
                    </button>
                </div>
            )}
            </div>
        </div>

        {/* Notification toast */}
        {notification && (
            <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                {notification.message}
            </div>
        )}
        </>
    );
};

export default SupplyChainOrderList;
