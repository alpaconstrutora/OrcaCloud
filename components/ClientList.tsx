import React from 'react';
import { clientService } from '../services/clientService';
import { clientPortalService, ClientPortalToken } from '../services/clientPortalService';
import { supabase } from '../lib/supabase';
import { User, Mail, Phone, Trash2, Search, Loader2, Plus, Edit2, LayoutDashboard, Table2, Building2, Link2, Copy, Check, RefreshCw, X, Wrench, ClipboardList, Bell, Send, Tag } from 'lucide-react';
import { Client } from '../types';
import ClientModal from './ClientModal';
import ClientRequestsAdminModal from './ClientRequestsAdminModal';
import { clientMessagesService } from '../services/clientMessagesService';
import { useServicesToast } from './services/useServicestoast';
import ServicesToast from './services/ServicesToast';
import { useStore } from '../store/useStore';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { KpiCard } from './ui/KpiCard';
import { isObra } from '../utils/projectClassification';

interface ClientListProps {
    onClientsChange?: () => void;
    onSelectClient?: (client: Client) => void;
    organizationId?: string;
}

const CLIENT_COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Cliente', sortable: true },
    { key: 'category', label: 'Tipo', sortable: true },
    { key: 'organization', label: 'Organização', sortable: true },
    { key: 'contact', label: 'Contato', sortable: false },
    { key: 'document', label: 'Documento', sortable: true },
    { key: 'projects', label: 'Obra Vinculada', sortable: false },
];

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    code: 90, name: 220, category: 130, organization: 180, contact: 200, document: 150, projects: 200, actions: 190,
};

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa a
// busca/categoria já existentes, não os substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'name', label: 'Cliente', type: 'text' },
    { key: 'email', label: 'E-mail', type: 'text' },
    { key: 'document', label: 'Documento', type: 'text' },
    { key: 'organization', label: 'Organização', type: 'text' },
    { key: 'category', label: 'Tipo', type: 'select', options: [
        { value: 'Vendas', label: 'Vendas' }, { value: 'Locação', label: 'Locação' }, { value: 'Serviços', label: 'Serviços' },
    ] },
];

// Texto simples colorido — sem pílula/fundo/uppercase (ui_ux_standard_guide.md §8).
const CATEGORY_COLORS: Record<string, string> = {
    'Vendas': 'text-emerald-700',
    'Locação': 'text-blue-700',
    'Serviços': 'text-amber-700',
};

const CategoryLabel: React.FC<{ category?: string }> = ({ category }) => (
    <span className={`text-sm font-normal ${category ? (CATEGORY_COLORS[category] || 'text-gray-600') : 'text-gray-400'}`}>
        {category || 'Não definido'}
    </span>
);

function getAdvancedFilterValue(c: Client, key: string): unknown {
    switch (key) {
        case 'name': return c.name ?? '';
        case 'email': return c.email ?? '';
        case 'document': return c.document ?? '';
        case 'organization': return c.organization_name ?? '';
        case 'category': return c.category ?? '';
        default: return null;
    }
}

