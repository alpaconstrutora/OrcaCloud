import React from 'react';
import { Package, Plus, Search, Filter, LayoutDashboard, Table2, ArrowRight, Clock, Truck, DollarSign, Calendar, Copy, Trash2, AlertCircle, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
    version?: number;
}

const SupplyChainOrderList: React.FC<SupplyChainOrderListProps> = ({ onCreateNew, onViewDetails, onViewLogistics, version }) => {
    const [orders, setOrders] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [sortBy, setSortBy] = React.useState<string>('date-desc');
    const [searchTerm, setSearchTerm] = React.useState('');
    const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('list');
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [pendingConfirm, setPendingConfirm] = React.useState<{ message: string; onConfirm: () => void } | null>(null);

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
                const data = await orderService.listOrders();
                if (!cancelled) setOrders(data);
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
            'Confirmado': 'bg-gray-100 text-gray-800',
            'Separação': 'bg-blue-50 text-blue-700',
            'Em Trânsito': 'bg-indigo-100 text-indigo-800',
            'Entregue': 'bg-amber-100 text-amber-800 animate-pulse',
            'Recebido': 'bg-green-100 text-green-800',
            'Divergência': 'bg-red-100 text-red-800',
            'Rascunho': 'bg-gray-100 text-gray-800',
            'Enviado': 'bg-blue-50 text-blue-700',
            'Cancelado': 'bg-red-100 text-red-800',
        };
        return (
            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
                {status}
            </span>
        );
    };

    const filteredOrders = React.useMemo(() => {
        const calculateTotal = (order: any) => order.items?.reduce((sum: number, item: any) => sum + (item.total || 0), 0) || 0;

        return (orders || [])
            .filter(order =>
                order.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.linkedProjectName?.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => {
                if (sortBy === 'date-desc') return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
                if (sortBy === 'date-asc') return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime();
                if (sortBy === 'value-desc') return calculateTotal(b) - calculateTotal(a);
                if (sortBy === 'value-asc') return calculateTotal(a) - calculateTotal(b);
                if (sortBy === 'name-asc') return (a.supplierName || '').localeCompare(b.supplierName || '');
                return 0;
            });
    }, [orders, searchTerm, sortBy]);

    return (
        <>
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pedidos de Compra</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie suas cotações e pedidos de materiais com precisão executiva.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm mr-2">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                            title="Visualização em Grade"
                        >
                            <LayoutDashboard className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                            title="Visualização em Lista"
                        >
                            <Table2 className="w-4 h-4" />
                        </button>
                    </div>
                    <button
                        onClick={onCreateNew}
                        className="flex items-center gap-3 bg-blue-600 text-white px-6 py-3 rounded-[1.25rem] font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Novo Pedido</span>
                    </button>
                </div>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col justify-between group hover:shadow-xl hover:border-blue-100 transition-all">
                    <div className="flex items-center gap-5 mb-3">
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-[1.5rem] group-hover:scale-110 transition-transform">
                            <Package className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total de Pedidos</p>
                            <h3 className="text-3xl font-black text-gray-900">{orders.length}</h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                        Todos os pedidos registrados
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col justify-between group hover:shadow-xl hover:border-green-100 transition-all">
                    <div className="flex items-center gap-5 mb-3">
                        <div className="p-4 bg-green-50 text-green-600 rounded-[1.5rem] group-hover:scale-110 transition-transform">
                            <DollarSign className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Total</p>
                            <h3 className="text-2xl font-black text-gray-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(
                                    orders.reduce((sum, order) => sum + (order.items?.reduce((is: number, i: any) => is + (i.total || 0), 0) || 0), 0)
                                )}
                            </h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        Soma de todos os pedidos
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col justify-between group hover:shadow-xl hover:border-yellow-100 transition-all">
                    <div className="flex items-center gap-5 mb-3">
                        <div className="p-4 bg-yellow-50 text-yellow-600 rounded-[1.5rem] group-hover:scale-110 transition-transform">
                            <Filter className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Em Aberto</p>
                            <h3 className="text-3xl font-black text-gray-900">
                                {orders.filter(o => ['Rascunho', 'Enviado'].includes(o.status)).length}
                            </h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                        <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></span>
                        Rascunhos e Enviados
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col justify-between group hover:shadow-xl hover:border-purple-100 transition-all">
                    <div className="flex items-center gap-5 mb-3">
                        <div className="p-4 bg-purple-50 text-purple-600 rounded-[1.5rem] group-hover:scale-110 transition-transform">
                            <Package className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Confirmados</p>
                            <h3 className="text-3xl font-black text-gray-900">
                                {orders.filter(o => o.status === 'Confirmado').length}
                            </h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                        Pedidos confirmados/entregues
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            {(() => {
                const kpis = kpiService.compute(orders);
                return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Lead Time */}
                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-blue-100 transition-all">
                            <div className="p-3.5 bg-blue-50 text-blue-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Lead Time Médio</p>
                                <p className="text-2xl font-black text-gray-900">
                                    {kpis.leadTimeDays !== null ? `${kpis.leadTimeDays} dias` : '—'}
                                </p>
                                <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                                    {kpis.receivedCount > 0
                                        ? `Baseado em ${kpis.receivedCount + kpis.divergenceCount} pedido(s) concluído(s)`
                                        : 'Nenhum pedido concluído ainda'}
                                </p>
                            </div>
                        </div>

                        {/* Taxa Divergência */}
                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-red-100 transition-all">
                            <div className={`p-3.5 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform ${kpis.divergenceRate !== null && kpis.divergenceRate > 20 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Taxa de Divergência</p>
                                <p className={`text-2xl font-black ${kpis.divergenceRate !== null && kpis.divergenceRate > 20 ? 'text-red-600' : 'text-gray-900'}`}>
                                    {kpis.divergenceRate !== null ? `${kpis.divergenceRate}%` : '—'}
                                </p>
                                <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                                    {kpis.divergenceCount} divergência(s) em {kpis.divergenceCount + kpis.receivedCount} pedido(s)
                                </p>
                            </div>
                        </div>

                        {/* Aprovação Financeira */}
                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-green-100 transition-all">
                            <div className="p-3.5 bg-green-50 text-green-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Aprovação Financeira</p>
                                <p className="text-2xl font-black text-gray-900">
                                    {kpis.financialApprovalRate !== null ? `${kpis.financialApprovalRate}%` : '—'}
                                </p>
                                <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                                    {kpis.approvedCount} de {kpis.completedCount} pedido(s) aprovado(s)
                                </p>
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
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Ordenar:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-[1.25rem] px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    >
                        <option value="date-desc">Mais Recentes</option>
                        <option value="date-asc">Mais Antigos</option>
                        <option value="value-desc">Maior Valor</option>
                        <option value="value-asc">Menor Valor</option>
                        <option value="name-asc">Fornecedor (A-Z)</option>
                    </select>
                </div>
                <button
                    onClick={loadOrders}
                    className="p-4 bg-blue-50 text-blue-600 rounded-[1.25rem] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm"
                >
                    <Filter className="w-4 h-4" />
                </button>
            </div>

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
                            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-widest border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Número</th>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap">Obra</th>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap">Orçamento</th>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Fornecedor</th>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Status</th>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Data do Pedido</th>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Valor Total</th>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Itens</th>
                                    <th className="px-6 py-2 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredOrders.map(order => (
                                    <tr
                                        key={order.id}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                        onClick={() => onViewDetails(order.id)}
                                    >
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-mono text-sm font-bold text-gray-700">
                                            {order.number || order.id.slice(0, 8)}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-xs font-medium text-gray-700">
                                            {order.projectClassification === 'ORCAMENTO'
                                                ? (order.linkedProjectName || '-')
                                                : order.projectName}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-xs font-medium text-blue-600">
                                            {order.projectClassification === 'ORCAMENTO' ? order.projectName : '-'}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-700">
                                            {order.supplierName || '-'}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <StatusBadge status={order.status} />
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-600">
                                            {order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : '-'}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-black text-gray-900">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                order.items?.reduce((sum: number, item: any) => sum + (item.total || 0), 0) || 0
                                            )}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-600">
                                            {order.items?.length || 0} itens
                                        </td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onViewDetails(order.id); }}
                                                    className="text-blue-600 hover:text-blue-800 text-xs font-black uppercase tracking-widest p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                >
                                                    Ver Detalhes
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
                                    <StatusBadge status={order.status} />
                                </div>

                                <h3 className="text-lg font-black text-gray-900 mb-1">
                                    {order.number || order.id.slice(0, 8)}
                                </h3>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-6">
                                    Fornecedor: {order.supplierName || 'Não especificado'}
                                </p>

                                <div className="grid grid-cols-2 gap-4 py-4 border-t border-gray-50 mb-6">
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Pedido</p>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                                            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                                            {order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : '-'}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Entrega</p>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                                            {order.deliveryDate ? new Date(order.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Itens</p>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                                            <Package className="w-3.5 h-3.5 text-blue-500" />
                                            {order.items?.length || 0} Materiais
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                                    <div className="flex flex-col">
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Total</p>
                                        <span className="text-base font-black text-gray-900">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                order.items?.reduce((sum: number, item: any) => sum + (item.total || 0), 0) || 0
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => onViewDetails(order.id)}
                                            className="flex items-center gap-2 bg-gray-50 text-gray-900 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
                                        >
                                            Detalhes <ArrowRight className="w-3.5 h-3.5" />
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
                    <p className="text-sm font-medium text-gray-700 mb-6 leading-relaxed">{pendingConfirm.message}</p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setPendingConfirm(null)}
                            className="px-6 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }}
                            className="px-6 py-3 bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition-all"
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default SupplyChainOrderList;
