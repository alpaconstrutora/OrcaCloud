import React from 'react';
import { clientService } from '../services/clientService';
import { clientPortalService, ClientPortalToken } from '../services/clientPortalService';
import { supabase } from '../lib/supabase';
import { User, Mail, Phone, Trash2, Search, Loader2, Plus, Edit2, LayoutDashboard, Table2, Building2, Link2, Copy, Check, RefreshCw, X, Wrench, ClipboardList, Bell, Send, Settings } from 'lucide-react';
import { Client } from '../types';
import ClientModal from './ClientModal';
import ClientRequestsAdminModal from './ClientRequestsAdminModal';
import { clientMessagesService } from '../services/clientMessagesService';
import { useServicesToast } from './services/useServicestoast';
import ServicesToast from './services/ServicesToast';
import { useStore } from '../store/useStore';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader } from './ui/TableUtils';
import Button from './ui/Button';

interface ClientListProps {
    onClientsChange?: () => void;
    onSelectClient?: (client: Client) => void;
    organizationId?: string;
}

const CLIENT_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Cliente', sortable: true },
    { key: 'category', label: 'Tipo', sortable: true },
    { key: 'organization', label: 'Organização', sortable: true },
    { key: 'contact', label: 'Contato', sortable: false },
    { key: 'document', label: 'Documento', sortable: true },
    { key: 'projects', label: 'Obra Vinculada', sortable: false },
];

