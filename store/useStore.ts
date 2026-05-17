import { create } from 'zustand';
import {
    ProfileGroup,
    UserProfile,
    Client,
    ProjectSettings,
    BudgetEntry,
    Organization,
    Investor,
    Supplier
} from '../types';
import { projectService } from '../services/projectService';
import { clientService } from '../services/clientService';
import { organizationService } from '../services/organizationService';
import { investorService } from '../services/investorService';
import { supplierService } from '../services/supplierService';
import { profileService } from '../services/profileService';
import { INITIAL_PROJECT_SETTINGS, INITIAL_BUDGET } from '../constants';

interface AuthState {
    session: any | null;
    loadingSession: boolean;
    currentProfile: {
        group: ProfileGroup;
        role: UserProfile;
        email?: string;
    };
    selectedLoginGroup: ProfileGroup | null;
    investorProfile: Investor | null;
    clientProfile: Client | null;
    supplierProfile: Supplier | null;
    authError: string | null;
    isValidating: boolean;
    profileSynchronized: boolean;
    isRehydrating: boolean;
    activeClientId: string | undefined;
    setSession: (session: any) => void;
    setLoadingSession: (loading: boolean) => void;
    setCurrentProfile: (profile: Partial<AuthState['currentProfile']>) => void;
    setSelectedLoginGroup: (group: ProfileGroup | null) => void;
    setInvestorProfile: (profile: Investor | null) => void;
    setClientProfile: (profile: Client | null) => void;
    setSupplierProfile: (profile: Supplier | null) => void;
    setAuthError: (error: string | null) => void;
    setIsValidating: (validating: boolean) => void;
    setProfileSynchronized: (synced: boolean) => void;
    setIsRehydrating: (rehydrating: boolean) => void;
    setActiveClientId: (id: string | undefined) => void;
}

interface UIState {
    activeView: string;
    managementTab: string;
    isProjectModalOpen: boolean;
    projectModalMode: 'create' | 'edit';
    isAIChatOpen: boolean;
    isNotificationOpen: boolean;
    suppliesOrderMode: 'details' | 'logistics';
    setActiveView: (view: string) => void;
    setManagementTab: (tab: any) => void;
    setIsProjectModalOpen: (open: boolean, mode?: 'create' | 'edit') => void;
    setIsAIChatOpen: (open: boolean) => void;
    setIsNotificationOpen: (open: boolean) => void;
    setSuppliesOrderMode: (mode: 'details' | 'logistics') => void;
}

interface ProjectState {
    projectId: string | null;
    projects: any[];
    projectsLoading: boolean;
    organizations: Organization[];
    clients: Client[];
    budget: BudgetEntry[];
    projectSettings: ProjectSettings | null;
    favorites: string[];
    setProjectId: (id: string | null) => void;
    setProjects: (projects: any[]) => void;
    setOrganizations: (orgs: Organization[]) => void;
    setClients: (clients: Client[]) => void;
    setBudget: (budget: BudgetEntry[]) => void;
    setProjectSettings: (settings: ProjectSettings) => void;
    setFavorites: (favorites: string[] | ((prev: string[]) => string[])) => void;
    fetchProjects: (organizations: Organization[]) => Promise<void>;
    fetchClients: () => Promise<void>;
    fetchOrganizations: () => Promise<void>;
    activeOrganizationId: string | null;
    setActiveOrganizationId: (id: string | null) => void;
    logout: () => void;
}

