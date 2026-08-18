import React from 'react';
import {
    Search, Plus,
    FileText, Calendar, Building2, DollarSign,
    ArrowRight, Clock, Shield, LayoutDashboard,
    Table2, RefreshCw, Copy,
    AlertCircle, MoveHorizontal, Landmark
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { contractService } from '../services/contractService';
import { supplierService, getSupplierDisplayName } from '../services/supplierService';
import { appSettingsService } from '../services/appSettingsService';
import { clientService } from '../services/clientService';
import { projectService } from '../services/projectService';
import { empreendimentoService } from '../services/empreendimentoService';
import { financialRegistryService } from '../services/financialRegistryService';
import EmpreendimentoCell from './empreendimento/EmpreendimentoCell';
import { Contract } from '../types';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    number: 123, title: 260, project: 180, empreendimento: 184, supplier: 230, date: 170, status: 130, value: 150,
    costCenter: 170, planoContas: 170, actions: 200,
};

const COLUMNS: ColumnConfig[] = [
    { key: 'number', label: 'Número', sortable: true },
    { key: 'title', label: 'Contrato', sortable: true },
    { key: 'project', label: 'Obra', sortable: true },
    { key: 'empreendimento', label: 'Empreendimento', sortable: true },
    { key: 'supplier', label: 'Contratada/Contratante', sortable: true },
    { key: 'date', label: 'Vigência', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'value', label: 'Valor Atual', sortable: true },
    { key: 'costCenter', label: 'Centro de Custo', sortable: true },
    { key: 'planoContas', label: 'Plano de Contas', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica de fora: é renderizada fixa fora do
// drag. Label de 'supplier' é sobrescrito no render conforme `direction`
// (Cliente/Fornecedor) — aqui fica só o default.
const CONTRACT_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    number: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    title: { label: 'Contrato', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    project: { label: 'Obra', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    empreendimento: { label: 'Empreendimento', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    supplier: { label: 'Fornecedor', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    date: { label: 'Vigência', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    value: { label: 'Valor Atual', className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
    costCenter: { label: 'Centro de Custo', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    planoContas: { label: 'Plano de Contas', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
};

// Badge de status — sem estado próprio, movida para escopo de módulo para poder
// ser usada dentro de renderContractCell (função pura, fora do componente).
const ContractStatusBadge = ({ status }: { status: string }) => {
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

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderContractCell(
    key: string,
    contract: Contract,
    ctx: {
        direction: 'INCOMING' | 'OUTGOING';
        projectMap: Record<string, string>;
        supplierMap: Record<string, string>;
        clientMap: Record<string, string>;
        empreendimentoByProject: Record<string, { id: string; name: string; towerName?: string }>;
        empreendimentoById: Record<string, { id: string; name: string }>;
        costCenterMap: Record<string, string>;
        planoContasMap: Record<string, string>;
    },
): React.ReactNode {
    switch (key) {
        case 'number':
            return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{contract.number || '—'}</span>;
        case 'title':
            return <span className="text-sm font-normal text-gray-900 group-hover:text-blue-600 transition-colors">{contract.title}</span>;
        case 'project':
            return <span className="text-sm font-normal text-gray-700">{contract.project_id ? (ctx.projectMap[contract.project_id] ?? '—') : '—'}</span>;
        case 'empreendimento': {
            // Vínculo DIRETO (contract.empreendimento_id) tem prioridade — existe
            // justamente para contrato sem obra. Só cai para o derivado pela obra
            // quando não há vínculo direto (contratos antigos, criados antes dele existir).
            const direto = contract.empreendimento_id ? ctx.empreendimentoById[contract.empreendimento_id] : undefined;
            const porObra = contract.project_id ? ctx.empreendimentoByProject[contract.project_id] : undefined;
            return <EmpreendimentoCell value={direto ?? porObra} />;
        }
        case 'supplier':
            return (
                <span className="text-sm font-normal text-gray-700">
                    {ctx.direction === 'OUTGOING'
                        ? (contract.client_id ? (ctx.clientMap[contract.client_id] ?? '—') : '—')
                        : (contract.supplier_id ? (ctx.supplierMap[contract.supplier_id] ?? '—') : '—')}
                </span>
            );
        case 'date':
            return (
                <span className="text-sm font-normal text-gray-600">
                    {new Date(contract.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} a {contract.end_date ? new Date(contract.end_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indeterminado'}
                </span>
            );
        case 'status':
            return <ContractStatusBadge status={contract.status} />;
        case 'value':
            return (
                <span className="text-sm font-medium text-gray-800 text-right block">
                    R$ {contract.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
            );
        case 'costCenter':
            return <span className="text-sm font-normal text-gray-700">{contract.cost_center_id ? (ctx.costCenterMap[contract.cost_center_id] ?? '—') : '—'}</span>;
        case 'planoContas':
            return <span className="text-sm font-normal text-gray-700">{contract.plano_de_contas_id ? (ctx.planoContasMap[contract.plano_de_contas_id] ?? '—') : '—'}</span>;
        default:
            return null;
    }
}

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
    hideHeader?: boolean;
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
    hideHeader = false,
}) => {
    const [contracts, setContracts] = React.useState<Contract[]>([]);
    const [supplierMap, setSupplierMap] = React.useState<Record<string, string>>({});
    // Preferência global razão social/apelido (definida em Meus Fornecedores) — só a exibição na
    // lista respeita; contratos/documentos oficiais continuam com a razão social à parte.
    const nameMode = React.useMemo(() => appSettingsService.get().supplierNameDisplay, []);
    const [clientMap, setClientMap] = React.useState<Record<string, string>>({});
    const [projectMap, setProjectMap] = React.useState<Record<string, string>>({});
    // Obra → empreendimento (empreendimentos.project_id / empreendimento_towers.project_id)
    // — usado quando o contrato não tem vínculo direto. Desde 20270905000028,
    // contracts.empreendimento_id também existe (contrato sem obra também pode ter
    // empreendimento); esse mapa por id vem de empreendimentoById logo abaixo.
    const [empreendimentoByProject, setEmpreendimentoByProject] = React.useState<Record<string, { id: string; name: string; towerName?: string }>>({});
    const [empreendimentoById, setEmpreendimentoById] = React.useState<Record<string, { id: string; name: string }>>({});
    const [costCenterMap, setCostCenterMap] = React.useState<Record<string, string>>({});
    const [planoContasMap, setPlanoContasMap] = React.useState<Record<string, string>>({});
    const [loading, setLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = usePersistedState('supplyChainContractFilters:search', '');
    const [statusFilter, setStatusFilter] = usePersistedState('supplyChainContractFilters:status', 'all');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('supplyChainContractFilters:viewMode', 'list');
    const [localShowAll, setLocalShowAll] = React.useState(true);
    const tableColumns = useTableColumns(COLUMNS, 'supplyChainContractColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'supplyChainContractColWidths');
    // Largura total = soma exata das colunas visíveis. NUNCA w-full/100% junto com
    // table-layout:fixed: o navegador redistribuiria a sobra entre as colunas e
    // arrastar uma borda moveria a vizinha errada (§6.1).
    const tableTotalWidth = COLUMNS.filter(c => c.key !== 'actions')
        .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0)
        + cols.getWidth('actions');

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
            const [data, suppliers, clients, projects, empMap, empreendimentos, costCenters, planoContas] = await Promise.all([
                contractService.listContracts(targetProjectId, organizationId, undefined, direction, domain),
                supplierService.listSuppliers(organizationId).catch(() => []),
                clientService.listClients(organizationId).catch(() => []),
                projectService.listProjects(undefined, organizationId).catch(() => []),
                // Sem organização ("Todas") o mapa não é bloqueado — o service não filtra
                // e a RLS recorta (CLAUDE.md regra #5).
                empreendimentoService.mapObrasToEmpreendimentos(organizationId).catch(() => ({})),
                empreendimentoService.list(organizationId).catch(() => []),
                financialRegistryService.listCostCenters(organizationId).catch(() => []),
                financialRegistryService.listPlanoContas(organizationId).catch(() => []),
            ]);
            setContracts(data);
            setSupplierMap(Object.fromEntries(suppliers.map(s => [s.id, getSupplierDisplayName(s, nameMode)])));
            setClientMap(Object.fromEntries(clients.map((c: { id: string; name: string }) => [c.id, c.name])));
            setProjectMap(Object.fromEntries(projects.map((p: { id: string; name: string }) => [p.id, p.name])));
            setEmpreendimentoByProject(empMap);
            setEmpreendimentoById(Object.fromEntries(empreendimentos.map(e => [e.id, { id: e.id, name: e.name }])));
            setCostCenterMap(Object.fromEntries(costCenters.map(c => [c.id, c.name])));
            setPlanoContasMap(Object.fromEntries(planoContas.map(c => [c.id, c.name])));
        } catch (error) {
            console.error("ERRO CRÍTICO AO CARREGAR CONTRATOS:", error);
            notify("Erro ao carregar contratos. Verifique a conexão com o banco de dados.", "error");
        } finally {
            setLoading(false);
        }
    };

    // Excluir direto (sem diálogo) — usado pelo InlineDisclosureMenu, que já tem
    // confirmação de 2 passos embutida (ui_ux_guia_unificado.md §9).
    const performDelete = async (id: string) => {
        try {
            await contractService.deleteContract(id);
            // §22: atualiza o array local em vez de recarregar contratos + fornecedores
            // + clientes + obras (4 consultas) por causa de um único item excluído.
            setContracts(prev => prev.filter(c => c.id !== id));
            onDelete?.();
            notify("Contrato excluído com sucesso.", "success");
        } catch (error) {
            console.error("Erro ao excluir contrato:", error);
            notify("Erro ao excluir contrato.", "error");
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
            const dupe = await contractService.duplicateContract(id);
            // §22: insere a cópia devolvida pelo backend no array local, sem refetch.
            setContracts(prev => [dupe, ...prev]);
            notify(`Contrato duplicado com sucesso! Nova cópia: ${dupe.title}`, "success");
        } catch (error) {
            console.error("Erro ao duplicar contrato:", error);
            notify("Erro ao duplicar contrato.", "error");
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
                if (field === 'empreendimento') {
                    const nomeA = empreendimentoById[a.empreendimento_id || '']?.name || empreendimentoByProject[a.project_id || '']?.name || '';
                    const nomeB = empreendimentoById[b.empreendimento_id || '']?.name || empreendimentoByProject[b.project_id || '']?.name || '';
                    cmp = nomeA.localeCompare(nomeB);
                }
                if (field === 'supplier') cmp = (supplierMap[a.supplier_id || ''] || '').localeCompare(supplierMap[b.supplier_id || ''] || '');
                if (field === 'date')     cmp = new Date(a.start_date || '').getTime() - new Date(b.start_date || '').getTime();
                if (field === 'status')   cmp = (a.status || '').localeCompare(b.status || '');
                if (field === 'value')    cmp = a.current_value - b.current_value;
                if (field === 'costCenter') cmp = (costCenterMap[a.cost_center_id || ''] || '').localeCompare(costCenterMap[b.cost_center_id || ''] || '');
                if (field === 'planoContas') cmp = (planoContasMap[a.plano_de_contas_id || ''] || '').localeCompare(planoContasMap[b.plano_de_contas_id || ''] || '');
                return dir === 'asc' ? cmp : -cmp;
            });
    }, [contracts, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection, statusFilter, supplierMap, projectMap, empreendimentoByProject, empreendimentoById, costCenterMap, planoContasMap]);

    // Dashboard data
    const stats = {
        total: contracts.length,
        active: contracts.filter(c => c.status === 'Ativo').length,
        totalValue: contracts.reduce((sum, c) => sum + (c.current_value || 0), 0),
        pendingMeasurements: 0, // Placeholder
    };

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
            {!hideHeader && (
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{title}</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{subtitle}</p>
                </div>
            )}

            {/* Stats Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <KpiCard shadow={false} size="sm" label="Total de Contratos" value={stats.total} icon={<FileText className="w-4 h-4" />} color="blue" />
                <KpiCard shadow={false} size="sm" label="Contratos Ativos" value={stats.active} icon={<Shield className="w-4 h-4" />} color="emerald" />
                <KpiCard shadow={false} size="sm" label="Valor Total Contratado" value={`R$ ${stats.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<DollarSign className="w-4 h-4" />} color="indigo" />
                <KpiCard shadow={false} size="sm" label="Pendentes de Medição" value={stats.pendingMeasurements} icon={<Clock className="w-4 h-4" />} color="amber" />
            </div>

            {/* Toolbar de botões (§5.3) — separada da busca por pedido explícito do
                usuário (2026-07-29): mesmo sem controles de escopo (conta/competência/
                período), Templates e Novo Contrato ganham régua própria acima da
                toolbar de busca/tabela, com o layout canônico justify-between do §5.3. */}
            <div className="flex items-center justify-end gap-2 bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                {extraActions}
                <button
                    onClick={onCreateNew}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Novo contrato
                </button>
            </div>

            {/* Toolbar acoplada à tabela (§5.2, padrão OpuraDocsModule/GED) — toolbar e
                conteúdo dividem um único card (border/rounded/shadow só no container pai);
                a costura visível entre os dois é o border-b da toolbar. Componente
                compartilhado (Suprimentos/Locação/Serviços/Vendas via prop domain/direction). */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex flex-col md:flex-row gap-2.5 items-center p-4 border-b border-gray-100 bg-white">
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
                    {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                        Duplo clique no divisor segue "restaurar padrão". Só em modo
                        lista: no modo blocos não há coluna para ajustar. */}
                    {viewMode === 'list' && (
                        <button
                            onClick={() => cols.autoFit()}
                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                            title="Ajustar largura das colunas ao conteúdo"
                        >
                            <MoveHorizontal className="w-4 h-4" />
                        </button>
                    )}
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

            {/* Content List — sem bg/border/rounded próprios: já está dentro do card
                acoplado toolbar+conteúdo (ver abertura acima) */}
            {loading ? (
                /* §11 — dentro do card acoplado: título, KPIs e toolbar continuam
                   visíveis durante o carregamento (antes, um early return apagava
                   a tela inteira). */
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : filteredContracts.length === 0 ? (
                <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum contrato encontrado</h3>
                    <p className="text-sm text-gray-500 mb-6">Tente ajustar seus filtros de busca ou cadastre o primeiro contrato.</p>
                    <button onClick={onCreateNew} className="text-blue-600 font-bold hover:underline">
                        Começar Cadastro
                    </button>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    {filteredContracts.map((contract) => (
                        <div
                            key={contract.id}
                            className="bg-white rounded-[10px] border border-gray-100 shadow-sm hover:shadow-lg hover:border-blue-100 transition-all group overflow-hidden flex flex-col p-5 cursor-pointer"
                            onClick={() => onViewDetails(contract.id)}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-2">
                                    <div className="p-3 bg-blue-50 rounded-[6px] text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        <ActionIconButton kind="edit" size="sm" title="Ajustar Contrato" onClick={(e) => { e.stopPropagation(); onEdit && onEdit(contract); }} />
                                        <ActionIconButton kind="duplicate" size="sm" title="Duplicar Contrato" onClick={(e) => handleDuplicate(e, contract.id)} />
                                        <ActionIconButton kind="delete" size="sm" title="Excluir Contrato" onClick={(e) => handleDelete(e, contract.id)} />
                                    </div>
                                </div>
                                <ContractStatusBadge status={contract.status} />
                            </div>

                            {/* §16/§6.2: sentence case — o `uppercase tracking-widest`
                                é o vocabulário "gritado" já removido de thead/badge/botão. */}
                            <div className="space-y-1 mb-4">
                                <p className="text-xs font-medium text-blue-600">{contract.number}</p>
                                <h3 className="text-base font-medium text-gray-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors">{contract.title}</h3>
                            </div>

                            <div className="space-y-3 mb-5 flex-1">
                                <div className="flex items-center gap-3 text-gray-500">
                                    <Building2 className="w-4 h-4 text-gray-400" />
                                    <span className="text-xs font-medium truncate">
                                        {contract.project_id ? (projectMap[contract.project_id] ?? '—') : '—'}
                                    </span>
                                </div>
                                {(() => {
                                    const emp = (contract.empreendimento_id && empreendimentoById[contract.empreendimento_id])
                                        || (contract.project_id ? empreendimentoByProject[contract.project_id] : undefined);
                                    return emp && (
                                        <div className="flex items-center gap-3 text-gray-500">
                                            <Landmark className="w-4 h-4 text-gray-400" />
                                            <span className="text-xs font-medium truncate">{emp.name}</span>
                                        </div>
                                    );
                                })()}
                                <div className="flex items-center gap-3 text-gray-500">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    <span className="text-xs font-medium">Vigência: {new Date(contract.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} a {contract.end_date ? new Date(contract.end_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indeterminado'}</span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100 mt-auto">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-xs font-medium text-gray-400 mb-1">Valor atualizado</p>
                                        <p className="text-lg font-medium text-gray-900 tracking-tight">
                                            R$ {contract.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="p-2.5 bg-gray-50 rounded-[6px] group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* §6.5 — rolagem própria + thead sticky: a lista de contratos cresce
                   sem teto. §6.1: nada de width/minWidth 100% no <table> junto com
                   table-layout:fixed (o navegador redistribuiria a sobra e arrastar
                   uma borda moveria a coluna vizinha errada). */
                <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                    borda de "Ações" não andar a cada redimensionamento. */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            {/* thead em sentence case (§6.2) — escala compacta; uppercase={false} porque
                                SortableHeader força uppercase internamente por padrão. */}
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = CONTRACT_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        const label = key === 'supplier' ? (direction === 'OUTGOING' ? 'Cliente' : 'Fornecedor') : def.label;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                        Ações
                                        <cols.ResizeHandle colKey="actions" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredContracts.map((contract) => (
                                    <tr
                                        key={contract.id}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                        onClick={() => onViewDetails(contract.id)}
                                    >
                                        {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {renderContractCell(key, contract, { direction, projectMap, supplierMap, clientMap, empreendimentoByProject, empreendimentoById, costCenterMap, planoContasMap })}
                                            </td>
                                        ))}
                                        {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                        <td aria-hidden="true" className="border-r border-gray-100"></td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onViewDetails(contract.id); }}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all"
                                                >
                                                    Ver Detalhes
                                                </button>
                                                <ActionIconButton kind="edit" title="Ajustar Contrato" onClick={(e) => { e.stopPropagation(); onEdit?.(contract); }} />
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
            )}
            </div>
        </div>
    );
};

export default SupplyChainContractList;
