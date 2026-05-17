import React, { useState } from 'react';
import { 
    Building2, Mail, Plus, Search, 
    Trash2, Edit2, LayoutDashboard, Table2, 
    Activity, Users, Briefcase, UserPlus,
    TrendingUp, HandCoins, Filter, Truck
} from 'lucide-react';
import { Organization } from '../types';
import { useStore } from '../store/useStore';
import ProjectList from './ProjectList';
import OrganizationUsers from './OrganizationUsers';
import OrganizationPage from './OrganizationPage';
import ClientList from './ClientList';
import InvestorList from './InvestorList';
import { SupplierList } from './SupplierList';
import FinancialRegistryManager from './FinancialRegistryManager';
import CostCenterImportModal from './CostCenterImportModal';
import { financialRegistryService } from '../services/financialRegistryService';
import { exportService } from '../services/exportService';
import { PaymentAccount, CostCenter, ChartOfAccount } from '../types';

interface OrganizationListProps {
    organizations: Organization[];
    onCreate: () => void;
    onEdit: (org: Organization) => void;
    onDelete: (id: string) => void;
    onSelect: (org: Organization) => void;
    
    // Management Props
    activeTab: 'organizations' | 'projects' | 'clients' | 'investors' | 'suppliers' | 'users' | 'accounts' | 'cost_centers' | 'chart_of_accounts' | 'settings';
    onTabChange: (tab: any) => void;
    projects: any[];
    onClientsChange: () => void;
    onLoadProject: (id: string, view: any) => void;
    onEditProject: (id: string) => void;
    onNewProject: (type: any) => void;
    onDuplicateProject: (id: string) => void;
    onImportProject: (data: any) => void;
    onExportProject: (id: string) => void;
}