const ClientList: React.FC<ClientListProps> = ({ onClientsChange, onSelectClient, organizationId }) => {
    const { activeOrganizationId } = useStore();
    const [clients, setClients] = React.useState<Client[]>([]);
    const [projects, setProjects] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('clientListFilters:search', '');
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedClient, setSelectedClient] = React.useState<Client | undefined>(undefined);
    const [viewMode, setViewMode] = usePersistedState<'list' | 'grid'>('clientListFilters:viewMode', 'list');
    const [categoryFilter, setCategoryFilter] = usePersistedState<string>('clientListFilters:category', 'all');
    const { toasts, show: showToast, dismiss: dismissToast } = useServicesToast();
    const tableColumns = useTableColumns(CLIENT_COLUMNS, 'clientListColumns');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'clientListFilters:advanced');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'clientListColWidths');
    // table-layout:fixed + largura 100% faz o navegador redistribuir o espaço
    // sobrando entre as colunas de <col> fixo (arrastar uma borda "puxava" as
    // vizinhas). Fixar a largura total na soma exata das colunas elimina esse
    // espaço sobrando — mesma correção aplicada em SupplierList.tsx.
    const tableTotalWidth = (['code', 'name', 'category', 'organization', 'contact', 'document', 'projects'] as const)
        .reduce((sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0)
        + cols.getWidth('actions');
    const confirm = useConfirm();

    React.useEffect(() => {
        loadData();
    }, [organizationId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [clientsData, { data: projectsData }] = await Promise.all([
                clientService.listClients(organizationId),
                supabase.from('projects').select('id, name, settings').eq('settings->>classification', 'OBRA')
            ]);
            setClients(clientsData);
            setProjects(projectsData ?? []);
        } catch (error) {
            console.error("Erro ao listar dados:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadClients = loadData; // Alias for compatibility with existing calls

    // Excluir direto (sem diálogo) — usado pelo InlineDisclosureMenu, que já tem
    // confirmação de 2 passos embutida (ui_ux_standard_guide.md §9).
    const performDelete = async (id: string) => {
        try {
            await clientService.deleteClient(id);
            setClients(prev => prev.filter(c => c.id !== id));
            if (onClientsChange) onClientsChange();
            showToast('Cliente excluído com sucesso.', 'success');
        } catch (error) {
            console.error("Erro ao excluir cliente:", error);
            showToast('Erro ao excluir o cliente.', 'error');
        }
    };

    // Excluir fora do kebab (grid view): pede confirmação via useConfirm (§14).
    const handleDelete = async (id: string, name: string) => {
        const ok = await confirm({
            title: 'Excluir cliente?',
            message: `Tem certeza que deseja excluir o cliente "${name}"? Essa ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await performDelete(id);
    };

    const handleOpenModal = (client?: Client) => {
        setSelectedClient(client);
        setIsModalOpen(true);
    };

    const handleSubmit = async (data: Partial<Client>) => {
        try {
            await clientService.saveClient(data);
            setIsModalOpen(false);
            loadClients();
            if (onClientsChange) onClientsChange();
            showToast('Cliente salvo com sucesso!', 'success');
        } catch (error) {
            console.error("Erro ao salvar cliente:", error);
            showToast('Erro ao salvar o cliente.', 'error');
        }
    };

    const [tokenModal, setTokenModal] = React.useState<{ client: Client; token: ClientPortalToken | null } | null>(null);
    const [tokenLoading, setTokenLoading] = React.useState(false);
    const [tokenCopied, setTokenCopied] = React.useState(false);
    const [requestsModal, setRequestsModal] = React.useState<Client | null>(null);
    const [comunicadoModal, setComunicadoModal] = React.useState<Client | null>(null);
    const [comunicadoForm, setComunicadoForm] = React.useState({ title: '', body: '' });
    const [comunicadoSending, setComunicadoSending] = React.useState(false);

    const openTokenModal = async (client: Client) => {
        setTokenModal({ client, token: null });
        setTokenLoading(true);
        try {
            const tok = await clientPortalService.getTokenForClient(client.id);
            setTokenModal({ client, token: tok });
        } catch (e) {
            console.error(e);
        } finally {
            setTokenLoading(false);
        }
    };

    const handleGenerateToken = async () => {
        const orgId = organizationId || activeOrganizationId || tokenModal?.client.organization_id;
        if (!tokenModal || !orgId) {
            console.error('[ClientPortal] organizationId ausente', { organizationId, activeOrganizationId, clientOrgId: tokenModal?.client.organization_id });
            showToast('Erro: organização não identificada.', 'error');
            return;
        }
        setTokenLoading(true);
        try {
            await clientPortalService.generateToken(tokenModal.client.id, orgId);
            const tok = await clientPortalService.getTokenForClient(tokenModal.client.id);
            setTokenModal(prev => prev ? { ...prev, token: tok } : null);
            showToast('Link gerado com sucesso!', 'success');
        } catch (e) {
            console.error('[ClientPortal] Erro ao gerar token:', e);
            showToast('Erro ao gerar link.', 'error');
        } finally {
            setTokenLoading(false);
        }
    };

    const handleCopyLink = async () => {
        if (!tokenModal?.token) return;
        const url = clientPortalService.buildPortalUrl(tokenModal.token.token);
        await navigator.clipboard.writeText(url);
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
    };

    const handleRevokeToken = async () => {
        if (!tokenModal) return;
        const ok = await confirm({
            title: 'Revogar acesso ao portal?',
            message: 'O cliente perderá o acesso ao portal através deste link.',
            variant: 'warning',
            confirmLabel: 'Revogar',
        });
        if (!ok) return;
        setTokenLoading(true);
        try {
            await clientPortalService.revokeToken(tokenModal.client.id);
            setTokenModal(prev => prev ? { ...prev, token: null } : null);
            showToast('Acesso revogado.', 'success');
        } catch (e) {
            showToast('Erro ao revogar.', 'error');
        } finally {
            setTokenLoading(false);
        }
    };

    const filteredClients = React.useMemo(() => {
        let result = clients
            .filter(c =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.document?.includes(searchTerm)
            )
            .filter(c => categoryFilter === 'all' || c.category === categoryFilter);

        result = applyFilterRules(result, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);

        return result.sort((a, b) => {
                // Ordenação por coluna (quando selecionada)
                if (tableColumns.sortColumn) {
                    switch (tableColumns.sortColumn) {
                        case 'code':
                            return tableColumns.sortDirection === 'asc'
                                ? (a.code || '').localeCompare(b.code || '', 'pt-BR', { numeric: true })
                                : (b.code || '').localeCompare(a.code || '', 'pt-BR', { numeric: true });
                        case 'name':
                            return tableColumns.sortDirection === 'asc'
                                ? a.name.localeCompare(b.name)
                                : b.name.localeCompare(a.name);
                        case 'category':
                            return tableColumns.sortDirection === 'asc'
                                ? (a.category || '').localeCompare(b.category || '')
                                : (b.category || '').localeCompare(a.category || '');
                        case 'organization':
                            return tableColumns.sortDirection === 'asc'
                                ? (a.organization_name || '').localeCompare(b.organization_name || '')
                                : (b.organization_name || '').localeCompare(a.organization_name || '');
                        case 'document':
                            return tableColumns.sortDirection === 'asc'
                                ? (a.document || '').localeCompare(b.document || '')
                                : (b.document || '').localeCompare(a.document || '');
                        default:
                            return 0;
                    }
                }
                // Sem coluna clicada, ordenação default é nome A-Z (ui_ux_standard_guide.md §6.4:
                // toda coluna ordenável já ordena pelo próprio cabeçalho, sem dropdown redundante).
                return a.name.localeCompare(b.name);
            });
    }, [clients, searchTerm, categoryFilter, advancedFilters.rules, tableColumns.sortColumn, tableColumns.sortDirection]);

    const handleSendComunicado = async () => {
        if (!comunicadoModal || !comunicadoForm.title.trim()) return;
        const orgId = organizationId || activeOrganizationId || comunicadoModal.organization_id;
        if (!orgId) { showToast('Organização não identificada.', 'error'); return; }
        setComunicadoSending(true);
        try {
            await clientMessagesService.sendMessage(orgId, comunicadoModal.id, {
                sender_name: 'Equipe',
                type: 'comunicado',
                title: comunicadoForm.title,
                body: comunicadoForm.body || undefined,
            });
            showToast('Comunicado enviado!', 'success');
            setComunicadoModal(null);
            setComunicadoForm({ title: '', body: '' });
        } catch (e) {
            showToast('Erro ao enviar comunicado.', 'error');
        } finally {
            setComunicadoSending(false);
        }
    };


    const kpis = React.useMemo(() => ({
        total: clients.length,
        vendas: clients.filter(c => c.category === 'Vendas').length,
        locacao: clients.filter(c => c.category === 'Locação').length,
        servicos: clients.filter(c => c.category === 'Serviços').length,
    }), [clients]);

    const getClientProjects = React.useCallback(
        (clientId: string) => projects.filter(p => p.settings?.clientId === clientId && isObra(p)),
        [projects]
    );

    const handleAccessPortal = async (client: Client) => {
        try {
            const fullClient = await clientService.getById(client.id);
            if (fullClient && onSelectClient) onSelectClient(fullClient);
        } catch (error) {
            console.error('Erro ao carregar:', error);
            showToast('Erro ao carregar dados do portal.', 'error');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Meus Clientes</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie sua base de contatos e clientes com infraestrutura premium.</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {/* "Total" em destaque (2 colunas); os demais são a decomposição por categoria (§4.2) */}
                <KpiCard shadow={false} size="lg" className="col-span-2" label="Total de Clientes" value={kpis.total} icon={<User className="w-4 h-4" />} color="blue" />
                <KpiCard shadow={false} size="sm" label="Vendas" value={kpis.vendas} icon={<Tag className="w-4 h-4" />} color="emerald" />
                <KpiCard shadow={false} size="sm" label="Locação" value={kpis.locacao} icon={<Building2 className="w-4 h-4" />} color="indigo" />
                <KpiCard shadow={false} size="sm" label="Serviços" value={kpis.servicos} icon={<Wrench className="w-4 h-4" />} color="amber" />
            </div>

            {/* Toolbar §5.2 (variante acoplada à tabela, escala compacta §16) — toolbar e
                conteúdo dividem um único card; a única linha visível entre os dois é o
                border-b abaixo, sem duas bordas concêntricas. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-white">
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, e-mail ou documento..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>

                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-9 text-sm font-normal text-gray-700 bg-white border border-gray-200 rounded-[6px] px-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                    <option value="all">Todos os Tipos</option>
                    <option value="Vendas">Vendas</option>
                    <option value="Locação">Locação</option>
                    <option value="Serviços">Serviços</option>
                </select>

                {/* Dropdown "Ordenar" removido: toda coluna ordenável já ordena pelo próprio cabeçalho (ui_ux_standard_guide.md §6.4) */}
                <div className="flex items-center h-9">
                    <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                </div>

                <button
                    onClick={loadData}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>

                {/* Separador entre grupo "filtrar" (busca/categoria/filtro avançado/refresh) e grupo "visualizar" (colunas/grid/lista) */}
                <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    {viewMode === 'list' && (
                        <>
                            <ColumnConfigButton
                                columns={CLIENT_COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
                        </>
                    )}
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Blocos"
                    >
                        <LayoutDashboard className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Linhas"
                    >
                        <Table2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Variante compacta do CTA primário (§17) — movida pra dentro da régua,
                    igual ao SupplierList.tsx (cadastro não é o fluxo principal desta tela). */}
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Novo cliente
                </button>
            </div>
            </div>

            {isLoading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : filteredClients.length === 0 ? (
                <div className="text-center py-12">
                    <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum cliente encontrado</h3>
                    <p className="text-sm text-gray-500">
                        {searchTerm ? 'Tente ajustar seus filtros de busca.' : 'Cadastre seu primeiro cliente no botão acima.'}
                    </p>
                </div>
            ) : (
                viewMode === 'list' ? (
                        <div className="overflow-x-auto">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.visibleColumns.includes('code') && <col data-col-key="code" style={{ width: `${cols.getWidth('code')}px` }} />}
                                {tableColumns.visibleColumns.includes('name') && <col data-col-key="name" style={{ width: `${cols.getWidth('name')}px` }} />}
                                {tableColumns.visibleColumns.includes('category') && <col data-col-key="category" style={{ width: `${cols.getWidth('category')}px` }} />}
                                {tableColumns.visibleColumns.includes('organization') && <col data-col-key="organization" style={{ width: `${cols.getWidth('organization')}px` }} />}
                                {tableColumns.visibleColumns.includes('contact') && <col data-col-key="contact" style={{ width: `${cols.getWidth('contact')}px` }} />}
                                {tableColumns.visibleColumns.includes('document') && <col data-col-key="document" style={{ width: `${cols.getWidth('document')}px` }} />}
                                {tableColumns.visibleColumns.includes('projects') && <col data-col-key="projects" style={{ width: `${cols.getWidth('projects')}px` }} />}
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                                {/* coluna "espaçadora" sem largura fixa — absorve o espaço sobrando quando
                                    a tabela é mais estreita que o container (ver §6.1 do guia de UI). */}
                                <col />
                            </colgroup>
                            {/* thead em sentence case (§6.2) — uppercase={false} porque SortableHeader força
                                uppercase internamente por padrão; classes de estilo movidas pro <tr>, igual ao
                                snippet oficial do guia. */}
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.visibleColumns.includes('code') && (
                                        <SortableHeader colKey="code" label="Código" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="code" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('name') && (
                                        <SortableHeader colKey="name" label="Cliente" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="name" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('category') && (
                                        <SortableHeader colKey="category" label="Tipo" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="category" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('organization') && (
                                        <SortableHeader colKey="organization" label="Organização" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="organization" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('contact') && (
                                        // Contato = e-mail + telefone combinados — sem valor único óbvio pra ordenar (§6.3).
                                        <SortableHeader colKey="contact" label="Contato" sortable={false} uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                            <cols.ResizeHandle colKey="contact" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('document') && (
                                        <SortableHeader colKey="document" label="Documento" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="document" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('projects') && (
                                        // Obra Vinculada = lista de 0..N obras — sem valor único pra ordenar (§6.3).
                                        <SortableHeader colKey="projects" label="Obra Vinculada" sortable={false} uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                                            <cols.ResizeHandle colKey="projects" />
                                        </SortableHeader>
                                    )}
                                    <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                        Ações
                                        <cols.ResizeHandle colKey="actions" />
                                    </th>
                                    <th aria-hidden="true" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredClients.map(client => {
                                    const clientProjects = getClientProjects(client.id);
                                    return (
                                        <tr key={client.id} className="hover:bg-blue-50/50 transition-colors group">
                                            {tableColumns.visibleColumns.includes('code') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                    {client.code || '-'}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('name') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                                            <User className="w-4 h-4" />
                                                        </div>
                                                        <span className="text-sm font-normal text-gray-900">{client.name}</span>
                                                    </div>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('category') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <CategoryLabel category={client.category} />
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('organization') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                    {client.organization_name || '-'}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('contact') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <div className="space-y-1">
                                                        {client.email && (
                                                            <div className="flex items-center text-sm font-normal text-gray-600">
                                                                <Mail className="w-3.5 h-3.5 mr-1.5 text-blue-500 shrink-0" />
                                                                {client.email}
                                                            </div>
                                                        )}
                                                        {client.phone && (
                                                            <div className="flex items-center text-sm font-normal text-gray-600">
                                                                <Phone className="w-3.5 h-3.5 mr-1.5 text-gray-400 shrink-0" />
                                                                {client.phone}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('document') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                    {client.document || '-'}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('projects') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {clientProjects.length === 0 ? (
                                                        <span className="text-sm font-normal text-gray-400">-</span>
                                                    ) : (
                                                        <div className="flex flex-col gap-1">
                                                            {clientProjects.map(p => (
                                                                <div key={p.id} className="flex items-center gap-1.5 text-sm font-normal text-blue-600">
                                                                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                                                                    <span className="truncate max-w-[200px]" title={p.name}>{p.name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => handleOpenModal(client)}
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        Editar
                                                    </button>
                                                    {onSelectClient && (
                                                        <button
                                                            onClick={() => handleAccessPortal(client)}
                                                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                            title="Acessar Portal"
                                                        >
                                                            <LayoutDashboard className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => openTokenModal(client)}
                                                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                        title="Link de Acesso"
                                                    >
                                                        <Link2 className="w-4 h-4" />
                                                    </button>
                                                    <InlineDisclosureMenu
                                                        menuItems={[
                                                            ...(client.category === 'Locação' || client.category === 'Serviços' ? [{
                                                                icon: client.category === 'Serviços' ? <ClipboardList className="w-[18px] h-[18px]" /> : <Wrench className="w-[18px] h-[18px]" />,
                                                                label: client.category === 'Serviços' ? 'Ordens de Serviço' : 'Chamados de Manutenção',
                                                                onClick: () => setRequestsModal(client),
                                                            }] : []),
                                                            {
                                                                icon: <Bell className="w-[18px] h-[18px]" />,
                                                                label: 'Enviar Comunicado',
                                                                onClick: () => { setComunicadoModal(client); setComunicadoForm({ title: '', body: '' }); },
                                                            },
                                                        ]}
                                                        showDelete
                                                        onDelete={() => performDelete(client.id)}
                                                    />
                                                </div>
                                            </td>
                                            <td aria-hidden="true" />
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
                        {filteredClients.map(client => (
                            <div
                                key={client.id}
                                className="bg-white rounded-[10px] border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col overflow-hidden"
                            >
                                <div className="p-6 flex-1">
                                    <div className="flex items-center mb-4">
                                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                                            <User className="w-6 h-6" />
                                        </div>
                                        <div className="ml-4">
                                            <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                                                {client.name}
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-normal text-gray-500">{client.type === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}</span>
                                                {client.category && (
                                                    <>
                                                        <span className="text-gray-300">·</span>
                                                        <CategoryLabel category={client.category} />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-gray-50">
                                        {client.email && (
                                            <div className="flex items-center text-sm text-gray-600 underline-offset-4 hover:underline cursor-pointer font-medium">
                                                <Mail className="w-4 h-4 mr-2 text-blue-500" />
                                                <span className="truncate">{client.email}</span>
                                            </div>
                                        )}
                                        {client.phone && (
                                            <div className="flex items-center text-sm text-gray-600 font-medium">
                                                <Phone className="w-4 h-4 mr-2 text-gray-400" />
                                                <span>{client.phone}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-xs pt-2">
                                            <span className="text-gray-400 uppercase tracking-widest font-bold">Organização</span>
                                            <span className="text-gray-900 font-semibold">{client.organization_name || '-'}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-400 uppercase tracking-widest font-bold">Documento</span>
                                            <span className="text-gray-900 font-bold bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{client.document || '-'}</span>
                                        </div>

                                        {/* Linked Projects for Grid View */}
                                        {(() => {
                                            const clientProjects = projects.filter(p =>
                                                p.settings?.clientId === client.id &&
                                                isObra(p)
                                            );

                                            if (clientProjects.length > 0) {
                                                return (
                                                    <div className="pt-3 mt-3 border-t border-gray-100">
                                                        <span className="text-xs text-gray-400 uppercase tracking-widest font-bold block mb-2">Obra Vinculada</span>
                                                        <div className="space-y-1">
                                                            {clientProjects.slice(0, 2).map(p => (
                                                                <div key={p.id} className="flex items-center gap-1.5 text-xs text-gray-700 bg-blue-50/50 p-1.5 rounded-md border border-blue-100/50">
                                                                    <Building2 className="w-3 h-3 text-blue-500" />
                                                                    <span className="font-medium truncate">{p.name}</span>
                                                                </div>
                                                            ))}
                                                            {clientProjects.length > 2 && (
                                                                <span className="text-xs text-gray-400 pl-1">
                                                                    + {clientProjects.length - 2} outras obras
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-gray-50/50 rounded-b-[10px] border-t border-gray-100 flex justify-end gap-2">
                                    {onSelectClient && (
                                        <button
                                            onClick={() => handleAccessPortal(client)}
                                            className="p-2 text-indigo-600 hover:text-white hover:bg-indigo-600 rounded-xl transition-all shadow-sm border border-transparent hover:border-indigo-100"
                                            title="Acessar Portal"
                                        >
                                            <LayoutDashboard className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => openTokenModal(client)}
                                        className="p-2 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-xl transition-all shadow-sm border border-transparent hover:border-emerald-100"
                                        title="Link de Acesso ao Portal"
                                    >
                                        <Link2 className="w-4 h-4" />
                                    </button>
                                    {(client.category === 'Locação' || client.category === 'Serviços') && (
                                        <button
                                            onClick={() => setRequestsModal(client)}
                                            className="p-2 text-violet-500 hover:text-white hover:bg-violet-500 rounded-xl transition-all shadow-sm border border-transparent hover:border-violet-100"
                                            title={client.category === 'Serviços' ? 'Ordens de Serviço' : 'Chamados de Manutenção'}
                                        >
                                            {client.category === 'Serviços' ? <ClipboardList className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { setComunicadoModal(client); setComunicadoForm({ title: '', body: '' }); }}
                                        className="p-2 text-orange-400 hover:text-white hover:bg-orange-400 rounded-xl transition-all shadow-sm border border-transparent hover:border-orange-100"
                                        title="Enviar Comunicado"
                                    >
                                        <Bell className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleOpenModal(client)}
                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-blue-100"
                                        title="Editar"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(client.id, client.name)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-red-100"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )
            }
            </div>

            {/* Token Modal */}
            {tokenModal && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setTokenModal(null)}>
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">Link de Acesso</h3>
                                <p className="text-sm text-gray-400 font-medium mt-0.5">{tokenModal.client.name}</p>
                            </div>
                            <button onClick={() => setTokenModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {tokenLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                            </div>
                        ) : tokenModal.token && tokenModal.token.is_active ? (
                            <div className="space-y-4">
                                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                                    <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-2">Link ativo</p>
                                    <p className="text-xs text-gray-700 font-mono break-all leading-relaxed">
                                        {clientPortalService.buildPortalUrl(tokenModal.token.token)}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-2">
                                        Expira em: {new Date(tokenModal.token.expires_at).toLocaleDateString('pt-BR')}
                                        {tokenModal.token.last_used_at && ` · Último acesso: ${new Date(tokenModal.token.last_used_at).toLocaleDateString('pt-BR')}`}
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleCopyLink}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-button font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95"
                                    >
                                        {tokenCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        {tokenCopied ? 'Copiado!' : 'Copiar Link'}
                                    </button>
                                    <Button
                                        onClick={handleGenerateToken}
                                        variant="secondary"
                                        className="rounded-2xl"
                                        title="Gerar novo link (invalida o anterior)"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        onClick={handleRevokeToken}
                                        variant="secondary"
                                        className="rounded-2xl border-red-100 text-red-400 hover:border-red-300 hover:text-red-600"
                                        title="Revogar acesso"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
                                    <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-sm font-bold text-gray-700">Nenhum link ativo</p>
                                    <p className="text-xs text-gray-400 mt-1">Gere um link para que o cliente acesse o portal sem precisar de cadastro.</p>
                                </div>
                                <button
                                    onClick={handleGenerateToken}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-button font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95"
                                >
                                    <Link2 className="w-4 h-4" />
                                    Gerar Link de Acesso
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Comunicado */}
            {comunicadoModal && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setComunicadoModal(null)}>
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 space-y-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Bell className="w-5 h-5 text-orange-400" /> Enviar Comunicado</h3>
                                <p className="text-sm text-gray-400 font-medium mt-0.5">{comunicadoModal.name}</p>
                            </div>
                            <button onClick={() => setComunicadoModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Título *</label>
                                <input
                                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-300"
                                    placeholder="Ex: Informação sobre manutenção"
                                    value={comunicadoForm.title}
                                    onChange={e => setComunicadoForm(p => ({ ...p, title: e.target.value }))}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Mensagem</label>
                                <textarea
                                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                                    rows={4}
                                    placeholder="Detalhes do comunicado..."
                                    value={comunicadoForm.body}
                                    onChange={e => setComunicadoForm(p => ({ ...p, body: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={handleSendComunicado}
                                disabled={comunicadoSending || !comunicadoForm.title.trim()}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-2xl text-button font-black uppercase tracking-widest hover:bg-orange-600 disabled:opacity-50 transition-all active:scale-95"
                            >
                                {comunicadoSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {comunicadoSending ? 'Enviando...' : 'Enviar'}
                            </button>
                            <Button onClick={() => setComunicadoModal(null)} variant="secondary" className="rounded-2xl">Cancelar</Button>
                        </div>
                    </div>
                </div>
            )}

            {requestsModal && (
                <ClientRequestsAdminModal
                    client={requestsModal}
                    organizationId={organizationId || activeOrganizationId || requestsModal.organization_id || ''}
                    onClose={() => setRequestsModal(null)}
                />
            )}

            <ClientModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                initialData={selectedClient}
            />

            <ServicesToast toasts={toasts} onDismiss={dismissToast} />
        </div >
    );
};

export default ClientList;
