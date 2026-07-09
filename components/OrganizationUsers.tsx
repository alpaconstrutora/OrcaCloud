import React, { useState } from 'react';
import { OrganizationMember, OrganizationRole, UserPermissions, OrganizationCustomRole, ProductContext, ModuleVisibilityConfig, ProductModuleMap } from '../types';
import { User, Plus, Trash2, Shield, MoreVertical, Mail, Check, X, Settings as SettingsIcon, ChevronDown, ChevronUp, Briefcase, Users, Edit2, Send, Save, Building2, Palette, AlertCircle } from 'lucide-react';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, SortableHeader } from './ui/TableUtils';

// §6.3: toda coluna de valor único é ordenável. "Função / Cargo" é composta
// (papel + nome do cargo customizado opcional na mesma célula) — exceção
// legítima documentada, igual ao padrão de "Contato" em SupplierList.tsx.
const MEMBER_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Membro', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'role', label: 'Função / Cargo', sortable: false },
    { key: 'joinedAt', label: 'Entrou em', sortable: true },
];

interface OrganizationUsersProps {
    organizationId?: string;
    members: OrganizationMember[];
    onUpdateMembers: (updatedMembers: OrganizationMember[]) => void;
    customRoles: OrganizationCustomRole[];
    onUpdateCustomRoles: (updatedRoles: OrganizationCustomRole[]) => void;
    onUpdateAll: (updates: { members?: OrganizationMember[], customRoles?: OrganizationCustomRole[], settings?: any }) => void;
}

const getDefaultPermissions = (role: OrganizationRole): UserPermissions => {
    const baseViewer: UserPermissions = {
        canViewBudget: true, canEditBudget: false,
        canViewCompositions: true, canEditCompositions: false,
        canViewPlanning: true, canEditPlanning: false,
        canViewDiary: true, canEditDiary: false,
        canViewReports: true, canEditReports: false,
        canViewTechnicalData: true, canEditTechnicalData: false,
        canViewOrders: true, canEditOrders: false,
        canViewReceipts: true, canEditReceipts: false,
        canViewFinancial: true, canEditFinancial: false,
        canViewClientPortal: true, canEditClientPortal: false,
        canViewInvestorPortal: true, canEditInvestorPortal: false,
        canViewSupplierPortal: true, canEditSupplierPortal: false,
        canViewBrokerPortal: true, canEditBrokerPortal: false,
        canViewSettings: true, canEditSettings: false,
        canManageUsers: false,
        
        canViewLabor: true,
        canViewOffices: true,
        canViewPro: true,
        canViewSales: true,
        canViewImovib: true,
        canViewFiscal: true,
        canViewQuality: true,
        canViewRentals: true,
        canViewStructural: true
    };

    switch (role) {
        case 'admin':
            return Object.keys(baseViewer).reduce((acc, key) => ({
                ...acc,
                [key]: true
            }), {} as UserPermissions);
        case 'member':
            return {
                ...baseViewer,
                canEditBudget: true,
                canEditCompositions: true,
                canEditPlanning: true,
                canEditDiary: true,
                canEditOrders: true,
                canEditReceipts: true,
                canEditFinancial: true,
                canEditTechnicalData: true
            };
        case 'viewer':
            return baseViewer;
        default:
            return baseViewer;
    }
};

// Produtos Òpura disponíveis
const PRODUCTS: { id: ProductContext; label: string; icon: string; color: string; description: string }[] = [
    { id: 'platform', label: 'Plataforma', icon: '🏗️', color: 'blue', description: 'Construtoras, incorporadoras e engenheiros' },
    { id: 'pro',      label: 'Òpura Pro',  icon: '⚡', color: 'orange', description: 'Autônomos, prestadores e contratantes' },
    { id: 'offices',  label: 'Offices',    icon: '🎨', color: 'violet', description: 'Arquitetos e designers de interiores' },
    { id: 'compliance', label: 'Compliance', icon: '🛡️', color: 'blue', description: 'Governança operacional e controle do regime TTS' },
];

