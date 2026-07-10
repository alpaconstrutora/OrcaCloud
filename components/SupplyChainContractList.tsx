import React from 'react';
import {
    Search, Plus,
    FileText, Calendar, Building2, DollarSign,
    ArrowRight, Clock, Shield, LayoutDashboard,
    Table2, RefreshCw, Copy, Trash2, Pencil,
    AlertCircle
} from 'lucide-react';
import { contractService } from '../services/contractService';
import { supplierService } from '../services/supplierService';
import { clientService } from '../services/clientService';
import { projectService } from '../services/projectService';
import { Contract } from '../types';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import Button from './ui/Button';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';

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
    const confirm = useConfirm();

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

    // Excluir direto (sem diálogo) — usado pelo InlineDisclosureMenu, que já tem
    // confirmação de 2 passos embutida (ui_ux_standard_guide.md §9).
    const performDelete = async (id: string) => {
        try {
            setLoading(true);
            await contractService.deleteContract(id);
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

    // Excluir fora do kebab (grid view): pede confirmação via useConfirm (§14).
    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const ok = await confirm({
            title: 'Excluir contrato?',
            message: 'Esta ação é irreversível e removerá todos os dados associados ao contrato.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await performDelete(id);
    };

    const performDuplicate = async (id: string) => {
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

    const handleDuplicate = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        performDuplicate(id);
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

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-gray-400 font-medium animate-pulse uppercase tracking-widest text-xs">Sincronizando Contratos...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Notification toast */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{title}</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{subtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                    {extraActions}
                    <button
                        onClick={onCreateNew}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo contrato
                    </button>
                </div>
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard shadow={false} size="sm" label="Total de Contratos" value={stats.total} icon={<FileText className="w-4 h-4" />} color="blue" />
                <KpiCard shadow={false} size="sm" label="Contratos Ativos" value={stats.active} icon={<Shield className="w-4 h-4" />} color="emerald" />
                <KpiCard shadow={false} size="sm" label="Valor Total Contratado" value={`R$ ${stats.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<DollarSign className="w-4 h-4" />} color="indigo" />
                <KpiCard shadow={false} size="sm" label="Pendentes de Medição" value={stats.pendingMeasurements} icon={<Clock className="w-4 h-4" />} color="amber" />
            </div>

            {/* Filters — §5.1 (variante desaninhada, escala compacta §16) */}
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por número, título ou tipo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-9 text-sm font-normal text-gray-700 bg-white border border-gray-200 rounded-[6px] px-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                    <option value="all">Todos os Status</option>
                    <option value="Rascunho">Rascunho</option>
                    <option value="Minuta">Minuta</option>
                    <option value="Ativo">Ativo</option>
                    <option value="Suspenso">Suspenso</option>
                    <option value="Encerrado">Encerrado</option>
                    <option value="Cancelado">Cancelado</option>
                </select>

                {projectId && (
                    <button
                        onClick={() => setLocalShowAll(!localShowAll)}
                        title={!localShowAll ? 'Mostrando apenas contratos desta obra — clique para ver todos' : 'Filtrar contratos por esta obra'}
                        className={`flex items-center gap-1.5 h-9 px-3 rounded-[6px] transition-all active:scale-95 text-sm font-medium whitespace-nowrap ${!localShowAll
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                            }`}
                    >
                        <Building2 className="w-4 h-4" />
                        {localShowAll ? 'Filtrar por Obra' : 'Ver Todos Projetos'}
                    </button>
                )}

                <button
                    onClick={loadContracts}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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

            {/* Content List */}
            {filteredContracts.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum contrato encontrado</h3>
                    <p className="text-sm text-gray-500 mb-6">Não há contratos registrados para este projeto ainda.</p>
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
                                    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
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
                <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            {/* thead em sentence case (§6.2) — escala compacta; uppercase={false} porque
                                SortableHeader força uppercase internamente por padrão. */}
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.visibleColumns.includes('number') && <SortableHeader colKey="number" label="Código" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />}
                                    {tableColumns.visibleColumns.includes('title') && <SortableHeader colKey="title" label="Contrato" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {tableColumns.visibleColumns.includes('project') && <SortableHeader colKey="project" label="Obra" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />}
                                    {tableColumns.visibleColumns.includes('supplier') && <SortableHeader colKey="supplier" label={direction === 'OUTGOING' ? 'Cliente' : 'Fornecedor'} uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />}
                                    {tableColumns.visibleColumns.includes('date') && <SortableHeader colKey="date" label="Vigência" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />}
                                    {tableColumns.visibleColumns.includes('status') && <SortableHeader colKey="status" label="Status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {tableColumns.visibleColumns.includes('value') && <SortableHeader colKey="value" label="Valor Atual" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-right" />}
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredContracts.map((contract) => (
                                    <tr
                                        key={contract.id}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                        onClick={() => onViewDetails(contract.id)}
                                    >
                                        {tableColumns.visibleColumns.includes('number') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                {contract.number || '—'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('title') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-900 group-hover:text-blue-600 transition-colors">
                                                {contract.title}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('project') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {contract.project_id ? (projectMap[contract.project_id] ?? '—') : '—'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('supplier') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {direction === 'OUTGOING'
                                                    ? (contract.client_id ? (clientMap[contract.client_id] ?? '—') : '—')
                                                    : (contract.supplier_id ? (supplierMap[contract.supplier_id] ?? '—') : '—')}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('date') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {new Date(contract.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} a {contract.end_date ? new Date(contract.end_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indeterminado'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('status') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <StatusBadge status={contract.status} />
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('value') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800 text-right">
                                                R$ {contract.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                        )}
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onViewDetails(contract.id); }}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                >
                                                    Ver Detalhes
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onEdit?.(contract); }}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ml-1"
                                                    title="Ajustar Contrato"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <InlineDisclosureMenu
                                                    menuItems={[
                                                        { icon: <Copy className="w-[18px] h-[18px]" />, label: 'Duplicar Contrato', onClick: () => performDuplicate(contract.id) },
                                                    ]}
                                                    showDelete
                                                    onDelete={() => performDelete(contract.id)}
                                                />
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
