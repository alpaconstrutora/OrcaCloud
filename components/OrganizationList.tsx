import React, { useState } from 'react';
import {
    Building2, Mail, Plus, Search,
    Trash2, Edit2, LayoutDashboard, Table2,
    Activity, Users, UserPlus,
    TrendingUp, HandCoins, Filter, Truck, Settings, Send, MoveHorizontal, Library
} from 'lucide-react';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import Button from './ui/Button';

// Coluna 'actions' fica fora do array de propósito — sempre visível, não
// aparece no ColumnConfigButton (mesmo padrão de ClientList/InvestorList/SupplierList).
const ALL_USERS_FALLBACK_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Usuário', sortable: true },
    { key: 'email', label: 'E-mail', sortable: true },
    { key: 'organization', label: 'Organização', sortable: true },
    { key: 'role', label: 'Função', sortable: true },
];

// Larguras default do redimensionamento (§6.1 do guia) da tabela fallback —
// já próximas do container real, para não nascer truncando nem com faixa
// vazia grande antes do usuário mexer (mesmo raciocínio de SupplierList.tsx).
const ALL_USERS_COL_WIDTHS: Record<string, number> = {
    name: 260, email: 300, organization: 240, role: 160, actions: 240,
};

const ORG_LIST_COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Organização', sortable: true },
    { key: 'contact', label: 'Contato', sortable: true },
    { key: 'cnpj', label: 'CNPJ', sortable: true },
];

// Metadados de header por coluna — usados para renderizar o <thead> da tabela de
// organizações a partir de `tableColumns.orderedVisibleColumns` (ordem que o
// usuário arrasta), em vez de uma sequência fixa de JSX.
const ORG_LIST_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    code: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap' },
    name: { label: 'Organização', className: 'px-6 py-2 border-r border-gray-100' },
    contact: { label: 'Contato', className: 'px-6 py-2 border-r border-gray-100' },
    cnpj: { label: 'CNPJ', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap' },
};