// Módulos disponíveis por produto
const MODULES_BY_PRODUCT: Record<ProductContext, { key: string; label: string; description: string }[]> = {
    platform: [
        { key: 'obras',      label: 'Engenharia / Obras',               description: 'Obras, Orçamentos, Cronogramas e Composições' },
        { key: 'compras',    label: 'Suprimentos / Compras',            description: 'Pedidos, Cotações, Recebimento e Contratos' },
        { key: 'rh',         label: 'Mão de Obra / RH',                 description: 'Colaboradores, Equipes, Ponto, Folha e SST' },
        { key: 'crm',        label: 'Comercial & Vendas',               description: 'Espelho de vendas, aluguéis e CRM de serviços' },
        { key: 'incorporacao', label: 'Viabilidade Imobiliária',        description: 'Estudos e simulações financeiras de empreendimentos' },
        { key: 'fiscal',     label: 'Fiscal & NF-e',                    description: 'Notas fiscais eletrônicas e automação de impostos' },
        { key: 'quality',    label: 'Qualidade & Pós-Obra',             description: 'Qualidade de entrega, garantia e SLAs' },
        { key: 'pro',        label: 'ÒPURA Pro (Add-on)',               description: 'Modelos rápidos de orçamento para prestadores' },
        { key: 'offices',    label: 'ÒPURA Offices (Add-on)',           description: 'Projetos e especificações de arquitetura/design' },
        { key: 'compliance', label: 'ÒPURA Compliance (Add-on)',        description: 'Governança operacional e conformidade TTS' },
    ],
    pro: [
        { key: 'pro',        label: 'ÒPURA Pro',                        description: 'Modelos e estimativas rápidas de orçamento' },
    ],
    offices: [
        { key: 'offices',    label: 'ÒPURA Offices',                    description: 'Projetos e especificações de arquitetura/design' },
        { key: 'crm',        label: 'CRM de Serviços',                  description: 'Contratos e gestão de clientes de arquitetura' },
    ],
    compliance: [
        { key: 'compliance', label: 'ÒPURA Compliance',                 description: 'Dashboard de conformidade, mapa físico e checklists' },
    ],
};

const DETAILED_PERMISSIONS = [
    { title: 'Orçamento', view: 'canViewBudget', edit: 'canEditBudget' },
    { title: 'Composições', view: 'canViewCompositions', edit: 'canEditCompositions' },
    { title: 'Planejamento', view: 'canViewPlanning', edit: 'canEditPlanning' },
    { title: 'Diário de Obra', view: 'canViewDiary', edit: 'canEditDiary' },
    { title: 'Relatórios', view: 'canViewReports', edit: 'canEditReports' },
    { title: 'Dados Técnicos', view: 'canViewTechnicalData', edit: 'canEditTechnicalData' },
    { title: 'Pedidos', view: 'canViewOrders', edit: 'canEditOrders' },
    { title: 'Recebimento', view: 'canViewReceipts', edit: 'canEditReceipts' },
    { title: 'Financeiro', view: 'canViewFinancial', edit: 'canEditFinancial' },
    { title: 'Portal do Cliente', view: 'canViewClientPortal', edit: 'canEditClientPortal' },
    { title: 'Portal do Investidor', view: 'canViewInvestorPortal', edit: 'canEditInvestorPortal' },
    { title: 'Portal do Fornecedor', view: 'canViewSupplierPortal', edit: 'canEditSupplierPortal' },
    { title: 'Portal do Corretor', view: 'canViewBrokerPortal', edit: 'canEditBrokerPortal' },
    { title: 'Configurações', view: 'canViewSettings', edit: 'canEditSettings' },
    { title: 'Gestão de Team', view: 'canManageUsers' },
    
    // Novas flags de visibilidade de módulos
    { title: 'Módulo de Mão de Obra / RH', view: 'canViewLabor' },
    { title: 'Módulo ÒPURA Offices', view: 'canViewOffices' },
    { title: 'Módulo ÒPURA Pro', view: 'canViewPro' },
    { title: 'Módulo Comercial & Vendas', view: 'canViewSales' },
    { title: 'Módulo Viabilidade Imobiliária (Imovib)', view: 'canViewImovib' },
    { title: 'Módulo Fiscal & NF-e', view: 'canViewFiscal' },
    { title: 'Módulo Qualidade & Pós-Obra', view: 'canViewQuality' },
    { title: 'Módulo Locações', view: 'canViewRentals' },
    { title: 'Módulo Estrutural (Aço/Ferragem)', view: 'canViewStructural' },
    { title: 'Módulo de Compliance / TTS', view: 'canViewCompliance', edit: 'canEditCompliance' }
];