export const useStore = create<AuthState & UIState & ProjectState>((set, get) => ({
    // Auth State
    session: null,
    loadingSession: true,
    currentProfile: {
        group: ProfileGroup.USER,
        role: UserProfile.ADMIN,
    },
    selectedLoginGroup: typeof window !== 'undefined' ? localStorage.getItem('orca_selectedLoginGroup') as ProfileGroup | null : null,
    investorProfile: null,
    clientProfile: null,
    supplierProfile: null,
    authError: null,
    isValidating: false,
    profileSynchronized: false,
    isRehydrating: true,
    activeClientId: undefined,
    setSession: (session) => set({ session }),
    setLoadingSession: (loadingSession) => set({ loadingSession }),
    setCurrentProfile: (profile) => set((state) => ({
        currentProfile: { ...state.currentProfile, ...profile }
    })),
    setSelectedLoginGroup: (selectedLoginGroup) => {
        // Persiste enquanto há sessão ativa; limpo pelo onAuthStateChange quando a sessão expira
        if (selectedLoginGroup) localStorage.setItem('orca_selectedLoginGroup', selectedLoginGroup);
        else localStorage.removeItem('orca_selectedLoginGroup');
        set({ selectedLoginGroup });
    },
    setInvestorProfile: (investorProfile) => set({ investorProfile }),
    setClientProfile: (clientProfile) => set({ clientProfile }),
    setSupplierProfile: (supplierProfile) => set({ supplierProfile }),
    setAuthError: (authError) => set({ authError }),
    setIsValidating: (isValidating) => set({ isValidating }),
    setProfileSynchronized: (profileSynchronized) => set({ profileSynchronized }),
    setIsRehydrating: (isRehydrating) => set({ isRehydrating }),
    setActiveClientId: (activeClientId) => set({ activeClientId }),

    // UI State
    activeView: typeof window !== 'undefined' ? localStorage.getItem('orca_activeView') || 'eng-obras' : 'eng-obras',
    managementTab: 'organizations',
    isProjectModalOpen: false,
    projectModalMode: 'create',
    isAIChatOpen: false,
    isNotificationOpen: false,
    suppliesOrderMode: 'details',
    setActiveView: (activeView) => {
        if (typeof window !== 'undefined') localStorage.setItem('orca_activeView', activeView);
        set({ activeView });
    },
    setManagementTab: (managementTab) => set({ managementTab }),
    setIsProjectModalOpen: (isProjectModalOpen, projectModalMode = 'create') =>
        set({ isProjectModalOpen, projectModalMode }),
    setIsAIChatOpen: (isAIChatOpen) => set({ isAIChatOpen }),
    setIsNotificationOpen: (isNotificationOpen) => set({ isNotificationOpen }),
    setSuppliesOrderMode: (suppliesOrderMode) => set({ suppliesOrderMode }),

    // Project State
    projectId: typeof window !== 'undefined' ? localStorage.getItem('orca_currentProjectId') : null,
    projects: [],
    projectsLoading: true, // true até o primeiro fetch completar — evita flash de estado vazio
    organizations: [],
    clients: [],
    budget: [],
    projectSettings: null,
    favorites: [],
    activeOrganizationId: typeof window !== 'undefined'
        ? (() => { const v = localStorage.getItem('orca_activeOrganizationId'); return (!v || v === 'TODAS') ? null : v; })()
        : null,
    setActiveOrganizationId: (id) => {
        // 'TODAS' sentinel preserves null selection across page refreshes without being confused with "no preference set"
        localStorage.setItem('orca_activeOrganizationId', id || 'TODAS');
        set({ activeOrganizationId: id });
    },

    setProjectId: (projectId) => {
        if (projectId) localStorage.setItem('orca_currentProjectId', projectId);
        else localStorage.removeItem('orca_currentProjectId');
        set({ projectId });
    },
    setProjects: (projects) => set({ projects }),
    setOrganizations: (organizations) => set({ organizations }),
    setClients: (clients) => set({ clients }),
    setBudget: (budget) => set({ budget }),
    setProjectSettings: (projectSettings) => set({ projectSettings }),
    setFavorites: (favs) => set((state) => ({
        favorites: typeof favs === 'function' ? (favs as (prev: string[]) => string[])(state.favorites) : favs
    })),
    fetchProjects: async (organizations) => {
        set({ projectsLoading: true });
        try {
            const { activeOrganizationId } = get();
            
            // Se activeOrganizationId for null, buscamos todos os projetos permitidos via RLS
            // Se for explicitamente passado, filtramos por ele.
            const list = await projectService.listProjects(undefined, activeOrganizationId || undefined, true);
            set({ projects: list });
        } catch (err) {
            console.error("Error listing projects:", err);
            set({ projects: [] });
        } finally {
            set({ projectsLoading: false });
        }
    },

    fetchClients: async () => {
        try {
            const data = await clientService.listClients();
            set({ clients: data });
        } catch (error) {
            console.error("Erro ao carregar clientes:", error);
        }
    },
    fetchOrganizations: async () => {
        try {
            const list = await organizationService.listOrganizations();
            set({ organizations: list });
            // Only auto-select on first login (key absent from localStorage).
            // If the user explicitly chose TODAS, the sentinel 'TODAS' is stored — don't override it.
            const savedPref = typeof window !== 'undefined' ? localStorage.getItem('orca_activeOrganizationId') : null;
            if (!savedPref && list.length > 0) {
                get().setActiveOrganizationId(list[0].id);
            }
        } catch (err) {
            console.error("Error listing organizations:", err);
        }
    },
    logout: () => {
        if (typeof window !== 'undefined') {
            localStorage.clear();
            sessionStorage.clear();
        }
        set({
            session: null,
            currentProfile: {
                group: ProfileGroup.USER,
                role: UserProfile.ADMIN,
            },
            selectedLoginGroup: null,
            projects: [],
            organizations: [],
            projectId: null
        });
        if (typeof window !== 'undefined') window.location.href = '/';
    }
}));
