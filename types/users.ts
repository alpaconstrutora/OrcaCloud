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
    rg?: string;
    rg_uf?: string;
    rg_issuing_agency?: string;
    type: 'PF' | 'PJ';
    address?: string;
    address_number?: string;
    neighborhood?: string;
    zip_code?: string;
    city?: string;
    state?: string;
    category?: string;
    /** Portais em que o cliente é exposto. 'Portal do Cliente' o faz aparecer na
     *  tabela do módulo Portal do Cliente; 'Nenhum' (default) o oculta de lá. */
    portal?: 'Nenhum' | 'Portal do Cliente';
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
    /** Abas visíveis no Portal do Cliente. Fonte canônica, keyed pelo cliente. */
    portalTabs?: string[];
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

export interface SupplierPortalSettings {
    supplierPortalTabs?: string[];
}

/** Portal externo em que o fornecedor é exposto. É a fonte única da verdade:
 *  'Portal do Corretor' o sincroniza em broker_profiles (tabela do Portal do Corretor);
 *  'Portal do Fornecedor' o exibe na tabela do Portal do Fornecedor;
 *  'Portal do Parceiro' materializa/ativa o workspace na tabela do Portal do Parceiro;
 *  'Nenhum' (default) não o expõe em nenhum portal. */
export type SupplierPortal =
    | 'Nenhum'
    | 'Portal do Corretor'
    | 'Portal do Fornecedor'
    | 'Portal do Parceiro';

export interface Supplier {
    id: string;
    code?: string;
    name: string;
    nickname?: string | null;
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
    portal?: SupplierPortal;
    settings?: SupplierPortalSettings;
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

/** Produto Òpura que o membro acessa: Plataforma principal, Pro, Offices ou E-commerce */
export type ProductContext = 'platform' | 'pro' | 'offices' | 'ecommerce';

/** Mapa de visibilidade: roleId -> moduleKey -> habilitado */
export type ProductModuleMap = Record<string, Record<string, boolean>>;

/** Configuração de visibilidade de módulos por produto */
export interface ModuleVisibilityConfig {
    platform?: ProductModuleMap;
    pro?: ProductModuleMap;
    offices?: ProductModuleMap;
    ecommerce?: ProductModuleMap;
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
    
    // Permissões de E-commerce
    canViewEcommerce?: boolean;
    canEditEcommerce?: boolean;
    canManageEcommerceRules?: boolean;
    
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
    canViewEcommerceModule?: boolean;
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