// Metadados de header por coluna da tabela fallback "Todos os Usuários".
const ALL_USERS_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    name: { label: 'Usuário', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    email: { label: 'E-mail', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    organization: { label: 'Organização', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    role: { label: 'Função', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa a
// busca já existente, não a substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'name', label: 'Organização', type: 'text' },
    { key: 'email', label: 'E-mail', type: 'text' },
    { key: 'cnpj', label: 'CNPJ', type: 'text' },
    { key: 'website', label: 'Website', type: 'text' },
];

function getAdvancedFilterValue(org: Organization, key: string): unknown {
    switch (key) {
        case 'name': return org.name ?? '';
        case 'email': return org.email ?? '';
        case 'cnpj': return org.cnpj ?? '';
        case 'website': return org.website ?? '';
        default: return null;
    }
}

// Conteúdo de cada <td> por coluna da tabela de organizações — extraído para
// função pura para que o <tbody> possa mapear `tableColumns.orderedVisibleColumns`
// (ordem arrastável). `org === null` representa a linha fixa "Todas as
// organizações" (não é um registro real, mas segue a mesma ordem de colunas).
function renderOrgListCell(key: string, org: Organization | null, ctx: { isActive: boolean }): React.ReactNode {
    if (org === null) {
        switch (key) {
            case 'code':
                return <span className="text-sm font-normal text-gray-400 whitespace-nowrap">-</span>;
            case 'name':
                return (
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${ctx.isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                            <Activity className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-sm font-normal text-gray-900 flex items-center gap-2">
                                Todas as organizações
                                {ctx.isActive && <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />}
                            </p>
                            <p className="text-xs font-medium text-gray-400">Visão consolidada do grupo</p>
                        </div>
                    </div>
                );
            case 'contact':
                return <span className="text-sm font-normal text-gray-400">Global</span>;
            case 'cnpj':
                return <span className="text-sm font-normal text-gray-400">-</span>;
            default:
                return null;
        }
    }
    switch (key) {
        case 'code':
            return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{org.code || '-'}</span>;
        case 'name':
            return (
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${ctx.isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        <Building2 className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-normal text-gray-900 flex items-center gap-2">
                        {org.name}
                        {ctx.isActive && <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />}
                    </span>
                </div>
            );
        case 'contact':
            return (
                <div className="flex items-center text-sm font-normal text-gray-600">
                    <Mail className="w-3.5 h-3.5 mr-1.5 text-gray-400 shrink-0" />
                    {org.email || '-'}
                </div>
            );
        case 'cnpj':
            return <span className="text-sm font-normal text-gray-600">{org.cnpj || '-'}</span>;
        default:
            return null;
    }
}

// Conteúdo de cada <td> por coluna da tabela fallback "Todos os Usuários".
function renderAllUsersCell(key: string, item: { org: Organization; member: OrganizationMember }): React.ReactNode {
    const { org, member } = item;
    switch (key) {
        case 'name':
            return <span className="text-sm font-normal text-gray-700 truncate">{member.name}</span>;
        case 'email':
            return <span className="text-sm font-normal text-gray-600 truncate">{member.email}</span>;
        case 'organization':
            return <span className="text-sm font-normal text-blue-600 truncate">{org.name}</span>;
        case 'role':
            return <span className="text-sm font-normal text-gray-600">{member.role}</span>;
        default:
            return null;
    }
}
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { Organization, OrganizationMember, BudgetEntry } from '../types';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { organizationService } from '../services/organizationService';
import { useConfirm } from './ui/confirm';
import OrganizationUsers from './OrganizationUsers';
import OrganizationPage from './OrganizationPage';
import ClientList from './ClientList';
import InvestorList from './InvestorList';
import { SupplierList } from './SupplierList';
import FinancialRegistryManager from './FinancialRegistryManager';
import CompaniesModule from './CompaniesModule';
import CostCenterModule from './CostCenterModule';
import PlanoDeContasModule from './PlanoDeContasModule';
import { financialRegistryService } from '../services/financialRegistryService';
import { PaymentAccount, ChartOfAccount } from '../types';

interface OrganizationListProps {
    organizations: Organization[];
    onCreate: () => void;
    onEdit: (org: Organization) => void;
    onSave?: (org: Organization) => void;
    onDelete: (id: string) => void;
    onSelect: (org: Organization) => void;
    
    // Management Props
    activeTab: 'organizations' | 'empresas_grupo' | 'projects' | 'clients' | 'investors' | 'suppliers' | 'users' | 'accounts' | 'cost_centers' | 'chart_of_accounts' | 'plano_contas' | 'settings';
    onTabChange: (tab: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projects: { id: string; name: string; organizationId?: string; organization_id?: string; settings?: any }[];
    onClientsChange: () => void;
    onLoadProject: (id: string, targetView?: string) => void;
    onEditProject: (id: string) => void;
    onNewProject: (classification?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO') => void;
    onDuplicateProject: (id: string) => void;
    onImportProject: (data: { name: string; budget: BudgetEntry[]; settings?: Record<string, unknown> }) => void;
    onExportProject: (id: string) => void;
}

// Abas cujo conteúdo é escopado por UMA organização (via activeOrganizationId
// ou managingOrgId). Fora delas, o managingOrgId é descartado em contexto global.
const ORG_SCOPED_TABS = ['users', 'settings'];

const OrganizationList: React.FC<OrganizationListProps> = ({
    organizations,
    onCreate,
    onEdit,
    onSave,
    onDelete,
    onSelect,
    activeTab,
    onTabChange,
    projects,
    onClientsChange,
    onLoadProject,
    onEditProject,
    onNewProject,
    onDuplicateProject,
    onImportProject,
    onExportProject
}) => {
    const confirm = useConfirm();
    const [incluindoCatalogos, setIncluindoCatalogos] = useState<string | null>(null);

    /**
     * Organização nova NÃO herda os catálogos do grupo (bases de itens e
     * rubricas de folha) — e isso é de propósito: um gatilho em `organizations`
     * não distingue "mais uma empresa do grupo" de "outro cliente do SaaS", já
     * que as duas são um INSERT na mesma tabela (achado C1-06). Por isso a
     * inclusão é um ato deliberado, e este é o botão que o realiza.
     *
     * A autorização mora na RPC, não aqui: exige ser gestor da organização de
     * destino E já enxergar o catálogo que se está estendendo.
     */
    const handleIncluirNosCatalogos = async (org: Organization) => {
        const ok = await confirm({
            title: 'Incluir nos catálogos do grupo',
            message: `Os catálogos do grupo — bases de itens, rubricas de folha e os cadastros marcados como compartilhados — passam a pertencer também a "${org.name}". Só entra o que você já tem acesso.`,
            confirmLabel: 'Incluir',
        });
        if (!ok) return;

        setIncluindoCatalogos(org.id);
        try {
            const r = await organizationService.incluirNosCatalogos(org.id);
            alert(r.total === 0
                ? `"${org.name}" já pertencia a tudo a que você tem acesso.`
                : `Incluído em "${org.name}": ${r.bases} base(s) de dados, ${r.rubricas} rubrica(s), ` +
                  `${r.clientes} cliente(s) e ${r.fornecedores} fornecedor(es) compartilhados.`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            alert(msg.includes('not_allowed')
                ? 'Só owner ou admin da organização de destino pode fazer isso.'
                : `Erro ao incluir nos catálogos: ${msg}`);
        } finally {
            setIncluindoCatalogos(null);
        }
    };

    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('organizationListFilters:search', '');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('organizationListFilters:viewMode', 'list');
    const [managingOrgId, setManagingOrgId] = useState<string | null>(null);
    const tableColumns = useTableColumns(ORG_LIST_COLUMNS, 'organizationListColumns');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'organizationListFilters:advanced');
    const { activeOrganizationId, setActiveOrganizationId } = useStore();

    // Cadastros financeiros (Contas de Pagamento, Centros de Custo) são
    // POR-ORGANIZAÇÃO — não podem ser mesclados entre orgs. Em "Todas as
    // organizações" (activeOrganizationId null) buscar sem filtro trazia a
    // árvore de TODAS as orgs de uma vez; como toda org tem o mesmo plano
    // padrão (1.1.1 PIS, 1.1.2 COFINS...), o resultado parecia duplicado.
    // Aqui escolhemos UMA org por vez: a ativa no seletor global do topo, se
    // houver; senão a org sendo gerenciada; senão a primeira da lista. Nunca
    // merge. Não há mais seletor próprio na toolbar — o do topo é o único.
    const registryOrgId = activeOrganizationId || managingOrgId || (organizations || [])[0]?.id || null;

    const handleResendInviteFromList = async (orgId: string, email: string, name: string, role: string) => {
        const { data, error } = await supabase.functions.invoke('invite-member', {
            body: { email, name, organizationId: orgId, role },
        });
        if (error) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ctx = (error as any).context;
            let msg = error.message;
            try {
                const body = ctx ? await ctx.json() : null;
                if (body?.error) msg = body.error;
            } catch { /* ignore */ }
            alert(`Não foi possível reenviar o convite: ${msg}`);
        } else if (data?.error) {
            alert(`Não foi possível reenviar o convite: ${data.error}`);
        } else {
            alert(`Convite reenviado para ${email}`);
        }
    };

    // Financial Registries State
    // Centro de Custo tem tabela e tela própria agora (CostCenterModule +
    // costCenterService, cost_centers_v2) — não passa mais por aqui.
    const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
    const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
    // Plano de Contas tem módulo próprio (PlanoDeContasModule, tabela
    // `plano_de_contas`) — carrega os próprios dados, não passa por aqui.

    const loadRegistries = React.useCallback(async () => {
        // chart_of_accounts (financial_categories) é global — ignora org de propósito.
        const targetOrgId = registryOrgId;
        try {
            const [accs, charts] = await Promise.all([
                financialRegistryService.listPaymentAccounts(targetOrgId || undefined),
                financialRegistryService.listChartOfAccounts(targetOrgId || undefined)
            ]);
            setPaymentAccounts(accs);
            setChartOfAccounts(charts);
        } catch (error) {
            console.error('Error loading registries:', error);
        }
    }, [registryOrgId]);

    React.useEffect(() => {
        // Load registries when tab changes to a financial one OR when org changes
        if (['accounts', 'chart_of_accounts'].includes(activeTab)) {
            loadRegistries();
        }
    }, [activeTab, loadRegistries]);

    // Reset managingOrgId whenever the user navigates away das abas que dependem
    // dele, estando em contexto global (nenhuma org ativa). Isso faz a visão
    // consolidada reaparecer ao voltar para a aba de usuários.
    //
    // ⚠️ 'settings' PRECISA estar nesta lista: o botão "Detalhes" da lista de
    // organizações faz setManagingOrgId(org.id) + onTabChange('settings'). Com
    // "Todas as organizações" selecionado, este effect zerava o managingOrgId no
    // render seguinte, currentOrg virava undefined e a aba renderizava NADA —
    // tela branca (CLAUDE.md, REGRA OBRIGATÓRIA #5).
    React.useEffect(() => {
        if (!ORG_SCOPED_TABS.includes(activeTab) && !activeOrganizationId) {
            setManagingOrgId(null);
        }
    }, [activeTab, activeOrganizationId]);

    const managingOrg = organizations.find(o => o.id === managingOrgId);
    const activeOrg = organizations.find(o => o.id === activeOrganizationId);
    const currentOrg = managingOrg || activeOrg;

    const filteredOrganizations = React.useMemo(() => {
        const orgs = organizations || [];
        let result = orgs
            .filter(org =>
                org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                org.cnpj?.includes(searchTerm) ||
                org.website?.toLowerCase().includes(searchTerm.toLowerCase())
            );

        result = applyFilterRules(result, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);

        return result.sort((a, b) => {
                if (tableColumns.sortColumn) {
                    const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                    switch (tableColumns.sortColumn) {
                        case 'code': return dir * ((a.code || '').localeCompare(b.code || '', 'pt-BR', { numeric: true }));
                        case 'name': return dir * a.name.localeCompare(b.name);
                        case 'contact': return dir * ((a.email || '').localeCompare(b.email || ''));
                        case 'cnpj': return dir * ((a.cnpj || '').localeCompare(b.cnpj || ''));
                        default: return 0;
                    }
                }
                // Sem coluna clicada, ordenação default é nome A-Z (ui_ux_guia_unificado.md §6.4:
                // toda coluna ordenável já ordena pelo próprio cabeçalho, sem dropdown redundante).
                return a.name.localeCompare(b.name);
            });
    }, [organizations, searchTerm, advancedFilters.rules, tableColumns.sortColumn, tableColumns.sortDirection]);

    // Tabela fallback "Todos os Usuários" (só aparece sem organização selecionada).
    const allUsersColumns = useTableColumns(ALL_USERS_FALLBACK_COLUMNS, 'organizationListAllUsersColumns');
    const allUsersCols = useResizableColumns(ALL_USERS_COL_WIDTHS, 'organizationListAllUsersColWidths');
    const [allUsersSearch, setAllUsersSearch] = usePersistedState<string>('organizationListAllUsersSearch', '');
    // NUNCA w-full/100% com table-layout:fixed — ver ui_ux_guia_unificado.md §6.1.
    const allUsersTableTotalWidth = ['name', 'email', 'organization', 'role']
        .reduce((sum, key) => sum + (allUsersColumns.visibleColumns.includes(key) ? allUsersCols.getWidth(key) : 0), 0)
        + allUsersCols.getWidth('actions');
    const allUsersFlat = React.useMemo(() => {
        const flatAll = organizations.flatMap(org => (org.members || []).map(member => ({ org, member })));
        const term = allUsersSearch.trim().toLowerCase();
        const flat = !term ? flatAll : flatAll.filter(({ org, member }) =>
            member.name.toLowerCase().includes(term) ||
            member.email.toLowerCase().includes(term) ||
            org.name.toLowerCase().includes(term)
        );
        const dir = allUsersColumns.sortDirection === 'asc' ? 1 : -1;
        const col = allUsersColumns.sortColumn;
        if (col === 'name') return [...flat].sort((a, b) => a.member.name.localeCompare(b.member.name) * dir);
        if (col === 'email') return [...flat].sort((a, b) => a.member.email.localeCompare(b.member.email) * dir);
        if (col === 'organization') return [...flat].sort((a, b) => a.org.name.localeCompare(b.org.name) * dir);
        if (col === 'role') return [...flat].sort((a, b) => a.member.role.localeCompare(b.member.role) * dir);
        return flat;
    }, [organizations, allUsersSearch, allUsersColumns.sortColumn, allUsersColumns.sortDirection]);

    return (
        <div className="space-y-8">
            {/* Organizations Tab Content */}
            {activeTab === 'organizations' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div>
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Empresas do Grupo</h2>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie os perfis e logotipos das suas empresas.</p>
                    </div>

                    {/* Toolbar §5.1 (variante desaninhada, escala compacta §16) — mesma decisão já
                        aplicada em Clientes/Investidores/Fornecedores, pra consistência dentro do
                        módulo Organização (a barra de abas acima já está na escala compacta, §19). */}
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nome, CNPJ ou website..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        {/* Dropdown "Ordenar" removido: toda coluna ordenável já ordena pelo próprio cabeçalho (ui_ux_guia_unificado.md §6.4) */}
                        <div className="flex items-center h-9">
                            <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                        </div>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            {viewMode === 'list' && (
                                <>
                                    <ColumnConfigButton
                                        columns={ORG_LIST_COLUMNS}
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
                                className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <LayoutDashboard className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <Table2 className="w-4 h-4" />
                            </button>
                        </div>

                        <button
                            onClick={onCreate}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            Nova empresa
                        </button>
                    </div>

                    {viewMode === 'list' ? (
                        <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                            <div className="overflow-x-auto">
                                {/* thead em sentence case (§6.2) — obrigatório porque a tela adotou a
                                    escala de radius compacta (§16), mesmo critério já usado nas outras
                                    telas do módulo Organização. */}
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            {tableColumns.orderedVisibleColumns.map(key => {
                                                const def = ORG_LIST_COLUMN_HEADERS[key];
                                                if (!def) return null;
                                                return (
                                                    <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                        sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                        onSort={tableColumns.handleColumnSort}
                                                        onMoveColumn={tableColumns.moveColumn}
                                                        className={def.className} />
                                                );
                                            })}
                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        <tr
                                            onClick={() => { setActiveOrganizationId(null); setManagingOrgId(null); }}
                                            className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${!activeOrganizationId ? 'bg-blue-50/60' : ''}`}
                                        >
                                            {tableColumns.orderedVisibleColumns.map(key => (
                                                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {renderOrgListCell(key, null, { isActive: !activeOrganizationId })}
                                                </td>
                                            ))}
                                            <td className="px-6 py-2.5 text-right text-xs font-medium text-gray-400" onClick={(e) => e.stopPropagation()}>
                                                {!activeOrganizationId && 'Ativa'}
                                            </td>
                                        </tr>
                                        {filteredOrganizations.map(org => {
                                            const isActive = activeOrganizationId === org.id;
                                            return (
                                                <tr key={org.id} className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${isActive ? 'bg-blue-50/60' : ''}`}
                                                    onClick={() => setActiveOrganizationId(org.id)}
                                                >
                                                    {tableColumns.orderedVisibleColumns.map(key => (
                                                        <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                            {renderOrgListCell(key, org, { isActive })}
                                                        </td>
                                                    ))}
                                                    <td className="px-6 py-2.5 text-right">
                                                        {/* Selecionar = clique na linha (ação dominante, §9.1). O botão
                                                            "Ativo/Selecionar" antigo duplicava exatamente essa ação —
                                                            removido. Kebab só tem o que sobra (Detalhes/Excluir). */}
                                                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                            {isActive && <span className="text-xs font-medium text-emerald-600">Ativa</span>}
                                                            <InlineDisclosureMenu
                                                                menuItems={[
                                                                    {
                                                                        icon: <Settings className="w-[18px] h-[18px]" />,
                                                                        label: 'Detalhes',
                                                                        onClick: () => { setManagingOrgId(org.id); onTabChange('settings'); },
                                                                    },
                                                                    {
                                                                        icon: <Library className="w-[18px] h-[18px]" />,
                                                                        label: incluindoCatalogos === org.id ? 'Incluindo...' : 'Incluir nos catálogos do grupo',
                                                                        onClick: () => handleIncluirNosCatalogos(org),
                                                                    },
                                                                ]}
                                                                showDelete
                                                                onDelete={() => onDelete(org.id)}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filteredOrganizations.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">
                                                    {searchTerm ? 'Nenhuma organização encontrada para essa busca.' : 'Nenhuma outra organização cadastrada ainda.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Selecionar = clique no card (ação dominante, §9.1) — mesmo critério da lista. */}
                            <div
                                onClick={() => setActiveOrganizationId(null)}
                                className={`bg-white border rounded-[10px] overflow-hidden group transition-all hover:shadow-md cursor-pointer flex flex-col ${!activeOrganizationId ? 'ring-2 ring-blue-500/20 border-blue-300' : 'border-gray-100'}`}
                            >
                                <div className="aspect-video bg-gray-50 flex items-center justify-center">
                                    <Activity className={`w-12 h-12 ${!activeOrganizationId ? 'text-blue-600' : 'text-gray-200'}`} />
                                </div>
                                <div className="p-4 flex items-center justify-between gap-2">
                                    <h3 className="text-sm font-normal text-gray-900 truncate">Todas as organizações</h3>
                                    {!activeOrganizationId && <span className="text-xs font-medium text-emerald-600 shrink-0">Ativa</span>}
                                </div>
                            </div>
                            {filteredOrganizations.map(org => {
                                const isActive = activeOrganizationId === org.id;
                                return (
                                    <div key={org.id}
                                        onClick={() => setActiveOrganizationId(org.id)}
                                        className={`bg-white border rounded-[10px] overflow-hidden group transition-all hover:shadow-md cursor-pointer flex flex-col ${isActive ? 'ring-2 ring-blue-500/20 border-blue-300' : 'border-gray-100'}`}
                                    >
                                        <div className="aspect-video bg-gray-50 flex items-center justify-center">
                                            {org.logoUrl ? (
                                                <img src={org.logoUrl} alt={org.name} className="max-h-full max-w-full object-contain" />
                                            ) : (
                                                <Building2 className={`w-12 h-12 ${isActive ? 'text-blue-600' : 'text-gray-200'}`} />
                                            )}
                                        </div>
                                        <div className="p-4 flex items-center justify-between gap-2">
                                            <h3 className="text-sm font-normal text-gray-900 truncate">{org.name}</h3>
                                            <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                {isActive && <span className="text-xs font-medium text-emerald-600">Ativa</span>}
                                                <InlineDisclosureMenu
                                                    menuItems={[
                                                        {
                                                            icon: <Settings className="w-[18px] h-[18px]" />,
                                                            label: 'Detalhes',
                                                            onClick: () => { setManagingOrgId(org.id); onTabChange('settings'); },
                                                        },
                                                    ]}
                                                    showDelete
                                                    onDelete={() => onDelete(org.id)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Empresas do Grupo Tab */}
            {activeTab === 'empresas_grupo' && (
                activeOrganizationId
                    ? <CompaniesModule orgId={activeOrganizationId} />
                    : (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
                            <Building2 className="w-10 h-10 opacity-30" />
                            <p className="text-sm font-black uppercase tracking-wide">Selecione uma organização primeiro</p>
                            <p className="text-xs text-center max-w-xs">
                                Vá para a aba <strong className="text-gray-600">Organização</strong>, clique em <strong className="text-gray-600">SELECIONAR</strong> na empresa desejada e volte aqui.
                            </p>
                            <Button
                                onClick={() => onTabChange('organizations')}
                                className="mt-2"
                            >
                                Ir para Organização
                            </Button>
                        </div>
                    )
            )}

            {/* Other Tabs Rendering with Filtering */}
            <div className="min-h-[60vh] animate-in fade-in slide-in-from-bottom-4 duration-500">
                {activeTab === 'clients' && (
                    <ClientList onClientsChange={onClientsChange} organizationId={activeOrganizationId || undefined} />
                )}
                {activeTab === 'investors' && (
                    <InvestorList organizationId={activeOrganizationId || undefined} />
                )}
                {activeTab === 'suppliers' && (
                    <SupplierList organizationId={activeOrganizationId || undefined} />
                )}
                
                {activeTab === 'users' && (
                    currentOrg ? (
                        <OrganizationUsers
                            organizationId={currentOrg.id}
                            members={currentOrg.members || []}
                            onUpdateMembers={(members) => (onSave ?? onEdit)({ ...currentOrg, members })}
                            customRoles={currentOrg.customRoles || []}
                            onUpdateCustomRoles={(customRoles) => (onSave ?? onEdit)({ ...currentOrg, customRoles })}
                            onUpdateAll={(updates) => (onSave ?? onEdit)({ ...currentOrg, ...updates })}
                        />
                    ) : (
                        <div className="space-y-3">
                            {/* Título da tela (§20) — bloco solto, fora do card acoplado. */}
                            <div>
                                <h2 className="text-lg font-black text-gray-900 tracking-tight">Todos os usuários</h2>
                                <p className="text-sm text-gray-400 font-medium mt-0.5">Visão consolidada de acessos do ecossistema</p>
                            </div>
                            {/* Toolbar acoplada à tabela (§5.2 do guia): moldura/sombra só no card
                                pai, a única linha visível entre os blocos é o border-b da toolbar. */}
                            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-2 border-b border-gray-100 bg-white flex items-center gap-3">
                                    <div className="flex-1 relative w-full max-w-md">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar por nome, e-mail ou organização..."
                                            value={allUsersSearch}
                                            onChange={(e) => setAllUsersSearch(e.target.value)}
                                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                        <ColumnConfigButton
                                            columns={ALL_USERS_FALLBACK_COLUMNS}
                                            visibleColumns={allUsersColumns.visibleColumns}
                                            showColumnConfig={allUsersColumns.showColumnConfig}
                                            onToggleShow={() => allUsersColumns.setShowColumnConfig(!allUsersColumns.showColumnConfig)}
                                            onToggleColumn={allUsersColumns.toggleColumn}
                                            onReset={allUsersColumns.resetColumns}
                                        />
                                        {/* Ajustar largura ao conteúdo — sob comando explícito, nunca automático (§6.1.2). */}
                                        <button
                                            onClick={() => allUsersCols.autoFit()}
                                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                            title="Ajustar largura das colunas ao conteúdo"
                                        >
                                            <MoveHorizontal className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                <table ref={allUsersCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: allUsersTableTotalWidth }}>
                                    <colgroup>
                                        {allUsersColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                            <col key={key} data-col-key={key} style={{ width: `${allUsersCols.getWidth(key)}px` }} />
                                        ))}
                                        {/* espaçador — absorve a folga ANTES de "Ações" (§6.1.1) */}
                                        <col />
                                        <col data-col-key="actions" style={{ width: `${allUsersCols.getWidth('actions')}px` }} />
                                    </colgroup>
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            {allUsersColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                                const def = ALL_USERS_COLUMN_HEADERS[key];
                                                if (!def) return null;
                                                return (
                                                    <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                        sortColumn={allUsersColumns.sortColumn} sortDirection={allUsersColumns.sortDirection}
                                                        onSort={allUsersColumns.handleColumnSort}
                                                        onMoveColumn={allUsersColumns.moveColumn}
                                                        className={def.className}>
                                                        <allUsersCols.ResizeHandle colKey={key} />
                                                    </SortableHeader>
                                                );
                                            })}
                                            {/* espaçador — casa com o <col /> sem largura, na mesma ordem (§6.1.1) */}
                                            <th aria-hidden="true" className="border-r border-gray-100" />
                                            <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                                Ações
                                                <allUsersCols.ResizeHandle colKey="actions" />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {allUsersFlat.length === 0 ? (
                                            <tr>
                                                <td colSpan={allUsersColumns.visibleColumns.length + 2} className="px-6 py-8 text-center text-sm text-gray-400">
                                                    Nenhum usuário encontrado.
                                                </td>
                                            </tr>
                                        ) : allUsersFlat.map(({ org, member }) => (
                                            <tr key={`${org.id}-${member.email}`} className="hover:bg-blue-50/50 transition-colors">
                                                {allUsersColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        {renderAllUsersCell(key, { org, member })}
                                                    </td>
                                                ))}
                                                {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-3">
                                                        <button
                                                            onClick={() => handleResendInviteFromList(org.id, member.email, member.name, member.role)}
                                                            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-sm font-medium p-1.5 hover:bg-indigo-50 rounded-lg transition-all"
                                                        >
                                                            <Send className="w-3.5 h-3.5" />
                                                            Reenviar
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setManagingOrgId(org.id);
                                                                onTabChange('users');
                                                            }}
                                                            className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                        >
                                                            <Users className="w-3.5 h-3.5" />
                                                            Gerenciar
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            </div>
                        </div>
                    )
                )}

                {(activeTab === 'accounts' || activeTab === 'chart_of_accounts') && (
                    <FinancialRegistryManager
                        organizations={activeTab === 'accounts' ? organizations.map(o => ({ id: o.id, name: o.name })) : undefined}
                        defaultOrganizationId={activeTab === 'accounts' ? (registryOrgId || undefined) : undefined}
                        // Sem seletor de organização na toolbar: a org vem do seletor global do topo.
                        title={activeTab === 'accounts' ? 'Contas de Pagamento' : 'Plano de Contas'}
                        description={
                            activeTab === 'accounts' ? 'Gerencie as contas bancárias para alocação de gastos' :
                            'Estruture seu plano de contas para relatórios detalhados'
                        }
                        icon={activeTab === 'accounts' ? Building2 : HandCoins}
                        items={activeTab === 'accounts' ? paymentAccounts : chartOfAccounts}
                        showDescription={activeTab === 'accounts'}
                        showBankDetails={activeTab === 'accounts'}
                        showCode={true}
                        showNature={activeTab === 'chart_of_accounts'}
                        onSave={async (item) => {
                            const currentOrgId = item.organization_id || registryOrgId;
                            if (!currentOrgId) return alert("Selecione uma organização para vincular a conta.");

                            // Remover apenas campos gerados pelo servidor (id, created_at)
                            const { id: _id, created_at: _ca, ...rest } = item as { id?: string; created_at?: string; name: string; description?: string; bank?: string; branch?: string; account_number?: string; code?: string; organization_id?: string; accounting_nature?: 'CREDORA' | 'DEVEDORA' };
                            if (activeTab === 'accounts') {
                                // code: em branco = auto-gerado pelo service (001/002/003...); preenchido = respeita a edição manual.
                                const payload = { name: rest.name, description: rest.description, bank: rest.bank, branch: rest.branch, account_number: rest.account_number, code: rest.code || undefined };
                                if (item.id) await financialRegistryService.updatePaymentAccount(item.id, { ...payload, organization_id: currentOrgId });
                                else await financialRegistryService.createPaymentAccount({ ...payload, organization_id: currentOrgId });
                            } else {
                                const payload = { name: rest.name, code: rest.code ?? '', accounting_nature: rest.accounting_nature };
                                if (item.id) await financialRegistryService.updateChartOfAccount(item.id, payload);
                                else await financialRegistryService.createChartOfAccount({ ...payload, organization_id: currentOrgId });
                            }
                            loadRegistries();
                        }}
                        onDelete={async (id) => {
                            if (activeTab === 'accounts') await financialRegistryService.deletePaymentAccount(id);
                            else await financialRegistryService.deleteChartOfAccount(id);
                            loadRegistries();
                        }}
                    />
                )}

                {activeTab === 'cost_centers' && (
                    <CostCenterModule organizationId={registryOrgId} />
                )}

                {activeTab === 'plano_contas' && (
                    <PlanoDeContasModule organizationId={registryOrgId} />
                )}

                {activeTab === 'settings' && (
                    currentOrg ? (
                        <OrganizationPage
                            organization={currentOrg}
                            onUpdate={(org) => {
                                (onSave ?? onEdit)(org);
                            }}
                        />
                    ) : (
                        // Nunca renderizar vazio: detalhe de organização é inerentemente
                        // por-empresa (REGRA #5, caso 3) — pede a seleção explicitamente.
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
                            <Building2 className="w-10 h-10 opacity-30" />
                            <p className="text-sm font-black uppercase tracking-wide">Nenhuma organização selecionada</p>
                            <p className="text-xs text-center max-w-xs">
                                O detalhe é de uma empresa específica. Volte para a aba{' '}
                                <strong className="text-gray-600">Organização</strong> e use{' '}
                                <strong className="text-gray-600">Detalhes</strong> na empresa desejada.
                            </p>
                            <Button onClick={() => onTabChange('organizations')} className="mt-2">
                                Ir para Organização
                            </Button>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default OrganizationList;