const OrganizationList: React.FC<OrganizationListProps> = ({
    organizations,
    onCreate,
    onEdit,
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
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    const [sortBy, setSortBy] = useState<string>('name-asc');
    const [managingOrgId, setManagingOrgId] = useState<string | null>(null);
    const { activeOrganizationId, setActiveOrganizationId } = useStore();

    // Financial Registries State
    const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
    const [showImportModal, setShowImportModal] = useState(false);

    const loadRegistries = React.useCallback(async () => {
        const targetOrgId = activeOrganizationId || managingOrgId;
        try {
            const [accs, centers, charts] = await Promise.all([
                financialRegistryService.listPaymentAccounts(targetOrgId || undefined),
                financialRegistryService.listCostCenters(targetOrgId || undefined),
                financialRegistryService.listChartOfAccounts(targetOrgId || undefined)
            ]);
            setPaymentAccounts(accs);
            setCostCenters(centers);
            setChartOfAccounts(charts);
        } catch (error) {
            console.error('Error loading registries:', error);
        }
    }, [managingOrgId, activeOrganizationId]);

    React.useEffect(() => {
        // Load registries when tab changes to a financial one OR when org changes
        if (['accounts', 'cost_centers', 'chart_of_accounts'].includes(activeTab)) {
            loadRegistries();
        }
    }, [activeTab, activeOrganizationId, managingOrgId, loadRegistries]);

    const managingOrg = organizations.find(o => o.id === managingOrgId);
    const activeOrg = organizations.find(o => o.id === activeOrganizationId);
    const currentOrg = managingOrg || activeOrg;

    const filteredOrganizations = React.useMemo(() => {
        const orgs = organizations || [];
        return orgs
            .filter(org =>
                org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                org.cnpj?.includes(searchTerm) ||
                org.website?.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => {
                if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
                if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
                if (sortBy === 'recent') return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
                return 0;
            });
    }, [organizations, searchTerm, sortBy]);

    return (
        <div className="space-y-8">
            {/* Header with Global Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center p-3 shadow-lg shadow-blue-500/20">
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Minha Organização</h1>
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">
                            {activeOrganizationId 
                                ? `Filtro Ativo: ${organizations.find(o => o.id === activeOrganizationId)?.name}` 
                                : 'Visão Consolidada Global'}
                        </p>
                    </div>
                </div>
                
                <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100 overflow-x-auto scrollbar-hide max-w-full">
                    {[
                        { id: 'organizations', label: 'Empresas', icon: Building2 },
                        { id: 'projects', label: 'Projetos', icon: Briefcase },
                        { id: 'clients', label: 'Clientes', icon: UserPlus },
                        { id: 'investors', label: 'Investidores', icon: TrendingUp },
                        { id: 'suppliers', label: 'Fornecedores', icon: Truck },
                        { id: 'users', label: 'Usuários', icon: Users },
                        { id: 'accounts', label: 'Contas', icon: Building2 },
                        { id: 'cost_centers', label: 'Centros', icon: Filter },
                        { id: 'chart_of_accounts', label: 'Plano', icon: HandCoins }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                // If switching away from organizations, and no organization is active,
                                // we might want to keep the current view or prompt.
                                // But for now, just change the tab.
                                onTabChange(tab.id as any);
                            }}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-lg shadow-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Organizations Tab Content */}
            {activeTab === 'organizations' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight italic border-l-4 border-blue-600 pl-4">Empresas do Grupo</h2>
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Gerencie os perfis e logotipos das suas empresas.</p>
                        </div>
                        <button
                            onClick={onCreate}
                            className="px-8 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/20 flex items-center gap-3 active:scale-95"
                        >
                            <Plus className="w-5 h-5" />
                            Nova Empresa
                        </button>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative group">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Buscar por nome, CNPJ ou website..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-14 pr-6 py-4 bg-white border border-gray-100 rounded-[1.5rem] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 placeholder:text-gray-400 shadow-sm"
                            />
                        </div>
                        <div className="flex gap-4">
                            <div className="relative">
                                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="pl-11 pr-8 py-4 bg-white border border-gray-100 rounded-[1.5rem] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 appearance-none shadow-sm cursor-pointer"
                                >
                                    <option value="name-asc">Nome (A-Z)</option>
                                    <option value="name-desc">Nome (Z-A)</option>
                                    <option value="recent">Mais Recentes</option>
                                </select>
                            </div>
                            <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    <LayoutDashboard className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    <Table2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {viewMode === 'list' ? (
                        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] border-b border-gray-100">
                                            <th className="px-8 py-5">Organização</th>
                                            <th className="px-8 py-5">Contato</th>
                                            <th className="px-8 py-5">CNPJ</th>
                                            <th className="px-8 py-5 text-center">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        <tr 
                                            onClick={() => setActiveOrganizationId(null)}
                                            className={`hover:bg-blue-50/30 transition-all duration-200 group cursor-pointer ${!activeOrganizationId ? 'bg-blue-50/50' : ''}`}
                                        >
                                            <td className="px-8 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center p-2 transition-all duration-300 ${!activeOrganizationId ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>
                                                        <Activity className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors flex items-center gap-2 uppercase">
                                                            TODAS AS ORGANIZAÇÕES
                                                            {!activeOrganizationId && <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />}
                                                        </p>
                                                        <span className="text-[10px] text-gray-400 font-medium">Visão consolidada do grupo</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-4 text-[10px] text-gray-400 font-black uppercase tracking-widest italic">Global</td>
                                            <td className="px-8 py-4">---</td>
                                            <td className="px-8 py-4">
                                                <div className="flex items-center justify-center">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setActiveOrganizationId(null); }}
                                                        className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${!activeOrganizationId ? 'bg-emerald-500 text-white shadow-sm' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                                    >
                                                        {!activeOrganizationId ? 'ATIVO' : 'SELECIONAR'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {filteredOrganizations.map(org => {
                                            const isActive = activeOrganizationId === org.id;
                                            return (
                                                <tr key={org.id} className={`hover:bg-blue-50/30 transition-all duration-200 group cursor-pointer ${isActive ? 'bg-blue-50/50' : ''}`}
                                                    onClick={() => setActiveOrganizationId(org.id)}
                                                >
                                                    <td className="px-8 py-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center p-2 transition-all duration-300 ${isActive ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>
                                                                <Building2 className="w-5 h-5" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors flex items-center gap-2 uppercase">
                                                                    {org.name}
                                                                    {isActive && <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-4">
                                                        <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase">
                                                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                                                            {org.email || '---'}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-4">
                                                        <span className="text-[10px] font-black text-gray-600 font-mono bg-gray-100/50 px-3 py-1 rounded-lg border border-gray-100">
                                                            {org.cnpj || '---'}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-4">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setActiveOrganizationId(org.id); }}
                                                                className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${isActive ? 'bg-emerald-500 text-white shadow-sm' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                                            >
                                                                {isActive ? 'ATIVO' : 'SELECIONAR'}
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setManagingOrgId(org.id);
                                                                    onTabChange('settings');
                                                                }}
                                                                className="px-4 py-2 bg-gray-50 text-gray-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-100 border border-gray-200 transition-all"
                                                            >
                                                                DETALHES
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); onDelete(org.id); }}
                                                                className="p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 border border-rose-100 transition-all group/del"
                                                                title="Excluir Organização"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 group-hover/del:scale-110 transition-transform" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {/* Grid View Content - Re-implement if needed or use same logic */}
                            <div 
                                onClick={() => setActiveOrganizationId(null)}
                                className={`bg-white border rounded-[2.5rem] overflow-hidden group transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 cursor-pointer ${!activeOrganizationId ? 'ring-4 ring-blue-500/10 border-blue-500' : 'border-gray-100'}`}
                            >
                                <div className="aspect-video bg-gray-50 relative flex items-center justify-center p-8">
                                    <Activity className={`w-16 h-16 ${!activeOrganizationId ? 'text-blue-600 shadow-2xl' : 'text-gray-200 group-hover:text-blue-200'}`} />
                                </div>
                                <div className="p-8">
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2 truncate">TODAS AS ORGANIZAÇÕES</h3>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setActiveOrganizationId(null); }}
                                        className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all ${!activeOrganizationId ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                    >
                                        {!activeOrganizationId ? 'ATIVO' : 'SELECIONAR VISÃO GLOBAL'}
                                    </button>
                                </div>
                            </div>
                            {filteredOrganizations.map(org => {
                                const isActive = activeOrganizationId === org.id;
                                return (
                                    <div key={org.id} 
                                        onClick={() => setActiveOrganizationId(org.id)}
                                        className={`bg-white border rounded-[2.5rem] overflow-hidden group transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 cursor-pointer ${isActive ? 'ring-4 ring-blue-500/10 border-blue-500' : 'border-gray-100'}`}
                                    >
                                        <div className="aspect-video bg-gray-50 relative flex items-center justify-center p-8">
                                            {org.logoUrl ? (
                                                <img src={org.logoUrl} alt={org.name} className="max-h-full max-w-full object-contain group-hover:scale-110 transition-transform duration-700" />
                                            ) : (
                                                <Building2 className={`w-16 h-16 ${isActive ? 'text-blue-600' : 'text-gray-200 group-hover:text-blue-200'}`} />
                                            )}
                                        </div>
                                        <div className="p-8">
                                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2 truncate">{org.name}</h3>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setActiveOrganizationId(org.id); }}
                                                    className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all ${isActive ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                                >
                                                    {isActive ? 'ATIVO' : 'SELECIONAR'}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setManagingOrgId(org.id);
                                                        onTabChange('settings');
                                                    }}
                                                    className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-gray-200 border border-gray-200 transition-all font-bold"
                                                >
                                                    DETALHES
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDelete(org.id); }}
                                                    className="p-4 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-100 border border-rose-100 transition-all group/del"
                                                    title="Excluir Organização"
                                                >
                                                    <Trash2 className="w-5 h-5 group-hover/del:scale-110 transition-transform" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Other Tabs Rendering with Filtering */}
            <div className="min-h-[60vh] animate-in fade-in slide-in-from-bottom-4 duration-500">
                {activeTab === 'projects' && (
                    <ProjectList
                        projects={projects.filter(p => !activeOrganizationId || p.organizationId === activeOrganizationId || p.organization_id === activeOrganizationId)}
                        onLoadProject={onLoadProject}
                        onEditProject={onEditProject}
                        onNewProject={onNewProject}
                        onDuplicateProject={onDuplicateProject}
                        onImportProject={onImportProject}
                        onExportProject={onExportProject}
                        organizationId={activeOrganizationId || undefined}
                        organizations={organizations.map(o => ({ id: o.id, name: o.name }))}
                    />
                )}
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
                            members={currentOrg.members || []}
                            onUpdateMembers={(members) => onEdit({ ...currentOrg, members })}
                            customRoles={currentOrg.customRoles || []}
                            onUpdateCustomRoles={(customRoles) => onEdit({ ...currentOrg, customRoles })}
                            onUpdateAll={(updates) => onEdit({ ...currentOrg, ...updates })}
                        />
                    ) : (
                        <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden">
                            <div className="p-8 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Todos os Usuários</h2>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Visão consolidada de acessos do ecossistema</p>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                        <tr>
                                            <th className="px-8 py-4 text-left">Usuário</th>
                                            <th className="px-8 py-4 text-left">E-mail</th>
                                            <th className="px-8 py-4 text-left">Organização</th>
                                            <th className="px-8 py-4 text-left">Função</th>
                                            <th className="px-8 py-4 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {organizations.flatMap(org => (org.members || []).map(member => (
                                            <tr key={`${org.id}-${member.email}`} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-8 py-4 font-bold text-gray-900">{member.name}</td>
                                                <td className="px-8 py-4 text-gray-500">{member.email}</td>
                                                <td className="px-8 py-4">
                                                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                                        {org.name}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-4">
                                                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                                        {member.role}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-4 text-right">
                                                    <button 
                                                        onClick={() => {
                                                            setManagingOrgId(org.id);
                                                            onTabChange('users');
                                                        }}
                                                        className="p-2 hover:bg-white rounded-xl text-gray-400 hover:text-blue-600 transition-all border border-transparent hover:border-blue-100"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        )))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                )}

                {(activeTab === 'accounts' || activeTab === 'cost_centers' || activeTab === 'chart_of_accounts') && (
                    <FinancialRegistryManager
                        title={
                            activeTab === 'accounts' ? 'Contas de Pagamento' :
                            activeTab === 'cost_centers' ? 'Centros de Custo' : 'Plano de Contas'
                        }
                        description={
                            activeTab === 'accounts' ? 'Gerencie as contas bancárias para alocação de gastos' :
                            activeTab === 'cost_centers' ? 'Defina os centros de custo para classificação' :
                            'Estruture seu plano de contas para relatórios detalhados'
                        }
                        icon={
                            activeTab === 'accounts' ? Building2 :
                            activeTab === 'cost_centers' ? Filter : HandCoins
                        }
                        items={
                            activeTab === 'accounts' ? paymentAccounts :
                            activeTab === 'cost_centers' ? costCenters : chartOfAccounts
                        }
                        showDescription={activeTab === 'accounts'}
                        showBankDetails={activeTab === 'accounts'}
                        showCode={activeTab !== 'accounts'}
                        onSave={async (item) => {
                            const currentOrgId = activeOrganizationId || managingOrgId;
                            if (!currentOrgId) return alert("Selecione uma empresa ativa ou clique em 'Detalhes' para gerenciar registros financeiros.");
                            
                            // Remover apenas campos gerados pelo servidor (id, created_at)
                            const { id: _id, created_at: _ca, ...rest } = item as any;
                            if (activeTab === 'accounts') {
                                const payload = { name: rest.name, description: rest.description, bank: rest.bank, branch: rest.branch, account_number: rest.account_number };
                                if (item.id) await financialRegistryService.updatePaymentAccount(item.id, payload);
                                else await financialRegistryService.createPaymentAccount({ ...payload, organization_id: currentOrgId });
                            } else if (activeTab === 'cost_centers') {
                                const payload = { name: rest.name, code: rest.code };
                                if (item.id) await financialRegistryService.updateCostCenter(item.id, payload);
                                else await financialRegistryService.createCostCenter({ ...payload, organization_id: currentOrgId });
                            } else {
                                const payload = { name: rest.name, code: rest.code };
                                if (item.id) await financialRegistryService.updateChartOfAccount(item.id, payload);
                                else await financialRegistryService.createChartOfAccount({ ...payload, organization_id: currentOrgId });
                            }
                            loadRegistries();
                        }}
                        onDelete={async (id) => {
                            if (activeTab === 'accounts') await financialRegistryService.deletePaymentAccount(id);
                            else if (activeTab === 'cost_centers') await financialRegistryService.deleteCostCenter(id);
                            else await financialRegistryService.deleteChartOfAccount(id);
                            loadRegistries();
                        }}
                        onExport={activeTab === 'cost_centers' ? () => exportService.exportCostCenters(costCenters) : undefined}
                        onDownloadTemplate={activeTab === 'cost_centers' ? () => exportService.downloadCostCenterTemplate() : undefined}
                        onImport={activeTab === 'cost_centers' ? () => setShowImportModal(true) : undefined}
                    />
                )}

                {showImportModal && (activeOrganizationId || managingOrgId) && (
                    <CostCenterImportModal
                        organizationId={(activeOrganizationId || managingOrgId)!}
                        existingCostCenters={costCenters}
                        onClose={() => setShowImportModal(false)}
                        onSuccess={() => { loadRegistries(); setShowImportModal(false); }}
                    />
                )}

                {activeTab === 'settings' && currentOrg && (
                    <OrganizationPage 
                        organization={currentOrg}
                        onUpdate={(org) => {
                            onEdit(org);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default OrganizationList;

