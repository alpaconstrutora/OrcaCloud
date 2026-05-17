import React from 'react';
import {
    Search, Plus, Filter, MoreHorizontal,
    FileText, Calendar, Building2, DollarSign,
    ArrowRight, Clock, Shield, LayoutGrid,
    List, RotateCcw, Copy, Trash2, Pencil
} from 'lucide-react';
import { contractService } from '../services/contractService';
import { Contract } from '../types';

interface SupplyChainContractListProps {
    projectId: string;
    onCreateNew: () => void;
    onViewDetails: (contractId: string) => void;
    onEdit?: (contract: Contract) => void;
    onDelete?: () => void;
    organizationId?: string;
    version?: number;
}

const SupplyChainContractList: React.FC<SupplyChainContractListProps> = ({
    projectId,
    onCreateNew,
    onViewDetails,
    onEdit,
    onDelete,
    organizationId,
    version
}) => {
    const [contracts, setContracts] = React.useState<Contract[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [sortBy, setSortBy] = React.useState<string>('date-desc');
    const [searchTerm, setSearchTerm] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState<string>('all');
    const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('list');
    const [localShowAll, setLocalShowAll] = React.useState(true);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

    const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    React.useEffect(() => {
        loadContracts();
    }, [projectId, organizationId, localShowAll, version]);

    const loadContracts = async () => {
        try {
            setLoading(true);
            const targetProjectId = localShowAll ? undefined : (projectId || undefined);
            const data = await contractService.listContracts(targetProjectId, organizationId);
            setContracts(data);
        } catch (error) {
            console.error("ERRO CRÍTICO AO CARREGAR CONTRATOS:", error);
            notify("Erro ao carregar contratos. Verifique a conexão com o banco de dados.", "error");
        } finally {
            setLoading(false);
        }
    };

    const StatusBadge = ({ status }: { status: string }) => {
        const colors: Record<string, string> = {
            'Ativo': 'bg-green-100 text-green-800',
            'Rascunho': 'bg-gray-100 text-gray-800',
            'Suspenso': 'bg-amber-100 text-amber-800',
            'Encerrado': 'bg-blue-100 text-blue-800',
            'Cancelado': 'bg-red-100 text-red-800',
        };
        return (
            <span className={`px-2 py-1 rounded-full text-[12px] font-medium uppercase tracking-wider ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
                {status}
            </span>
        );
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setConfirmDeleteId(id);
    };

    const confirmDelete = async () => {
        if (!confirmDeleteId) return;
        setConfirmDeleteId(null);
        try {
            setLoading(true);
            await contractService.deleteContract(confirmDeleteId);
            await loadContracts();
            onDelete?.();
            notify("Contrato excluído com sucesso.", "success");
        } catch (error) {
            console.error("Erro ao excluir contrato:", error);
            notify("Erro ao excluir contrato.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDuplicate = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            setLoading(true);
            const dupe = await contractService.duplicateContract(id);
            await loadContracts();
            notify(`Contrato duplicado com sucesso! Nova cópia: ${dupe.title}`, "success");
        } catch (error) {
            console.error("Erro ao duplicar contrato:", error);
            notify("Erro ao duplicar contrato.", "error");
        } finally {
            setLoading(false);
        }
    };

    const filteredContracts = React.useMemo(() => {
        return (contracts || [])
            .filter(contract => statusFilter === 'all' || contract.status === statusFilter)
            .filter(contract =>
                contract.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contract.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contract.contract_type?.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => {
                if (sortBy === 'date-desc') return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
                if (sortBy === 'date-asc') return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime();
                if (sortBy === 'value-desc') return b.current_value - a.current_value;
                if (sortBy === 'value-asc') return a.current_value - b.current_value;
                if (sortBy === 'title-asc') return (a.title || '').localeCompare(b.title || '');
                return 0;
            });
    }, [contracts, searchTerm, sortBy]);

    // Dashboard data
    const stats = {
        total: contracts.length,
        active: contracts.filter(c => c.status === 'Ativo').length,
        totalValue: contracts.reduce((sum, c) => sum + (c.current_value || 0), 0),
        pendingMeasurements: 0, // Placeholder
    };

    const STAT_ICON_CLS: Record<string, string> = {
        blue:   'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white',
        green:  'bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white',
        indigo: 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white',
        amber:  'bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white',
    };
    const STAT_BG_CLS: Record<string, string> = {
        blue:   'bg-blue-500/5',
        green:  'bg-green-500/5',
        indigo: 'bg-indigo-500/5',
        amber:  'bg-amber-500/5',
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-gray-400 font-medium animate-pulse uppercase tracking-widest text-[12px]">Sincronizando Contratos...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Notification toast */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] max-w-sm px-6 py-4 rounded-2xl shadow-2xl font-medium text-sm animate-in fade-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' :
                    notification.type === 'error' ? 'bg-red-600 text-white' :
                    'bg-gray-900 text-white'
                }`}>
                    {notification.message}
                </div>
            )}

            {/* Inline confirm dialog */}
            {confirmDeleteId && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[32px] shadow-2xl p-8 max-w-md w-full space-y-6 border border-gray-100 animate-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-red-100 rounded-2xl shrink-0">
                                <Trash2 className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-900 mb-1">Excluir contrato?</p>
                                <p className="text-sm text-gray-500">Esta ação é irreversível e removerá todos os dados associados ao contrato.</p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium text-[12px] uppercase tracking-widest hover:bg-gray-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-6 py-3 bg-red-600 text-white rounded-xl font-medium text-[12px] uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                            >
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-medium text-gray-900 tracking-tight">Gestão de Contratos</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Controle de empreitadas, aditivos e medições físico-financeiras.</p>
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
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                            title="Visualização em Lista"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        onClick={loadContracts}
                        className="p-4 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm active:scale-95 group"
                        title="Recarregar Lista"
                    >
                        <RotateCcw className={`w-5 h-5 group-hover:rotate-180 transition-transform duration-500 ${loading ? 'animate-spin text-blue-600' : ''}`} />
                    </button>

                    <button
                        onClick={onCreateNew}
                        className="group flex items-center gap-2 px-6 py-4 bg-gray-900 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-gray-200 hover:shadow-blue-200 font-medium text-[12px] uppercase tracking-widest active:scale-95 translate-y-0 hover:-translate-y-1"
                    >
                        <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                        Novo Contrato
                    </button>
                    {projectId && (
                        <button
                            onClick={() => setLocalShowAll(!localShowAll)}
                            className={`flex items-center gap-2 px-6 py-4 rounded-2xl border transition-all font-medium text-[12px] uppercase tracking-widest active:scale-95 ${!localShowAll
                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                : 'bg-white border-gray-100 text-gray-400 hover:text-gray-600'
                                } `}
                        >
                            <Building2 className="w-4 h-4" />
                            {localShowAll ? 'Filtrar por Obra' : 'Ver Todos Projetos'}
                        </button>
                    )}
                </div>
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total de Contratos', value: stats.total, icon: FileText, color: 'blue' },
                    { label: 'Contratos Ativos', value: stats.active, icon: Shield, color: 'green' },
                    { label: 'Valor Total Contratado', value: `R$ ${stats.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} `, icon: DollarSign, color: 'indigo' },
                    { label: 'Pendentes de Medição', value: stats.pendingMeasurements, icon: Clock, color: 'amber' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
                        <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-8 -mt-8 group-hover:scale-150 transition-transform duration-500 ${STAT_BG_CLS[stat.color]}`} />
                        <div className="flex items-start justify-between relative z-10">
                            <div>
                                <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                                <h3 className="text-xl font-medium text-gray-900 tracking-tight">{stat.value}</h3>
                            </div>
                            <div className={`p-3 rounded-2xl transition-all duration-300 ${STAT_ICON_CLS[stat.color]}`}>
                                <stat.icon className="w-5 h-5" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="Buscar por número, título ou tipo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm"
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-6 py-4 bg-white border border-gray-100 rounded-2xl text-[12px] font-medium text-gray-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm cursor-pointer hover:bg-gray-50 transition-all uppercase tracking-widest"
                    >
                        <option value="all">Todos os Status</option>
                        <option value="Ativo">Ativo</option>
                        <option value="Rascunho">Rascunho</option>
                        <option value="Suspenso">Suspenso</option>
                        <option value="Encerrado">Encerrado</option>
                        <option value="Cancelado">Cancelado</option>
                    </select>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-6 py-4 bg-white border border-gray-100 rounded-2xl text-[12px] font-medium text-gray-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm cursor-pointer hover:bg-gray-50 transition-all uppercase tracking-widest"
                    >
                        <option value="date-desc">Mais Recentes</option>
                        <option value="date-asc">Mais Antigos</option>
                        <option value="value-desc">Maior Valor</option>
                        <option value="value-asc">Menor Valor</option>
                        <option value="title-asc">Título A-Z</option>
                    </select>
                </div>
            </div>

            {/* Content List */}
            {filteredContracts.length === 0 ? (
                <div className="bg-white rounded-[40px] p-20 text-center border-2 border-dashed border-gray-100">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileText className="w-10 h-10 text-gray-200" />
                    </div>
                    <h3 className="text-xl font-medium text-gray-900 tracking-tight">Nenhum contrato encontrado</h3>
                    <p className="text-gray-400 text-sm mt-2 font-medium max-w-xs mx-auto">Não há contratos registrados para este projeto ainda.</p>
                    <button
                        onClick={onCreateNew}
                        className="mt-8 px-8 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all font-medium text-[12px] uppercase tracking-widest shadow-lg shadow-blue-200 active:scale-95"
                    >
                        Começar Cadastro
                    </button>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredContracts.map((contract) => (
                        <div
                            key={contract.id}
                            className="bg-white rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all group overflow-hidden flex flex-col p-8 cursor-pointer"
                            onClick={() => onViewDetails(contract.id)}
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex gap-2">
                                    <div className="p-4 bg-blue-50 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEdit && onEdit(contract);
                                            }}
                                            className="p-2 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-emerald-600 hover:border-emerald-100 transition-all shadow-sm"
                                            title="Ajustar Contrato"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => handleDuplicate(e, contract.id)}
                                            className="p-2 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm"
                                            title="Duplicar Contrato"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => handleDelete(e, contract.id)}
                                            className="p-2 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-red-600 hover:border-red-100 transition-all shadow-sm"
                                            title="Excluir Contrato"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <StatusBadge status={contract.status} />
                            </div>

                            <div className="space-y-1 mb-6">
                                <p className="text-[12px] font-medium text-blue-500 uppercase tracking-widest">{contract.number}</p>
                                <h3 className="text-lg font-medium text-gray-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors uppercase">{contract.title}</h3>
                            </div>

                            <div className="space-y-4 mb-8 flex-1">
                                <div className="flex items-center gap-3 text-gray-500">
                                    <Building2 className="w-4 h-4 text-gray-400" />
                                    <span className="text-[12px] font-medium truncate">Projeto Vinculado</span>
                                </div>
                                <div className="flex items-center gap-3 text-gray-500">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    <span className="text-[12px] font-medium">Vigência: {new Date(contract.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} a {contract.end_date ? new Date(contract.end_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indeterminado'}</span>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-gray-50 mt-auto">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest mb-1">Valor Atualizado</p>
                                        <p className="text-xl font-medium text-gray-900 tracking-tighter">
                                            R$ {contract.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50">
                                    <th className="px-6 py-4 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Contrato</th>
                                    <th className="px-6 py-4 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Tipo / Natureza</th>
                                    <th className="px-6 py-4 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Vigência</th>
                                    <th className="px-6 py-4 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-right text-[12px] font-medium text-gray-400 uppercase tracking-widest">Valor Atual</th>
                                    <th className="px-6 py-4 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredContracts.map((contract) => (
                                    <tr
                                        key={contract.id}
                                        className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                                        onClick={() => onViewDetails(contract.id)}
                                    >
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-[12px] font-medium text-blue-500 uppercase tracking-widest mb-0.5">{contract.number}</p>
                                                    <p className="text-[12px] font-medium text-gray-900 group-hover:text-blue-600 transition-colors uppercase">{contract.title}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[12px] font-medium text-gray-700">{contract.contract_type}</span>
                                                <span className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">{contract.nature}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <Calendar className="w-3.5 h-3.5" />
                                                <span className="text-[12px] font-medium">{new Date(contract.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} a {contract.end_date ? new Date(contract.end_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indeterminado'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <StatusBadge status={contract.status} />
                                        </td>
                                        <td className="px-6 py-5 text-right font-medium text-gray-900 tracking-tighter text-[12px]">
                                            R$ {contract.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEdit && onEdit(contract);
                                                    }}
                                                    className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-emerald-600 hover:border-emerald-100 transition-all shadow-sm active:scale-95"
                                                    title="Ajustar Contrato"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDuplicate(e, contract.id)}
                                                    className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm active:scale-95"
                                                    title="Duplicar Contrato"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDelete(e, contract.id)}
                                                    className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-red-600 hover:border-red-100 transition-all shadow-sm active:scale-95"
                                                    title="Excluir Contrato"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm ml-2">
                                                    <ArrowRight className="w-5 h-5" />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupplyChainContractList;
