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
    code?: string;
    name: string;
    email?: string;
    phone?: string;
    document?: string;
    type: 'PF' | 'PJ';
    address?: string;
    address_number?: string;
    neighborhood?: string;
    zip_code?: string;
    city?: string;
    state?: string;
    category?: string;
    organization_name?: string;
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
    code?: string;
    name: string;
    email?: string;
    phone?: string;
    document?: string;
    organization_id?: string;
    created_at?: string;
}

export interface SupplierCnaeActivity {
    code?: string | null;
    text?: string | null;
}

export interface SupplierPartner {
    name?: string | null;
    role?: string | null;
    since?: string | null;
}

export interface SupplierStateRegistration {
    number?: string | null;
    state?: string | null;
    enabled?: boolean | null;
    status?: string | null;
}

export interface Supplier {
    id: string;
    code?: string;
    name: string;
    contact_name?: string;
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
    organization_id?: string | null;
    organization_name?: string;
    created_at?: string;
    // Dados oficiais trazidos pela consulta CNPJa (Receita Federal / Simples / Cadastro de Contribuintes)
    cnpj_status?: string | null;
    cnpj_status_date?: string | null;
    cnpj_updated_at?: string | null;
    cnpj_founded_at?: string | null;
    cnpj_legal_nature?: string | null;
    cnpj_company_size?: string | null;
    cnpj_main_activity_code?: string | null;
    cnpj_main_activity_text?: string | null;
    cnpj_side_activities?: SupplierCnaeActivity[] | null;
    cnpj_partners?: SupplierPartner[] | null;
    cnpj_simples_optant?: boolean | null;
    cnpj_simples_since?: string | null;
    cnpj_simei_optant?: boolean | null;
    cnpj_simei_since?: string | null;
    cnpj_state_registrations?: SupplierStateRegistration[] | null;
}

export interface SupplierCategory {
    id: string;
    name: string;
    organization_id?: string;
    created_at?: string;
}

export interface ClientCategory {
    id: string;
    name: string;
    organization_id?: string;
    created_at?: string;
}

export type OrganizationRole = 'admin' | 'member' | 'viewer';

/** Produto Òpura que o membro acessa: Plataforma principal, Pro, Offices ou Compliance */
export type ProductContext = 'platform' | 'pro' | 'offices' | 'compliance';

/** Mapa de visibilidade: roleId -> moduleKey -> habilitado */
export type ProductModuleMap = Record<string, Record<string, boolean>>;

/** Configuração de visibilidade de módulos por produto */
export interface ModuleVisibilityConfig {
    platform?: ProductModuleMap;
    pro?: ProductModuleMap;
    offices?: ProductModuleMap;
    compliance?: ProductModuleMap;
}

export enum ProfileGroup {
    USER = 'USUARIO',
    CLIENT = 'CLIENTE',
    INVESTOR = 'INVESTIDOR',
    DEVELOPER = 'DESENVOLVEDOR',
    SUPPLIER = 'FORNECEDOR',
    BROKER = 'CORRETOR',
    PARTNER = 'PARCEIRO'
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
    BROKER = 'CORRETOR',
    PARTNER = 'PARCEIRO'
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
    
    // Permissões de Compliance
    canViewCompliance?: boolean;
    canEditCompliance?: boolean;
    canManageComplianceRules?: boolean;
    
    // Configurações de Visibilidade de Módulos (Feature Flags por Cargo)
    canViewLabor?: boolean;
    canViewOffices?: boolean;
    canViewPro?: boolean;
    canViewSales?: boolean;
    canViewImovib?: boolean;
    canViewFiscal?: boolean;
    canViewQuality?: boolean;
    canViewRentals?: boolean;
    canViewStructural?: boolean;
    canViewComplianceModule?: boolean;
}

export interface OrganizationCustomRole {
    id: string;
    name: string;
    permissions: UserPermissions;
}

export interface OrganizationMember {
    id: string;
    code?: string;
    name: string;
    email: string;
    role: OrganizationRole;
    customRoleId?: string;
    joinedAt: string;
    permissions: UserPermissions;
    /** Produto Òpura que este membro utiliza (default: 'platform') */
    productContext?: ProductContext;
}

export interface Organization {
    id: string;
    code?: string;
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
    settings?: {
        /** Visibilidade de módulos por produto e por cargo. Retrocompatível com formato flat (legacy). */
        module_visibility?: ModuleVisibilityConfig | Record<string, Record<string, boolean>>;
    };
    resources?: {
        roles: ResourceRole[];
        workers: ResourceWorker[];
        teams: ResourceTeam[];
        companies?: LaborCompany[];
        supplierCategories?: SupplierCategory[];
        };
}
