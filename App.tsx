import React from 'react';
import Layout from './components/Layout';
import Auth from './components/Auth';
import ResetPassword from './components/ResetPassword';
import LoginGateway from './components/LoginGateway';

const AIChat      = React.lazy(() => import('./components/AIChat'));
const ProjectModal = React.lazy(() => import('./components/ProjectModal'));
import { supabase } from './lib/supabase';
import { atsService } from './services/atsService';
import { PortalView } from './components/LaborPortal';

// Acesso público via token — sem login
const PortalTokenGate: React.FC<{ token: string }> = ({ token }) => {
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [empId, setEmpId] = React.useState('');
  const [orgId, setOrgId] = React.useState('');

  React.useEffect(() => {
    atsService.validatePortalToken(token)
      .then(res => {
        if (res.valid && res.employee_id && res.org_id) {
          setEmpId(res.employee_id);
          setOrgId(res.org_id);
          setState('ok');
        } else {
          setState('error');
        }
      })
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'loading') return (
    <div className="h-screen flex items-center justify-center bg-indigo-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black text-indigo-700 uppercase tracking-widest">Carregando portal...</p>
      </div>
    </div>
  );

  if (state === 'error') return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3 p-8">
        <p className="text-4xl">🔒</p>
        <p className="text-lg font-black text-slate-800">Link inválido ou expirado</p>
        <p className="text-sm text-slate-500">Solicite um novo link ao seu gestor.</p>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-white overflow-hidden">
      <PortalView employeeId={empId} orgId={orgId} onLogout={() => { window.location.href = '/'; }} />
    </div>
  );
};
// Portal do Cliente via token público
const ClientPortalTokenGate: React.FC<{ token: string }> = ({ token }) => {
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [clientData, setClientData] = React.useState<any>(null);
  const [projectSettings, setProjectSettings] = React.useState<any>(null);
  const [orgId, setOrgId] = React.useState('');

  React.useEffect(() => {
    (async () => {
      try {
        const res = await clientPortalService.getPortalData(token);
        if (!res.valid || !res.client) { setState('error'); return; }
        const cli = res.client;
        setOrgId(cli.organization_id);
        // Mapeia campos snake_case → camelCase que ClientArea espera
        setClientData({
          id: cli.id,
          name: cli.name,
          email: cli.email,
          phone: cli.phone,
          document: cli.document,
          type: cli.type,
          address: cli.address,
          address_number: cli.address_number,
          neighborhood: cli.neighborhood,
          zip_code: cli.zip_code,
          city: cli.city,
          state: cli.state,
          category: cli.category,
          organization_id: cli.organization_id,
          clientDocuments: cli.client_documents ?? cli.clientDocuments ?? [],
          financialInfo: cli.financial_info ?? cli.financialInfo ?? null,
          diaryEntries: cli.diary_entries ?? cli.diaryEntries ?? [],
          scheduleInfo: cli.schedule_info ?? cli.scheduleInfo ?? null,
          aiInsight: cli.ai_insight ?? cli.aiInsight ?? null,
          visualGallery: cli.visual_gallery ?? cli.visualGallery ?? [],
          // Fonte canônica das abas visíveis: prioriza portal_tabs da RPC
          // (clients.portal_tabs), com fallback ao legado no próprio cliente.
          portalTabs: (res.portal_tabs ?? cli.portal_tabs ?? cli.portalTabs) ?? undefined,
        });
        // Monta settings: usa projeto vinculado se disponível, e injeta portal_tabs em qualquer caso
        const baseSettings = res.project
          ? { ...res.project.settings, id: res.project.id, name: res.project.name }
          : {};
        // portal_tabs da RPC tem precedência (busca também em outros projetos da org como fallback)
        if (res.portal_tabs !== undefined && res.portal_tabs !== null) {
          (baseSettings as any).clientPortalTabs = res.portal_tabs;
        }
        setProjectSettings(baseSettings);
        setState('ok');
      } catch {
        setState('error');
      }
    })();
  }, [token]);

  if (state === 'loading') return (
    <div className="h-screen flex items-center justify-center bg-blue-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black text-blue-700 uppercase tracking-widest">Carregando portal...</p>
      </div>
    </div>
  );

  if (state === 'error') return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3 p-8">
        <p className="text-4xl">🔒</p>
        <p className="text-lg font-black text-slate-800">Link inválido ou expirado</p>
        <p className="text-sm text-slate-500">Solicite um novo link à construtora.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <React.Suspense fallback={<div className="h-screen flex items-center justify-center"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
        <ClientArea
          settings={projectSettings || { name: '', location: '', standard: '', cubRate: 0, area: 0, bdi: 0, ls: 0, database: '', referenceMonth: '', socialChargesMode: '', wbs: [] }}
          budget={[]}
          profile={{ group: 'CLIENTE', role: '' }}
          clientProfile={clientData}
          organizationId={orgId}
          portalToken={token}
          onClientSelect={() => {}}
          isPreview
        />
      </React.Suspense>
    </div>
  );
};

