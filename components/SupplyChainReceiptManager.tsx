import React from 'react';
import { Package, Truck, Search, Filter, CheckCircle2, AlertTriangle, Clock, ArrowRight, Camera, Pencil, LayoutDashboard, Table2, AlertCircle } from 'lucide-react';
import { orderService } from '../services/orderService';
import { PurchaseOrder } from '../types';
import OrderReceiptModal from './OrderReceiptModal';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import Button from './ui/Button';

const COLUMNS: ColumnConfig[] = [
    { key: 'number', label: 'Número', sortable: true },
    { key: 'obra', label: 'Obra', sortable: true },
    { key: 'orcamento', label: 'Orçamento', sortable: true },
    { key: 'supplier', label: 'Fornecedor', sortable: true },
    { key: 'status', label: 'Status Logístico', sortable: true },
    { key: 'date', label: 'Previsão', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

interface SupplyChainReceiptManagerProps {
    onViewOrder: (id: string) => void;
}

const SupplyChainReceiptManager: React.FC<SupplyChainReceiptManagerProps> = ({ onViewOrder }) => {
    const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = usePersistedState<string>('supplyChainReceiptFilters:search', '');
    const [filterStatus, setFilterStatus] = usePersistedState<string>('supplyChainReceiptFilters:status', 'all');
    const [selectedOrder, setSelectedOrder] = React.useState<PurchaseOrder | null>(null);
    const [showReceiptModal, setShowReceiptModal] = React.useState(false);
    const tableColumns = useTableColumns(COLUMNS, 'supplyChainReceiptColumns');
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [pendingConfirm, setPendingConfirm] = React.useState<{ message: string; onConfirm: () => void } | null>(null);

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const askConfirm = (message: string, onConfirm: () => void) => {
        setPendingConfirm({ message, onConfirm });
    };

    const loadOrders = async () => {
        try {
            setLoading(true);
            const data = await orderService.listOrders();
            // Filter only relevant statuses for receipt management
            const relevantStatuses = ['Confirmado', 'Separação', 'Em Trânsito', 'Entregue', 'Recebido', 'Divergência'];
            const filtered = data.filter(o => relevantStatuses.includes(o.status));
            setOrders(filtered);
        } catch (error) {
            console.error("Erro ao carregar pedidos para recebimento:", error);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadOrders();
    }, []);

    const filteredOrders = React.useMemo(() => {
        const calculateTotal = (order: PurchaseOrder) =>
            order.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;

        return orders
            .filter(order => {
                const matchesSearch = (
                    order.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    order.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    order.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    order.linkedProjectName?.toLowerCase().includes(searchTerm.toLowerCase())
                );
                const matchesStatus = filterStatus === 'all' ? true :
                    filterStatus === 'pending' ? ['Confirmado', 'Separação', 'Em Trânsito', 'Entregue'].includes(order.status) :
                        filterStatus === 'received' ? order.status === 'Recebido' :
                            filterStatus === 'divergent' ? order.status === 'Divergência' : true;
                return matchesSearch && matchesStatus;
            })
            .sort((a, b) => {
                const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                
                if (tableColumns.sortColumn === 'date') {
                    return (new Date(a.deliveryDate || '').getTime() - new Date(b.deliveryDate || '').getTime()) * dir;
                }
                if (tableColumns.sortColumn === 'obra') {
                    const nameA = a.projectClassification === 'ORCAMENTO' ? (a.linkedProjectName || '') : (a.projectName || '');
                    const nameB = b.projectClassification === 'ORCAMENTO' ? (b.linkedProjectName || '') : (b.projectName || '');
                    return nameA.localeCompare(nameB) * dir;
                }
                if (tableColumns.sortColumn === 'orcamento') {
                    const nameA = a.projectClassification === 'ORCAMENTO' ? (a.projectName || '') : '';
                    const nameB = b.projectClassification === 'ORCAMENTO' ? (b.projectName || '') : '';
                    return nameA.localeCompare(nameB) * dir;
                }
                if (tableColumns.sortColumn === 'supplier') {
                    return (a.supplierName || '').localeCompare(b.supplierName || '') * dir;
                }
                if (tableColumns.sortColumn === 'number') {
                    return (a.number || '').localeCompare(b.number || '') * dir;
                }
                if (tableColumns.sortColumn === 'status') {
                    return (a.status || '').localeCompare(b.status || '') * dir;
                }

                // Default fallback: Prioritize 'Entregue' and 'Em Trânsito' se não tiver ordenação ativa
                const priorityOrder: Record<string, number> = {
                    'Entregue': 0,
                    'Em Trânsito': 1,
                    'Confirmado': 2,
                    'Separação': 3,
                    'Divergência': 4,
                    'Recebido': 5
                };
                return (priorityOrder[a.status] || 99) - (priorityOrder[b.status] || 99);
            });
    }, [orders, searchTerm, filterStatus, tableColumns.sortColumn, tableColumns.sortDirection]);

    const StatusBadge = ({ status }: { status: string }) => {
        const colors: Record<string, string> = {
            'Confirmado': 'text-gray-800',
            'Separação': 'text-blue-700',
            'Em Trânsito': 'text-indigo-800',
            'Entregue': 'text-amber-800',
            'Recebido': 'text-green-800',
            'Divergência': 'text-red-600',
        };
        return (
            <span className={`text-sm font-normal ${colors[status] || 'text-gray-600'}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Gerenciamento de Recebimento</h1>
                    <p className="text-gray-500 text-sm mt-1.5">Controle de entregas, conferência de carga e checkouts de obra.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm flex shrink-0 gap-1.5">
                        <button
                            onClick={() => setFilterStatus('all')}
                            className={`p-2.5 rounded-xl transition-all text-sm font-semibold ${filterStatus === 'all' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Todos
                        </button>
                        <button
                            onClick={() => setFilterStatus('pending')}
                            className={`p-2.5 rounded-xl transition-all text-sm font-semibold ${filterStatus === 'pending' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Pendentes
                        </button>
                        <button
                            onClick={() => setFilterStatus('received')}
                            className={`p-2.5 rounded-xl transition-all text-sm font-semibold ${filterStatus === 'received' ? 'bg-green-600 text-white shadow-lg shadow-green-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Recebidos
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-amber-100 transition-all">
                    <div className="p-3.5 bg-amber-50 text-amber-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <Truck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Prontos para Checkout</p>
                        <p className="text-2xl font-bold text-gray-900 truncate">{orders.filter(o => o.status === 'Entregue').length}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">Aguardando conferência de carga</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-indigo-100 transition-all">
                    <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <Clock className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Em Trânsito</p>
                        <p className="text-2xl font-bold text-gray-900 truncate">{orders.filter(o => o.status === 'Em Trânsito').length}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">A caminho do local</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-red-100 transition-all">
                    <div className="p-3.5 bg-red-50 text-red-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Divergências Em Aberto</p>
                        <p className="text-2xl font-bold text-gray-900 truncate">{orders.filter(o => o.status === 'Divergência').length}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">Requerem atenção imediata</p>
                        </div>
                    </div>
                </div>
            </div>

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
                        className={`p-2.5 rounded-xl transition-all bg-indigo-600 text-white shadow-lg shadow-indigo-200 cursor-default`}
                        title="Visualização em Lista (Padrão para Recebimentos)"
                    >
                        <Table2 className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Orders List */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando fluxos de entrega...</p>
                </div>
            ) : filteredOrders.length > 0 ? (
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
                            <tr>
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
                                    <SortableHeader colKey="status" label="Status Logístico" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('date') && (
                                    <SortableHeader colKey="date" label="Previsão" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
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
                                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                    onClick={() => onViewOrder(order.id)}
                                >
                                    {tableColumns.visibleColumns.includes('number') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm text-gray-600">
                                            #{order.number || order.id.slice(0, 8)}
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
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-gray-700 text-sm font-normal">
                                            {order.supplierName}
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <StatusBadge status={order.status} />
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('date') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-3.5 h-3.5 text-gray-300" />
                                                <span className="text-sm font-normal text-gray-600">
                                                    {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : '-'}
                                                </span>
                                            </div>
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onViewOrder(order.id); }}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                >
                                                    Ver Detalhes
                                                </button>
                                                {order.status === 'Entregue' ? (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedOrder(order);
                                                            setShowReceiptModal(true);
                                                        }}
                                                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors ml-1"
                                                        title="Fazer Checkout"
                                                    >
                                                        <Camera className="w-4 h-4" />
                                                    </button>
                                                ) : ['Recebido', 'Divergência'].includes(order.status) ? (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedOrder(order);
                                                            setShowReceiptModal(true);
                                                        }}
                                                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors ml-1"
                                                        title="Editar Checkout"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-12 bg-white rounded-[2.5rem] shadow-sm border border-gray-100">
                    <Truck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma entrega no radar</h3>
                    <p className="text-sm text-gray-500">No momento não há pedidos em trânsito ou aguardando conferência.</p>
                </div>
            )}

            {/* Receipt Modal */}
            {showReceiptModal && selectedOrder && (
                <OrderReceiptModal
                    order={selectedOrder}
                    onClose={() => {
                        setShowReceiptModal(false);
                        setSelectedOrder(null);
                    }}
                    onSave={() => loadOrders()}
                />
            )}

            {/* Toast de Notificação — Seção 13 do guia */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}

            {/* Modal de Confirmação — Seção 14 do guia */}
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
        </div>
    );
};

export default SupplyChainReceiptManager;
