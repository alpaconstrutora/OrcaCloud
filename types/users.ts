import { FinancialInfo } from "./financial";
import { DiaryEntry } from "./diary";
import { ProjectSchedule } from "./project";
import { ResourceRole, ResourceWorker, ResourceTeam, LaborCompany } from "./resources";

export interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: Date;
}

export interface Client {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    document?: string;
    type: 'PF' | 'PJ';
    address?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    category?: 'Vendas' | 'Locação' | 'Serviços';
    organization_id?: string;
    created_at?: string;
    clientDocuments?: {
        name: string;
        category: string;
        url?: string;
        disabled?: boolean;
        date?: string;
        }[];
    financialInfo?: FinancialInfo;
    diaryEntries?: DiaryEntry[];
    scheduleInfo?: ProjectSchedule;
    aiInsight?: {
        title: string;
        message?: string; // Used in Client Portal
        content?: string; // Used in Investor Portal
        type?: string;
        actionable?: {
          label: string;
          target: string;
        };
        };
    visualGallery?: string[];
}

export interface Investor {
    id: string;
    name: string;
    email: string;
    phone?: string;
    document?: string;
    organization_id?: string;
    created_at?: string;
}

export interface Supplier {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    document?: string;
    type: 'PF' | 'PJ';
    category?: string;
    address?: string;
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    organization_id?: string;
    created_at?: string;
}

export interface SupplierCategory {
    id: string;
    name: string;
    organization_id?: string;
    created_at?: string;
}

export type OrganizationRole = 'admin' | 'member' | 'viewer';

export enum ProfileGroup {
    USER = 'USUARIO',
    CLIENT = 'CLIENTE',
    INVESTOR = 'INVESTIDOR',
    DEVELOPER = 'DESENVOLVEDOR',
    SUPPLIER = 'FORNECEDOR',
    BROKER = 'CORRETOR'
}

export enum UserProfile {
    DEVELOPER = 'DESENVOLVEDOR',
    ADMIN = 'ADMINISTRADOR',
    USER = 'PERFIL_USUARIO',
    CLIENT_BUYER = 'CLIENTE_COMPRA',
    RENTAL = 'ALUGUEL',
    ADMINISTRATION = 'ADMINISTRACAO',
    INVESTOR = 'INVESTIDOR',
    SUPPLIER = 'FORNECEDOR',
    BROKER = 'CORRETOR'
}

export interface UserPermissions {
    canViewBudget: boolean;
    canEditBudget: boolean;
    canViewCompositions: boolean;
    canEditCompositions: boolean;
    canViewPlanning: boolean;
    canEditPlanning: boolean;
    canViewDiary: boolean;
    canEditDiary: boolean;
    canViewReports: boolean;
    canEditReports: boolean;
    canViewTechnicalData: boolean;
    canEditTechnicalData: boolean;
    canViewOrders: boolean;
    canEditOrders: boolean;
    canViewReceipts: boolean;
    canEditReceipts: boolean;
    canViewFinancial: boolean;
    canEditFinancial: boolean;
    canViewClientPortal: boolean;
    canEditClientPortal: boolean;
    canViewInvestorPortal: boolean;
    canEditInvestorPortal: boolean;
    canViewSupplierPortal: boolean;
    canEditSupplierPortal: boolean;
    canViewBrokerPortal: boolean;
    canEditBrokerPortal: boolean;
    canViewSettings: boolean;
    canEditSettings: boolean;
    canManageUsers: boolean;
}

export interface OrganizationCustomRole {
    id: string;
    name: string;
    permissions: UserPermissions;
}

export interface OrganizationMember {
    id: string;
    name: string;
    email: string;
    role: OrganizationRole;
    customRoleId?: string;
    joinedAt: string;
    permissions: UserPermissions;
}

export interface Organization {
    id: string;
    name: string;
    cnpj?: string;
    email?: string;
    phone?: string;
    website?: string;
    logoUrl?: string;
    created_at?: string;
    address: {
        street?: string;
        number?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        };
    members?: OrganizationMember[];
    customRoles?: OrganizationCustomRole[];
    resources?: {
        roles: ResourceRole[];
        workers: ResourceWorker[];
        teams: ResourceTeam[];
        companies?: LaborCompany[];
        supplierCategories?: SupplierCategory[];
        };
}
