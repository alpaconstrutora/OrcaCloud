import React from 'react';
import { Package, Truck, Search, Filter, CheckCircle2, AlertTriangle, Clock, ArrowRight, Camera, Pencil } from 'lucide-react';
import { orderService } from '../services/orderService';
import { PurchaseOrder } from '../types';
import OrderReceiptModal from './OrderReceiptModal';

interface SupplyChainReceiptManagerProps {
    onViewOrder: (id: string) => void;
}

const SupplyChainReceiptManager: React.FC<SupplyChainReceiptManagerProps> = ({ onViewOrder }) => {
    const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedOrder, setSelectedOrder] = React.useState<PurchaseOrder | null>(null);
    const [showReceiptModal, setShowReceiptModal] = React.useState(false);
    const [filterStatus, setFilterStatus] = React.useState<string>('all');
    const [sortBy, setSortBy] = React.useState<string>('date-desc');

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
                if (sortBy === 'date-desc') {
                    return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
                }
                if (sortBy === 'date-asc') {
                    return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime();
                }
                if (sortBy === 'value-desc') {
                    return calculateTotal(b) - calculateTotal(a);
                }
                if (sortBy === 'value-asc') {
                    return calculateTotal(a) - calculateTotal(b);
                }
                if (sortBy === 'name-asc') {
                    return (a.supplierName || '').localeCompare(b.supplierName || '');
                }

                // Default fallback: Prioritize 'Entregue' and 'Em Trânsito'
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
    }, [orders, searchTerm, filterStatus, sortBy]);

    const StatusBadge = ({ status }: { status: string }) => {
        const colors: Record<string, string> = {
            'Confirmado': 'bg-gray-100 text-gray-800',
            'Separação': 'bg-blue-50 text-blue-700',
            'Em Trânsito': 'bg-indigo-100 text-indigo-800',
            'Entregue': 'bg-amber-100 text-amber-800 animate-pulse',
            'Recebido': 'bg-green-100 text-green-800',
            'Divergência': 'bg-red-100 text-red-800',
        };
        return (
            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Gerenciamento de Recebimento</h1>
                    <p className="text-gray-500 text-sm mt-1">Controle de entregas, conferência de carga e checkouts de obra.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-white p-1 rounded-xl border border-gray-100 shadow-sm flex">
                        <button
                            onClick={() => setFilterStatus('all')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterStatus === 'all' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Todos
                        </button>
                        <button
                            onClick={() => setFilterStatus('pending')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterStatus === 'pending' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Pendentes
                        </button>
                        <button
                            onClick={() => setFilterStatus('received')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterStatus === 'received' ? 'bg-green-600 text-white shadow-lg shadow-green-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Recebidos
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                    <div className="relative z-10">
                        <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl w-fit mb-4">
                            <Truck className="w-6 h-6" />
                        </div>
                        <h3 className="text-3xl font-black text-gray-900 leading-none">
                            {orders.filter(o => o.status === 'Entregue').length}
                        </h3>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Prontos para Checkout</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                    <div className="relative z-10">
                        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl w-fit mb-4">
                            <Clock className="w-6 h-6" />
                        </div>
                        <h3 className="text-3xl font-black text-gray-900 leading-none">
                            {orders.filter(o => o.status === 'Em Trânsito').length}
                        </h3>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Em Trânsito</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                    <div className="relative z-10">
                        <div className="p-3 bg-red-100 text-red-600 rounded-2xl w-fit mb-4">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <h3 className="text-3xl font-black text-gray-900 leading-none">
                            {orders.filter(o => o.status === 'Divergência').length}
                        </h3>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Divergências Em Aberto</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por número ou fornecedor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent rounded-xl text-sm font-medium focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Ordenar:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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
                    className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all active:scale-95"
                >
                    <Filter className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            {/* Orders List */}
            {loading ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500 font-medium">Carregando fluxos de entrega...</p>
                </div>
            ) : filteredOrders.length > 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-widest border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Número</th>
                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap">Obra</th>
                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap">Orçamento</th>
                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Fornecedor</th>
                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Status Logístico</th>
                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Previsão</th>
                                <th className="px-6 py-2 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredOrders.map(order => (
                                <tr
                                    key={order.id}
                                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                    onClick={() => onViewOrder(order.id)}
                                >
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-mono text-xs font-bold text-gray-700">
                                        #{order.number || order.id.slice(0, 8)}
                                    </td>
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-xs font-medium text-gray-700">
                                        {order.projectClassification === 'ORCAMENTO'
                                            ? (order.linkedProjectName || '-')
                                            : order.projectName}
                                    </td>
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-xs font-medium text-blue-600">
                                        {order.projectClassification === 'ORCAMENTO' ? order.projectName : '-'}
                                    </td>
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-gray-700 text-sm font-medium">
                                        {order.supplierName}
                                    </td>
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                        <StatusBadge status={order.status} />
                                    </td>
                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-3.5 h-3.5 text-gray-300" />
                                            <span className="text-sm font-bold text-gray-600">
                                                {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : '-'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onViewOrder(order.id); }}
                                                className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-all"
                                                title="Ver Detalhes"
                                            >
                                                <ArrowRight className="w-4 h-4" />
                                            </button>

                                            {order.status === 'Entregue' ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedOrder(order);
                                                        setShowReceiptModal(true);
                                                    }}
                                                    className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-green-700 hover:scale-105 transition-all shadow-lg shadow-green-900/10 active:scale-95"
                                                >
                                                    <Camera className="w-4 h-4" />
                                                    Fazer Checkout
                                                </button>
                                            ) : ['Recebido', 'Divergência'].includes(order.status) ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedOrder(order);
                                                        setShowReceiptModal(true);
                                                    }}
                                                    className="flex items-center gap-2 text-indigo-600 px-4 py-2 border border-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all font-sans"
                                                >
                                                    <Pencil className="w-3 h-3" />
                                                    Editar Checkout
                                                </button>
                                            ) : (
                                                <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest border border-dashed border-gray-100 px-4 py-2 rounded-xl">
                                                    Aguardando Carga
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="bg-white rounded-2xl p-20 border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="w-24 h-24 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                        <Truck className="w-10 h-10 text-indigo-400" />
                    </div>
                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">Nenhuma entrega no radar</h3>
                    <p className="text-gray-500 max-w-md mx-auto mt-2 leading-relaxed">
                        No momento não há pedidos em trânsito ou aguardando conferência para suas obras ativas.
                    </p>
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
        </div>
    );
};

export default SupplyChainReceiptManager;
