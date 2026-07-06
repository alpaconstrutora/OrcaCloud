import React from 'react';
import {
    Search, Plus, Filter, MoreHorizontal,
    FileText, Calendar, Building2, DollarSign,
    ArrowRight, Clock, Shield, LayoutGrid,
    List, RotateCcw, Copy, Trash2, Pencil,
    ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle
} from 'lucide-react';
import { contractService } from '../services/contractService';
import { supplierService } from '../services/supplierService';
import { clientService } from '../services/clientService';
import { projectService } from '../services/projectService';
import { Contract } from '../types';
import Button from './ui/Button';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';

const COLUMNS: ColumnConfig[] = [
    { key: 'number', label: 'Número', sortable: true },
    { key: 'title', label: 'Contrato', sortable: true },
    { key: 'project', label: 'Obra', sortable: true },
    { key: 'supplier', label: 'Contratada/Contratante', sortable: true },
    { key: 'date', label: 'Vigência', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'value', label: 'Valor Atual', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

interface SupplyChainContractListProps {
    projectId: string;
    onCreateNew: () => void;
    onViewDetails: (contractId: string) => void;
    onEdit?: (contract: Contract) => void;
    onDelete?: () => void;
    organizationId?: string;
    version?: number;
    direction?: 'INCOMING' | 'OUTGOING';
    domain?: 'SUPRIMENTOS' | 'SERVICOS' | 'LOCACAO' | 'VENDAS';
    title?: string;
    subtitle?: string;
    extraActions?: React.ReactNode;
}

const SupplyChainContractList: React.FC<SupplyChainContractListProps> = ({
    projectId,
    onCreateNew,
    onViewDetails,
    onEdit,
    onDelete,
    organizationId,
    version,
    direction = 'INCOMING',
    domain,
    title = 'Gestão de Contratos',
    subtitle = 'Controle de empreitadas, aditivos e medições físico-financeiras.',
    extraActions,
}) => {
    const [contracts, setContracts] = React.useState<Contract[]>([]);
    const [supplierMap, setSupplierMap] = React.useState<Record<string, string>>({});
    const [clientMap, setClientMap] = React.useState<Record<string, string>>({});
    const [projectMap, setProjectMap] = React.useState<Record<string, string>>({});
    const [loading, setLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = usePersistedState('supplyChainContractFilters:search', '');
    const [statusFilter, setStatusFilter] = usePersistedState('supplyChainContractFilters:status', 'all');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('supplyChainContractFilters:viewMode', 'list');
    const [localShowAll, setLocalShowAll] = React.useState(true);
    const tableColumns = useTableColumns(COLUMNS, 'supplyChainContractColumns');

    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

    const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    React.useEffect(() => {
        loadContracts();
    }, [projectId, organizationId, localShowAll, version, domain]);

    const loadContracts = async () => {
        try {
            setLoading(true);
            const targetProjectId = localShowAll ? undefined : (projectId || undefined);
            const [data, suppliers, clients, projects] = await Promise.all([
                contractService.listContracts(targetProjectId, organizationId, undefined, direction, domain),
                supplierService.listSuppliers(organizationId).catch(() => []),
                clientService.listClients(organizationId).catch(() => []),
                projectService.listProjects(undefined, organizationId).catch(() => []),
            ]);
            setContracts(data);
            setSupplierMap(Object.fromEntries(suppliers.map(s => [s.id, s.name])));
            setClientMap(Object.fromEntries(clients.map((c: { id: string; name: string }) => [c.id, c.name])));
            setProjectMap(Object.fromEntries(projects.map((p: { id: string; name: string }) => [p.id, p.name])));
        } catch (error) {
            console.error("ERRO CRÍTICO AO CARREGAR CONTRATOS:", error);
            notify("Erro ao carregar contratos. Verifique a conexão com o banco de dados.", "error");
        } finally {
            setLoading(false);
        }
    };

    const StatusBadge = ({ status }: { status: string }) => {
        const colors: Record<string, string> = {
            'Ativo': 'text-green-600',
            'Rascunho': 'text-gray-600',
            'Minuta': 'text-purple-600',
            'Suspenso': 'text-amber-600',
            'Encerrado': 'text-blue-600',
            'Cancelado': 'text-red-600',
        };
        return (
            <span className={`text-sm font-normal ${colors[status] || 'text-gray-600'}`}>
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
        const field = tableColumns.sortColumn || 'number';
        const dir = tableColumns.sortDirection || 'asc';
        return (contracts || [])
            .filter(contract => statusFilter === 'all' || contract.status === statusFilter)
            .filter(contract =>
                contract.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contract.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contract.contract_type?.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => {
                let cmp = 0;
                if (field === 'number')   cmp = (a.number || '').localeCompare(b.number || '', undefined, { numeric: true });
                if (field === 'title')    cmp = (a.title || '').localeCompare(b.title || '');
                if (field === 'project')  cmp = (projectMap[a.project_id || ''] || '').localeCompare(projectMap[b.project_id || ''] || '');
                if (field === 'supplier') cmp = (supplierMap[a.supplier_id || ''] || '').localeCompare(supplierMap[b.supplier_id || ''] || '');
                if (field === 'date')     cmp = new Date(a.start_date || '').getTime() - new Date(b.start_date || '').getTime();
                if (field === 'status')   cmp = (a.status || '').localeCompare(b.status || '');
                if (field === 'value')    cmp = a.current_value - b.current_value;
                return dir === 'asc' ? cmp : -cmp;
            });
    }, [contracts, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection, statusFilter, supplierMap, projectMap]);

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
                <p className="text-gray-400 font-medium animate-pulse uppercase tracking-widest text-xs">Sincronizando Contratos...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Notification toast */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] max-w-sm px-6 py-4 rounded-[1.5rem] shadow-2xl font-bold text-sm animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-3 ${
                    notification.type === 'success' ? 'bg-gray-900 text-white' :
                    notification.type === 'error' ? 'bg-red-600 text-white' :
                    'bg-gray-900 text-white'
                }`}>
                    {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
                    {notification.message}
                </div>
            )}

            {/* Inline confirm dialog */}
            {confirmDeleteId && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 max-w-md w-full space-y-6 border border-gray-100 animate-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-red-50 text-red-600 rounded-[1.25rem] shrink-0">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900 mb-1">Excluir contrato?</p>
                                <p className="text-sm text-gray-500">Esta ação é irreversível e removerá todos os dados associados ao contrato.</p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-6 py-3 bg-gray-50 text-gray-600 rounded-[1.25rem] font-bold text-sm hover:bg-gray-100 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-6 py-3 bg-red-600 text-white rounded-[1.25rem] font-bold text-sm shadow-lg shadow-red-200 hover:bg-red-700 transition-all"
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
                    <h1 className="text-3xl font-medium text-gray-900 tracking-tight">{title}</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{subtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                    {extraActions}
                    <button
                        onClick={onCreateNew}
                        className="group flex items-center gap-2 px-6 py-4 bg-gray-900 text-white rounded-[1.25rem] hover:bg-blue-600 transition-all shadow-xl shadow-gray-200 hover:shadow-blue-200 font-medium text-button uppercase tracking-widest active:scale-95"
                    >
                        <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                        Novo Contrato
                    </button>
                    {projectId && (
                        <button
                            onClick={() => setLocalShowAll(!localShowAll)}
                            className={`flex items-center gap-2 px-6 py-4 rounded-[1.25rem] border transition-all font-medium text-button uppercase tracking-widest active:scale-95 ${!localShowAll
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-blue-100 transition-all">
                    <div className="p-3.5 bg-blue-50 text-blue-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Total de Contratos</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-green-100 transition-all">
                    <div className="p-3.5 bg-green-50 text-green-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <Shield className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Contratos Ativos</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-indigo-100 transition-all">
                    <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <DollarSign className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Valor Total Contratado</p>
                        <p className="text-xl font-bold text-gray-900 truncate">R$ {stats.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-amber-100 transition-all">
                    <div className="p-3.5 bg-amber-50 text-amber-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
                        <Clock className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Pendentes de Medição</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.pendingMeasurements}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por número, título ou tipo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-semibold uppercase tracking-wider text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all cursor-pointer"
                    >
                        <option value="all">Todos os Status</option>
                        <option value="Rascunho">Rascunho</option>
                        <option value="Minuta">Minuta</option>
                        <option value="Ativo">Ativo</option>
                        <option value="Suspenso">Suspenso</option>
                        <option value="Encerrado">Encerrado</option>
                        <option value="Cancelado">Cancelado</option>
                    </select>

                    <button
                        onClick={loadContracts}
                        className="p-4 bg-blue-50 text-blue-600 rounded-[1.25rem] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm group"
                    >
                        <RotateCcw className={`w-4 h-4 group-hover:rotate-180 transition-transform duration-500 ${loading ? 'animate-spin' : ''}`} />
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
                        <LayoutGrid className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Lista"
                    >
                        <List className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Content List */}
            {filteredContracts.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-[2.5rem] shadow-sm border border-gray-100">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum contrato encontrado</h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">Não há contratos registrados para este projeto ainda.</p>
                    <button onClick={onCreateNew} className="text-blue-600 font-bold hover:underline">
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
                                        <Button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEdit && onEdit(contract);
                                            }}
                                            variant="secondary"
                                            size="icon"
                                            className="!h-8 !w-8 hover:text-emerald-600 hover:border-emerald-100 shadow-sm"
                                            title="Ajustar Contrato"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            onClick={(e) => handleDuplicate(e, contract.id)}
                                            variant="secondary"
                                            size="icon"
                                            className="!h-8 !w-8 hover:text-blue-600 hover:border-blue-100 shadow-sm"
                                            title="Duplicar Contrato"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            onClick={(e) => handleDelete(e, contract.id)}
                                            variant="secondary"
                                            size="icon"
                                            className="!h-8 !w-8 hover:text-red-600 hover:border-red-100 shadow-sm"
                                            title="Excluir Contrato"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                <StatusBadge status={contract.status} />
                            </div>

                            <div className="space-y-1 mb-6">
                                <p className="text-xs font-medium text-blue-500 uppercase tracking-widest">{contract.number}</p>
                                <h3 className="text-lg font-medium text-gray-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors uppercase">{contract.title}</h3>
                            </div>

                            <div className="space-y-4 mb-8 flex-1">
                                <div className="flex items-center gap-3 text-gray-500">
                                    <Building2 className="w-4 h-4 text-gray-400" />
                                    <span className="text-xs font-medium truncate">
                                        {contract.project_id ? (projectMap[contract.project_id] ?? '—') : '—'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-gray-500">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    <span className="text-xs font-medium">Vigência: {new Date(contract.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} a {contract.end_date ? new Date(contract.end_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indeterminado'}</span>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-gray-50 mt-auto">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Valor Atualizado</p>
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
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-max">
                            <thead>
                                <tr className="bg-gray-50/50">
                                    {tableColumns.visibleColumns.includes('number') && <SortableHeader colKey="number" label="Código" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} />}
                                    {tableColumns.visibleColumns.includes('title') && <SortableHeader colKey="title" label="Contrato" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} />}
                                    {tableColumns.visibleColumns.includes('project') && <SortableHeader colKey="project" label="Obra" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} />}
                                    {tableColumns.visibleColumns.includes('supplier') && <SortableHeader colKey="supplier" label={direction === 'OUTGOING' ? 'Cliente' : 'Fornecedor'} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} />}
                                    {tableColumns.visibleColumns.includes('date') && <SortableHeader colKey="date" label="Vigência" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} />}
                                    {tableColumns.visibleColumns.includes('status') && <SortableHeader colKey="status" label="Status" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} />}
                                    {tableColumns.visibleColumns.includes('value') && <SortableHeader colKey="value" label="Valor Atual" sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-4 text-right" />}
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
                                        {tableColumns.visibleColumns.includes('number') && (
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-normal text-gray-500">{contract.number || '—'}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('title') && (
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{contract.title}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('project') && (
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-normal text-gray-600">
                                                    {contract.project_id ? (projectMap[contract.project_id] ?? '—') : '—'}
                                                </span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('supplier') && (
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-normal text-gray-600">
                                                    {direction === 'OUTGOING'
                                                        ? (contract.client_id ? (clientMap[contract.client_id] ?? '—') : '—')
                                                        : (contract.supplier_id ? (supplierMap[contract.supplier_id] ?? '—') : '—')}
                                                </span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('date') && (
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-normal text-gray-600">{new Date(contract.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} a {contract.end_date ? new Date(contract.end_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indeterminado'}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('status') && (
                                            <td className="px-6 py-5">
                                                <StatusBadge status={contract.status} />
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('value') && (
                                            <td className="px-6 py-5 text-right font-medium text-gray-900">
                                                R$ {contract.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                        )}
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onViewDetails(contract.id);
                                                    }}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Ver Detalhes"
                                                >
                                                    <List className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onViewDetails(contract.id);
                                                    }}
                                                    className="text-blue-600 font-semibold hover:underline text-sm"
                                                >
                                                    Ver Detalhes
                                                </button>
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
