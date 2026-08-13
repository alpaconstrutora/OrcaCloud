import React from 'react';
import { clientService } from '../services/clientService';
import { clientPortalService, ClientPortalToken } from '../services/clientPortalService';
import { clientCategoryService } from '../services/clientCategoryService';
import { empreendimentoService } from '../services/empreendimentoService';
import { supabase } from '../lib/supabase';
import { User, Mail, Phone, Trash2, Search, Loader2, Plus, LayoutDashboard, Table2, Building2, Link2, Copy, Check, RefreshCw, X, Wrench, ClipboardList, Bell, Send, Tag, MoveHorizontal } from 'lucide-react';
import { Client, ClientCategory } from '../types';
import ClientModal from './ClientModal';
import ClientRequestsAdminModal from './ClientRequestsAdminModal';
import { clientMessagesService } from '../services/clientMessagesService';
import { useServicesToast } from './services/useServicestoast';
import ServicesToast from './services/ServicesToast';
import { useStore } from '../store/useStore';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { useConfirm } from './ui/confirm';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import { isObra } from '../utils/projectClassification';

interface ClientListProps {
    onClientsChange?: () => void;
    onSelectClient?: (client: Client) => void;
    organizationId?: string;
    /** Quando true (módulo Portal do Cliente), exibe apenas os clientes cujo
     *  campo "Portais" = 'Portal do Cliente'. Em "Meus Clientes" fica false. */
    portalContext?: boolean;
}

