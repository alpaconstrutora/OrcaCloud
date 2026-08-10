import React, { useState } from 'react';
import { OrganizationMember, OrganizationRole, UserPermissions, OrganizationCustomRole, ProductContext, ModuleVisibilityConfig, ProductModuleMap } from '../types';
import { User, Plus, Trash2, Shield, MoreVertical, Mail, Check, X, Settings as SettingsIcon, ChevronDown, ChevronUp, Briefcase, Users, Edit2, Send, Save, Building2, Palette, AlertCircle, Search, ArrowLeft, MoveHorizontal } from 'lucide-react';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';

// §6.3: toda coluna de valor único é ordenável. "Função / Cargo" é composta
// (papel + nome do cargo customizado opcional na mesma célula) — exceção
// legítima documentada, igual ao padrão de "Contato" em SupplierList.tsx.
const MEMBER_COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Membro', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'role', label: 'Função / Cargo', sortable: false },
    { key: 'joinedAt', label: 'Entrou em', sortable: true },
];

// Larguras default do redimensionamento (§6.1 do guia) — já próximas do
// container real (padrão de SupplierList.tsx), para não nascer truncando
// nome/email nem deixando faixa vazia grande antes do usuário mexer.
const MEMBER_COL_WIDTHS: Record<string, number> = {
    code: 118, name: 260, email: 300, role: 240, joinedAt: 150, actions: 220,
};

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `memberColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'role' (Função/Cargo) não tem valor único pra
// ordenar (§6.3).
const MEMBER_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    code: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    name: { label: 'Membro', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    email: { label: 'Email', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    role: { label: 'Função / Cargo', sortable: false, className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    joinedAt: { label: 'Entrou em', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `memberColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderMemberCell(
    key: string,
    member: OrganizationMember,
    ctx: { customRoles: OrganizationCustomRole[]; onRoleChange: (id: string, role: OrganizationRole) => void },
): React.ReactNode {
    switch (key) {
        case 'code':
            return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{member.code || '-'}</span>;
        case 'name':
            return (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-semibold text-xs shrink-0">
                        {member.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-sm font-normal text-gray-700 truncate">{member.name}</p>
                </div>
            );
        case 'email':
            return (
                <div className="flex items-center gap-1.5 text-sm text-gray-600 font-normal">
                    <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{member.email}</span>
                </div>
            );
        case 'role':
            return (
                <div className="flex flex-col gap-1">
                    {/* Select editável inline — MESMA tipografia do TD comum (§7.1),
                        nunca pílula/caixa-alta/peso pesado só porque parece um chip
                        (era exatamente esse erro que já vazou em BankReconciliation.tsx). */}
                    <select
                        value={member.role}
                        onChange={(e) => ctx.onRoleChange(member.id, e.target.value as OrganizationRole)}
                        className="w-fit text-sm font-normal text-gray-900 bg-gray-50 border border-gray-100 rounded px-2 py-1 outline-none cursor-pointer appearance-none transition-all"
                    >
                        <option value="admin">Admin</option>
                        <option value="member">Membro</option>
                        <option value="viewer">Visitante</option>
                    </select>
                    {member.customRoleId && (
                        <span className="text-xs font-medium text-gray-400">
                            Cargo: {ctx.customRoles.find(r => r.id === member.customRoleId)?.name || 'Customizado'}
                        </span>
                    )}
                </div>
            );
        case 'joinedAt':
            return <span className="text-sm font-normal text-gray-600">{new Date(member.joinedAt).toLocaleDateString('pt-BR')}</span>;
        default:
            return null;
    }
}

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
        canViewStructural: true,

        // Módulos adicionados junto com a expansão de DETAILED_PERMISSIONS.
        // Visualizar = true por padrão (o menu já filtra por produto/plano);
        // Editar fica false — quem edita é `member`/`admin`, abaixo.
        canViewCommandCenter: true,
        canViewTasks: true, canEditTasks: false,
        canViewNotifications: true,
        canViewBi: true,
        canViewOpuraReports: true,
        canViewCentralObra: true,
        canViewCentralCliente: true,
        canViewCentralFornecedor: true,
        canViewMarket: true,
        canViewGovernance: true, canEditGovernance: false,
        canViewOrganization: true, canEditOrganization: false,
        canViewClients: true, canEditClients: false,
        canViewSuppliers: true, canEditSuppliers: false,
        canViewInvestors: true, canEditInvestors: false,
        canViewBankAccounts: true, canEditBankAccounts: false,
        canViewCostCenters: true, canEditCostCenters: false,
        canViewChartOfAccounts: true, canEditChartOfAccounts: false,
        canViewAssets: true, canEditAssets: false,
        canViewDocs: true, canEditDocs: false,
        canViewProcesses: true, canEditProcesses: false,
        canViewMasterData: true, canEditMasterData: false,
        canViewProjects: true, canEditProjects: false,
        canViewMeasureAi: true, canEditMeasureAi: false,
        canEditStructural: false,
        canViewElectrical: true, canEditElectrical: false,
        canViewAreaEngine: true, canEditAreaEngine: false,
        canViewProjectTemplates: true, canEditProjectTemplates: false,
        canViewOperational: true, canEditOperational: false,
        canEditQuality: false,
        canViewWarranty: true, canEditWarranty: false,
        canEditLabor: false,
        canViewPayroll: true, canEditPayroll: false,
        canViewTimeTracking: true, canEditTimeTracking: false,
        canViewEsocial: true, canEditEsocial: false,
        canViewSst: true, canEditSst: false,
        canViewIncentives: true, canEditIncentives: false,
        canViewPartnerComp: true, canEditPartnerComp: false,
        canViewRecruitment: true, canEditRecruitment: false,
        canViewP2P: true, canEditP2P: false,
        canViewProcurementPlan: true, canEditProcurementPlan: false,
        canViewSupplyContracts: true, canEditSupplyContracts: false,
        canViewQuotations: true, canEditQuotations: false,
        canViewInventory: true, canEditInventory: false,
        canViewFpa: true, canEditFpa: false,
        canViewReceivables: true, canEditReceivables: false,
        canViewPayables: true, canEditPayables: false,
        canViewTaxPayables: true, canEditTaxPayables: false,
        canViewBoletos: true, canEditBoletos: false,
        canViewBankReconciliation: true, canEditBankReconciliation: false,
        canViewFinancialApproval: true, canEditFinancialApproval: false,
        canViewDunning: true, canEditDunning: false,
        canViewFinancialIntelligence: true,
        canViewControladoria: true, canEditControladoria: false,
        canEditFiscal: false,
        canViewAutomation: true, canEditAutomation: false,
        canEditSales: false,
        canEditRentals: false,
        canViewServiceContracts: true, canEditServiceContracts: false,
        canViewServicesCrm: true, canEditServicesCrm: false,
        canViewDevelopments: true, canEditDevelopments: false,
        canViewRegulatoryMap: true, canEditRegulatoryMap: false,
        canViewOpportunities: true, canEditOpportunities: false,
        canViewPlantaAi: true, canEditPlantaAi: false,
        canEditImovib: false,
        canViewAppraisal: true, canEditAppraisal: false,
        canViewPartnerPortal: true, canEditPartnerPortal: false,
        canEditPro: false,
        canEditOffices: false,
        canViewReformas: true, canEditReformas: false,
        canViewCno: true, canEditCno: false,
        // `canViewEcommerce` fica INTENCIONALMENTE ausente: Layout.checkModule dá
        // precedência à permissão do membro sobre a matriz de visibilidade da
        // organização. Defini-la aqui forçaria o módulo visível para todos.
    };

    switch (role) {
        case 'admin':
            return Object.keys(baseViewer).reduce((acc, key) => ({
                ...acc,
                [key]: true
            }), {} as UserPermissions);
        case 'member':
            // `member` = operacional: edita o que produz obra/compra/venda,
            // mas não mexe em cadastro mestre, organização, contábil, RH
            // sensível, aprovações nem configurações.
            return {
                ...baseViewer,
                canEditBudget: true,
                canEditCompositions: true,
                canEditPlanning: true,
                canEditDiary: true,
                canEditOrders: true,
                canEditReceipts: true,
                canEditFinancial: true,
                canEditTechnicalData: true,

                canEditTasks: true,
                canEditProjects: true,
                canEditMeasureAi: true,
                canEditStructural: true,
                canEditElectrical: true,
                canEditAreaEngine: true,
                canEditOperational: true,
                canEditQuality: true,
                canEditWarranty: true,
                canEditP2P: true,
                canEditProcurementPlan: true,
                canEditSupplyContracts: true,
                canEditQuotations: true,
                canEditInventory: true,
                canEditReceivables: true,
                canEditPayables: true,
                canEditBoletos: true,
                canEditBankReconciliation: true,
                canEditSales: true,
                canEditRentals: true,
                canEditServiceContracts: true,
                canEditServicesCrm: true,
                canEditDevelopments: true,
                canEditPlantaAi: true,
                canEditImovib: true,
                canEditAppraisal: true,
                canEditDocs: true,
                canEditProcesses: true,
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
    { id: 'ecommerce', label: 'E-commerce', icon: '🛡️', color: 'blue', description: 'Governança operacional e controle do regime TTS' },
];

// Módulos disponíveis por produto
const MODULES_BY_PRODUCT: Record<ProductContext, { key: string; label: string; description: string }[]> = {
    platform: [
        { key: 'obras',      label: 'Engenharia / Obras',               description: 'Obras, Orçamentos, Cronogramas e Composições' },
        { key: 'compras',    label: 'Suprimentos / Compras',            description: 'Pedidos, Cotações, Recebimento e Contratos' },
        { key: 'rh',         label: 'Mão de Obra / RH',                 description: 'Colaboradores, Equipes, Ponto, Folha e SST' },
        { key: 'crm',        label: 'Comercial & Vendas',               description: 'Espelho de vendas e CRM de serviços' },
        { key: 'rentals',    label: 'Comercial — Locações',             description: 'Gestão de locações, contratos de aluguel e inadimplência' },
        { key: 'incorporacao', label: 'Viabilidade Imobiliária',        description: 'Estudos e simulações financeiras de empreendimentos' },
        { key: 'fiscal',     label: 'Fiscal & NF-e',                    description: 'Notas fiscais eletrônicas e automação de impostos' },
        { key: 'quality',    label: 'Qualidade & Pós-Obra',             description: 'Qualidade de entrega, garantia e SLAs' },
        { key: 'pro',        label: 'ÒPURA Pro (Add-on)',               description: 'Modelos rápidos de orçamento para prestadores' },
        { key: 'offices',    label: 'ÒPURA Offices (Add-on)',           description: 'Projetos e especificações de arquitetura/design' },
        { key: 'ecommerce',  label: 'ÒPURA E-commerce (Add-on)',        description: 'Governança operacional e conformidade TTS' },
    ],
    pro: [
        { key: 'pro',        label: 'ÒPURA Pro',                        description: 'Modelos e estimativas rápidas de orçamento' },
    ],
    offices: [
        { key: 'offices',    label: 'ÒPURA Offices',                    description: 'Projetos e especificações de arquitetura/design' },
        { key: 'crm',        label: 'CRM de Serviços',                  description: 'Contratos e gestão de clientes de arquitetura' },
    ],
    ecommerce: [
        { key: 'ecommerce',  label: 'ÒPURA E-commerce',                 description: 'Dashboard de conformidade, mapa físico e checklists' },
    ],
};

// §19.1/§20: título e subtítulo mudam junto com a aba ativa — cada aba troca o
// assunto inteiro da tela (membros × cargos-template × visibilidade por papel).
const SUBTAB_HEADERS: Record<'members' | 'roles' | 'visibility', { title: string; subtitle: string }> = {
    members: { title: 'Usuários', subtitle: 'Gerencie os membros desta organização e suas permissões individuais.' },
    roles: { title: 'Cargos Customizados', subtitle: 'Templates de permissões reutilizáveis para aplicar a múltiplos membros.' },
    visibility: { title: 'Visibilidade de Módulos', subtitle: 'Defina quais módulos cada papel enxerga por padrão, por produto Òpura.' },
};

// Espelha a navegação real de `components/Layout.tsx`. Ao adicionar um item novo
// ao menu lateral, adicione a permissão correspondente aqui — e a chave em
// `UserPermissions` (types/users.ts) + o default em `getDefaultPermissions`.
const DETAILED_PERMISSIONS: { group: string; title: string; view: string; edit?: string }[] = [
    // --- Geral ---
    { group: 'Geral', title: 'Central de Controle', view: 'canViewCommandCenter' },
    { group: 'Geral', title: 'Minhas Tarefas', view: 'canViewTasks', edit: 'canEditTasks' },
    { group: 'Geral', title: 'Notificações', view: 'canViewNotifications' },

    // --- Inteligência de Negócios ---
    { group: 'Inteligência de Negócios', title: 'BI Executivo', view: 'canViewBi' },
    { group: 'Inteligência de Negócios', title: 'ÒPURA Relatórios', view: 'canViewOpuraReports' },
    { group: 'Inteligência de Negócios', title: 'Central de Obras', view: 'canViewCentralObra' },
    { group: 'Inteligência de Negócios', title: 'Central de Clientes', view: 'canViewCentralCliente' },
    { group: 'Inteligência de Negócios', title: 'Central de Fornecedores', view: 'canViewCentralFornecedor' },
    { group: 'Inteligência de Negócios', title: 'ÒPURA Market', view: 'canViewMarket' },
    { group: 'Inteligência de Negócios', title: 'Governança Corporativa', view: 'canViewGovernance', edit: 'canEditGovernance' },

    // --- Corporativo ---
    { group: 'Corporativo', title: 'Minha Organização', view: 'canViewOrganization', edit: 'canEditOrganization' },
    { group: 'Corporativo', title: 'Clientes', view: 'canViewClients', edit: 'canEditClients' },
    { group: 'Corporativo', title: 'Fornecedores', view: 'canViewSuppliers', edit: 'canEditSuppliers' },
    { group: 'Corporativo', title: 'Investidores', view: 'canViewInvestors', edit: 'canEditInvestors' },
    { group: 'Corporativo', title: 'Contas Bancárias', view: 'canViewBankAccounts', edit: 'canEditBankAccounts' },
    { group: 'Corporativo', title: 'Centros de Custo', view: 'canViewCostCenters', edit: 'canEditCostCenters' },
    { group: 'Corporativo', title: 'Plano de Contas', view: 'canViewChartOfAccounts', edit: 'canEditChartOfAccounts' },
    { group: 'Corporativo', title: 'Gestão de Ativos', view: 'canViewAssets', edit: 'canEditAssets' },
    { group: 'Corporativo', title: 'Gestão de Documentos', view: 'canViewDocs', edit: 'canEditDocs' },
    { group: 'Corporativo', title: 'Processos', view: 'canViewProcesses', edit: 'canEditProcesses' },
    { group: 'Corporativo', title: 'Cadastros (Dados Mestres)', view: 'canViewMasterData', edit: 'canEditMasterData' },

    // --- Engenharia ---
    { group: 'Engenharia', title: 'Obras', view: 'canViewProjects', edit: 'canEditProjects' },
    { group: 'Engenharia', title: 'Orçamento', view: 'canViewBudget', edit: 'canEditBudget' },
    { group: 'Engenharia', title: 'Composições', view: 'canViewCompositions', edit: 'canEditCompositions' },
    { group: 'Engenharia', title: 'Planejamento', view: 'canViewPlanning', edit: 'canEditPlanning' },
    { group: 'Engenharia', title: 'Relatórios de Engenharia', view: 'canViewReports', edit: 'canEditReports' },
    { group: 'Engenharia', title: 'Dados Técnicos', view: 'canViewTechnicalData', edit: 'canEditTechnicalData' },
    { group: 'Engenharia', title: 'Medição Inteligente', view: 'canViewMeasureAi', edit: 'canEditMeasureAi' },
    { group: 'Engenharia', title: 'Ferragem & Aço (Estrutural)', view: 'canViewStructural', edit: 'canEditStructural' },
    { group: 'Engenharia', title: 'Projetos Elétricos', view: 'canViewElectrical', edit: 'canEditElectrical' },
    { group: 'Engenharia', title: 'Áreas NBR 12721', view: 'canViewAreaEngine', edit: 'canEditAreaEngine' },
    { group: 'Engenharia', title: 'Tipos e Templates de Obra', view: 'canViewProjectTemplates', edit: 'canEditProjectTemplates' },

    // --- Operação de Obra ---
    { group: 'Operação de Obra', title: 'Controle Operacional', view: 'canViewOperational', edit: 'canEditOperational' },
    { group: 'Operação de Obra', title: 'Diário de Obra', view: 'canViewDiary', edit: 'canEditDiary' },
    { group: 'Operação de Obra', title: 'Qualidade e Entrega', view: 'canViewQuality', edit: 'canEditQuality' },
    { group: 'Operação de Obra', title: 'Pós-Obra e Garantia', view: 'canViewWarranty', edit: 'canEditWarranty' },

    // --- Recursos Humanos ---
    { group: 'Recursos Humanos', title: 'Mão de Obra / RH', view: 'canViewLabor', edit: 'canEditLabor' },
    { group: 'Recursos Humanos', title: 'Folha de Pagamento', view: 'canViewPayroll', edit: 'canEditPayroll' },
    { group: 'Recursos Humanos', title: 'Ponto e Banco de Horas', view: 'canViewTimeTracking', edit: 'canEditTimeTracking' },
    { group: 'Recursos Humanos', title: 'eSocial', view: 'canViewEsocial', edit: 'canEditEsocial' },
    { group: 'Recursos Humanos', title: 'SST e EPIs', view: 'canViewSst', edit: 'canEditSst' },
    { group: 'Recursos Humanos', title: 'Incentivos & Produtividade', view: 'canViewIncentives', edit: 'canEditIncentives' },
    { group: 'Recursos Humanos', title: 'Remuneração Societária', view: 'canViewPartnerComp', edit: 'canEditPartnerComp' },
    { group: 'Recursos Humanos', title: 'Recrutamento', view: 'canViewRecruitment', edit: 'canEditRecruitment' },

    // --- Suprimentos ---
    { group: 'Suprimentos', title: 'Fluxo Integrado (P2P)', view: 'canViewP2P', edit: 'canEditP2P' },
    { group: 'Suprimentos', title: 'Plano de Aquisições', view: 'canViewProcurementPlan', edit: 'canEditProcurementPlan' },
    { group: 'Suprimentos', title: 'Contratos de Suprimentos', view: 'canViewSupplyContracts', edit: 'canEditSupplyContracts' },
    { group: 'Suprimentos', title: 'Cotações', view: 'canViewQuotations', edit: 'canEditQuotations' },
    { group: 'Suprimentos', title: 'Pedidos', view: 'canViewOrders', edit: 'canEditOrders' },
    { group: 'Suprimentos', title: 'Recebimento', view: 'canViewReceipts', edit: 'canEditReceipts' },
    { group: 'Suprimentos', title: 'Almoxarifado', view: 'canViewInventory', edit: 'canEditInventory' },

    // --- Financeiro ---
    { group: 'Financeiro', title: 'Financeiro (Geral)', view: 'canViewFinancial', edit: 'canEditFinancial' },
    { group: 'Financeiro', title: 'FP&A', view: 'canViewFpa', edit: 'canEditFpa' },
    { group: 'Financeiro', title: 'Contas a Receber', view: 'canViewReceivables', edit: 'canEditReceivables' },
    { group: 'Financeiro', title: 'Contas a Pagar', view: 'canViewPayables', edit: 'canEditPayables' },
    { group: 'Financeiro', title: 'Tributos a Pagar', view: 'canViewTaxPayables', edit: 'canEditTaxPayables' },
    { group: 'Financeiro', title: 'Boletos', view: 'canViewBoletos', edit: 'canEditBoletos' },
    { group: 'Financeiro', title: 'Conciliação Bancária', view: 'canViewBankReconciliation', edit: 'canEditBankReconciliation' },
    { group: 'Financeiro', title: 'Aprovações Financeiras', view: 'canViewFinancialApproval', edit: 'canEditFinancialApproval' },
    { group: 'Financeiro', title: 'Cobrança Automática', view: 'canViewDunning', edit: 'canEditDunning' },
    { group: 'Financeiro', title: 'Inteligência Financeira', view: 'canViewFinancialIntelligence' },
    { group: 'Financeiro', title: 'Controladoria', view: 'canViewControladoria', edit: 'canEditControladoria' },
    { group: 'Financeiro', title: 'Fiscal e NF-e', view: 'canViewFiscal', edit: 'canEditFiscal' },
    { group: 'Financeiro', title: 'Automação', view: 'canViewAutomation', edit: 'canEditAutomation' },

    // --- Comercial ---
    { group: 'Comercial', title: 'Vendas de Ativos', view: 'canViewSales', edit: 'canEditSales' },
    { group: 'Comercial', title: 'Locações', view: 'canViewRentals', edit: 'canEditRentals' },
    { group: 'Comercial', title: 'Contratos de Serviço', view: 'canViewServiceContracts', edit: 'canEditServiceContracts' },
    { group: 'Comercial', title: 'CRM de Serviços', view: 'canViewServicesCrm', edit: 'canEditServicesCrm' },

    // --- Incorporação ---
    { group: 'Incorporação', title: 'Empreendimentos', view: 'canViewDevelopments', edit: 'canEditDevelopments' },
    { group: 'Incorporação', title: 'Mapa Regulatório', view: 'canViewRegulatoryMap', edit: 'canEditRegulatoryMap' },
    { group: 'Incorporação', title: 'Oportunidades', view: 'canViewOpportunities', edit: 'canEditOpportunities' },
    { group: 'Incorporação', title: 'Estudo de Massa (Planta IA)', view: 'canViewPlantaAi', edit: 'canEditPlantaAi' },
    { group: 'Incorporação', title: 'Estudos de Viabilidade (Imovib)', view: 'canViewImovib', edit: 'canEditImovib' },
    { group: 'Incorporação', title: 'Laudo de Avaliação', view: 'canViewAppraisal', edit: 'canEditAppraisal' },

    // --- Portais ---
    { group: 'Portais', title: 'Portal do Cliente', view: 'canViewClientPortal', edit: 'canEditClientPortal' },
    { group: 'Portais', title: 'Portal do Investidor', view: 'canViewInvestorPortal', edit: 'canEditInvestorPortal' },
    { group: 'Portais', title: 'Portal do Fornecedor', view: 'canViewSupplierPortal', edit: 'canEditSupplierPortal' },
    { group: 'Portais', title: 'Portal do Corretor', view: 'canViewBrokerPortal', edit: 'canEditBrokerPortal' },
    { group: 'Portais', title: 'Portal de Parceiros', view: 'canViewPartnerPortal', edit: 'canEditPartnerPortal' },

    // --- Especialidades ÒPURA ---
    { group: 'Especialidades ÒPURA', title: 'ÒPURA Pro', view: 'canViewPro', edit: 'canEditPro' },
    { group: 'Especialidades ÒPURA', title: 'ÒPURA Offices', view: 'canViewOffices', edit: 'canEditOffices' },
    { group: 'Especialidades ÒPURA', title: 'ÒPURA Reformas', view: 'canViewReformas', edit: 'canEditReformas' },
    { group: 'Especialidades ÒPURA', title: 'ÒPURA CNO e Previdência', view: 'canViewCno', edit: 'canEditCno' },
    { group: 'Especialidades ÒPURA', title: 'ÒPURA E-commerce / TTS', view: 'canViewEcommerce', edit: 'canEditEcommerce' },

    // --- Sistema ---
    { group: 'Sistema', title: 'Configurações', view: 'canViewSettings', edit: 'canEditSettings' },
    { group: 'Sistema', title: 'Gestão de Usuários', view: 'canManageUsers' },
];

// Ordem de exibição dos grupos = ordem em que aparecem na lista acima.
const PERMISSION_GROUPS: { group: string; modules: typeof DETAILED_PERMISSIONS }[] =
    DETAILED_PERMISSIONS.reduce((acc, module) => {
        const bucket = acc.find(g => g.group === module.group);
        if (bucket) bucket.modules.push(module);
        else acc.push({ group: module.group, modules: [module] });
        return acc;
    }, [] as { group: string; modules: typeof DETAILED_PERMISSIONS }[]);

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
    const [memberSearch, setMemberSearch] = usePersistedState<string>('organizationUsersMembersSearch', '');
    const memberColumns = useTableColumns(MEMBER_COLUMNS, 'organizationUsersMembersColumns');
    const cols = useResizableColumns(MEMBER_COL_WIDTHS, 'organizationUsersMembersColWidths');
    // NUNCA w-full/100% com table-layout:fixed — ver ui_ux_guia_unificado.md §6.1
    // (a largura precisa ser a soma exata das colunas visíveis).
    const memberTableTotalWidth = ['code', 'name', 'email', 'role', 'joinedAt']
        .reduce((sum, key) => sum + (memberColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0)
        + cols.getWidth('actions');
    const sortedMembers = React.useMemo(() => {
        const term = memberSearch.trim().toLowerCase();
        const filtered = !term ? members : members.filter(m =>
            m.name.toLowerCase().includes(term) ||
            m.email.toLowerCase().includes(term) ||
            (m.code || '').toLowerCase().includes(term)
        );
        const dir = memberColumns.sortDirection === 'asc' ? 1 : -1;
        if (memberColumns.sortColumn === 'code') {
            return [...filtered].sort((a, b) => (a.code || '').localeCompare(b.code || '', 'pt-BR', { numeric: true }) * dir);
        }
        if (memberColumns.sortColumn === 'name') {
            return [...filtered].sort((a, b) => a.name.localeCompare(b.name) * dir);
        }
        if (memberColumns.sortColumn === 'email') {
            return [...filtered].sort((a, b) => a.email.localeCompare(b.email) * dir);
        }
        if (memberColumns.sortColumn === 'joinedAt') {
            return [...filtered].sort((a, b) => (new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()) * dir);
        }
        return filtered;
    }, [members, memberSearch, memberColumns.sortColumn, memberColumns.sortDirection]);
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
    const [permissionsSearch, setPermissionsSearch] = usePersistedState<string>('orgUsers:permissionsSearch', '');

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
        // Ação (não leitura): o convite é sempre PARA uma organização específica.
        // Com "Todas as organizações" selecionado não há org de destino — avisa
        // em vez de falhar em silêncio (CLAUDE.md REGRA #5, caso 3).
        if (!organizationId) {
            notify('Selecione uma organização específica para reenviar o convite.', 'error');
            return;
        }
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

    /** Permissões efetivas do membro (as salvas, com o default do papel como fallback). */
    const effectivePerms = (member: OrganizationMember): UserPermissions => ({
        ...getDefaultPermissions(member.role),
        ...(member.permissions || {}),
    });

    const isGroupFullyChecked = (member: OrganizationMember, modules: typeof DETAILED_PERMISSIONS) => {
        const perms = effectivePerms(member);
        return modules.every(mod =>
            !!perms[mod.view as keyof UserPermissions] &&
            (!mod.edit || !!perms[mod.edit as keyof UserPermissions])
        );
    };

    /** Marca/desmarca de uma vez todas as permissões de um grupo de módulos. */
    const handleToggleMemberGroup = (member: OrganizationMember, modules: typeof DETAILED_PERMISSIONS) => {
        const next = !isGroupFullyChecked(member, modules);
        onUpdateMembers(members.map(m => {
            if (m.id !== member.id) return m;
            const currentPerms = m.permissions || getDefaultPermissions(m.role);
            const patch: Record<string, boolean> = {};
            modules.forEach(mod => {
                patch[mod.view] = next;
                if (mod.edit) patch[mod.edit] = next;
            });
            return {
                ...m,
                customRoleId: undefined, // igual ao toggle individual: quebra o vínculo com o template
                permissions: { ...currentPerms, ...patch },
            };
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

    // Membro cuja tela de Permissões Detalhadas está aberta — busca sempre a versão
    // fresca em `members` (não uma cópia presa no momento do clique), já que cada
    // toggle de checkbox atualiza `members` via onUpdateMembers.
    const permissionsMember = editingMemberId ? members.find(m => m.id === editingMemberId) || null : null;

    // Tela dedicada de Permissões Detalhadas — troca o conteúdo da aba "Membros"
    // pelo detalhe, no mesmo padrão de lista→detalhe já usado em
    // ContractDetailView.tsx (seta "voltar" + <h1>, sem overlay/backdrop, o
    // shell/sidebar continua visível). NÃO é modal, painel lateral nem tela cheia.
    if (permissionsMember) {
        const permissionsSearchNormalized = permissionsSearch.trim().toLowerCase();
        const visiblePermissionGroups = PERMISSION_GROUPS
            .map(section => ({
                ...section,
                modules: section.modules.filter(mod => !permissionsSearchNormalized || mod.title.toLowerCase().includes(permissionsSearchNormalized) || section.group.toLowerCase().includes(permissionsSearchNormalized)),
            }))
            .filter(section => section.modules.length > 0);

        return (
            <div className="space-y-6 animate-in fade-in duration-500 pb-4">
                {/* Cabeçalho — mesmo padrão de ContractDetailView.tsx: seta "voltar" +
                    identidade do registro, título em text-2xl (detalhe, não raiz de lista) */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setEditingMemberId(null)}
                        className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group shrink-0"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">
                        {permissionsMember.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-blue-600 truncate">{permissionsMember.email}</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full shrink-0" />
                            <span className="text-xs font-medium text-gray-400">Permissões detalhadas</span>
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-tight truncate">{permissionsMember.name}</h1>
                    </div>
                </div>

                {/* Toolbar de busca — variante desaninhada (§5.1) */}
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                    <div className="flex-1 relative w-full max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar módulo ou área..."
                            value={permissionsSearch}
                            onChange={(e) => setPermissionsSearch(e.target.value)}
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Tabela — container/thead/tbody §6, tipografia §7, separadores §6.6 */}
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                {/* §6.3: nenhuma coluna é ordenável por valor único — "Módulo" segue a
                                    ordem fixa dos grupos (Geral → Sistema, espelhando Layout.tsx), e
                                    Visualizar/Editar são toggles, não dado comparável. Exceção legítima
                                    documentada, mesmo padrão da matriz de Visibilidade de Módulos abaixo
                                    neste arquivo (Administrador/Membro/Visualizador também não ordenam). */}
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-6 py-2 border-r border-gray-100">Módulo</th>
                                    <th className="px-6 py-2 border-r border-gray-100 text-center w-32 last:border-r-0">Visualizar</th>
                                    <th className="px-6 py-2 text-center w-32">Editar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {visiblePermissionGroups.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-400">
                                            Nenhum módulo encontrado para "{permissionsSearch}".
                                        </td>
                                    </tr>
                                ) : visiblePermissionGroups.map((section) => (
                                    <React.Fragment key={section.group}>
                                        <tr className="bg-gray-50/70">
                                            <td colSpan={3} className="px-6 py-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-black text-gray-700 uppercase tracking-widest">{section.group}</span>
                                                    <div className="flex-1 h-px bg-gray-200" />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleMemberGroup(permissionsMember, section.modules)}
                                                        className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition-colors shrink-0"
                                                    >
                                                        {isGroupFullyChecked(permissionsMember, section.modules) ? 'Desmarcar tudo' : 'Marcar tudo'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {section.modules.map((module) => {
                                            const perms = effectivePerms(permissionsMember);
                                            const viewChecked = !!perms[module.view as keyof UserPermissions];
                                            const editChecked = module.edit ? !!perms[module.edit as keyof UserPermissions] : false;
                                            return (
                                                <tr key={module.view} className="hover:bg-gray-50/40 transition-colors">
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{module.title}</td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={viewChecked}
                                                            onChange={() => handleToggleMemberPermission(permissionsMember.id, module.view as keyof UserPermissions)}
                                                            className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                            title={`Permite ver o módulo ${module.title}.`}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-2.5 text-center">
                                                        {module.edit ? (
                                                            <input
                                                                type="checkbox"
                                                                checked={editChecked}
                                                                onChange={() => handleToggleMemberPermission(permissionsMember.id, module.edit as keyof UserPermissions)}
                                                                className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                                title={`Permite salvar alterações no módulo ${module.title}.`}
                                                            />
                                                        ) : (
                                                            <span className="text-gray-300 text-sm" title="Este módulo não tem ação de edição própria">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{SUBTAB_HEADERS[activeSubTab].title}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{SUBTAB_HEADERS[activeSubTab].subtitle}</p>
            </div>

            {/* §19.1 — toolbar de abas: card branco próprio + trilho bg-gray-50 */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    <button
                        onClick={() => setActiveSubTab('members')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeSubTab === 'members' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        <Users className="w-4 h-4 inline mr-2" />
                        Membros
                    </button>
                    <button
                        onClick={() => setActiveSubTab('roles')}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeSubTab === 'roles' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        <Briefcase className="w-4 h-4 inline mr-2" />
                        Cargos Customizados
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setActiveSubTab('visibility')}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${activeSubTab === 'visibility' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
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
                // Toolbar acoplada à tabela (§5.2 do guia): toolbar e tabela dividem um
                // único card — moldura/sombra só no pai, a única linha visível entre os
                // dois é o border-b da toolbar interna.
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nome, e-mail ou código..."
                                value={memberSearch}
                                onChange={(e) => setMemberSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={MEMBER_COLUMNS}
                                visibleColumns={memberColumns.visibleColumns}
                                showColumnConfig={memberColumns.showColumnConfig}
                                onToggleShow={() => memberColumns.setShowColumnConfig(!memberColumns.showColumnConfig)}
                                onToggleColumn={memberColumns.toggleColumn}
                                onReset={memberColumns.resetColumns}
                            />
                            {/* Ajustar largura ao conteúdo — sob comando explícito, nunca automático (§6.1.2). */}
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: memberTableTotalWidth }}>
                            <colgroup>
                                {memberColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* espaçador — absorve a folga ANTES de "Ações", senão a borda dela anda a cada resize (§6.1.1) */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {memberColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = MEMBER_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={memberColumns.sortColumn} sortDirection={memberColumns.sortDirection}
                                                onSort={memberColumns.handleColumnSort}
                                                onMoveColumn={memberColumns.moveColumn}
                                                className={def.className}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem (§6.1.1) */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                        Ações
                                        <cols.ResizeHandle colKey="actions" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sortedMembers.length === 0 ? (
                                    <tr>
                                        <td colSpan={memberColumns.visibleColumns.length + 2} className="px-6 py-8 text-center text-sm text-gray-400">
                                            Nenhum membro encontrado.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedMembers.map((member) => (
                                        <React.Fragment key={member.id}>
                                            <tr className="hover:bg-blue-50/50 transition-colors">
                                                {memberColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        {renderMemberCell(key, member, { customRoles, onRoleChange: handleMemberRoleChange })}
                                                    </td>
                                                ))}
                                                {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                <td aria-hidden="true" className="border-r border-gray-100"></td>
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
                                                            onClick={() => setEditingMemberId(member.id)}
                                                            className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-blue-600 hover:bg-blue-50"
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
                                        </React.Fragment>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
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
                    <div className="overflow-x-auto bg-white border border-gray-100 rounded-[10px] shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                {/* §6.3: "Módulo/Recurso" não ordena — é lista fixa e curta (até 11 itens
                                    por produto, MODULES_BY_PRODUCT) na ordem em que aparecem no menu, e as
                                    colunas de papel são toggles, não dado comparável. Mesma exceção
                                    documentada na tabela de Permissões Detalhadas acima. */}
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                                    <th className="px-6 py-2 min-w-[280px] border-r border-gray-100">Módulo / Recurso</th>
                                    <th className="px-6 py-2 text-center border-r border-gray-100">
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span>Administrador</span>
                                            <span className="text-[9px] text-emerald-500 font-black uppercase">Sempre ativo</span>
                                        </div>
                                    </th>
                                    <th className="px-6 py-2 text-center border-r border-gray-100">Membro</th>
                                    <th className="px-6 py-2 text-center border-r border-gray-100 last:border-r-0">Visualizador</th>
                                    {customRoles.map(role => (
                                        <th key={role.id} className="px-6 py-2 text-center truncate max-w-[150px] border-r border-gray-100 last:border-r-0">{role.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 text-sm text-gray-700">
                                {MODULES_BY_PRODUCT[activeProductTab].map(modItem => (
                                    <tr key={modItem.key} className="hover:bg-gray-50/40 transition-colors">
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <div className="text-sm font-normal text-gray-700">{modItem.label}</div>
                                            <div className="text-xs text-gray-400 font-medium">{modItem.description}</div>
                                        </td>
                                        {/* Admin: sempre habilitado */}
                                        <td className="px-6 py-2.5 text-center border-r border-gray-100">
                                            <div className="flex justify-center">
                                                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                                    <Check className="w-3 h-3 text-emerald-600" />
                                                </div>
                                            </div>
                                        </td>
                                        {/* Membro */}
                                        <td className="px-6 py-2.5 text-center border-r border-gray-100">
                                            <div className="flex justify-center">
                                                <input type="checkbox"
                                                    checked={getVisibility('member', modItem.key)}
                                                    onChange={() => handleToggleVisibility('member', modItem.key)}
                                                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                        </td>
                                        {/* Visualizador */}
                                        <td className="px-6 py-2.5 text-center border-r border-gray-100 last:border-r-0">
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
                                            <td key={role.id} className="px-6 py-2.5 text-center border-r border-gray-100 last:border-r-0">
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
                                        <div className="p-6 space-y-8 max-h-[400px] overflow-y-auto">
                                            {PERMISSION_GROUPS.map((section) => (
                                                <div key={section.group} className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-xs font-black text-gray-700 uppercase tracking-widest">{section.group}</div>
                                                        <div className="flex-1 h-px bg-gray-200" />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                                                        {section.modules.map((module) => (
                                                            <div key={module.view} className="space-y-2">
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
                                        <div className="p-6 space-y-8 max-h-[400px] overflow-y-auto">
                                            {PERMISSION_GROUPS.map((section) => (
                                                <div key={section.group} className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-xs font-black text-gray-700 uppercase tracking-widest">{section.group}</div>
                                                        <div className="flex-1 h-px bg-gray-200" />
                                                        <button
                                                            type="button"
                                                            onClick={() => setRoleFormData(prev => {
                                                                const next = !section.modules.every(mod =>
                                                                    !!prev.permissions[mod.view as keyof UserPermissions] &&
                                                                    (!mod.edit || !!prev.permissions[mod.edit as keyof UserPermissions])
                                                                );
                                                                const patch: Record<string, boolean> = {};
                                                                section.modules.forEach(mod => {
                                                                    patch[mod.view] = next;
                                                                    if (mod.edit) patch[mod.edit] = next;
                                                                });
                                                                return { ...prev, permissions: { ...prev.permissions, ...patch } };
                                                            })}
                                                            className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                                        >
                                                            {section.modules.every(mod =>
                                                                !!roleFormData.permissions[mod.view as keyof UserPermissions] &&
                                                                (!mod.edit || !!roleFormData.permissions[mod.edit as keyof UserPermissions])
                                                            ) ? 'Desmarcar tudo' : 'Marcar tudo'}
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                                                        {section.modules.map((module) => (
                                                            <div key={module.view} className="space-y-2">
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
