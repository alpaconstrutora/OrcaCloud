import React from 'react';
import Layout from './components/Layout';
import AIChat from './components/AIChat';
import ProjectModal from './components/ProjectModal';
import Auth from './components/Auth';
import ResetPassword from './components/ResetPassword';
import LoginGateway from './components/LoginGateway';
import { supabase } from './lib/supabase';
import { ContractModal } from './components/ContractModal';
import SupplyChainQuotationForm from './components/SupplyChainQuotationForm';
import SupplyChainOrderForm from './components/SupplyChainOrderForm';
import { INITIAL_PROJECT_SETTINGS } from './constants';
import { BudgetEntry, ProjectSettings, Organization, Contract, Client } from './types';
import { Loader2, Shield } from 'lucide-react';
import { useStore } from './store/useStore';
import { useToast } from './hooks/useToast';
import { usePersistenceSync } from './hooks/usePersistenceSync';
import { useAuthSync } from './hooks/useAuthSync';
import { useProjectOperations } from './hooks/useProjectOperations';
import AppRouter from './components/AppRouter';
import { ErrorBoundary } from './components/ErrorBoundary';
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
    projects, setProjects,
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
    if (session?.user?.id && activeOrganizationId) {
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
  const showOverlay = loadingSession || !profileSynchronized || isValidating || projectsLoading;

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
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Sincronizando OrçaCloud...</p>
        </div>
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

      {/* Modais globais */}
      <AIChat isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} budget={budget} settings={settingsWithId} />

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

      {isCreatingQuotation && (
        <SupplyChainQuotationForm
          onBack={() => { setIsCreatingQuotation(false); setEditingQuotationId(null); }}
          onSave={() => { setIsCreatingQuotation(false); setEditingQuotationId(null); }}
          editingQuotationId={editingQuotationId || null}
        />
      )}

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