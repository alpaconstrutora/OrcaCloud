import React from 'react';
import { Plus, FileText, Calendar, Clock, ChevronRight, Search, Filter, LayoutDashboard, Table2, ArrowRight } from 'lucide-react';
import { QuotationRequest } from '../types';
import { quotationService } from '../services/quotationService';

interface SupplyChainQuotationListProps {
    onCreateNew: () => void;
    onViewDetails: (id: string) => void;
    onViewComparison: (id: string) => void;
}

const SupplyChainQuotationList: React.FC<SupplyChainQuotationListProps> = ({ onCreateNew, onViewDetails, onViewComparison }) => {
    const [requests, setRequests] = React.useState<QuotationRequest[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('list');

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
            'Aberta': 'bg-blue-50 text-blue-600 border-blue-100',
            'Em Análise': 'bg-amber-50 text-amber-600 border-amber-100',
            'Concluída': 'bg-emerald-50 text-emerald-600 border-emerald-100',
            'Cancelada': 'bg-gray-50 text-gray-400 border-gray-100',
        };
        return (
            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
                {status}
            </span>
        );
    };

    const filteredRequests = React.useMemo(() => {
        return requests.filter(req =>
            req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (req.projectName && req.projectName.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [requests, searchTerm]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Cotações de Suprimentos</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie solicitações de preço e mapas comparativos com visão estratégica.</p>
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
                        <span>Nova Cotação</span>
                    </button>
                </div>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col justify-between group hover:shadow-xl hover:border-blue-100 transition-all">
                    <div className="flex items-center gap-5 mb-3">
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-[1.5rem] group-hover:scale-110 transition-transform">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total</p>
                            <h3 className="text-3xl font-black text-gray-900">{requests.length}</h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                        Cotações registradas
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col justify-between group hover:shadow-xl hover:border-amber-100 transition-all">
                    <div className="flex items-center gap-5 mb-3">
                        <div className="p-4 bg-amber-50 text-amber-600 rounded-[1.5rem] group-hover:scale-110 transition-transform">
                            <Clock className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Abertas</p>
                            <h3 className="text-3xl font-black text-gray-900">
                                {requests.filter(r => r.status === 'Aberta').length}
                            </h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                        Aguardando respostas
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col justify-between group hover:shadow-xl hover:border-indigo-100 transition-all">
                    <div className="flex items-center gap-5 mb-3">
                        <div className="p-4 bg-indigo-50 text-indigo-600 rounded-[1.5rem] group-hover:scale-110 transition-transform">
                            <Search className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Em Análise</p>
                            <h3 className="text-3xl font-black text-gray-900">
                                {requests.filter(r => r.status === 'Em Análise').length}
                            </h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                        Comparando propostas
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col justify-between group hover:shadow-xl hover:border-green-100 transition-all">
                    <div className="flex items-center gap-5 mb-3">
                        <div className="p-4 bg-green-50 text-green-600 rounded-[1.5rem] group-hover:scale-110 transition-transform">
                            <Plus className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Concluídas</p>
                            <h3 className="text-3xl font-black text-gray-900">
                                {requests.filter(r => r.status === 'Concluída').length}
                            </h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        Pedidos gerados
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
                            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-widest border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Número</th>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Título / Obra</th>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Prazo Final</th>
                                    <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Status</th>
                                    <th className="px-6 py-2 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredRequests.map(req => (
                                    <tr
                                        key={req.id}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                        onClick={() => onViewDetails(req.id)}
                                    >
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-mono text-sm font-bold text-gray-700">
                                            #{req.number}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-gray-900">{req.title}</span>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{req.projectName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-600">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                {new Date(req.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <StatusBadge status={req.status} />
                                        </td>
                                        <td className="px-6 py-2.5 text-right flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => onViewDetails(req.id)}
                                                className="text-gray-500 hover:text-gray-700 text-xs font-black uppercase tracking-widest p-1.5 hover:bg-gray-100 rounded-lg transition-all"
                                            >
                                                Ver Detalhes
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onViewComparison(req.id); }}
                                                className="text-blue-600 hover:text-blue-800 text-xs font-black uppercase tracking-widest p-1.5 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-1"
                                            >
                                                <Table2 className="w-3.5 h-3.5" />
                                                Mapa
                                            </button>
                                        </td>
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
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Prazo Final</p>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                                            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                                            {new Date(req.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onViewComparison(req.id); }}
                                            className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
                                        >
                                            <Table2 className="w-3.5 h-3.5" /> Mapa
                                        </button>
                                        <button
                                            onClick={() => onViewDetails(req.id)}
                                            className="flex items-center gap-2 bg-gray-50 text-gray-900 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all shadow-sm active:scale-95"
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
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-blue-500" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma cotação encontrada</h3>
                    <p className="text-gray-500 max-w-md mx-auto mb-6">Comece criando uma nova solicitação de cotação para suas obras.</p>
                    <button
                        onClick={onCreateNew}
                        className="text-blue-600 font-bold hover:underline"
                    >
                        Criar minha primeira cotação
                    </button>
                </div>
            )}
        </div>
    );
};

export default SupplyChainQuotationList;
