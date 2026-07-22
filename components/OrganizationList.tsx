import React, { useState } from 'react';
import {
    Building2, Mail, Plus, Search,
    Trash2, Edit2, LayoutDashboard, Table2,
    Activity, Users, UserPlus,
    TrendingUp, HandCoins, Filter, Truck, Settings, Send
} from 'lucide-react';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
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

const ORG_LIST_COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Organização', sortable: true },
    { key: 'contact', label: 'Contato', sortable: true },
    { key: 'cnpj', label: 'CNPJ', sortable: true },
];

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
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { KpiCard } from './ui/KpiCard';
import { Organization, BudgetEntry } from '../types';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import OrganizationUsers from './OrganizationUsers';
import OrganizationPage from './OrganizationPage';
import ClientList from './ClientList';
import InvestorList from './InvestorList';
import { SupplierList } from './SupplierList';
import FinancialRegistryManager from './FinancialRegistryManager';
import CompaniesModule from './CompaniesModule';
import CostCenterModule from './CostCenterModule';
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
    activeTab: 'organizations' | 'empresas_grupo' | 'projects' | 'clients' | 'investors' | 'suppliers' | 'users' | 'accounts' | 'cost_centers' | 'chart_of_accounts' | 'settings';
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
    // Aqui escolhemos UMA org por vez: a ativa, se houver; senão a escolha
    // salva no seletor da toolbar; senão a primeira org da lista. Nunca merge.
    const [registryOrgOverride, setRegistryOrgOverride] = usePersistedState<string | null>('financialRegistryOrgFilter', null);
    const validOverride = React.useMemo(
        () => (organizations || []).some(o => o.id === registryOrgOverride) ? registryOrgOverride : null,
        [organizations, registryOrgOverride]
    );
    const registryOrgId = activeOrganizationId || managingOrgId || validOverride || (organizations || [])[0]?.id || null;

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

    // Reset managingOrgId whenever the user navigates away from the users tab
    // while in global context (no active org). This ensures the consolidated
    // view appears correctly when coming back to the users tab.
    React.useEffect(() => {
        if (activeTab !== 'users' && !activeOrganizationId) {
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
                // Sem coluna clicada, ordenação default é nome A-Z (ui_ux_standard_guide.md §6.4:
                // toda coluna ordenável já ordena pelo próprio cabeçalho, sem dropdown redundante).
                return a.name.localeCompare(b.name);
            });
    }, [organizations, searchTerm, advancedFilters.rules, tableColumns.sortColumn, tableColumns.sortDirection]);

    const orgKpis = React.useMemo(() => ({
        total: organizations.length,
        comCnpj: organizations.filter(o => !!o.cnpj).length,
    }), [organizations]);

    // Tabela fallback "Todos os Usuários" (só aparece sem organização selecionada).
    const allUsersColumns = useTableColumns(ALL_USERS_FALLBACK_COLUMNS, 'organizationListAllUsersColumns');
    const allUsersFlat = React.useMemo(() => {
        const flat = organizations.flatMap(org => (org.members || []).map(member => ({ org, member })));
        const dir = allUsersColumns.sortDirection === 'asc' ? 1 : -1;
        const col = allUsersColumns.sortColumn;
        if (col === 'name') return [...flat].sort((a, b) => a.member.name.localeCompare(b.member.name) * dir);
        if (col === 'email') return [...flat].sort((a, b) => a.member.email.localeCompare(b.member.email) * dir);
        if (col === 'organization') return [...flat].sort((a, b) => a.org.name.localeCompare(b.org.name) * dir);
        if (col === 'role') return [...flat].sort((a, b) => a.member.role.localeCompare(b.member.role) * dir);
        return flat;
    }, [organizations, allUsersColumns.sortColumn, allUsersColumns.sortDirection]);

    return (
        <div className="space-y-8">
            {/* Organizations Tab Content */}
            {activeTab === 'organizations' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div>
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Empresas do Grupo</h2>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie os perfis e logotipos das suas empresas.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <KpiCard shadow={false} size="lg" label="Total de Organizações" value={orgKpis.total} icon={<Building2 className="w-4 h-4" />} color="blue" />
                        <KpiCard shadow={false} size="lg" label="Com CNPJ Cadastrado" value={orgKpis.comCnpj} icon={<Activity className="w-4 h-4" />} color="emerald" />
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

                        {/* Dropdown "Ordenar" removido: toda coluna ordenável já ordena pelo próprio cabeçalho (ui_ux_standard_guide.md §6.4) */}
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
                                            {tableColumns.visibleColumns.includes('code') && (
                                                <SortableHeader label="Código" colKey="code" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                                            )}
                                            {tableColumns.visibleColumns.includes('name') && (
                                                <SortableHeader label="Organização" colKey="name" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                            )}
                                            {tableColumns.visibleColumns.includes('contact') && (
                                                <SortableHeader label="Contato" colKey="contact" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                            )}
                                            {tableColumns.visibleColumns.includes('cnpj') && (
                                                <SortableHeader label="CNPJ" colKey="cnpj" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                                            )}
                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        <tr
                                            onClick={() => { setActiveOrganizationId(null); setManagingOrgId(null); }}
                                            className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${!activeOrganizationId ? 'bg-blue-50/60' : ''}`}
                                        >
                                            {tableColumns.visibleColumns.includes('code') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-400 whitespace-nowrap">-</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('name') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${!activeOrganizationId ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                            <Activity className="w-4 h-4" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-normal text-gray-900 flex items-center gap-2">
                                                                Todas as organizações
                                                                {!activeOrganizationId && <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />}
                                                            </p>
                                                            <p className="text-xs font-medium text-gray-400">Visão consolidada do grupo</p>
                                                        </div>
                                                    </div>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('contact') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-400">Global</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('cnpj') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-400">-</td>
                                            )}
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
                                                    {tableColumns.visibleColumns.includes('code') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                            {org.code || '-'}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('name') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                                    <Building2 className="w-4 h-4" />
                                                                </div>
                                                                <span className="text-sm font-normal text-gray-900 flex items-center gap-2">
                                                                    {org.name}
                                                                    {isActive && <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('contact') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                            <div className="flex items-center text-sm font-normal text-gray-600">
                                                                <Mail className="w-3.5 h-3.5 mr-1.5 text-gray-400 shrink-0" />
                                                                {org.email || '-'}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('cnpj') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                            {org.cnpj || '-'}
                                                        </td>
                                                    )}
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
                        <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                                <h2 className="text-lg font-black text-gray-900 tracking-tight">Todos os usuários</h2>
                                <p className="text-sm text-gray-400 font-medium mt-0.5">Visão consolidada de acessos do ecossistema</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            <SortableHeader label="Usuário" colKey="name" sortable={true} uppercase={false} sortColumn={allUsersColumns.sortColumn} sortDirection={allUsersColumns.sortDirection} onSort={allUsersColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                            <SortableHeader label="E-mail" colKey="email" sortable={true} uppercase={false} sortColumn={allUsersColumns.sortColumn} sortDirection={allUsersColumns.sortDirection} onSort={allUsersColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                            <SortableHeader label="Organização" colKey="organization" sortable={true} uppercase={false} sortColumn={allUsersColumns.sortColumn} sortDirection={allUsersColumns.sortDirection} onSort={allUsersColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                            <SortableHeader label="Função" colKey="role" sortable={true} uppercase={false} sortColumn={allUsersColumns.sortColumn} sortDirection={allUsersColumns.sortDirection} onSort={allUsersColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {allUsersFlat.map(({ org, member }) => (
                                            <tr key={`${org.id}-${member.email}`} className="hover:bg-blue-50/50 transition-colors">
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-900">{member.name}</td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{member.email}</td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-blue-600">
                                                    {org.name}
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                    {member.role}
                                                </td>
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
                    )
                )}

                {(activeTab === 'accounts' || activeTab === 'chart_of_accounts') && (
                    <FinancialRegistryManager
                        organizations={activeTab === 'accounts' ? organizations.map(o => ({ id: o.id, name: o.name })) : undefined}
                        defaultOrganizationId={activeTab === 'accounts' ? (registryOrgId || undefined) : undefined}
                        // Seletor de organização: só na aba por-org (accounts), e só quando não
                        // há org fixada globalmente e existe mais de uma. chart_of_accounts é
                        // global (financial_categories) — não recebe seletor.
                        orgFilter={
                            activeTab !== 'chart_of_accounts' && !activeOrganizationId && !managingOrgId && organizations.length > 1
                                ? {
                                    organizations: organizations.map(o => ({ id: o.id, name: o.name })),
                                    value: registryOrgId,
                                    onChange: setRegistryOrgOverride,
                                }
                                : undefined
                        }
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
                    <CostCenterModule
                        organizationId={registryOrgId}
                        orgFilter={
                            !activeOrganizationId && !managingOrgId && organizations.length > 1
                                ? {
                                    organizations: organizations.map(o => ({ id: o.id, name: o.name })),
                                    value: registryOrgId,
                                    onChange: setRegistryOrgOverride,
                                }
                                : undefined
                        }
                    />
                )}

                {activeTab === 'settings' && currentOrg && (
                    <OrganizationPage
                        organization={currentOrg}
                        onUpdate={(org) => {
                            (onSave ?? onEdit)(org);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default OrganizationList;