const ClientList: React.FC<ClientListProps> = ({ onClientsChange, onSelectClient, organizationId }) => {
    const { activeOrganizationId } = useStore();
    const [clients, setClients] = React.useState<Client[]>([]);
    const [projects, setProjects] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedClient, setSelectedClient] = React.useState<Client | undefined>(undefined);
    const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('list');
    const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
    const { toasts, show: showToast, dismiss: dismissToast } = useServicesToast();
    const tableColumns = useTableColumns(CLIENT_COLUMNS, 'clientListColumns');

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

    const handleDelete = async (id: string, name: string) => {
        if (confirm(`Tem certeza que deseja excluir o cliente "${name}"?`)) {
            try {
                await clientService.deleteClient(id);
                setClients(clients.filter(c => c.id !== id));
                if (onClientsChange) onClientsChange();
                showToast('Cliente excluído com sucesso.', 'success');
            } catch (error) {
                console.error("Erro ao excluir cliente:", error);
                showToast('Erro ao excluir o cliente.', 'error');
            }
        }
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

    const [sortBy, setSortBy] = React.useState<string>('name-asc');
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
        if (!confirm('Revogar acesso deste cliente ao portal?')) return;
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
        return clients
            .filter(c =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.document?.includes(searchTerm)
            )
            .filter(c => categoryFilter === 'all' || c.category === categoryFilter)
            .sort((a, b) => {
                // Ordenação por coluna (quando selecionada)
                if (tableColumns.sortColumn) {
                    switch (tableColumns.sortColumn) {
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
                // Fallback: ordenação padrão
                if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
                if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
                if (sortBy === 'recent') return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
                return 0;
            });
    }, [clients, searchTerm, sortBy, categoryFilter, tableColumns.sortColumn, tableColumns.sortDirection]);

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

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Meus Clientes</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie sua base de contatos e clientes com infraestrutura premium.</p>
                </div>
                <Button
                    onClick={() => handleOpenModal()}
                    variant="primary"
                    size="lg"
                    className="rounded-[1.25rem] gap-3 shadow-xl shadow-blue-900/20"
                >
                    <Plus className="w-4 h-4" />
                    Novo Cliente
                </Button>
            </div>

            <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, e-mail ou documento..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Filtrar:</span>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-[1.25rem] px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    >
                        <option value="all">Todos os Tipos</option>
                        <option value="Vendas">Vendas</option>
                        <option value="Locação">Locação</option>
                        <option value="Serviços">Serviços</option>
                    </select>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Ordenar:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-[1.25rem] px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    >
                        <option value="name-asc">Nome (A-Z)</option>
                        <option value="name-desc">Nome (Z-A)</option>
                        <option value="recent">Mais Recentes</option>
                    </select>
                </div>
                <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm gap-1.5">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Blocos"
                    >
                        <LayoutDashboard className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Linhas"
                    >
                        <Table2 className="w-5 h-5" />
                    </button>
                    {viewMode === 'list' && (
                        <ColumnConfigButton
                            columns={CLIENT_COLUMNS}
                            visibleColumns={tableColumns.visibleColumns}
                            showColumnConfig={tableColumns.showColumnConfig}
                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                            onToggleColumn={tableColumns.toggleColumn}
                            onReset={tableColumns.resetColumns}
                        />
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
            ) : filteredClients.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border border-gray-200 border-dashed">
                    <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900">Nenhum cliente encontrado</h3>
                    <p className="text-gray-500 font-medium">
                        {searchTerm ? 'Tente buscar por outro termo.' : 'Cadastre seu primeiro cliente no botão acima.'}
                    </p>
                </div>
            ) : (
                viewMode === 'list' ? (
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    {tableColumns.visibleColumns.includes('name') && (
                                        <SortableHeader
                                            label="Cliente"
                                            colKey="name"
                                            sortable={true}
                                            sortColumn={tableColumns.sortColumn}
                                            sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-5"
                                        />
                                    )}
                                    {tableColumns.visibleColumns.includes('category') && (
                                        <SortableHeader
                                            label="Tipo"
                                            colKey="category"
                                            sortable={true}
                                            sortColumn={tableColumns.sortColumn}
                                            sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-5"
                                        />
                                    )}
                                    {tableColumns.visibleColumns.includes('organization') && (
                                        <SortableHeader
                                            label="Organização"
                                            colKey="organization"
                                            sortable={true}
                                            sortColumn={tableColumns.sortColumn}
                                            sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-5"
                                        />
                                    )}
                                    {tableColumns.visibleColumns.includes('contact') && (
                                        <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Contato</th>
                                    )}
                                    {tableColumns.visibleColumns.includes('document') && (
                                        <SortableHeader
                                            label="Documento"
                                            colKey="document"
                                            sortable={true}
                                            sortColumn={tableColumns.sortColumn}
                                            sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-5"
                                        />
                                    )}
                                    {tableColumns.visibleColumns.includes('projects') && (
                                        <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Obra Vinculada</th>
                                    )}
                                    <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-[0.2em] text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredClients.map(client => (
                                    <tr key={client.id} className="hover:bg-gray-50 transition-colors group">
                                        {tableColumns.visibleColumns.includes('name') && (
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
                                                        <User className="w-5 h-5" />
                                                    </div>
                                                    <span className="text-sm font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                                                        {client.name}
                                                    </span>
                                                </div>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('category') && (
                                            <td className="px-6 py-4">
                                                <span className={`text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${client.category === 'Vendas' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                    client.category === 'Locação' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                        client.category === 'Serviços' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                            'bg-gray-50 text-gray-400 border-gray-100'
                                                    }`}>
                                                    {client.category || 'Não definido'}
                                                </span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('organization') && (
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-semibold text-gray-700">
                                                    {client.organization_name || '-'}
                                                </span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('contact') && (
                                            <td className="px-6 py-4">
                                                <div className="space-y-1">
                                                    {client.email && (
                                                        <div className="flex items-center text-xs text-gray-600">
                                                            <Mail className="w-3 h-3 mr-1.5 text-blue-500" />
                                                            {client.email}
                                                        </div>
                                                    )}
                                                    {client.phone && (
                                                        <div className="flex items-center text-xs text-gray-600">
                                                            <Phone className="w-3 h-3 mr-1.5" />
                                                            {client.phone}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('document') && (
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-gray-600">{client.document || '-'}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('projects') && (
                                            <td className="px-6 py-4">
                                                {(() => {
                                                    const clientProjects = projects.filter(p =>
                                                        p.settings?.clientId === client.id &&
                                                        p.settings?.classification === 'OBRA'
                                                    );

                                                    if (clientProjects.length === 0) {
                                                        return <span className="text-gray-400 text-sm">-</span>;
                                                    }

                                                    return (
                                                        <div className="flex flex-col gap-1.5">
                                                            {clientProjects.map(p => (
                                                                <div key={p.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                                                                    <Building2 className="w-3.5 h-3.5 text-blue-500" />
                                                                    <span className="font-medium truncate max-w-[200px]" title={p.name}>
                                                                        {p.name}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {onSelectClient && (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const fullClient = await clientService.getById(client.id);
                                                                if (fullClient) onSelectClient(fullClient);
                                                            } catch (error) {
                                                                console.error("Erro ao carregar dados completos do cliente:", error);
                                                                alert("Erro ao carregar os dados do portal deste cliente.");
                                                            }
                                                        }}
                                                        className="p-2 text-indigo-600 hover:text-white hover:bg-indigo-600 rounded-lg transition-colors"
                                                        title="Acessar Portal"
                                                    >
                                                        <LayoutDashboard className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => openTokenModal(client)}
                                                    className="p-2 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition-colors"
                                                    title="Link de Acesso ao Portal"
                                                >
                                                    <Link2 className="w-4 h-4" />
                                                </button>
                                                {(client.category === 'Locação' || client.category === 'Serviços') && (
                                                    <button
                                                        onClick={() => setRequestsModal(client)}
                                                        className="p-2 text-violet-500 hover:text-white hover:bg-violet-500 rounded-lg transition-colors"
                                                        title={client.category === 'Serviços' ? 'Ordens de Serviço' : 'Chamados de Manutenção'}
                                                    >
                                                        {client.category === 'Serviços' ? <ClipboardList className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => { setComunicadoModal(client); setComunicadoForm({ title: '', body: '' }); }}
                                                    className="p-2 text-orange-400 hover:text-white hover:bg-orange-400 rounded-lg transition-colors"
                                                    title="Enviar Comunicado"
                                                >
                                                    <Bell className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleOpenModal(client)}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(client.id, client.name)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredClients.map(client => (
                            <div
                                key={client.id}
                                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group flex flex-col"
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
                                            <div className="flex gap-2">
                                                <span className="text-xs font-black uppercase tracking-widest text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                    {client.type === 'PF' ? 'PF' : 'PJ'}
                                                </span>
                                                {client.category && (
                                                    <span className={`text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${client.category === 'Vendas' ? 'bg-emerald-100 text-emerald-700' :
                                                        client.category === 'Locação' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-amber-100 text-amber-700'
                                                        }`}>
                                                        {client.category}
                                                    </span>
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
                                                p.settings?.classification === 'OBRA'
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

                                <div className="px-6 py-4 bg-gray-50/50 rounded-b-[2rem] border-t border-gray-100 flex justify-end gap-2">
                                    {onSelectClient && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const fullClient = await clientService.getById(client.id);
                                                    if (fullClient) onSelectClient(fullClient);
                                                } catch (error) {
                                                    console.error("Erro ao carregar dados completos do cliente:", error);
                                                    alert("Erro ao carregar os dados do portal deste cliente.");
                                                }
                                            }}
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
