import React from 'react';
import { Plus, FileText, Calendar, Clock, ChevronRight, Search, Filter, LayoutDashboard, Table2, ArrowRight, AlertCircle } from 'lucide-react';
import { QuotationRequest } from '../types';
import { quotationService } from '../services/quotationService';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import Button from './ui/Button';

const COLUMNS: ColumnConfig[] = [
    { key: 'number', label: 'Número', sortable: true },
    { key: 'title', label: 'Título / Obra', sortable: true },
    { key: 'deadline', label: 'Prazo Final', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

interface SupplyChainQuotationListProps {
    onCreateNew: () => void;
    onViewDetails: (id: string) => void;
    onViewComparison: (id: string) => void;
}

const SupplyChainQuotationList: React.FC<SupplyChainQuotationListProps> = ({ onCreateNew, onViewDetails, onViewComparison }) => {
    const [requests, setRequests] = React.useState<QuotationRequest[]>([]);
    const [loading, setLoading] = React.useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('supplyChainQuotationFilters:search', '');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('supplyChainQuotationFilters:viewMode', 'list');
    const tableColumns = useTableColumns(COLUMNS, 'supplyChainQuotationColumns');

    // Toast de Notificação — Seção 13 do guia
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Modal de Confirmação — Seção 14 do guia
    const [pendingConfirm, setPendingConfirm] = React.useState<{ message: string; onConfirm: () => void } | null>(null);
    const askConfirm = (message: string, onConfirm: () => void) => setPendingConfirm({ message, onConfirm });

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

    const StatusBadge = ({ status }: { status: string }) => {
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

    const filteredRequests = React.useMemo(() => {
        const filtered = requests.filter(req =>
            req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (req.projectName && req.projectName.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        if (tableColumns.sortColumn) {
            const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
            return [...filtered].sort((a, b) => {
                if (tableColumns.sortColumn === 'number') return a.number.localeCompare(b.number) * dir;
                if (tableColumns.sortColumn === 'title') return a.title.localeCompare(b.title) * dir;
                if (tableColumns.sortColumn === 'deadline') return a.deadline.localeCompare(b.deadline) * dir;
                return 0;
            });
        }
        return filtered;
    }, [requests, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Cotações de Suprimentos</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie solicitações de preço e mapas comparativos com visão estratégica.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        onClick={onCreateNew}
                        size="lg"
                        className="gap-3 rounded-[1.25rem] shadow-xl shadow-blue-900/20"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Nova Cotação</span>
                    </Button>
                </div>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-blue-100 transition-all">
                    <div className="p-3.5 bg-blue-50 text-blue-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Total</p>
                        <p className="text-2xl font-bold text-gray-900">{requests.length}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">Cotações registradas</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-amber-100 transition-all">
                    <div className="p-3.5 bg-amber-50 text-amber-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <Clock className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Abertas</p>
                        <p className="text-2xl font-bold text-gray-900">{requests.filter(r => r.status === 'Aberta').length}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0 animate-pulse"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">Aguardando respostas</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-indigo-100 transition-all">
                    <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <Search className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Em Análise</p>
                        <p className="text-2xl font-bold text-gray-900">{requests.filter(r => r.status === 'Em Análise').length}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">Comparando propostas</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-emerald-100 transition-all">
                    <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <Plus className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Concluídas</p>
                        <p className="text-2xl font-bold text-gray-900">{requests.filter(r => r.status === 'Concluída').length}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0"></span>
                            <p className="text-xs text-gray-400 font-medium truncate">Pedidos gerados</p>
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
                        placeholder="Buscar por título, número ou obra..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <button
                    onClick={loadRequests}
                    className="p-4 bg-blue-50 text-blue-600 rounded-[1.25rem] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm"
                >
                    <Filter className="w-4 h-4" />
                </button>

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

            {/* List / Grid */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando cotações...</p>
                </div>
            ) : filteredRequests.length > 0 ? (
                viewMode === 'list' ? (
                    <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
                                <tr>
                                    {tableColumns.visibleColumns.includes('number') && (
                                        <SortableHeader colKey="number" label="Número" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('title') && (
                                        <SortableHeader colKey="title" label="Título / Obra" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('deadline') && (
                                        <SortableHeader colKey="deadline" label="Prazo Final" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader colKey="status" label="Status" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right">Ações</th>
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
                                        {tableColumns.visibleColumns.includes('number') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {req.number || req.id.slice(0, 8)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('title') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-900">{req.title}</span>
                                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{req.projectName}</span>
                                                </div>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('deadline') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-600">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                    {new Date(req.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                </div>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('status') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <StatusBadge status={req.status} />
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right flex items-center justify-end gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onViewComparison(req.id); }}
                                                    className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                                    title="Ver Mapa Comparativo"
                                                >
                                                    <Table2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onViewDetails(req.id); }}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-semibold hover:underline"
                                                >
                                                    Ver Detalhes
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredRequests.map(req => (
                            <div
                                key={req.id}
                                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative cursor-pointer"
                                onClick={() => onViewDetails(req.id)}
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <StatusBadge status={req.status} />
                                </div>

                                <h3 className="text-lg font-black text-gray-900 mb-1">
                                    #{req.number}
                                </h3>
                                <p className="text-sm font-bold text-gray-900 mb-1">{req.title}</p>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-6">
                                    Obra: {req.projectName}
                                </p>

                                <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                                    <div className="flex flex-col">
                                        <p className="text-xs text-gray-400 font-black uppercase tracking-widest mb-1">Prazo Final</p>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                                            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                                            {new Date(req.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onViewComparison(req.id); }}
                                            className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-sm font-bold uppercase hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
                                        >
                                            <Table2 className="w-3.5 h-3.5" /> Mapa
                                        </button>
                                        <button
                                            onClick={() => onViewDetails(req.id)}
                                            className="flex items-center gap-2 bg-gray-50 text-gray-900 px-4 py-2 rounded-xl text-sm font-bold uppercase hover:bg-gray-200 transition-all shadow-sm active:scale-95"
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
                <div className="text-center py-12 bg-white rounded-[2.5rem] shadow-sm border border-gray-100">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma cotação encontrada</h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">Comece criando uma nova solicitação de cotação para suas obras.</p>
                    <button
                        onClick={onCreateNew}
                        className="text-blue-600 font-bold hover:underline"
                    >
                        Criar minha primeira cotação
                    </button>
                </div>
            )}

            {/* Toast de Notificação — padrão guia seção 13 */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}

            {/* Modal de Confirmação — padrão guia seção 14 */}
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

export default SupplyChainQuotationList;
