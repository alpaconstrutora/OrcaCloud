import React from 'react';
import { Package, Plus, Search, Filter, LayoutDashboard, Table2, ArrowRight, Clock, Truck, DollarSign, Calendar, Copy, Trash2, AlertCircle, TrendingUp, AlertTriangle, CheckCircle2, Pencil, FileCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import Button from './ui/Button';
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
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [pendingConfirm, setPendingConfirm] = React.useState<{ message: string; onConfirm: () => void } | null>(null);
    const [linkedNfeOrderIds, setLinkedNfeOrderIds] = React.useState<Set<string>>(new Set());
    const [nfFilter, setNfFilter] = usePersistedState<'all' | 'sem-nf'>('supplyChainOrderFilters:nf', 'all');
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = React.useState(false);

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const askConfirm = (message: string, onConfirm: () => void) => {
        setPendingConfirm({ message, onConfirm });
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

    const handleDelete = (id: string, number: string) => {
        askConfirm(`Deseja realmente excluir o pedido ${number}? Esta ação não pode ser desfeita.`, () => {
            (async () => {
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
            })();
        });
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
            notify("Erro ao duplicar pedido.", "error");
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

        const filtered = (orders || []).filter(order => {
            const matchSearch =
                order.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.linkedProjectName?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchNf = nfFilter === 'all' || !linkedNfeOrderIds.has(order.id);
            return matchSearch && matchNf;
        });

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
    }, [orders, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection, nfFilter, linkedNfeOrderIds]);

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

    function handleBulkDelete() {
        const alvos = selectedVisible;
        if (alvos.length === 0) return;
        askConfirm(`Deseja realmente excluir ${alvos.length} pedido${alvos.length !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`, async () => {
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
        });
    }

    return (
        <>
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Pedidos de Compra</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie suas cotações e pedidos de materiais com precisão executiva.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        onClick={onCreateNew}
                        size="lg"
                        className="gap-3 rounded-[1.25rem] shadow-xl shadow-blue-900/20"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Novo Pedido</span>
                    </Button>
                </div>
            </div>

            {/* Dashboard Cards */}
            {(() => {
                const kpis = kpiService.compute(orders);
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total de Pedidos */}
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-blue-100 transition-all">
                    <div className="p-3.5 bg-blue-50 text-blue-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <Package className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Total de Pedidos</p>
                        <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">Todos os pedidos registrados</p>
                        </div>
                    </div>
                </div>

                {/* Valor Total */}
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-green-100 transition-all">
                    <div className="p-3.5 bg-green-50 text-green-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <DollarSign className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Valor Total</p>
                        <p className="text-2xl font-bold text-gray-900 truncate">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(
                                orders.reduce((sum, order) => sum + (order.items?.reduce((is: number, i: any) => is + (i.total || 0), 0) || 0), 0)
                            )}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">Soma de todos os pedidos</p>
                        </div>
                    </div>
                </div>

                {/* Em Aberto */}
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-yellow-100 transition-all">
                    <div className="p-3.5 bg-yellow-50 text-yellow-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <Filter className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Em Aberto</p>
                        <p className="text-2xl font-bold text-gray-900">
                            {orders.filter(o => ['Rascunho', 'Enviado'].includes(o.status)).length}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full shrink-0 animate-pulse"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">Rascunhos e Enviados</p>
                        </div>
                    </div>
                </div>

                {/* Confirmados */}
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-purple-100 transition-all">
                    <div className="p-3.5 bg-purple-50 text-purple-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <Package className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Confirmados</p>
                        <p className="text-2xl font-bold text-gray-900">
                            {orders.filter(o => o.status === 'Confirmado').length}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full shrink-0"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">Pedidos confirmados/entregues</p>
                        </div>
                    </div>
                </div>
                        {/* Lead Time */}
                        <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-blue-100 transition-all">
                            <div className="p-3.5 bg-blue-50 text-blue-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Lead Time Médio</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {kpis.leadTimeDays !== null ? `${kpis.leadTimeDays} dias` : '—'}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0"></span>
                                    <p className="text-xs text-gray-400 font-medium truncate">
                                        {kpis.receivedCount > 0
                                            ? `Baseado em ${kpis.receivedCount + kpis.divergenceCount} pedido(s) concluído(s)`
                                            : 'Nenhum pedido concluído ainda'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Taxa Divergência */}
                        <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-red-100 transition-all">
                            <div className={`p-3.5 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform ${kpis.divergenceRate !== null && kpis.divergenceRate > 20 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Taxa de Divergência</p>
                                <p className={`text-2xl font-bold ${kpis.divergenceRate !== null && kpis.divergenceRate > 20 ? 'text-red-600' : 'text-gray-900'}`}>
                                    {kpis.divergenceRate !== null ? `${kpis.divergenceRate}%` : '—'}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${kpis.divergenceRate !== null && kpis.divergenceRate > 20 ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                                    <p className="text-xs text-gray-400 font-medium truncate">
                                        {kpis.divergenceCount} divergência(s) em {kpis.divergenceCount + kpis.receivedCount} pedido(s)
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Aprovação Financeira */}
                        <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-green-100 transition-all">
                            <div className="p-3.5 bg-green-50 text-green-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Aprovação Financeira</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {kpis.financialApprovalRate !== null ? `${kpis.financialApprovalRate}%` : '—'}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0"></span>
                                    <p className="text-xs text-gray-400 font-medium truncate">
                                        {kpis.approvedCount} de {kpis.completedCount} pedido(s) aprovado(s)
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Filters */}
            <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por número ou fornecedor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setNfFilter(f => f === 'sem-nf' ? 'all' : 'sem-nf')}
                        title={nfFilter === 'sem-nf' ? 'Mostrando apenas pedidos sem NF-e — clique para ver todos' : 'Filtrar pedidos sem NF-e vinculada'}
                        className={`flex items-center gap-2 px-4 py-4 rounded-[1.25rem] transition-all active:scale-95 shadow-sm text-sm font-semibold uppercase tracking-wider whitespace-nowrap ${
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
                        className="p-4 bg-blue-50 text-blue-600 rounded-[1.25rem] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm"
                    >
                        <Filter className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm gap-1.5 shrink-0">
                    <ColumnConfigButton
                        columns={COLUMNS.filter(c => c.key !== 'actions')}
                        visibleColumns={tableColumns.visibleColumns}
                        showColumnConfig={tableColumns.showColumnConfig}
                        onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                        onToggleColumn={tableColumns.toggleColumn}
                        onReset={tableColumns.resetColumns}
                    />
                    <div className="w-px bg-gray-200 mx-1 my-1"></div>
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Grade"
                    >
                        <LayoutDashboard className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Lista"
                    >
                        <Table2 className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Barra de ação em massa (F3, só na visão em lista) */}
            {viewMode === 'list' && selectedVisible.length > 0 && (
                <div className="flex items-center gap-4 bg-red-600 text-white px-6 py-3 rounded-[1.5rem] shadow-sm">
                    <span className="text-sm font-semibold">
                        {selectedVisible.length} selecionado{selectedVisible.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex-1" />
                    <button
                        onClick={handleBulkDelete}
                        disabled={bulkLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-60 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                    </button>
                    <button
                        onClick={clearSelection}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm font-medium text-red-100 hover:text-white hover:bg-red-500 transition-colors"
                    >
                        Limpar
                    </button>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando pedidos...</p>
                </div>
            ) : filteredOrders.length > 0 ? (
                viewMode === 'list' ? (
                    <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
                                <tr>
                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-40"
                                            checked={allVisibleSelected}
                                            disabled={selectableVisible.length === 0}
                                            onChange={toggleAllVisible}
                                            title="Selecionar todos (excluíveis)"
                                        />
                                    </th>
                                    {tableColumns.visibleColumns.includes('number') && (
                                        <SortableHeader colKey="number" label="Número" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('obra') && (
                                        <SortableHeader colKey="obra" label="Obra" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                                    )}
                                    {tableColumns.visibleColumns.includes('orcamento') && (
                                        <SortableHeader colKey="orcamento" label="Orçamento" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                                    )}
                                    {tableColumns.visibleColumns.includes('supplier') && (
                                        <SortableHeader colKey="supplier" label="Fornecedor" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader colKey="status" label="Status" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('date') && (
                                        <SortableHeader colKey="date" label="Data do Pedido" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('value') && (
                                        <SortableHeader colKey="value" label="Valor Total" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('items') && (
                                        <SortableHeader colKey="items" label="Itens" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredOrders.map(order => (
                                    <tr
                                        key={order.id}
                                        className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${selectedIds.has(order.id) ? 'bg-red-50/60' : ''}`}
                                        onClick={() => onViewDetails(order.id)}
                                    >
                                        <td className="w-10 px-4 py-2.5 border-r border-gray-100 text-center" onClick={e => e.stopPropagation()}>
                                            {canDeleteOrder(order.status) ? (
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                                                    checked={selectedIds.has(order.id)}
                                                    onChange={() => toggleRow(order.id)}
                                                />
                                            ) : null}
                                        </td>
                                        {tableColumns.visibleColumns.includes('number') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm text-gray-600">
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
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onViewDetails(order.id); }}
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        Ver Detalhes
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onEdit?.(order.id); }}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ml-1"
                                                        title="Editar Pedido"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
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
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                                        <button
                                            onClick={() => onEdit?.(order.id)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ml-2"
                                            title="Editar Pedido"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
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
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                        <Package className="w-8 h-8 text-blue-500" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum pedido encontrado</h3>
                    <p className="text-gray-500 max-w-md mx-auto mb-6">Comece criando um novo pedido de compra para suas obras.</p>
                    <button
                        onClick={onCreateNew}
                        className="text-blue-600 font-bold hover:underline"
                    >
                        Criar meu primeiro pedido
                    </button>
                </div>
            )}
        </div>

        {/* Notification toast */}
        {notification && (
            <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                {notification.message}
            </div>
        )}

        {/* Inline confirm modal */}
        {pendingConfirm && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
                <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-gray-100 animate-in zoom-in-95 duration-200">
                    <p className="text-sm font-normal text-gray-700 mb-6 leading-relaxed">{pendingConfirm.message}</p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setPendingConfirm(null)}
                            className="px-6 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-semibold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-all"
                        >
                            Cancelar
                        </button>
                        <Button
                            variant="danger"
                            onClick={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }}
                            className="rounded-2xl"
                        >
                            Confirmar
                        </Button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default SupplyChainOrderList;
