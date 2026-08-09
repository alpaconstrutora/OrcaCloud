import React from 'react';
import { Truck, Search, RefreshCw, AlertTriangle, Clock, Camera, MoveHorizontal } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { orderService } from '../services/orderService';
import { PurchaseOrder } from '../types';
import OrderReceiptModal from './OrderReceiptModal';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { KpiCard } from './ui/KpiCard';
import { useToast } from '../hooks/useToast';

const COLUMNS: ColumnConfig[] = [
    { key: 'number', label: 'Número', sortable: true },
    { key: 'obra', label: 'Obra', sortable: true },
    { key: 'orcamento', label: 'Orçamento', sortable: true },
    { key: 'supplier', label: 'Fornecedor', sortable: true },
    { key: 'status', label: 'Status Logístico', sortable: true },
    { key: 'date', label: 'Previsão', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    number: 123, obra: 180, orcamento: 160, supplier: 200, status: 178, date: 150, actions: 180,
};

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
    const { localToast, showToast } = useToast();
    const tableColumns = useTableColumns(COLUMNS, 'supplyChainReceiptColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'supplyChainReceiptColWidths');
    // Largura total = soma exata das colunas visíveis. NUNCA w-full/100% junto com
    // table-layout:fixed (§6.1).
    const tableTotalWidth = (['number', 'obra', 'orcamento', 'supplier', 'status', 'date'] as const)
        .reduce((sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0)
        + cols.getWidth('actions');

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
            showToast('Erro ao carregar pedidos para recebimento', 'error');
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
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gerenciamento de Recebimento</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Controle de entregas, conferência de carga e checkouts de obra.</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard shadow={false} size="sm" label="Prontos para Checkout" value={orders.filter(o => o.status === 'Entregue').length} sub="Aguardando conferência de carga" icon={<Truck className="w-4 h-4" />} color="amber" />
                <KpiCard shadow={false} size="sm" label="Em Trânsito" value={orders.filter(o => o.status === 'Em Trânsito').length} sub="A caminho do local" icon={<Clock className="w-4 h-4" />} color="indigo" />
                <KpiCard shadow={false} size="sm" label="Divergências Em Aberto" value={orders.filter(o => o.status === 'Divergência').length} sub="Requerem atenção imediata" icon={<AlertTriangle className="w-4 h-4" />} color="red" pulse={orders.some(o => o.status === 'Divergência')} />
            </div>

            {/* Filters — §5.1 (variante desaninhada, escala compacta §16). Sem toggle
                grid/lista: esta tela só tem visão em lista (§5, nota). */}
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
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

                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    <button
                        onClick={() => setFilterStatus('all')}
                        className={`h-7 px-3 rounded-[6px] transition-all text-sm font-medium ${filterStatus === 'all' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setFilterStatus('pending')}
                        className={`h-7 px-3 rounded-[6px] transition-all text-sm font-medium ${filterStatus === 'pending' ? 'bg-amber-600 text-white' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Pendentes
                    </button>
                    <button
                        onClick={() => setFilterStatus('received')}
                        className={`h-7 px-3 rounded-[6px] transition-all text-sm font-medium ${filterStatus === 'received' ? 'bg-emerald-600 text-white' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        Recebidos
                    </button>
                </div>

                <button
                    onClick={loadOrders}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar"
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
                    {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                        Duplo clique no divisor segue "restaurar padrão". Sem guarda de
                        viewMode: esta tela não tem alternância grade/lista. */}
                    <button
                        onClick={() => cols.autoFit()}
                        className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                        title="Ajustar largura das colunas ao conteúdo"
                    >
                        <MoveHorizontal className="w-4 h-4" />
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
                <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                    <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                        <colgroup>
                            {tableColumns.visibleColumns.includes('number') && <col data-col-key="number" style={{ width: `${cols.getWidth('number')}px` }} />}
                            {tableColumns.visibleColumns.includes('obra') && <col data-col-key="obra" style={{ width: `${cols.getWidth('obra')}px` }} />}
                            {tableColumns.visibleColumns.includes('orcamento') && <col data-col-key="orcamento" style={{ width: `${cols.getWidth('orcamento')}px` }} />}
                            {tableColumns.visibleColumns.includes('supplier') && <col data-col-key="supplier" style={{ width: `${cols.getWidth('supplier')}px` }} />}
                            {tableColumns.visibleColumns.includes('status') && <col data-col-key="status" style={{ width: `${cols.getWidth('status')}px` }} />}
                            {tableColumns.visibleColumns.includes('date') && <col data-col-key="date" style={{ width: `${cols.getWidth('date')}px` }} />}
                            {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                borda de "Ações" não andar a cada redimensionamento. */}
                            <col />
                            {tableColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
                        </colgroup>
                        {/* thead em sentence case (§6.2) — escala compacta; uppercase={false} porque
                            SortableHeader força uppercase internamente por padrão. */}
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
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
                                    <SortableHeader colKey="status" label="Status Logístico" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                        <cols.ResizeHandle colKey="status" />
                                    </SortableHeader>
                                )}
                                {tableColumns.visibleColumns.includes('date') && (
                                    <SortableHeader colKey="date" label="Previsão" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                        <cols.ResizeHandle colKey="date" />
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
                            {filteredOrders.map(order => (
                                <tr
                                    key={order.id}
                                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                    onClick={() => onViewOrder(order.id)}
                                >
                                    {tableColumns.visibleColumns.includes('number') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
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
                                    {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                    <td aria-hidden="true" className="border-r border-gray-100"></td>
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onViewOrder(order.id); }}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all"
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
                                                    <ActionIconButton
                                                        kind="edit"
                                                        className="ml-1"
                                                        title="Editar Checkout"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedOrder(order);
                                                            setShowReceiptModal(true);
                                                        }}
                                                    />
                                                ) : null}
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
                <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
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

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default SupplyChainReceiptManager;