const CLIENT_COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Cliente', sortable: true },
    { key: 'category', label: 'Tipo', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'organization', label: 'Organização', sortable: true },
    { key: 'contact', label: 'Contato', sortable: false },
    { key: 'document', label: 'Documento', sortable: true },
    { key: 'projects', label: 'Empreendimento Vinculado', sortable: false },
    { key: 'portal', label: 'Portal do Cliente', sortable: true },
];

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    code: 118, name: 220, category: 130, status: 110, organization: 180, contact: 200, document: 150, projects: 236, portal: 150, actions: 190,
};

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'contact' e 'projects' não têm valor único pra
// ordenar (§6.3).
const CLIENT_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    code: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    name: { label: 'Cliente', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    category: { label: 'Tipo', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    organization: { label: 'Organização', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    contact: { label: 'Contato', sortable: false, className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    document: { label: 'Documento', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    projects: { label: 'Empreendimento Vinculado', sortable: false, className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    portal: { label: 'Portal do Cliente', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
};

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa a
// busca/categoria já existentes, não os substitui.
// As opções do campo "category" são montadas em runtime a partir das categorias
// cadastradas em Configurações do Sistema > Tipos de Clientes (clientCategoryService) —
// ver buildAdvancedFilterFields abaixo.
const BASE_ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'name', label: 'Cliente', type: 'text' },
    { key: 'email', label: 'E-mail', type: 'text' },
    { key: 'document', label: 'Documento', type: 'text' },
    { key: 'organization', label: 'Organização', type: 'text' },
];

const buildAdvancedFilterFields = (categories: ClientCategory[]): FilterFieldConfig[] => [
    ...BASE_ADVANCED_FILTER_FIELDS,
    { key: 'category', label: 'Tipo', type: 'select', options: categories.map(c => ({ value: c.name, label: c.name })) },
];

// Texto simples colorido — sem pílula/fundo/uppercase (ui_ux_guia_unificado.md §8).
// Cores fixas pros 3 tipos originais (histórico); categoria custom cadastrada em
// Configurações do Sistema > Tipos de Clientes cai no fallback cinza abaixo.
const CATEGORY_COLORS: Record<string, string> = {
    'Vendas': 'text-emerald-700',
    'Locação': 'text-blue-700',
    'Serviços': 'text-amber-700',
};

// Ciclo de cores dos KPI cards por categoria (§4.2) — mesma paleta do KpiCard.
const KPI_COLOR_CYCLE = ['emerald', 'indigo', 'amber', 'purple', 'teal', 'rose', 'cyan', 'orange'] as const;

const CategoryLabel: React.FC<{ category?: string }> = ({ category }) => (
    <span className={`text-sm font-normal ${category ? (CATEGORY_COLORS[category] || 'text-gray-600') : 'text-gray-400'}`}>
        {category || 'Não definido'}
    </span>
);

// Switch de tabela (padrão existente em PriceTableManager.tsx) — reaproveitado
// aqui para as duas colunas booleanas de Clientes (Status, Portal do Cliente),
// em vez de inventar um estilo novo.
const TableSwitch: React.FC<{ checked: boolean; onChange: () => void; onLabel: string; offLabel: string; onColor?: string }> = ({ checked, onChange, onLabel, offLabel, onColor = 'peer-checked:bg-blue-600' }) => (
    <label className="inline-flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} />
        <div className={`w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all relative ${onColor}`}></div>
        <span className={`text-sm font-normal ${checked ? 'text-gray-700' : 'text-gray-400'}`}>{checked ? onLabel : offLabel}</span>
    </label>
);

// Conteúdo de cada célula (TD) por coluna — extraído para função pura para que o corpo da tabela
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderClientCell(
    key: string,
    client: Client,
    clientEmpreendimentos: { id: string; name: string }[],
    onToggleStatus: (client: Client) => void,
    onTogglePortal: (client: Client) => void,
): React.ReactNode {
    switch (key) {
        case 'code':
            return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{client.code || '-'}</span>;
        case 'name':
            return (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                        <User className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-normal text-gray-700">{client.name}</span>
                </div>
            );
        case 'category':
            return <CategoryLabel category={client.category} />;
        case 'status':
            return (
                <TableSwitch
                    checked={client.status !== 'Inativo'}
                    onChange={() => onToggleStatus(client)}
                    onLabel="Ativo"
                    offLabel="Inativo"
                    onColor="peer-checked:bg-emerald-600"
                />
            );
        case 'organization':
            return <span className="text-sm font-normal text-gray-700">{client.organization_name || '-'}</span>;
        case 'contact':
            return (
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
            );
        case 'document':
            return <span className="text-sm font-normal text-gray-600">{client.document || '-'}</span>;
        case 'projects':
            return clientEmpreendimentos.length === 0 ? (
                <span className="text-sm font-normal text-gray-400">-</span>
            ) : (
                <div className="flex flex-col gap-1">
                    {clientEmpreendimentos.map(e => (
                        <div key={e.id} className="flex items-center gap-1.5 text-sm font-normal text-blue-600">
                            <Building2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]" title={e.name}>{e.name}</span>
                        </div>
                    ))}
                </div>
            );
        case 'portal':
            return (
                <TableSwitch
                    checked={client.portal === 'Portal do Cliente'}
                    onChange={() => onTogglePortal(client)}
                    onLabel="Ativo"
                    offLabel="Inativo"
                />
            );
        default:
            return null;
    }
}

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

const ClientList: React.FC<ClientListProps> = ({ onClientsChange, onSelectClient, organizationId, portalContext }) => {
    const { activeOrganizationId, organizations } = useStore();
    const [clients, setClients] = React.useState<Client[]>([]);
    const [projects, setProjects] = React.useState<any[]>([]);
    // Obra (projects.id) → empreendimento a que ela pertence. A coluna da tabela
    // fala em "Empreendimento Vinculado" (não "Obra"), então o vínculo por
    // settings.clientId (que mora na obra) precisa ser resolvido até o
    // empreendimento-pai antes de exibir (Empreendimento → Obra na hierarquia
    // de domínio; empreendimentoService.mapObrasToEmpreendimentos já resolve
    // pelos dois sentidos do módulo: obra principal e obra por torre).
    const [obraToEmpreendimento, setObraToEmpreendimento] = React.useState<Record<string, { id: string; name: string; towerName?: string }>>({});
    const [categories, setCategories] = React.useState<ClientCategory[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('clientListFilters:search', '');
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedClient, setSelectedClient] = React.useState<Client | undefined>(undefined);
    const [viewMode, setViewMode] = usePersistedState<'list' | 'grid'>('clientListFilters:viewMode', 'list');
    const [categoryFilter, setCategoryFilter] = usePersistedState<string>('clientListFilters:category', 'all');
    const { toasts, show: showToast, dismiss: dismissToast } = useServicesToast();
    const tableColumns = useTableColumns(CLIENT_COLUMNS, 'clientListColumns');
    // Opções de "Tipo" vêm de Configurações do Sistema > Tipos de Clientes (mesma
    // fonte usada pelo ClientModal), não de uma lista fixa — categoria custom
    // criada lá (ex: "Condomínio") precisa aparecer aqui igual.
    const advancedFilterFields = React.useMemo(() => buildAdvancedFilterFields(categories), [categories]);
    const advancedFilters = useAdvancedFilters(advancedFilterFields, 'clientListFilters:advanced');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'clientListColWidths');
    // table-layout:fixed + largura 100% faz o navegador redistribuir o espaço
    // sobrando entre as colunas de <col> fixo (arrastar uma borda "puxava" as
    // vizinhas). Fixar a largura total na soma exata das colunas elimina esse
    // espaço sobrando — mesma correção aplicada em SupplierList.tsx.
    const tableTotalWidth = (['code', 'name', 'category', 'status', 'organization', 'contact', 'document', 'projects', 'portal'] as const)
        .reduce((sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0)
        + cols.getWidth('actions');
    const confirm = useConfirm();

    React.useEffect(() => {
        loadData();
    }, [organizationId]);

    React.useEffect(() => {
        clientCategoryService.list(organizationId || activeOrganizationId || undefined)
            .then(setCategories)
            .catch(console.error);
    }, [organizationId, activeOrganizationId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [clientsData, { data: projectsData }, obraEmpMap] = await Promise.all([
                clientService.listClients(organizationId),
                supabase.from('projects').select('id, name, settings').eq('settings->>classification', 'OBRA'),
                // Resolver Empreendimento é só um dado a mais na coluna — se a
                // consulta falhar, a listagem de clientes não pode cair junto.
                empreendimentoService.mapObrasToEmpreendimentos(organizationId).catch(err => {
                    console.error('Erro ao mapear obras para empreendimentos:', err);
                    return {};
                })
            ]);
            setClients(clientsData);
            setProjects(projectsData ?? []);
            setObraToEmpreendimento(obraEmpMap);
        } catch (error) {
            console.error("Erro ao listar dados:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadClients = loadData; // Alias for compatibility with existing calls

    // Excluir direto (sem diálogo) — usado pelo InlineDisclosureMenu, que já tem
    // confirmação de 2 passos embutida (ui_ux_guia_unificado.md §9).
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

    // Switch inline de Status/Portal (colunas da tabela) — atualiza direto sem
    // abrir o modal; array local atualizado em vez de recarregar a tabela (§22).
    const handleToggleStatus = async (client: Client) => {
        const nextStatus: Client['status'] = client.status === 'Inativo' ? 'Ativo' : 'Inativo';
        try {
            await clientService.saveClient({ id: client.id, status: nextStatus });
            setClients(prev => prev.map(c => c.id === client.id ? { ...c, status: nextStatus } : c));
        } catch (error) {
            console.error('Erro ao atualizar status do cliente:', error);
            showToast('Erro ao atualizar o status.', 'error');
        }
    };

    const handleTogglePortal = async (client: Client) => {
        const nextPortal: Client['portal'] = client.portal === 'Portal do Cliente' ? 'Nenhum' : 'Portal do Cliente';
        try {
            await clientService.saveClient({ id: client.id, portal: nextPortal });
            setClients(prev => prev.map(c => c.id === client.id ? { ...c, portal: nextPortal } : c));
        } catch (error) {
            console.error('Erro ao atualizar portal do cliente:', error);
            showToast('Erro ao atualizar o portal.', 'error');
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
        // Deriva a org: prop > seletor ativo > org do próprio cliente > única org do usuário.
        // Cliente global (organization_id null) + seletor em "Todas as organizações" não tem org
        // para derivar; nesse caso, se o usuário só pertence a uma org, usamos ela.
        const singleOrgId = organizations.length === 1 ? organizations[0].id : null;
        const orgId = organizationId || activeOrganizationId || tokenModal?.client.organization_id || singleOrgId;
        if (!tokenModal) return;
        if (!orgId) {
            console.error('[ClientPortal] organizationId ausente', { organizationId, activeOrganizationId, clientOrgId: tokenModal?.client.organization_id, orgCount: organizations.length });
            showToast('Selecione uma organização específica no seletor do topo para gerar o link de acesso.', 'error');
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
            // Módulo Portal do Cliente: só clientes marcados com Portais = 'Portal do Cliente'.
            .filter(c => !portalContext || c.portal === 'Portal do Cliente')
            .filter(c =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.document?.includes(searchTerm)
            )
            .filter(c => categoryFilter === 'all' || c.category === categoryFilter);

        result = applyFilterRules(result, advancedFilters.rules, advancedFilterFields, getAdvancedFilterValue);

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
                        case 'status':
                            return tableColumns.sortDirection === 'asc'
                                ? (a.status || 'Ativo').localeCompare(b.status || 'Ativo')
                                : (b.status || 'Ativo').localeCompare(a.status || 'Ativo');
                        case 'portal':
                            return tableColumns.sortDirection === 'asc'
                                ? (a.portal || 'Nenhum').localeCompare(b.portal || 'Nenhum')
                                : (b.portal || 'Nenhum').localeCompare(a.portal || 'Nenhum');
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
                // Sem coluna clicada, ordenação default é nome A-Z (ui_ux_guia_unificado.md §6.4:
                // toda coluna ordenável já ordena pelo próprio cabeçalho, sem dropdown redundante).
                return a.name.localeCompare(b.name);
            });
    }, [clients, portalContext, searchTerm, categoryFilter, advancedFilters.rules, advancedFilterFields, tableColumns.sortColumn, tableColumns.sortDirection]);

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


    // Decomposição por categoria (§4.2): as categorias vêm de Configurações do
    // Sistema > Tipos de Clientes — não são mais fixas em Vendas/Locação/Serviços,
    // uma categoria custom (ex: "Condomínio") ganha card igual às demais.
    const categoryKpis = React.useMemo(
        () => categories.map(cat => ({ id: cat.id, name: cat.name, count: clients.filter(c => c.category === cat.name).length })),
        [categories, clients]
    );
    const totalClients = clients.length;

    const getClientProjects = React.useCallback(
        (clientId: string) => projects.filter(p => p.settings?.clientId === clientId && isObra(p)),
        [projects]
    );

    // Empreendimento(s) vinculado(s) ao cliente: resolve cada obra vinculada (via
    // settings.clientId) até o empreendimento-pai e deduplica — duas obras/torres
    // do mesmo empreendimento não podem aparecer como dois vínculos distintos.
    const getClientEmpreendimentos = React.useCallback(
        (clientId: string) => {
            const seen = new Set<string>();
            const result: { id: string; name: string }[] = [];
            for (const p of getClientProjects(clientId)) {
                const emp = obraToEmpreendimento[p.id];
                if (emp && !seen.has(emp.id)) {
                    seen.add(emp.id);
                    result.push({ id: emp.id, name: emp.name });
                }
            }
            return result;
        },
        [getClientProjects, obraToEmpreendimento]
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

            {/* grid-cols fixo (lg:grid-cols-5) assumia sempre 3 categorias (2 do Total + 3 = 5
                unidades); com N categorias custom (§4.2) a soma de unidades (2 + N) passa de 5
                e quebra para 2 linhas — corrigido com nº de colunas calculado via CSS var, que o
                Tailwind aceita como valor arbitrário estático (`grid-cols-[repeat(var(--kpi-cols),...)]`). */}
            <div
                className="grid grid-cols-2 lg:grid-cols-[repeat(var(--kpi-cols),minmax(0,1fr))] gap-4 mb-3"
                style={{ ['--kpi-cols' as any]: 2 + categoryKpis.length }}
            >
                {/* "Total" em destaque (2 colunas); os demais são a decomposição por categoria (§4.2) */}
                <KpiCard shadow={false} size="lg" className="col-span-2" label="Total de Clientes" value={totalClients} icon={<User className="w-4 h-4" />} color="blue" />
                {categoryKpis.map((kpi, idx) => (
                    <KpiCard
                        key={kpi.id}
                        shadow={false}
                        size="sm"
                        label={kpi.name}
                        value={kpi.count}
                        icon={<Tag className="w-4 h-4" />}
                        color={KPI_COLOR_CYCLE[idx % KPI_COLOR_CYCLE.length]}
                    />
                ))}
            </div>

            {/* Sem toolbar de botões (§5.3): Clientes não tem controle de escopo, então
                vai direto de KPIs para a toolbar de busca — a ação primária ("Novo cliente")
                mora dentro dela, ao lado do toggle grid/lista (mesmo padrão de InvestorList.tsx). */}

            {/* Toolbar §5.2 (variante acoplada à tabela, escala compacta §16) — toolbar e
                conteúdo dividem um único card; a única linha visível entre os dois é o
                border-b abaixo, sem duas bordas concêntricas. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-white space-y-3">
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
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                </select>

                {/* Dropdown "Ordenar" removido: toda coluna ordenável já ordena pelo próprio cabeçalho (ui_ux_guia_unificado.md §6.4) */}
                <div className="flex items-center h-9">
                    <AdvancedFilterPanel fields={advancedFilterFields} state={advancedFilters} />
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
                            {/* Autofit sob comando explícito — nunca automático: recalcular a cada
                                filtro/busca faria as colunas dançarem enquanto o usuário digita.
                                Duplo clique no divisor segue sendo "restaurar padrão" (não mudamos
                                o gesto que já existia). */}
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
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

                {/* Ação primária (§17, variante compacta) — sem toolbar de botões própria (§5.3),
                    fica na régua junto do toggle grid/lista, igual InvestorList.tsx. */}
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
                                {tableColumns.orderedVisibleColumns.map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* coluna "espaçadora" sem largura fixa — absorve o espaço sobrando quando
                                    a tabela é mais estreita que o container (ver §6.1 do guia de UI).
                                    Fica ANTES de "Ações" de propósito: com ela depois, todo o espaço
                                    sobrando ia para a direita de "Ações", que então "andava" a cada
                                    redimensionamento e desalinhava da toolbar acoplada acima. Antes de
                                    "Ações", o espaço é absorvido no meio e "Ações" fica sempre colada
                                    na borda direita do card. */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            {/* thead em sentence case (§6.2) — uppercase={false} porque SortableHeader força
                                uppercase internamente por padrão; classes de estilo movidas pro <tr>, igual ao
                                snippet oficial do guia. Ordem vem de orderedVisibleColumns — arrastar um header
                                (onMoveColumn) reordena e persiste, estilo ClickUp. */}
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.map(key => {
                                        const def = CLIENT_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    {/* espaçador — casa com o <col /> sem largura do colgroup, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                        Ações
                                        <cols.ResizeHandle colKey="actions" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredClients.map(client => {
                                    const clientEmpreendimentos = getClientEmpreendimentos(client.id);
                                    return (
                                        <tr key={client.id} className="hover:bg-blue-50/50 transition-colors group">
                                            {tableColumns.orderedVisibleColumns.map(key => (
                                                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {renderClientCell(key, client, clientEmpreendimentos, handleToggleStatus, handleTogglePortal)}
                                                </td>
                                            ))}
                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    <ActionIconButton kind="edit" onClick={() => handleOpenModal(client)} />
                                                    {onSelectClient && (
                                                        <ActionIconButton
                                                            kind="view"
                                                            title="Acessar Portal"
                                                            icon={<LayoutDashboard className="w-4 h-4" />}
                                                            onClick={() => handleAccessPortal(client)}
                                                        />
                                                    )}
                                                    <ActionIconButton
                                                        kind="share"
                                                        title="Link de Acesso"
                                                        icon={<Link2 className="w-4 h-4" />}
                                                        onClick={() => openTokenModal(client)}
                                                    />
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
                                            <span className="text-xs font-semibold text-slate-500">Organização</span>
                                            <span className="text-gray-900 font-medium">{client.organization_name || '-'}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-xs font-semibold text-slate-500">Documento</span>
                                            <span className="text-gray-900 font-medium">{client.document || '-'}</span>
                                        </div>

                                        {/* Empreendimento(s) vinculado(s) — Grid View */}
                                        {(() => {
                                            const clientEmpreendimentos = getClientEmpreendimentos(client.id);

                                            if (clientEmpreendimentos.length > 0) {
                                                return (
                                                    <div className="pt-3 mt-3 border-t border-gray-100">
                                                        <span className="text-xs font-semibold text-slate-500 block mb-2">Empreendimento Vinculado</span>
                                                        <div className="space-y-1">
                                                            {clientEmpreendimentos.slice(0, 2).map(e => (
                                                                <div key={e.id} className="flex items-center gap-1.5 text-xs text-gray-700 bg-blue-50/50 p-1.5 rounded-[6px] border border-blue-100/50">
                                                                    <Building2 className="w-3 h-3 text-blue-500" />
                                                                    <span className="font-medium truncate">{e.name}</span>
                                                                </div>
                                                            ))}
                                                            {clientEmpreendimentos.length > 2 && (
                                                                <span className="text-xs text-gray-400 pl-1">
                                                                    + {clientEmpreendimentos.length - 2} outros empreendimentos
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

                                <div className="px-6 py-4 bg-gray-50/50 rounded-b-[10px] border-t border-gray-100 flex justify-end gap-1.5">
                                    {onSelectClient && (
                                        <ActionIconButton
                                            kind="view"
                                            title="Acessar Portal"
                                            icon={<LayoutDashboard className="w-4 h-4" />}
                                            onClick={() => handleAccessPortal(client)}
                                        />
                                    )}
                                    <ActionIconButton
                                        kind="share"
                                        title="Link de Acesso ao Portal"
                                        icon={<Link2 className="w-4 h-4" />}
                                        onClick={() => openTokenModal(client)}
                                    />
                                    {(client.category === 'Locação' || client.category === 'Serviços') && (
                                        <ActionIconButton
                                            kind="view"
                                            title={client.category === 'Serviços' ? 'Ordens de Serviço' : 'Chamados de Manutenção'}
                                            icon={client.category === 'Serviços' ? <ClipboardList className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                                            onClick={() => setRequestsModal(client)}
                                        />
                                    )}
                                    <ActionIconButton
                                        kind="share"
                                        title="Enviar Comunicado"
                                        icon={<Bell className="w-4 h-4" />}
                                        onClick={() => { setComunicadoModal(client); setComunicadoForm({ title: '', body: '' }); }}
                                    />
                                    <ActionIconButton kind="edit" onClick={() => handleOpenModal(client)} />
                                    <ActionIconButton kind="delete" onClick={() => handleDelete(client.id, client.name)} />
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
                    <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md p-8 space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Link de Acesso</h3>
                                <p className="text-sm text-gray-400 font-medium mt-0.5">{tokenModal.client.name}</p>
                            </div>
                            <button onClick={() => setTokenModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-[6px] hover:bg-gray-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {tokenLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                            </div>
                        ) : tokenModal.token && tokenModal.token.is_active ? (
                            <div className="space-y-4">
                                <div className="bg-emerald-50 border border-emerald-100 rounded-[10px] p-4">
                                    <p className="text-xs font-semibold text-emerald-600 mb-2">Link ativo</p>
                                    <p className="text-xs text-gray-700 break-all leading-relaxed">
                                        {clientPortalService.buildPortalUrl(tokenModal.token.token)}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-2">
                                        Expira em: {new Date(tokenModal.token.expires_at).toLocaleDateString('pt-BR')}
                                        {tokenModal.token.last_used_at && ` · Último acesso: ${new Date(tokenModal.token.last_used_at).toLocaleDateString('pt-BR')}`}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleCopyLink}
                                        className="flex-1 flex items-center justify-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium text-[13px] transition-all active:scale-95"
                                    >
                                        {tokenCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        {tokenCopied ? 'Copiado!' : 'Copiar Link'}
                                    </button>
                                    <ActionIconButton
                                        kind="history"
                                        title="Gerar novo link (invalida o anterior)"
                                        icon={<RefreshCw className="w-4 h-4" />}
                                        onClick={handleGenerateToken}
                                    />
                                    <ActionIconButton kind="delete" title="Revogar acesso" onClick={handleRevokeToken} />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-gray-50 border border-gray-100 rounded-[10px] p-6 text-center">
                                    <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-sm font-bold text-gray-700">Nenhum link ativo</p>
                                    <p className="text-xs text-gray-400 mt-1">Gere um link para que o cliente acesse o portal sem precisar de cadastro.</p>
                                </div>
                                <button
                                    onClick={handleGenerateToken}
                                    className="w-full flex items-center justify-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium text-[13px] transition-all active:scale-95"
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
                    <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md p-8 space-y-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2"><Bell className="w-5 h-5 text-orange-400" /> Enviar Comunicado</h3>
                                <p className="text-sm text-gray-400 font-medium mt-0.5">{comunicadoModal.name}</p>
                            </div>
                            <button onClick={() => setComunicadoModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-[6px] hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Título *</label>
                                <input
                                    className="w-full rounded-[6px] border border-gray-200 px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-300"
                                    placeholder="Ex: Informação sobre manutenção"
                                    value={comunicadoForm.title}
                                    onChange={e => setComunicadoForm(p => ({ ...p, title: e.target.value }))}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Mensagem</label>
                                <textarea
                                    className="w-full rounded-[6px] border border-gray-200 px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                                    rows={4}
                                    placeholder="Detalhes do comunicado..."
                                    value={comunicadoForm.body}
                                    onChange={e => setComunicadoForm(p => ({ ...p, body: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={handleSendComunicado}
                                disabled={comunicadoSending || !comunicadoForm.title.trim()}
                                className="flex-1 flex items-center justify-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white rounded-[6px] hover:bg-orange-600 font-medium text-[13px] disabled:opacity-50 transition-all active:scale-95"
                            >
                                {comunicadoSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {comunicadoSending ? 'Enviando...' : 'Enviar'}
                            </button>
                            {/* botão local em vez de <Button>: a classe BASE do Button.tsx compartilhado
                                traz `font-black uppercase tracking-widest`, fora do §17 */}
                            <button
                                onClick={() => setComunicadoModal(null)}
                                className="flex items-center justify-center h-9 px-3.5 bg-white text-gray-600 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95"
                            >
                                Cancelar
                            </button>
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
