import React, { useState } from 'react';
import { OrganizationMember, OrganizationRole, UserPermissions, OrganizationCustomRole } from '../types';
import { User, Plus, Trash2, Shield, MoreVertical, Mail, Check, X, Settings as SettingsIcon, ChevronDown, ChevronUp, Briefcase, Users, Edit2 } from 'lucide-react';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { supabase } from '../lib/supabase';

interface OrganizationUsersProps {
    organizationId?: string;
    members: OrganizationMember[];
    onUpdateMembers: (updatedMembers: OrganizationMember[]) => void;
    customRoles: OrganizationCustomRole[];
    onUpdateCustomRoles: (updatedRoles: OrganizationCustomRole[]) => void;
    onUpdateAll: (updates: { members?: OrganizationMember[], customRoles?: OrganizationCustomRole[] }) => void;
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
        canManageUsers: false
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

const OrganizationUsers: React.FC<OrganizationUsersProps> = ({
    organizationId,
    members = [],
    onUpdateMembers,
    customRoles = [],
    onUpdateCustomRoles,
    onUpdateAll
}) => {
    const [activeSubTab, setActiveSubTab] = useState<'members' | 'roles'>('members');

    // Member State
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [newMemberEmail, setNewMemberEmail] = useState('');
    const [newMemberRole, setNewMemberRole] = useState<OrganizationRole>('member');
    const [newMemberCustomRoleId, setNewMemberCustomRoleId] = useState<string>('');
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberPermissions, setNewMemberPermissions] = useState<UserPermissions>(getDefaultPermissions('member'));
    const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