const OrganizationUsers: React.FC<OrganizationUsersProps> = ({
    organizationId,
    members = [],
    onUpdateMembers,
    customRoles = [],
    onUpdateCustomRoles,
    onUpdateAll
}) => {
    const { currentProfile, session, organizations } = useStore();
    const currentOrg = organizations.find(o => o.id === organizationId);
    
    const userEmail = session?.user?.email?.toLowerCase() || '';
    const isDevEmail = userEmail === 'altair.rosa@alpaconstrutora.com.br';
    
    // O usuário é desenvolvedor?
    const isDeveloper = currentProfile?.group === 'DESENVOLVEDOR' || isDevEmail;
    
    // O usuário é admin na organização?
    const memberSelf = members.find(m => m.email.toLowerCase() === userEmail);
    const isAdmin = memberSelf?.role === 'admin' || isDeveloper || isDevEmail;

    const [activeSubTab, setActiveSubTab] = useState<'members' | 'roles' | 'visibility'>('members');
    const memberColumns = useTableColumns(MEMBER_COLUMNS, 'organizationUsersMembersColumns');
    const sortedMembers = React.useMemo(() => {
        const dir = memberColumns.sortDirection === 'asc' ? 1 : -1;
        if (memberColumns.sortColumn === 'name') {
            return [...members].sort((a, b) => a.name.localeCompare(b.name) * dir);
        }
        if (memberColumns.sortColumn === 'email') {
            return [...members].sort((a, b) => a.email.localeCompare(b.email) * dir);
        }
        if (memberColumns.sortColumn === 'joinedAt') {
            return [...members].sort((a, b) => (new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()) * dir);
        }
        return members;
    }, [members, memberColumns.sortColumn, memberColumns.sortDirection]);
    const confirm = useConfirm();
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };
    const [activeProductTab, setActiveProductTab] = useState<ProductContext>('platform');

    // Helper: normaliza module_visibility legado (flat) para a nova estrutura por produto
    const normalizeVisibility = (raw: any): ModuleVisibilityConfig => {
        if (!raw) return { platform: {}, pro: {}, offices: {} };
        if (raw.platform !== undefined || raw.pro !== undefined || raw.offices !== undefined) {
            return { platform: raw.platform || {}, pro: raw.pro || {}, offices: raw.offices || {} };
        }
        // Formato legado: tratar como configuração de 'platform'
        return { platform: raw as ProductModuleMap, pro: {}, offices: {} };
    };

    // Visibilidade de Módulos State
    const [visibilitySettings, setVisibilitySettings] = useState<ModuleVisibilityConfig>(() =>
        normalizeVisibility(currentOrg?.settings?.module_visibility)
    );

    React.useEffect(() => {
        if (currentOrg?.settings?.module_visibility !== undefined) {
            setVisibilitySettings(normalizeVisibility(currentOrg.settings.module_visibility));
        }
    }, [currentOrg]);

    const handleToggleVisibility = (roleId: string, moduleKey: string) => {
        setVisibilitySettings(prev => {
            const productMap: ProductModuleMap = { ...(prev[activeProductTab] || {}) };
            const defaults: Record<string, boolean> = {};
            MODULES_BY_PRODUCT[activeProductTab].forEach(m => { defaults[m.key] = true; });
            const roleSettings = productMap[roleId] || defaults;
            return {
                ...prev,
                [activeProductTab]: {
                    ...productMap,
                    [roleId]: {
                        ...roleSettings,
                        [moduleKey]: roleSettings[moduleKey] === false ? true : false
                    }
                }
            };
        });
    };

    const getVisibility = (roleId: string, moduleKey: string): boolean => {
        const productMap = visibilitySettings[activeProductTab] || {};
        const roleSettings = productMap[roleId];
        if (roleSettings && roleSettings[moduleKey] !== undefined) return roleSettings[moduleKey];
        return true;
    };

    const handleSaveVisibility = async () => {
        try {
            const updatedSettings = {
                ...(currentOrg?.settings || {}),
                module_visibility: visibilitySettings as any
            };
            onUpdateAll({ settings: updatedSettings });
            notify('Configurações de visibilidade de módulos atualizadas com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao salvar visibilidade de módulos:', error);
            notify('Ocorreu um erro ao salvar as configurações.', 'error');
        }
    };

    // Member State
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [newMemberEmail, setNewMemberEmail] = useState('');
    const [newMemberRole, setNewMemberRole] = useState<OrganizationRole>('member');
    const [newMemberCustomRoleId, setNewMemberCustomRoleId] = useState<string>('');
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberPermissions, setNewMemberPermissions] = useState<UserPermissions>(getDefaultPermissions('member'));
    const [newMemberProductContext, setNewMemberProductContext] = useState<ProductContext>('platform');
    const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

    // Edit member state
    const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);
    const [editMemberName, setEditMemberName] = useState('');
    const [editMemberEmail, setEditMemberEmail] = useState('');
    const [editMemberRole, setEditMemberRole] = useState<OrganizationRole>('member');
    const [editMemberProductContext, setEditMemberProductContext] = useState<ProductContext>('platform');

    // Invite loading state
    const [isInviting, setIsInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);

    // Role State
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
    const [roleFormData, setRoleFormData] = useState<Omit<OrganizationCustomRole, 'id'>>({
        name: '',
        permissions: getDefaultPermissions('member')
    });

    const handleRoleChangeWithDefaults = (role: OrganizationRole) => {
        setNewMemberRole(role);
        setNewMemberCustomRoleId('');
        setNewMemberPermissions(getDefaultPermissions(role));
    };

    const handleCustomRoleSelect = (roleId: string) => {
        setNewMemberCustomRoleId(roleId);
        const selectedRole = customRoles.find(r => r.id === roleId);
        if (selectedRole) {
            setNewMemberPermissions(selectedRole.permissions);
        } else {
            // If "Nenhum" is selected, reset to default member permissions
            setNewMemberPermissions(getDefaultPermissions('member'));
        }
    };

    const togglePermission = (perm: keyof UserPermissions) => {
        setNewMemberPermissions(prev => ({
            ...prev,
            [perm]: !prev[perm]
        }));
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsInviting(true);
        setInviteError(null);

        const newMember: OrganizationMember = {
            id: crypto.randomUUID(),
            name: newMemberName,
            email: newMemberEmail,
            role: newMemberRole,
            customRoleId: newMemberCustomRoleId || undefined,
            joinedAt: new Date().toISOString(),
            permissions: newMemberPermissions,
            productContext: newMemberProductContext,
        };

        let emailError: string | null = null;
        try {
            if (organizationId) {
                const { error: fnError } = await supabase.functions.invoke('invite-member', {
                    body: { email: newMemberEmail, name: newMemberName, organizationId, role: newMemberRole },
                });
                if (fnError) emailError = fnError.message;
            }
        } catch (err: unknown) {
            emailError = err instanceof Error ? err.message : 'Erro desconhecido';
        } finally {
            setIsInviting(false);
        }

        // Always add the member to the local list
        onUpdateMembers([...members, newMember]);

        if (emailError) {
            setInviteError(`Membro adicionado, mas o e-mail de convite não pôde ser enviado: ${emailError}`);
            // Leave modal open so user can see the warning
        } else {
            setIsInviteModalOpen(false);
            resetInviteForm();
        }
    };

    const resetInviteForm = () => {
        setNewMemberEmail('');
        setNewMemberRole('member');
        setNewMemberCustomRoleId('');
        setNewMemberName('');
        setNewMemberPermissions(getDefaultPermissions('member'));
        setNewMemberProductContext('platform');
    };

    const handleOpenEditMember = (member: OrganizationMember) => {
        setEditMemberName(member.name);
        setEditMemberEmail(member.email);
        setEditMemberRole(member.role);
        setEditMemberProductContext(member.productContext || 'platform');
        setEditingMember(member);
    };

    const handleResendInvite = async (member: OrganizationMember) => {
        if (!organizationId) return;
        const { data, error } = await supabase.functions.invoke('invite-member', {
            body: { email: member.email, name: member.name, organizationId, role: member.role, resend: true },
        });
        if (error) {
            // Try to read the actual error message from the JSON body
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ctx = (error as any).context;
            let msg = error.message;
            try {
                const body = ctx ? await ctx.json() : null;
                if (body?.error) msg = body.error;
            } catch { /* ignore */ }
            notify(`Não foi possível reenviar o convite: ${msg}`, 'error');
        } else if (data?.error) {
            notify(`Não foi possível reenviar o convite: ${data.error}`, 'error');
        } else if (data?.alreadyConfirmed) {
            notify(`${member.email} já possui conta ativa no sistema.`, 'error');
        } else {
            notify(`Convite reenviado para ${member.email}`, 'success');
        }
    };

    const handleSaveEditMember = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMember) return;
        onUpdateMembers(members.map(m =>
            m.id === editingMember.id
                ? { ...m, name: editMemberName, email: editMemberEmail.trim().toLowerCase(), role: editMemberRole, productContext: editMemberProductContext, permissions: getDefaultPermissions(editMemberRole) }
                : m
        ));
        setEditingMember(null);
    };

    const handleRemoveMember = async (id: string) => {
        const ok = await confirm({
            title: 'Remover membro?',
            message: 'Tem certeza que deseja remover este membro da organização?',
            variant: 'danger',
            confirmLabel: 'Remover',
        });
        if (!ok) return;
        onUpdateMembers(members.filter(m => m.id !== id));
        notify('Membro removido.', 'success');
    };

    const handleMemberRoleChange = (id: string, newRole: OrganizationRole) => {
        onUpdateMembers(members.map(m =>
            m.id === id ? {
                ...m,
                role: newRole,
                customRoleId: undefined,
                permissions: getDefaultPermissions(newRole)
            } : m
        ));
    };

    const handleToggleMemberPermission = (userId: string, perm: keyof UserPermissions) => {
        onUpdateMembers(members.map(m => {
            if (m.id === userId) {
                const currentPerms = m.permissions || getDefaultPermissions(m.role);
                return {
                    ...m,
                    customRoleId: undefined, // Clear template link if manually overridden
                    permissions: { ...currentPerms, [perm]: !currentPerms[perm] }
                };
            }
            return m;
        }));
    };

    // Role Management
    const handleSaveRole = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingRoleId) {
            const updatedRoles = customRoles.map(r =>
                r.id === editingRoleId ? { ...roleFormData, id: editingRoleId } : r
            );
            // Perform a single update to the parent to avoid race conditions
            onUpdateAll({
                customRoles: updatedRoles,
                members: members.map(m =>
                    m.customRoleId === editingRoleId ? { ...m, permissions: roleFormData.permissions } : m
                )
            });
        } else {
            const newRole = { ...roleFormData, id: crypto.randomUUID() };
            onUpdateCustomRoles([...customRoles, newRole]);
        }
        setIsRoleModalOpen(false);
        setEditingRoleId(null);
        setRoleFormData({ name: '', permissions: getDefaultPermissions('member') });
    };

    const handleEditRole = (role: OrganizationCustomRole) => {
        setEditingRoleId(role.id);
        setRoleFormData({ name: role.name, permissions: role.permissions });
        setIsRoleModalOpen(true);
    };

    const handleDeleteRole = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir cargo?',
            message: 'Usuários vinculados manterão suas permissões atuais mas perderão o vínculo com este cargo.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        onUpdateCustomRoles(customRoles.filter(r => r.id !== id));
        onUpdateMembers(members.map(m =>
            m.customRoleId === id ? { ...m, customRoleId: undefined } : m
        ));
        notify('Cargo excluído.', 'success');
    };

    const PermissionCheckbox = ({
        label,
        checked,
        onChange,
        description
    }: {
        label: string;
        checked: boolean | undefined;
        onChange: () => void;
        description: string;
    }) => (
        <div className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer" onClick={onChange}>
            <div className={`mt-1 w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
                {checked && <Check className="w-3 h-3 text-white" />}
            </div>
            <div>
                <div className="text-sm font-medium text-gray-900">{label}</div>
                <div className="text-xs text-gray-500">{description}</div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Usuários</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie membros, cargos customizados e visibilidade de módulos.</p>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveSubTab('members')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeSubTab === 'members' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Users className="w-4 h-4 inline mr-2" />
                        Membros
                    </button>
                    <button
                        onClick={() => setActiveSubTab('roles')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeSubTab === 'roles' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Briefcase className="w-4 h-4 inline mr-2" />
                        Cargos Customizados
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setActiveSubTab('visibility')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeSubTab === 'visibility' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Shield className="w-4 h-4 inline mr-2" />
                            Visibilidade de Módulos
                        </button>
                    )}
                </div>
                {activeSubTab === 'members' ? (
                    <button
                        onClick={() => setIsInviteModalOpen(true)}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Convidar membro
                    </button>
                ) : activeSubTab === 'roles' ? (
                    <button
                        onClick={() => {
                            setEditingRoleId(null);
                            setRoleFormData({ name: '', permissions: getDefaultPermissions('member') });
                            setIsRoleModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo cargo
                    </button>
                ) : (
                    <button
                        onClick={handleSaveVisibility}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Save className="w-4 h-4" />
                        Salvar configurações
                    </button>
                )}
            </div>

            {activeSubTab === 'members' ? (
                <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <SortableHeader label="Membro" colKey="name" sortable={true} uppercase={false} sortColumn={memberColumns.sortColumn} sortDirection={memberColumns.sortDirection} onSort={memberColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                <SortableHeader label="Email" colKey="email" sortable={true} uppercase={false} sortColumn={memberColumns.sortColumn} sortDirection={memberColumns.sortDirection} onSort={memberColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                {/* Função/Cargo composta (papel + nome do cargo customizado) — sem valor único pra ordenar (§6.3). */}
                                <SortableHeader label="Função / Cargo" colKey="role" sortable={false} uppercase={false} className="px-6 py-2 border-r border-gray-100" />
                                <SortableHeader label="Entrou em" colKey="joinedAt" sortable={true} uppercase={false} sortColumn={memberColumns.sortColumn} sortDirection={memberColumns.sortDirection} onSort={memberColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {sortedMembers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">
                                        Nenhum membro encontrado.
                                    </td>
                                </tr>
                            ) : (
                                sortedMembers.map((member) => (
                                    <React.Fragment key={member.id}>
                                        <tr className="hover:bg-blue-50/50 transition-colors">
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-semibold text-xs shrink-0">
                                                        {member.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <p className="text-sm font-normal text-gray-900">{member.name}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="flex items-center gap-1.5 text-sm text-gray-500 font-normal">
                                                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                                                    {member.email}
                                                </div>
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="flex flex-col gap-1">
                                                    {/* Select editável inline — MESMA tipografia do TD comum (§7.1),
                                                        nunca pílula/caixa-alta/peso pesado só porque parece um chip
                                                        (era exatamente esse erro que já vazou em BankReconciliation.tsx). */}
                                                    <select
                                                        value={member.role}
                                                        onChange={(e) => handleMemberRoleChange(member.id, e.target.value as OrganizationRole)}
                                                        className="w-fit text-sm font-normal text-gray-900 bg-gray-50 border border-gray-100 rounded px-2 py-1 outline-none cursor-pointer"
                                                    >
                                                        <option value="admin">Admin</option>
                                                        <option value="member">Membro</option>
                                                        <option value="viewer">Visitante</option>
                                                    </select>
                                                    {member.customRoleId && (
                                                        <span className="text-xs font-medium text-gray-400">
                                                            Cargo: {customRoles.find(r => r.id === member.customRoleId)?.name || 'Customizado'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {new Date(member.joinedAt).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEditMember(member)}
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        Editar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingMemberId(editingMemberId === member.id ? null : member.id)}
                                                        className={`p-1.5 rounded-lg transition-colors ${editingMemberId === member.id ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                                        title="Permissões"
                                                    >
                                                        <Shield className="w-4 h-4" />
                                                    </button>
                                                    <InlineDisclosureMenu
                                                        menuItems={[
                                                            { icon: <Send className="w-[18px] h-[18px]" />, label: 'Reenviar convite', onClick: () => handleResendInvite(member) },
                                                        ]}
                                                        showDelete
                                                        onDelete={() => handleRemoveMember(member.id)}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                        {editingMemberId === member.id && (
                                            <tr className="bg-gray-50/50">
                                                <td colSpan={4} className="px-6 py-4">
                                                    <div className="bg-white rounded-lg border border-gray-200 shadow-inner overflow-hidden">
                                                        <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                                            <div className="text-sm font-bold text-gray-700">Permissões Detalhadas</div>
                                                            <div className="text-xs text-gray-400 font-bold uppercase tracking-widest">Controle de Acesso por Módulo</div>
                                                        </div>
                                                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-8 gap-x-12">
                                                            {DETAILED_PERMISSIONS.map((module) => (
                                                                <div key={module.title} className="space-y-4">
                                                                    <div className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">{module.title}</div>
                                                                    <div className="space-y-2">
                                                                        <PermissionCheckbox
                                                                            label="Visualizar"
                                                                            checked={!!(member.permissions?.[module.view as keyof UserPermissions] ?? getDefaultPermissions(member.role)[module.view as keyof UserPermissions])}
                                                                            onChange={() => handleToggleMemberPermission(member.id, module.view as keyof UserPermissions)}
                                                                            description={`Permite ver o módulo ${module.title}.`}
                                                                        />
                                                                        {module.edit && (
                                                                            <PermissionCheckbox
                                                                                label="Editar"
                                                                                checked={!!(member.permissions?.[module.edit as keyof UserPermissions] ?? getDefaultPermissions(member.role)[module.edit as keyof UserPermissions])}
                                                                                onChange={() => handleToggleMemberPermission(member.id, module.edit as keyof UserPermissions)}
                                                                                description={`Permite salvar alterações no módulo ${module.title}.`}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            ) : activeSubTab === 'roles' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {customRoles.length === 0 ? (
                        <div className="col-span-full py-12 bg-white rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400">
                            <Briefcase className="w-12 h-12 mb-2 opacity-20" />
                            <p>Nenhum cargo customizado criado.</p>
                            <button
                                onClick={() => {
                                    setEditingRoleId(null);
                                    setRoleFormData({ name: '', permissions: getDefaultPermissions('member') });
                                    setIsRoleModalOpen(true);
                                }}
                                className="mt-4 text-blue-600 hover:underline font-medium"
                            >
                                Criar o primeiro template
                            </button>
                        </div>
                    ) : (
                        customRoles.map(role => (
                            <div key={role.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all group">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{role.name}</h4>
                                    <InlineDisclosureMenu
                                        menuItems={[
                                            {
                                                icon: <SettingsIcon className="w-[18px] h-[18px]" />,
                                                label: 'Editar Cargo',
                                                onClick: () => handleEditRole(role),
                                            },
                                        ]}
                                        showDelete
                                        onDelete={() => handleDeleteRole(role.id)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1">
                                        {Object.entries(role.permissions)
                                            .filter(([key, val]) => val && key.startsWith('canEdit'))
                                            .slice(0, 3)
                                            .map(([key], i, arr) => (
                                                <span key={key} className="text-xs font-normal text-emerald-700">
                                                    {key.replace('canEdit', '')}{i < arr.length - 1 ? ',' : ''}
                                                </span>
                                            ))}
                                        {Object.values(role.permissions).filter(v => v).length > 3 && (
                                            <span className="text-[9px] text-gray-400 font-medium">+{Object.values(role.permissions).filter(v => v).length - 3} mais</span>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-50 text-xs text-gray-400 italic">
                                    {members.filter(m => m.customRoleId === role.id).length} membros vinculados
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                // ── Visibilidade de Módulos por Produto ─────────────────────────────
                <div className="space-y-6 animate-in fade-in duration-300">
                    {/* Aviso informativo */}
                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl text-sm text-indigo-700 flex items-start gap-3">
                        <Shield className="w-5 h-5 mt-0.5 shrink-0 text-indigo-600" />
                        <div>
                            <strong className="block font-bold mb-1">Painel de Controle de Visibilidade</strong>
                            Defina quais módulos ficam visíveis para cada cargo em cada produto Òpura. Administradores sempre têm acesso total. Salve ao terminar.
                        </div>
                    </div>

                    {/* Tabs de produto */}
                    <div className="flex gap-2 flex-wrap">
                        {PRODUCTS.map(p => {
                            const isActive = activeProductTab === p.id;
                            const colorMap: Record<string, string> = {
                                blue:   isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'   : 'bg-blue-50 text-blue-600 hover:bg-blue-100',
                                orange: isActive ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-orange-50 text-orange-600 hover:bg-orange-100',
                                violet: isActive ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'bg-violet-50 text-violet-600 hover:bg-violet-100',
                            };
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => setActiveProductTab(p.id)}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${ colorMap[p.color] }`}
                                >
                                    <span>{p.icon}</span>
                                    <div className="text-left">
                                        <div className="font-black text-xs uppercase tracking-widest">{p.label}</div>
                                        {isActive && <div className="text-[9px] font-medium opacity-80">{p.description}</div>}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Matriz para o produto ativo */}
                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    <th className="px-6 py-4 min-w-[280px]">Módulo / Recurso</th>
                                    <th className="px-6 py-4 text-center">
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span>Administrador</span>
                                            <span className="text-[9px] text-emerald-500 font-black uppercase">Sempre ativo</span>
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 text-center">Membro</th>
                                    <th className="px-6 py-4 text-center">Visualizador</th>
                                    {customRoles.map(role => (
                                        <th key={role.id} className="px-6 py-4 text-center truncate max-w-[150px]">{role.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                                {MODULES_BY_PRODUCT[activeProductTab].map(modItem => (
                                    <tr key={modItem.key} className="hover:bg-gray-50/40 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-normal text-gray-900">{modItem.label}</div>
                                            <div className="text-xs text-gray-400 font-medium">{modItem.description}</div>
                                        </td>
                                        {/* Admin: sempre habilitado */}
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center">
                                                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                                    <Check className="w-3 h-3 text-emerald-600" />
                                                </div>
                                            </div>
                                        </td>
                                        {/* Membro */}
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center">
                                                <input type="checkbox"
                                                    checked={getVisibility('member', modItem.key)}
                                                    onChange={() => handleToggleVisibility('member', modItem.key)}
                                                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                        </td>
                                        {/* Visualizador */}
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center">
                                                <input type="checkbox"
                                                    checked={getVisibility('viewer', modItem.key)}
                                                    onChange={() => handleToggleVisibility('viewer', modItem.key)}
                                                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                        </td>
                                        {/* Cargos customizados */}
                                        {customRoles.map(role => (
                                            <td key={role.id} className="px-6 py-4 text-center">
                                                <div className="flex justify-center">
                                                    <input type="checkbox"
                                                        checked={getVisibility(role.id, modItem.key)}
                                                        onChange={() => handleToggleVisibility(role.id, modItem.key)}
                                                        className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-end pt-4">
                        <button
                            type="button"
                            onClick={handleSaveVisibility}
                            className="flex items-center px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-lg text-sm font-bold active:scale-95"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Salvar Visibilidade — {PRODUCTS.find(p => p.id === activeProductTab)?.label}
                        </button>
                    </div>
                </div>
            )}


            {/* Edit Member Modal */}
            {editingMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-in fade-in zoom-in duration-200 border border-gray-200">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900">Editar Membro</h3>
                            <button onClick={() => setEditingMember(null)} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSaveEditMember} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                <input type="text" required value={editMemberName} onChange={(e) => setEditMemberName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                                <input type="email" required value={editMemberEmail} onChange={(e) => setEditMemberEmail(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Função</label>
                                <select value={editMemberRole} onChange={(e) => setEditMemberRole(e.target.value as OrganizationRole)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="admin">Administrador</option>
                                    <option value="member">Membro</option>
                                    <option value="viewer">Visualizador</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Produto Òpura</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {PRODUCTS.map(p => (
                                        <button key={p.id} type="button"
                                            onClick={() => setEditMemberProductContext(p.id)}
                                            className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all text-table-header font-bold ${
                                                editMemberProductContext === p.id
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                            }`}>
                                            <span className="text-lg">{p.icon}</span>
                                            <span>{p.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setEditingMember(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                                <Button type="submit">Salvar</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {isInviteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200 overflow-hidden border border-gray-200">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900">Convidar Novo Membro</h3>
                            <button onClick={() => setIsInviteModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">

                            <form onSubmit={handleInvite} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                        <input
                                            type="text"
                                            required
                                            value={newMemberName}
                                            onChange={(e) => setNewMemberName(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="Nome"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                                        <input
                                            type="email"
                                            required
                                            value={newMemberEmail}
                                            onChange={(e) => setNewMemberEmail(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="email@empresa.com"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Função Base</label>
                                        <select value={newMemberRole} onChange={(e) => handleRoleChangeWithDefaults(e.target.value as OrganizationRole)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                                            <option value="member">Membro</option>
                                            <option value="admin">Administrador</option>
                                            <option value="viewer">Visualizador</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Cargo Template (Opcional)</label>
                                        <select value={newMemberCustomRoleId} onChange={(e) => handleCustomRoleSelect(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                                            <option value="">Nenhum (Usar Permissões Customizadas)</option>
                                            {customRoles.map(role => (
                                                <option key={role.id} value={role.id}>{role.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Produto Òpura */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Produto Òpura</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {PRODUCTS.map(p => (
                                            <button key={p.id} type="button"
                                                onClick={() => setNewMemberProductContext(p.id)}
                                                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-button font-bold ${
                                                    newMemberProductContext === p.id
                                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                                }`}>
                                                <span className="text-xl">{p.icon}</span>
                                                <span className="font-black text-xs uppercase tracking-wide">{p.label}</span>
                                                <span className="text-[9px] text-gray-400 text-center leading-tight">{p.description}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="block text-sm font-medium text-gray-700">Revisão de Permissões</label>
                                    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12 max-h-[400px] overflow-y-auto">
                                            {DETAILED_PERMISSIONS.map((module) => (
                                                <div key={module.title} className="space-y-4">
                                                    <div className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">{module.title}</div>
                                                    <div className="space-y-2">
                                                        <PermissionCheckbox
                                                            label="Visualizar"
                                                            checked={!!newMemberPermissions[module.view as keyof UserPermissions]}
                                                            onChange={() => togglePermission(module.view as keyof UserPermissions)}
                                                            description=""
                                                        />
                                                        {module.edit && (
                                                            <PermissionCheckbox
                                                                label="Editar"
                                                                checked={!!newMemberPermissions[module.edit as keyof UserPermissions]}
                                                                onChange={() => togglePermission(module.edit as keyof UserPermissions)}
                                                                description=""
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {inviteError && (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                                        {inviteError}
                                    </div>
                                )}
                                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 mt-6">
                                    <button type="button" onClick={() => { setIsInviteModalOpen(false); setInviteError(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                                    <Button type="submit" disabled={isInviting}>
                                        {isInviting ? 'Enviando...' : 'Enviar Convite'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Role Modal */}
            {isRoleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200 overflow-hidden border border-gray-200">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900">{editingRoleId ? 'Editar Cargo' : 'Criar Novo Cargo Template'}</h3>
                            <button onClick={() => setIsRoleModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">

                            <form onSubmit={handleSaveRole} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cargo</label>
                                    <input
                                        type="text"
                                        required
                                        value={roleFormData.name}
                                        onChange={(e) => setRoleFormData(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Ex: Engenheiro Junior"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700">Permissões do Template</label>
                                    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                                        <div className="p-6 grid grid-cols-1 gap-y-8 max-h-[400px] overflow-y-auto">
                                            {DETAILED_PERMISSIONS.map((module) => (
                                                <div key={module.title} className="space-y-4">
                                                    <div className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">{module.title}</div>
                                                    <div className="space-y-2">
                                                        <PermissionCheckbox
                                                            label="Visualizar"
                                                            checked={!!roleFormData.permissions[module.view as keyof UserPermissions]}
                                                            onChange={() => setRoleFormData(prev => ({
                                                                ...prev,
                                                                permissions: { ...prev.permissions, [module.view as keyof UserPermissions]: !prev.permissions[module.view as keyof UserPermissions] }
                                                            }))}
                                                            description=""
                                                        />
                                                        {module.edit && (
                                                            <PermissionCheckbox
                                                                label="Editar"
                                                                checked={!!roleFormData.permissions[module.edit as keyof UserPermissions]}
                                                                onChange={() => setRoleFormData(prev => ({
                                                                    ...prev,
                                                                    permissions: { ...prev.permissions, [module.edit as keyof UserPermissions]: !prev.permissions[module.edit as keyof UserPermissions] }
                                                                }))}
                                                                description=""
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 mt-6">
                                    <button type="button" onClick={() => setIsRoleModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                                    <Button type="submit">Salvar Template</Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default OrganizationUsers;