import PublicOrderView from './components/PublicOrderView';
import PublicProposalView from './components/PublicProposalView';
import { PublicEspecificacoesView } from './components/PublicEspecificacoesView';
import { clientPortalService } from './services/clientPortalService';
import { brokerPortalService } from './services/brokerPortalService';
import { investorPortalTokenService } from './services/investorPortalTokenService';
import { partnerPortalTokenService } from './services/partnerPortalTokenService';
import { supplierPortalTokenService } from './services/supplierPortalTokenService';
const ClientArea = React.lazy(() => import('./components/ClientArea').then(m => ({ default: m.ClientArea })));
const BrokerPortal = React.lazy(() => import('./components/BrokerPortal'));
const InvestorDashboardPublic = React.lazy(() => import('./components/InvestorDashboard'));
const PartnerPortalPublic = React.lazy(() => import('./components/partner/PartnerPortal').then(m => ({ default: m.PartnerPortal })));
const SupplierDashboardPublic = React.lazy(() => import('./components/SupplierDashboard'));

// Portal do Investidor via token público
const InvestorPortalTokenGate: React.FC<{ token: string }> = ({ token }) => {
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [investorData, setInvestorData] = React.useState<any>(null);
  const [orgId, setOrgId] = React.useState('');

  React.useEffect(() => {
    investorPortalTokenService.getPortalData(token)
      .then(res => {
        if (!res.valid || !res.investor) { setState('error'); return; }
        setInvestorData(res.investor);
        setOrgId(res.org_id || res.investor.organization_id || '');
        setState('ok');
      })
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'loading') return (
    <div className="h-screen flex items-center justify-center bg-blue-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black text-blue-700 uppercase tracking-widest">Carregando portal...</p>
      </div>
    </div>
  );

  if (state === 'error') return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3 p-8">
        <p className="text-4xl">🔒</p>
        <p className="text-lg font-black text-slate-800">Link inválido ou expirado</p>
        <p className="text-sm text-slate-500">Solicite um novo link à construtora.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <React.Suspense fallback={<div className="h-screen flex items-center justify-center"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
        <InvestorDashboardPublic
          settings={{} as any}
          organizationId={orgId}
          investorProfile={investorData}
          portalToken={token}
          isPreview
        />
      </React.Suspense>
    </div>
  );
};

// Portal do Corretor via token público
const BrokerPortalTokenGate: React.FC<{ token: string }> = ({ token }) => {
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [brokerData, setBrokerData] = React.useState<any>(null);
  const [orgId, setOrgId] = React.useState('');

  React.useEffect(() => {
    brokerPortalService.getPortalData(token)
      .then(res => {
        if (!res.valid || !res.broker) { setState('error'); return; }
        setBrokerData(res.broker);
        setOrgId(res.org_id || res.broker.organization_id || '');
        setState('ok');
      })
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'loading') return (
    <div className="h-screen flex items-center justify-center bg-indigo-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black text-indigo-700 uppercase tracking-widest">Carregando portal...</p>
      </div>
    </div>
  );

  if (state === 'error') return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3 p-8">
        <p className="text-4xl">🔒</p>
        <p className="text-lg font-black text-slate-800">Link inválido ou expirado</p>
        <p className="text-sm text-slate-500">Solicite um novo link à construtora.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <React.Suspense fallback={<div className="h-screen flex items-center justify-center"><div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}>
        <BrokerPortal
          profile={{ group: 'CORRETOR', role: '', email: brokerData.email }}
          organizationId={orgId}
          portalToken={token}
          initialBroker={brokerData}
          isPreview
        />
      </React.Suspense>
    </div>
  );
};

// Portal do Parceiro via token público
const PartnerPortalTokenGate: React.FC<{ token: string }> = ({ token }) => {
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');

  React.useEffect(() => {
    partnerPortalTokenService.getPortalData(token)
      .then(res => setState(res.valid && res.workspace ? 'ok' : 'error'))
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'loading') return (
    <div className="h-screen flex items-center justify-center bg-[#141414]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black text-orange-400 uppercase tracking-widest">Carregando portal...</p>
      </div>
    </div>
  );

  if (state === 'error') return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3 p-8">
        <p className="text-4xl">🔒</p>
        <p className="text-lg font-black text-slate-800">Link inválido ou expirado</p>
        <p className="text-sm text-slate-500">Solicite um novo link à construtora.</p>
      </div>
    </div>
  );

  return (
    <React.Suspense fallback={<div className="h-screen flex items-center justify-center bg-[#141414]"><div className="w-6 h-6 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <PartnerPortalPublic userEmail="" portalToken={token} />
    </React.Suspense>
  );
};

// Portal do Fornecedor via token público — mesmo formato do Portal do Parceiro,
// reaproveitando o próprio SupplierDashboard (que já roda em modo token via `portalToken`).
const SupplierPortalTokenGate: React.FC<{ token: string }> = ({ token }) => {
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [supplier, setSupplier] = React.useState<import('./types').Supplier | null>(null);

  React.useEffect(() => {
    supplierPortalTokenService.getPortalData(token)
      .then(res => {
        if (res.valid && res.supplier) {
          setSupplier(res.supplier);
          setState('ok');
        } else {
          setState('error');
        }
      })
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'loading') return (
    <div className="h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black text-blue-700 uppercase tracking-widest">Carregando portal...</p>
      </div>
    </div>
  );

  if (state === 'error') return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3 p-8">
        <p className="text-4xl">🔒</p>
        <p className="text-lg font-black text-slate-800">Link inválido ou expirado</p>
        <p className="text-sm text-slate-500">Solicite um novo link à construtora.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8">
      <React.Suspense fallback={<div className="h-screen flex items-center justify-center"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
        <SupplierDashboardPublic supplierProfile={supplier} portalToken={token} />
      </React.Suspense>
    </div>
  );
};
import { ContractModal } from './components/ContractModal';
import SupplyChainOrderForm from './components/SupplyChainOrderForm';
import { INITIAL_PROJECT_SETTINGS } from './constants';
import { BudgetEntry, ProjectSettings, Organization, Contract, Client } from './types';
import { Loader2, Shield, WifiOff } from 'lucide-react';
import { useStore } from './store/useStore';
import { useToast } from './hooks/useToast';
import { usePersistenceSync } from './hooks/usePersistenceSync';
import { useAuthSync } from './hooks/useAuthSync';
import { useProjectOperations } from './hooks/useProjectOperations';
import AppRouter from './components/AppRouter';
import { ErrorBoundary } from './components/ErrorBoundary';
const PublicMarketplaceView = React.lazy(() => import('./components/public/PublicMarketplaceView'));
const PublicPlantChecker = React.lazy(() => import('./components/public/PublicPlantChecker').then(m => ({ default: m.PublicPlantChecker })));
import { PWAInstallPrompt, OfflineIndicator } from './components/PWAInstallPrompt';
import { useTabRouter } from './hooks/useTabRouter';
import { syncViewToUrl } from './lib/tabRouter';

const App: React.FC = () => {
  const {
    activeView, setActiveView,
    isProjectModalOpen, setIsProjectModalOpen,
    projectModalMode,
    projectId, setProjectId,
    session, setSession,
    loadingSession, setLoadingSession,
    selectedLoginGroup, setSelectedLoginGroup,
    currentProfile, setCurrentProfile,
    clients, setClients,
    investorProfile, setInvestorProfile,
    clientProfile, setClientProfile,
    supplierProfile, setSupplierProfile,
    isNotificationOpen, setIsNotificationOpen,
    projectSettings, setProjectSettings,
    budget, setBudget,
    isAIChatOpen, setIsAIChatOpen,
    organizations, setOrganizations,
    projects, allProjects, setProjects,
    managementTab, setManagementTab,
    authError, setAuthError,
    isValidating, setIsValidating,
    profileSynchronized, setProfileSynchronized,
    isRehydrating, setIsRehydrating,
    activeClientId, setActiveClientId,
    favorites, setFavorites,
    suppliesOrderMode, setSuppliesOrderMode,
    activeOrganizationId, setActiveOrganizationId,
    fetchProjects, fetchClients, fetchOrganizations,
    fetchCompanies,
    projectsLoading,
  } = useStore();

  // Local state for UI flow
  const [isResettingPassword, setIsResettingPassword] = React.useState(false);
  const [projectModalInitialClassification, setProjectModalInitialClassification] = React.useState<'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO' | undefined>(undefined);
  const [editingOrganizationId, setEditingOrganizationId] = React.useState<string | null>(null);
  const [isCreatingOrganization, setIsCreatingOrganization] = React.useState(false);
  const [isCreatingQuotation, setIsCreatingQuotation] = React.useState(false);
  const [editingQuotationId, setEditingQuotationId] = React.useState<string | null>(null);
  const [selectedQuotationId, setSelectedQuotationId] = React.useState<string | null>(
    localStorage.getItem('app_selected_quotation_id')
  );
  const [isCreatingContract, setIsCreatingContract] = React.useState(false);
  const [selectedContractId, setSelectedContractId] = React.useState<string | null>(
    localStorage.getItem('app_selected_contract_id')
  );
  const [editingContract, setEditingContract] = React.useState<Contract | null>(null);
  const [contractsVersion, setContractsVersion] = React.useState(0);

  const { localToast, showToast } = useToast();

  const [isImportModalOpenPlanning, setIsImportModalOpenPlanning] = React.useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = React.useState(false);
  const [ordersVersion, setOrdersVersion] = React.useState(0);
  const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(
    localStorage.getItem('app_selected_order_id')
  );
  const [editingOrderId, setEditingOrderId] = React.useState<string | null>(null);
  const [pendingSupplierOrderId, setPendingSupplierOrderId] = React.useState<string | null>(null);
  const [pendingSupplierOrderViewMode, setPendingSupplierOrderViewMode] = React.useState<'details' | 'logistics' | undefined>(undefined);
  const [isCreatingImovibStudy, setIsCreatingImovibStudy] = React.useState(
    localStorage.getItem('app_is_creating_imovib') === 'true'
  );
  const [editingImovibStudyId, setEditingImovibStudyId] = React.useState<string | null>(
    localStorage.getItem('app_editing_imovib_id')
  );
  const [viewingImovibStudyId, setViewingImovibStudyId] = React.useState<string | null>(
    localStorage.getItem('app_viewing_imovib_id')
  );

  // Multi-tab routing: sync URL hash → state and handle cross-tab auth events.
  useTabRouter(activeView, setActiveView, useStore.getState().logout);

  // Ensure the URL hash reflects the current view on first render.
  React.useEffect(() => {
    syncViewToUrl(activeView);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNavigate = React.useCallback((link: string) => {
    setIsNotificationOpen(false);
    if (link.includes('/supplier-portal')) {
      setActiveView('supplier-area');
      const params = new URLSearchParams(link.split('?')[1]);
      const orderId = params.get('order');
      if (orderId) {
        setPendingSupplierOrderId(orderId);
        setPendingSupplierOrderViewMode('details');
      }
    } else if (link.startsWith('/')) {
      const view = link.substring(1).split('?')[0];
      if (view) setActiveView(view);
    }
  }, [setActiveView, setIsNotificationOpen]);

  React.useEffect(() => {
    if (session?.user?.id) {
      fetchProjects(organizations);
    }
  }, [projectId, fetchProjects, organizations, session?.user?.id, activeOrganizationId]);

  React.useEffect(() => {
    // Sem activeOrganizationId ("Todas as organizações"), NÃO bloquear a
    // leitura — companyService.list() já omite o filtro org_id quando
    // undefined, deixando a RLS decidir o que o usuário pode ver (REGRA
    // OBRIGATÓRIA #5 do CLAUDE.md). Sem isso, o seletor de empresa da
    // sidebar nunca buscava as empresas quando nenhuma organização estava
    // selecionada, mostrando só a que já estava salva em cache.
    if (session?.user?.id) {
      fetchCompanies();
    }
  }, [session?.user?.id, activeOrganizationId, fetchCompanies]);

  usePersistenceSync({
    projectSettings, budget, projectId, session, isRehydrating, activeView,
    selectedQuotationId, selectedContractId, selectedOrderId,
    isCreatingImovibStudy, editingImovibStudyId, viewingImovibStudyId,
    favorites, setFavorites,
    setSelectedQuotationId, setSelectedContractId, setSelectedOrderId,
    setIsCreatingImovibStudy, setEditingImovibStudyId, setViewingImovibStudyId,
    setIsRehydrating, setProjectId, setProjectSettings, setBudget
  });

  const {
    isSaving,
    handleNewProject,
    handleEditActiveProject,
    handleUpsertProject,
    handleSaveProject,
    handleDeleteProject,
    handleDeleteProjectFromList,
    handleDuplicateProject,
    handleImportProject,
    handleExportProject,
    handleLoadProject,
    handleLoadAndEditProject,
    handleUpsertOrganization,
    handleDeleteOrganization,
    handleContractSubmit
  } = useProjectOperations({
    organizations, projects: projects as { id: string; name: string; settings?: ProjectSettings }[], projectSettings, projectModalMode, projectId, budget, activeOrganizationId, activeView, session,
    fetchProjects, fetchOrganizations, setProjectSettings, setBudget, setProjectId,
    setIsProjectModalOpen, setProjectModalInitialClassification, showToast, setActiveView,
    editingOrganizationId, setIsCreatingOrganization, setEditingOrganizationId,
    editingContract, setIsCreatingContract, setEditingContract, setContractsVersion
  });

  useAuthSync({
    session, setSession, setLoadingSession, selectedLoginGroup, setSelectedLoginGroup,
    setAuthError, setIsResettingPassword, profileSynchronized, setProfileSynchronized,
    currentProfile, setCurrentProfile, setIsValidating, setInvestorProfile, setClientProfile,
    setSupplierProfile, fetchProjects, fetchClients, fetchOrganizations,
    projectId, clientProfile, investorProfile, handleLoadProject
  });

  // Active Settings Memo
  const settingsWithId = React.useMemo(() => ({
    ...(projectSettings || INITIAL_PROJECT_SETTINGS),
    id: projectId || undefined
  }), [projectSettings, projectId]);

  const toggleFavorite = (e: React.MouseEvent | React.TouchEvent, code: string) => {
    e.stopPropagation();
    setFavorites(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const handleUpdateSettings = (newSettings: ProjectSettings) => setProjectSettings(newSettings);
  const handleUpdateBudget = (newBudget: BudgetEntry[]) => setBudget(newBudget);

  // ─────────────────────────────────────────────────────────────────────────────
  // ⚠️ TODOS os hooks precisam rodar ANTES do primeiro `return` de guard.
  //
  // Antes, cada token de portal era um useMemo seguido do seu próprio `return`,
  // e o useState/useEffect do overlay ficavam DEPOIS dos guards de autenticação.
  // Resultado: a contagem de hooks mudava entre renders. O caso que quebrava em
  // produção era o mais comum de todos — o carregamento normal:
  //   render 1: loadingSession=true  → nenhum guard dispara → roda TODOS os hooks
  //   render 2: loadingSession=false, session=null → `return <Auth/>` no meio
  //             → os hooks do overlay não rodam → menos hooks que no render 1
  //             → React #300 ("Rendered fewer hooks than expected") → tela branca.
  // Por isso a tela branca aparecia logo após limpar o storage/deslogar.
  // ─────────────────────────────────────────────────────────────────────────────

  // Tokens de portais públicos — derivados de window.location, estáveis no ciclo
  // de vida da página (por isso deps vazias).
  /* eslint-disable react-hooks/exhaustive-deps */
  const portalToken = React.useMemo(() => {
    if (window.location.pathname === '/portal') {
      return new URLSearchParams(window.location.search).get('token');
    }
    return null;
  }, []);

  const clientPortalToken = React.useMemo(() => {
    if (window.location.pathname === '/portal-cliente') {
      return new URLSearchParams(window.location.search).get('token');
    }
    return null;
  }, []);

  const brokerPortalToken = React.useMemo(() => {
    if (window.location.pathname === '/portal-corretor') {
      return new URLSearchParams(window.location.search).get('token');
    }
    return null;
  }, []);

  const investorPortalToken = React.useMemo(() => {
    if (window.location.pathname === '/portal-investidor') {
      return new URLSearchParams(window.location.search).get('token');
    }
    return null;
  }, []);

  const partnerPortalToken = React.useMemo(() => {
    if (window.location.pathname === '/portal-parceiro') {
      return new URLSearchParams(window.location.search).get('token');
    }
    return null;
  }, []);

  const supplierPortalToken = React.useMemo(() => {
    if (window.location.pathname === '/portal-fornecedor') {
      return new URLSearchParams(window.location.search).get('token');
    }
    return null;
  }, []);

  const orderShareToken = React.useMemo(() => {
    const match = window.location.pathname.match(/^\/pedido\/([0-9a-f-]{36})$/i);
    return match ? match[1] : null;
  }, []);

  const proposalShareToken = React.useMemo(() => {
    const match = window.location.pathname.match(/^\/proposta\/([0-9a-f-]{36})$/i);
    return match ? match[1] : null;
  }, []);

  const officesShareProjectId = React.useMemo(() => {
    const match = window.location.pathname.match(/^\/especificacoes-cliente\/([0-9a-f-]{36})$/i);
    return match ? match[1] : null;
  }, []);

  const marketplaceSlug = React.useMemo(() => {
    const match = window.location.pathname.match(/^\/m\/([a-z0-9-]+)\/?$/i);
    return match ? match[1] : null;
  }, []);

  const publicPlantDocId = React.useMemo(() => {
    const match = window.location.pathname.match(/^\/publico\/validar-planta\/([0-9a-f-]{36})$/i);
    return match ? match[1] : null;
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const showOverlay = loadingSession || !profileSynchronized || isValidating || projectsLoading;

  // Escape hatch: se o overlay continuar ativo por muito tempo, o backend
  // provavelmente está indisponível (ex.: Postgres travado → 522/503). Sem
  // isto o app fica preso em "Sincronizando..." para sempre, sem avisar o
  // usuário. Após OVERLAY_STUCK_MS mostramos uma tela de erro com "Tentar
  // novamente" em vez do loading infinito.
  const OVERLAY_STUCK_MS = 15000;
  const [overlayStuck, setOverlayStuck] = React.useState(false);
  React.useEffect(() => {
    if (!showOverlay) { setOverlayStuck(false); return; }
    const timer = setTimeout(() => setOverlayStuck(true), OVERLAY_STUCK_MS);
    return () => clearTimeout(timer);
  }, [showOverlay]);

  // ── Guards públicos (ordem preservada) ───────────────────────────────────────
  if (portalToken) return <PortalTokenGate token={portalToken} />;
  if (clientPortalToken) return <ClientPortalTokenGate token={clientPortalToken} />;
  if (brokerPortalToken) return <BrokerPortalTokenGate token={brokerPortalToken} />;
  if (investorPortalToken) return <InvestorPortalTokenGate token={investorPortalToken} />;
  if (partnerPortalToken) return <PartnerPortalTokenGate token={partnerPortalToken} />;
  if (supplierPortalToken) return <SupplierPortalTokenGate token={supplierPortalToken} />;
  if (orderShareToken) return <PublicOrderView token={orderShareToken} />;
  if (proposalShareToken) return <PublicProposalView token={proposalShareToken} />;
  if (officesShareProjectId) return <PublicEspecificacoesView projetoId={officesShareProjectId} />;
  if (marketplaceSlug) return (
    <React.Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}>
      <PublicMarketplaceView slug={marketplaceSlug} />
    </React.Suspense>
  );
  if (publicPlantDocId) return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>}>
      <PublicPlantChecker />
    </React.Suspense>
  );

  // ── Guards de autenticação ───────────────────────────────────────────────────
  if (isResettingPassword) return <ResetPassword onComplete={() => setIsResettingPassword(false)} />;
  if (!loadingSession && !selectedLoginGroup) return <LoginGateway onSelectGroup={setSelectedLoginGroup} />;
  if (!loadingSession && !session) return <Auth group={selectedLoginGroup || undefined} onBack={() => setSelectedLoginGroup(null)} />;
  if (authError) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center gap-4">
      <Shield className="w-12 h-12 text-red-500" />
      <h2 className="text-xl font-bold">Erro de Acesso</h2>
      <p className="text-slate-600 max-w-md">{authError}</p>
      <button
        onClick={() => { setSelectedLoginGroup(null); setSession(null); supabase.auth.signOut(); }}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold"
      >
        Voltar ao Início
      </button>
    </div>
  );

  // ── Layout principal ─────────────────────────────────────────────────────────
  return (
    <Layout
      activeView={activeView}
      onChangeView={setActiveView}
      projectName={settingsWithId.name || ''}
      onEditProject={handleEditActiveProject}
      onSaveProject={handleSaveProject}
      onDeleteProject={handleDeleteProject}
      isSaving={isSaving}
      profile={{ ...currentProfile, email: session?.user?.email }}
      onNavigate={handleNavigate}
      isNotificationOpen={isNotificationOpen}
      setIsNotificationOpen={setIsNotificationOpen}
    >
      {/* Overlay de loading — transição CSS, nunca desmontado */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          backgroundColor: 'rgba(248, 250, 252, 0.8)',
          backdropFilter: 'blur(8px)',
          opacity: showOverlay ? 1 : 0,
          pointerEvents: showOverlay ? 'auto' : 'none',
          transition: 'opacity 300ms ease-in-out',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        {overlayStuck ? (
          <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
            <WifiOff className="w-10 h-10 text-red-500" />
            <p className="text-sm font-black uppercase tracking-[0.15em] text-slate-600">Falha de conexão com o servidor</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Não foi possível sincronizar com o ÒPURA. O servidor pode estar
              temporariamente indisponível. Verifique sua conexão e tente novamente.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-1 px-6 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Sincronizando Opura...</p>
          </div>
        )}
      </div>

      {/* Roteamento de conteúdo */}
      <ErrorBoundary>
      <AppRouter
        activeView={activeView}
        setActiveView={setActiveView}
        currentProfile={currentProfile}
        settingsWithId={settingsWithId}
        budget={budget}
        projects={projects}
        allProjects={allProjects}
        organizations={organizations}
        projectId={projectId}
        session={session as import('@supabase/supabase-js').Session | null}
        activeOrganizationId={activeOrganizationId}
        setActiveOrganizationId={setActiveOrganizationId}
        clientProfile={clientProfile}
        investorProfile={investorProfile}
        supplierProfile={supplierProfile}
        clients={clients}
        setClientProfile={setClientProfile}
        favorites={favorites}
        contractsVersion={contractsVersion}
        setContractsVersion={setContractsVersion}
        managementTab={managementTab}
        setManagementTab={setManagementTab}
        projectsLoading={projectsLoading}
        selectedOrderId={selectedOrderId}
        setSelectedOrderId={setSelectedOrderId}
        editingOrderId={editingOrderId}
        setEditingOrderId={setEditingOrderId}
        pendingSupplierOrderViewMode={pendingSupplierOrderViewMode}
        setPendingSupplierOrderViewMode={setPendingSupplierOrderViewMode}
        selectedQuotationId={selectedQuotationId}
        setSelectedQuotationId={setSelectedQuotationId}
        editingQuotationId={editingQuotationId}
        setEditingQuotationId={setEditingQuotationId}
        selectedContractId={selectedContractId}
        setSelectedContractId={setSelectedContractId}
        editingContract={editingContract}
        setEditingContract={setEditingContract}
        isCreatingOrder={isCreatingOrder}
        setIsCreatingOrder={setIsCreatingOrder}
        ordersVersion={ordersVersion}
        isCreatingQuotation={isCreatingQuotation}
        setIsCreatingQuotation={setIsCreatingQuotation}
        isCreatingContract={isCreatingContract}
        setIsCreatingContract={setIsCreatingContract}
        isImportModalOpenPlanning={isImportModalOpenPlanning}
        setIsImportModalOpenPlanning={setIsImportModalOpenPlanning}
        isCreatingImovibStudy={isCreatingImovibStudy}
        setIsCreatingImovibStudy={setIsCreatingImovibStudy}
        editingImovibStudyId={editingImovibStudyId}
        setEditingImovibStudyId={setEditingImovibStudyId}
        viewingImovibStudyId={viewingImovibStudyId}
        setViewingImovibStudyId={setViewingImovibStudyId}
        isCreatingOrganization={isCreatingOrganization}
        setIsCreatingOrganization={setIsCreatingOrganization}
        editingOrganizationId={editingOrganizationId}
        setEditingOrganizationId={setEditingOrganizationId}
        handleNavigate={handleNavigate}
        handleNewProject={handleNewProject}
        handleLoadProject={handleLoadProject}
        handleLoadAndEditProject={handleLoadAndEditProject}
        handleDuplicateProject={handleDuplicateProject}
        handleImportProject={handleImportProject}
        handleExportProject={handleExportProject}
        handleDeleteProjectFromList={handleDeleteProjectFromList}
        handleDeleteOrganization={handleDeleteOrganization}
        handleUpsertOrganization={handleUpsertOrganization}
        handleSaveProject={handleSaveProject}
        handleUpdateSettings={handleUpdateSettings}
        handleUpdateBudget={handleUpdateBudget}
        handleContractSubmit={handleContractSubmit}
        toggleFavorite={toggleFavorite}
        fetchClients={fetchClients}
        setProjectId={setProjectId}
      />
      </ErrorBoundary>

      {/* Modais globais — lazy: só carregam quando necessários */}
      <React.Suspense fallback={null}>
        <AIChat isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} budget={budget} settings={settingsWithId} />
      </React.Suspense>

      <React.Suspense fallback={null}>
        <ProjectModal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onSubmit={handleUpsertProject as (data: any) => void}
          initialData={projectModalMode === 'edit' ? projectSettings as any : undefined}
          mode={projectModalMode as any}
          initialClassification={projectModalInitialClassification}
          organizationId={organizations[0]?.id}
          organizations={organizations.map(o => ({ id: o.id, name: o.name }))}
        />
      </React.Suspense>

      {isCreatingOrder && (
        <SupplyChainOrderForm
          onBack={() => { setIsCreatingOrder(false); setEditingOrderId(null); }}
          onSave={() => { setIsCreatingOrder(false); setEditingOrderId(null); setOrdersVersion(v => v + 1); }}
          editingOrderId={editingOrderId}
        />
      )}

      <ContractModal
        isOpen={isCreatingContract}
        onClose={() => { setIsCreatingContract(false); setEditingContract(null); }}
        onSubmit={handleContractSubmit as unknown as (data: Partial<Contract>) => Promise<void>}
        projectId={projectId || ''}
        organizationId={activeOrganizationId || undefined}
        initialData={editingContract || undefined}
        domain="SUPRIMENTOS"
      />

      {/* PWA */}
      <OfflineIndicator />
      <PWAInstallPrompt />

      {/* Toast global */}
      {localToast && (
        <div className="fixed bottom-6 right-6 z-[99999] animate-in slide-in-from-bottom-5 duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            <div className="bg-white/20 p-1.5 rounded-full">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <p className="font-bold text-sm">{localToast.message}</p>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;