    // Edit member state
    const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);
    const [editMemberName, setEditMemberName] = useState('');
    const [editMemberRole, setEditMemberRole] = useState<OrganizationRole>('member');

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
            permissions: newMemberPermissions
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
    };

    const handleOpenEditMember = (member: OrganizationMember) => {
        setEditMemberName(member.name);
        setEditMemberRole(member.role);
        setEditingMember(member);
    };

    const handleResendInvite = async (member: OrganizationMember) => {
        if (!organizationId) return;
        try {
            const { error } = await supabase.functions.invoke('invite-member', {
                body: { email: member.email, name: member.name, organizationId, role: member.role },
            });
            if (error) {
                alert(`Não foi possível reenviar o convite: ${error.message}`);
            } else {
                alert(`Convite reenviado para ${member.email}`);
            }
        } catch {
            alert('Erro ao reenviar convite. Tente novamente.');
        }
    };

    const handleSaveEditMember = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMember) return;
        onUpdateMembers(members.map(m =>
            m.id === editingMember.id
                ? { ...m, name: editMemberName, role: editMemberRole, permissions: getDefaultPermissions(editMemberRole) }
                : m
        ));
        setEditingMember(null);
    };

    const handleRemoveMember = (id: string) => {
        if (confirm('Tem certeza que deseja remover este membro da organização?')) {
            onUpdateMembers(members.filter(m => m.id !== id));
        }
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

    const handleDeleteRole = (id: string) => {
        if (confirm('Tem certeza que deseja excluir este cargo? Usuários vinculados manterão suas permissões atuais mas perderão o vínculo.')) {
            onUpdateCustomRoles(customRoles.filter(r => r.id !== id));
            onUpdateMembers(members.map(m =>
                m.customRoleId === id ? { ...m, customRoleId: undefined } : m
            ));
        }
    };

    const getRoleBadgeColor = (role: OrganizationRole) => {
        switch (role) {
            case 'admin': return 'bg-purple-100 text-purple-700 border-purple-200';
            case 'member': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'viewer': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const PermissionCheckbox = ({
        label,
        checked,
        onChange,
        description
    }: {
        label: string;
        checked: boolean;
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
                </div>
                {activeSubTab === 'members' ? (
                    <button
                        onClick={() => setIsInviteModalOpen(true)}
                        className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Convidar Membro
                    </button>
                ) : (
                    <button
                        onClick={() => {
                            setEditingRoleId(null);
                            setRoleFormData({ name: '', permissions: getDefaultPermissions('member') });
                            setIsRoleModalOpen(true);
                        }}
                        className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Novo Cargo
                    </button>
                )}
            </div>

            {activeSubTab === 'members' ? (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Membro</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Função / Cargo</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entrou em</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {members.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                        Nenhum membro encontrado.
                                    </td>
                                </tr>
                            ) : (
                                members.map((member) => (
                                    <React.Fragment key={member.id}>
                                        <tr className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm mr-3">
                                                        {member.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-gray-900">{member.name}</div>
                                                        <div className="text-sm text-gray-500 flex items-center">
                                                            <Mail className="w-3 h-3 mr-1" />
                                                            {member.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <select
                                                        value={member.role}
                                                        onChange={(e) => handleMemberRoleChange(member.id, e.target.value as OrganizationRole)}
                                                        className={`w-fit px-2 py-1 rounded-full text-[10px] font-bold border ${getRoleBadgeColor(member.role)} outline-none cursor-pointer`}
                                                    >
                                                        <option value="admin">ADMIN</option>
                                                        <option value="member">MEMBRO</option>
                                                        <option value="viewer">VISITANTE</option>
                                                    </select>
                                                    {member.customRoleId && (
                                                        <span className="text-[10px] text-gray-400 font-medium px-2 italic">
                                                            Cargo: {customRoles.find(r => r.id === member.customRoleId)?.name || 'Customizado'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {new Date(member.joinedAt).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        title="Editar membro"
                                                        onClick={() => handleOpenEditMember(member)}
                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Reenviar convite por e-mail"
                                                        onClick={() => handleResendInvite(member)}
                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                    >
                                                        <Mail className="w-4 h-4" />
                                                    </button>
                                                    <InlineDisclosureMenu
                                                        menuItems={[
                                                            {
                                                                icon: <Shield className="w-[18px] h-[18px]" />,
                                                                label: editingMemberId === member.id ? 'Fechar Permissões' : 'Permissões',
                                                                onClick: () => setEditingMemberId(editingMemberId === member.id ? null : member.id),
                                                            },
                                                        ]}
                                                        showDelete
                                                        onDelete={() => handleRemoveMember(member.id)}
                                                        deleteDisabledTitle="Remover membro"
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
                                                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Controle de Acesso por Módulo</div>
                                                        </div>
                                                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-8 gap-x-12">
                                                            {[
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
                                                                { title: 'Gestão de Team', view: 'canManageUsers' }
                                                            ].map((module) => (
                                                                <div key={module.title} className="space-y-4">
                                                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">{module.title}</div>
                                                                    <div className="space-y-2">
                                                                        <PermissionCheckbox
                                                                            label="Visualizar"
                                                                            checked={member.permissions?.[module.view as keyof UserPermissions] ?? getDefaultPermissions(member.role)[module.view as keyof UserPermissions]}
                                                                            onChange={() => handleToggleMemberPermission(member.id, module.view as keyof UserPermissions)}
                                                                            description={`Permite ver o módulo ${module.title}.`}
                                                                        />
                                                                        {module.edit && (
                                                                            <PermissionCheckbox
                                                                                label="Editar"
                                                                                checked={member.permissions?.[module.edit as keyof UserPermissions] ?? getDefaultPermissions(member.role)[module.edit as keyof UserPermissions]}
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
            ) : (
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
                                            .map(([key]) => (
                                                <span key={key} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded uppercase">
                                                    {key.replace('canEdit', '')}
                                                </span>
                                            ))}
                                        {Object.values(role.permissions).filter(v => v).length > 3 && (
                                            <span className="text-[9px] text-gray-400 font-medium">+{Object.values(role.permissions).filter(v => v).length - 3} mais</span>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-50 text-[10px] text-gray-400 italic">
                                    {members.filter(m => m.customRoleId === role.id).length} membros vinculados
                                </div>
                            </div>
                        ))
                    )}
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
                                <input
                                    type="text"
                                    required
                                    value={editMemberName}
                                    onChange={(e) => setEditMemberName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                                <input
                                    type="email"
                                    disabled
                                    value={editingMember.email}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed"
                                />
                                <p className="text-xs text-gray-400 mt-1">O e-mail não pode ser alterado pois é o identificador do membro.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Função</label>
                                <select
                                    value={editMemberRole}
                                    onChange={(e) => setEditMemberRole(e.target.value as OrganizationRole)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="admin">Administrador</option>
                                    <option value="member">Membro</option>
                                    <option value="viewer">Visualizador</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setEditingMember(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                                <button type="submit" className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-md shadow-blue-100">Salvar</button>
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
                                        <select
                                            value={newMemberRole}
                                            onChange={(e) => handleRoleChangeWithDefaults(e.target.value as OrganizationRole)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="member">Membro</option>
                                            <option value="admin">Administrador</option>
                                            <option value="viewer">Visualizador</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Cargo Template (Opcional)</label>
                                        <select
                                            value={newMemberCustomRoleId}
                                            onChange={(e) => handleCustomRoleSelect(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">Nenhum (Usar Permissões Customizadas)</option>
                                            {customRoles.map(role => (
                                                <option key={role.id} value={role.id}>{role.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="block text-sm font-medium text-gray-700">Revisão de Permissões</label>
                                    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12 max-h-[400px] overflow-y-auto">
                                            {[
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
                                                { title: 'Gestão de Team', view: 'canManageUsers' }
                                            ].map((module) => (
                                                <div key={module.title} className="space-y-4">
                                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">{module.title}</div>
                                                    <div className="space-y-2">
                                                        <PermissionCheckbox
                                                            label="Visualizar"
                                                            checked={newMemberPermissions[module.view as keyof UserPermissions]}
                                                            onChange={() => togglePermission(module.view as keyof UserPermissions)}
                                                            description=""
                                                        />
                                                        {module.edit && (
                                                            <PermissionCheckbox
                                                                label="Editar"
                                                                checked={newMemberPermissions[module.edit as keyof UserPermissions]}
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
                                    <button type="submit" disabled={isInviting} className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-md shadow-blue-100 disabled:opacity-60 disabled:cursor-not-allowed">
                                        {isInviting ? 'Enviando...' : 'Enviar Convite'}
                                    </button>
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
                                            {[
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
                                                { title: 'Gestão de Team', view: 'canManageUsers' }
                                            ].map((module) => (
                                                <div key={module.title} className="space-y-4">
                                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">{module.title}</div>
                                                    <div className="space-y-2">
                                                        <PermissionCheckbox
                                                            label="Visualizar"
                                                            checked={roleFormData.permissions[module.view as keyof UserPermissions]}
                                                            onChange={() => setRoleFormData(prev => ({
                                                                ...prev,
                                                                permissions: { ...prev.permissions, [module.view as keyof UserPermissions]: !prev.permissions[module.view as keyof UserPermissions] }
                                                            }))}
                                                            description=""
                                                        />
                                                        {module.edit && (
                                                            <PermissionCheckbox
                                                                label="Editar"
                                                                checked={roleFormData.permissions[module.edit as keyof UserPermissions]}
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
                                    <button type="submit" className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-md shadow-blue-100">Salvar Template</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrganizationUsers;
