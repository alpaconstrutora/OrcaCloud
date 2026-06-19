import React from 'react';
import { Plus, FileSpreadsheet, TrendingUp } from 'lucide-react';
import { ProfileGroup, UserProfile, ProjectSettings, BudgetEntry, Organization, Contract, Client } from '../types';
import { Session } from '@supabase/supabase-js';
import { ProjectData } from '../services/projectService';

interface CurrentProfile {
  group: ProfileGroup;
  role: UserProfile;
  email?: string;
}
import { INITIAL_PROJECT_SETTINGS } from '../constants';

// Views — lazy (carregadas apenas quando acessadas)
const Dashboard             = React.lazy(() => import('./Dashboard'));
const ProjectList           = React.lazy(() => import('./ProjectList'));
const ProjectOverview       = React.lazy(() => import('./ProjectOverview'));
const Settings              = React.lazy(() => import('./Settings'));
const ClientArea            = React.lazy(() => import('./ClientArea').then(m => ({ default: m.ClientArea })));
const OrganizationList      = React.lazy(() => import('./OrganizationList'));
const BudgetEditor          = React.lazy(() => import('./BudgetEditor'));
const ParametricEstimator   = React.lazy(() => import('./ParametricEstimator'));
const FinancialScheduleL    = React.lazy(() => import('./FinancialSchedule').then(m => ({ default: m.FinancialSchedule })));
const PlanningDashboard     = React.lazy(() => import('./PlanningDashboard'));
const ExcelImportModal      = React.lazy(() => import('./ExcelImportModal'));
const ProjectDiaryManager   = React.lazy(() => import('./ProjectDiaryManager'));
const DiaryReportViewer     = React.lazy(() => import('./DiaryReportViewer'));
const DiaryDashboard        = React.lazy(() => import('./DiaryDashboard'));
const LaborDashboard        = React.lazy(() => import('./LaborDashboard'));
const LaborModule           = React.lazy(() => import('./LaborModule'));
const ProjectFinancialManager = React.lazy(() => import('./ProjectFinancialManager'));
const ReportViewer          = React.lazy(() => import('./ReportViewer'));
const ProjectSettingsView   = React.lazy(() => import('./ProjectSettingsView'));
const SupplyChainOrderList  = React.lazy(() => import('./SupplyChainOrderList'));
const SupplyChainOrderDetails = React.lazy(() => import('./SupplyChainOrderDetails'));
const SupplyChainQuotationList = React.lazy(() => import('./SupplyChainQuotationList'));
const SupplyChainQuotationComparison = React.lazy(() => import('./SupplyChainQuotationComparison'));
const SupplyChainContractList = React.lazy(() => import('./SupplyChainContractList'));
const ContractDetailView    = React.lazy(() => import('./ContractDetailView'));
const ContractsDashboard    = React.lazy(() => import('./ContractsDashboard'));
const ContractTemplateManager = React.lazy(() => import('./ContractTemplateManager'));
const ContractIndexManager  = React.lazy(() => import('./ContractIndexManager'));
const SupplyChainReceiptManager = React.lazy(() => import('./SupplyChainReceiptManager'));
const AutomationManager     = React.lazy(() => import('./AutomationManager'));
const ImovibDashboard       = React.lazy(() => import('./ImovibDashboard'));
const ImovibForm            = React.lazy(() => import('./ImovibForm'));
const ImovibDetailView      = React.lazy(() => import('./ImovibDetailView'));
const InvestorDashboard     = React.lazy(() => import('./InvestorDashboard'));
const SupplierDashboard     = React.lazy(() => import('./SupplierDashboard'));
const BrokerPortal          = React.lazy(() => import('./BrokerPortal'));
const SalesModule           = React.lazy(() => import('./SalesModule'));
const RentalsModule         = React.lazy(() => import('./RentalsModule'));
const DatabaseExplorer      = React.lazy(() => import('./DatabaseExplorer'));
const QualityModule         = React.lazy(() => import('./QualityModule'));
const FiscalModuleL         = React.lazy(() => import('./fiscal/FiscalModule').then(m => ({ default: m.FiscalModule })));
const OperacionalModule     = React.lazy(() => import('./OperacionalModule'));
const StructuralModule      = React.lazy(() => import('./StructuralModule'));
const TasksModule           = React.lazy(() => import('./TasksModule'));
const ServicesCommercialModule = React.lazy(() => import('./ServicesCommercialModule'));
const ServiceContractsModule   = React.lazy(() => import('./ServiceContractsModule'));
const SalesManagementModule    = React.lazy(() => import('./SalesManagementModule'));
import { VIEW_TO_SALES_TAB } from '../constants/salesTabs';
import { VIEW_TO_CONTROLADORIA_TAB } from '../constants/controladoríaTabs';
const NotificationsCenter   = React.lazy(() => import('./NotificationsCenter'));
const ProjectTypeTemplateEditor = React.lazy(() => import('./ProjectTypeTemplateEditor'));
const WarrantyModule        = React.lazy(() => import('./WarrantyModule'));
const BIDashboard           = React.lazy(() => import('./BIDashboard'));
const ControladoriaModule   = React.lazy(() => import('./ControladoriaModule'));
const FinancialDashboard       = React.lazy(() => import('./FinancialDashboard'));
const FinancialIntelligence    = React.lazy(() => import('./FinancialIntelligence'));
const ContasReceberManager  = React.lazy(() => import('./ContasReceberManager'));
const FinancialApprovalModule = React.lazy(() => import('./FinancialApprovalModule'));
const FinancialCalendar       = React.lazy(() => import('./FinancialCalendar'));
const DunningModule           = React.lazy(() => import('./DunningModule'));
const MasterDataBrowser     = React.lazy(() => import('./MasterDataBrowser'));
const ProModule             = React.lazy(() => import('./ProModule'));
const OfficesModule         = React.lazy(() => import('./OfficesModule'));
const ReformasModule        = React.lazy(() => import('./ReformasModule'));
const MeasureAIModule       = React.lazy(() => import('./MeasureAIModule'));
const ComplianceDashboard   = React.lazy(() => import('./ComplianceDashboard'));
const CompliancePhysicalMap = React.lazy(() => import('./CompliancePhysicalMap'));
const ComplianceChecklists  = React.lazy(() => import('./ComplianceChecklists'));
const OpuraDocsModule       = React.lazy(() => import('./OpuraDocsModule'));
const OpuraCnoModule        = React.lazy(() => import('./OpuraCnoModule'));
const ObraTypesManager      = React.lazy(() => import('./ObraTypesManager'));
const OpuraMarketModule     = React.lazy(() => import('./OpuraMarketModule'));
const OpuraGovernanceModule = React.lazy(() => import('./OpuraGovernanceModule'));
const OpuraAssetsModule     = React.lazy(() => import('./OpuraAssetsModule'));
const InventoryModule       = React.lazy(() => import('./InventoryModule').then(m => ({ default: m.InventoryModule })));
const ProcurementModule     = React.lazy(() => import('./ProcurementModule').then(m => ({ default: m.ProcurementModule })));
const PartnerPortal         = React.lazy(() => import('./partner/PartnerPortal').then(m => ({ default: m.PartnerPortal })));
const PartnerWorkspaceManager = React.lazy(() => import('./partner/PartnerWorkspaceManager').then(m => ({ default: m.PartnerWorkspaceManager })));



// Suspense fallback
const Spinner = () => (
    <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
);

export interface AppRouterProps {
  activeView: string;
  setActiveView: (view: string) => void;
  currentProfile: CurrentProfile;
  settingsWithId: ProjectSettings & { id?: string };
  budget: BudgetEntry[];
  projects: ProjectData[];
  organizations: Organization[];
  projectId: string | null;
  session: Session | null;
  activeOrganizationId: string | null;
  setActiveOrganizationId: (id: string | null) => void;
  clientProfile: Client | null;
  investorProfile: import('../types').Investor | null;
  supplierProfile: import('../types').Supplier | null;
  clients: Client[];
  setClientProfile: (profile: Client | null) => void;
  favorites: string[];
  contractsVersion: number;
  setContractsVersion: React.Dispatch<React.SetStateAction<number>>;
  managementTab: string;
  setManagementTab: (tab: string) => void;
  projectsLoading: boolean;
  // UI State
  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;
  editingOrderId: string | null;
  setEditingOrderId: (id: string | null) => void;
  pendingSupplierOrderViewMode: 'details' | 'logistics' | undefined;
  setPendingSupplierOrderViewMode: (mode: 'details' | 'logistics' | undefined) => void;
  selectedQuotationId: string | null;
  setSelectedQuotationId: (id: string | null) => void;
  editingQuotationId: string | null;
  setEditingQuotationId: (id: string | null) => void;
  selectedContractId: string | null;
  setSelectedContractId: (id: string | null) => void;
  editingContract: Contract | null;
  setEditingContract: (contract: Contract | null) => void;
  isCreatingOrder: boolean;
  setIsCreatingOrder: (val: boolean) => void;
  ordersVersion: number;
  isCreatingQuotation: boolean;
  setIsCreatingQuotation: (val: boolean) => void;
  isCreatingContract: boolean;
  setIsCreatingContract: (val: boolean) => void;
  isImportModalOpenPlanning: boolean;
  setIsImportModalOpenPlanning: (val: boolean) => void;
  isCreatingImovibStudy: boolean;
  setIsCreatingImovibStudy: (val: boolean) => void;
  editingImovibStudyId: string | null;
  setEditingImovibStudyId: (id: string | null) => void;
  viewingImovibStudyId: string | null;
  setViewingImovibStudyId: (id: string | null) => void;
  isCreatingOrganization: boolean;
  setIsCreatingOrganization: (val: boolean) => void;
  editingOrganizationId: string | null;
  setEditingOrganizationId: (id: string | null) => void;
  // Handlers
  handleNavigate: (link: string) => void;
  handleNewProject: (classification?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO') => void;
  handleLoadProject: (id: string, targetView?: string | null) => Promise<void>;
  handleLoadAndEditProject: (id: string) => Promise<void>;
  handleDuplicateProject: (id: string) => Promise<void>;
  handleImportProject: (data: { name: string; budget: BudgetEntry[]; settings?: Partial<ProjectSettings> }) => Promise<void>;
  handleExportProject: (id: string) => Promise<void>;
  handleDeleteProjectFromList: (id: string) => Promise<void>;
  handleDeleteOrganization: (id: string) => Promise<void>;
  handleUpsertOrganization: (data: Organization, shouldClose?: boolean) => Promise<void>;
  handleSaveProject: (budget?: BudgetEntry[], settings?: ProjectSettings) => Promise<void>;
  handleUpdateSettings: (settings: ProjectSettings) => void;
  handleUpdateBudget: (budget: BudgetEntry[]) => void;
  handleContractSubmit: (data: Contract) => Promise<void>;
  toggleFavorite: (e: React.MouseEvent | React.TouchEvent, code: string) => void;
  fetchClients: () => void;
  setProjectId: (id: string | null) => void;
}

const AppRouter: React.FC<AppRouterProps> = (props) => {
  const {
    activeView, setActiveView, currentProfile, settingsWithId, budget, projects, organizations,
    projectId, session, activeOrganizationId, setActiveOrganizationId,
    clientProfile, investorProfile, supplierProfile, clients, setClientProfile,
    favorites, contractsVersion, setContractsVersion, managementTab, setManagementTab, projectsLoading,
    selectedOrderId, setSelectedOrderId, editingOrderId, setEditingOrderId,
    pendingSupplierOrderViewMode, setPendingSupplierOrderViewMode,
    selectedQuotationId, setSelectedQuotationId, editingQuotationId, setEditingQuotationId,
    selectedContractId, setSelectedContractId, editingContract, setEditingContract,
    isCreatingOrder, setIsCreatingOrder, ordersVersion, isCreatingQuotation, setIsCreatingQuotation,
    isCreatingContract, setIsCreatingContract,
    isImportModalOpenPlanning, setIsImportModalOpenPlanning,
    isCreatingImovibStudy, setIsCreatingImovibStudy,
    editingImovibStudyId, setEditingImovibStudyId,
    viewingImovibStudyId, setViewingImovibStudyId,
    isCreatingOrganization, setIsCreatingOrganization,
    editingOrganizationId, setEditingOrganizationId,
    handleNavigate, handleNewProject, handleLoadProject, handleLoadAndEditProject,
    handleDuplicateProject, handleImportProject, handleExportProject,
    handleDeleteProjectFromList, handleDeleteOrganization, handleUpsertOrganization,
    handleSaveProject, handleUpdateSettings, handleUpdateBudget, handleContractSubmit,
    toggleFavorite, fetchClients, setProjectId,
  } = props;

  // Projects mapeados para formato compatível com todos os componentes (id garantido vindo do banco)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedProjects = projects.filter(p => p.id).map(p => p as any as (typeof p & { id: string }));

  // Force SupplyChainOrderDetails to remount (and refetch) after returning from edit
  const [orderDetailsKey, setOrderDetailsKey] = React.useState(0);
  const prevEditingOrderIdRef = React.useRef(editingOrderId);
  React.useEffect(() => {
    if (prevEditingOrderIdRef.current !== null && editingOrderId === null) {
      setOrderDetailsKey(k => k + 1);
    }
    prevEditingOrderIdRef.current = editingOrderId;
  }, [editingOrderId]);

  // ── Proteção de Rotas / Redirecionamento de Segurança ──────────────────────
  const activeOrg = React.useMemo(() => {
    return organizations.find(o => o.id === activeOrganizationId);
  }, [organizations, activeOrganizationId]);

  const currentMember = React.useMemo(() => {
    if (!activeOrg?.members || !session?.user?.email) return null;
    return activeOrg.members.find(m => m.email.toLowerCase() === session?.user?.email?.toLowerCase()) || null;
  }, [activeOrg, session?.user?.email]);

  React.useEffect(() => {
    const isDevEmail = session?.user?.email?.toLowerCase() === 'altair.rosa@alpaconstrutora.com.br';
    // Desenvolvedores sempre têm acesso total
    if (currentProfile.group === 'DESENVOLVEDOR' || isDevEmail || !activeOrganizationId) return;
    
    // Se não há membro correspondente na organização selecionada, não redireciona (pode estar carregando)
    if (!currentMember) return;
    
    // Admins da organização sempre têm acesso total
    if (currentMember.role === 'admin') return;

    const roleId = currentMember.customRoleId || currentMember.role;
    const matrix = activeOrg?.settings?.module_visibility || {};

    // Suporte ao novo formato por produto — retrocompatível
    const productCtx = (currentMember as any).productContext || 'platform';
    let productMatrix: Record<string, Record<string, boolean>>;
    if ((matrix as any).platform !== undefined || (matrix as any).pro !== undefined || (matrix as any).offices !== undefined) {
      productMatrix = ((matrix as any)[productCtx] as Record<string, Record<string, boolean>>) || {};
    } else {
      productMatrix = matrix as Record<string, Record<string, boolean>>;
    }
    const roleConfig = productMatrix[roleId] || {};

    const isModuleAllowed = (userPermKey: string, matrixKey: string): boolean => {
      const userPerm = currentMember.permissions ? (currentMember.permissions as any)[userPermKey] : undefined;
      if (userPerm !== undefined) {
        return !!userPerm;
      }
      if (roleConfig[matrixKey] !== undefined) {
        return !!roleConfig[matrixKey];
      }
      return true; // Default true
    };

    // Mapear activeView para suas respectivas permissões
    let allowed = true;
    
    if (activeView.startsWith('labor-') || activeView === 'labor-management') {
      allowed = isModuleAllowed('canViewLabor', 'rh');
    } else if (activeView === 'pro-dashboard') {
      allowed = isModuleAllowed('canViewPro', 'pro');
    } else if (activeView === 'offices' || activeView === 'offices-dashboard' || activeView.startsWith('offices-')) {
      allowed = isModuleAllowed('canViewOffices', 'offices');
    } else if (['sales', 'rentals', 'gestao-vendas'].includes(activeView)) {
      allowed = isModuleAllowed('canViewSales', 'crm');
    } else if (activeView === 'imovib') {
      allowed = isModuleAllowed('canViewImovib', 'incorporacao');
    } else if (activeView === 'fiscal-nfe') {
      allowed = isModuleAllowed('canViewFiscal', 'fiscal');
    } else if (['quality', 'pos-obra'].includes(activeView)) {
      allowed = isModuleAllowed('canViewQuality', 'quality');
    } else if (['eng-obras', 'eng-orcamentos', 'analytic', 'parametric', 'explorer'].includes(activeView)) {
      allowed = isModuleAllowed('canViewBudget', 'obras');
    } else if (activeView.startsWith('supplies-')) {
      allowed = isModuleAllowed('canViewOrders', 'compras');
    } else if (activeView === 'opura-docs') {
      allowed = true;
    } else if (activeView === 'opura-market') {
      allowed = true;
    } else if (activeView === 'opura-governance') {
      allowed = true;
    } else if (activeView === 'opura-assets') {
      allowed = true;
    } else if (activeView === 'almoxarifado') {
      allowed = true;
    } else if (activeView === 'plano-aquisicoes') {
      allowed = true;
    }

    if (!allowed) {
      console.warn(`[RouteGuard] Acesso bloqueado para a rota: ${activeView}. Redirecionando para dashboard.`);
      setActiveView('dashboard');
    }
  }, [activeView, currentMember, activeOrg, activeOrganizationId, currentProfile.group, setActiveView]);

  // ── Render interno (envolto em Suspense para lazy components) ───────────────
  const renderContent = () => {
  // ── Portais de perfil específico (acesso direto sem switch) ─────────────────
  if (currentProfile.group === ProfileGroup.CLIENT) {
    return (
      <ClientArea
        settings={settingsWithId}
        budget={budget || []}
        profile={currentProfile}
        clientProfile={clientProfile}
        clients={clients}
        organizationId={activeOrganizationId}
        onClientSelect={(c: Client) => setClientProfile(c)}
        onUpdateSettings={handleUpdateSettings}
        activeTab={activeView as 'dashboard' | 'clientes' | 'jornada' | 'visual' | 'personalizacao' | 'diario' | 'documentos' | 'financeiro' | 'suporte'}
      />
    );
  }
  if (currentProfile.group === ProfileGroup.INVESTOR) {
    return (
      <InvestorDashboard
        settings={settingsWithId}
        organizationId={activeOrganizationId || undefined}
        budget={budget}
        profile={currentProfile}
        investorProfile={investorProfile}
        activeTab={activeView === 'dashboard' ? 'dashboard' : activeView as 'dashboard' | 'holdings' | 'opportunities' | 'reports'}
      />
    );
  }
  if (currentProfile.group === ProfileGroup.SUPPLIER) {
    const supplierTab = activeView === 'supplier-area' ? 'negotiations' : (activeView === 'orders' ? 'orders' : 'overview');
    return <SupplierDashboard profile={currentProfile} supplierProfile={supplierProfile} onNavigate={handleNavigate} activeTab={supplierTab as 'overview' | 'negotiations' | 'quotations' | 'orders' | 'documents' | 'profile'} />;
  }
  if (currentProfile.group === ProfileGroup.BROKER) {
    const tabMap: Record<string, string> = {
      'broker-proposals': 'propostas', 'broker-leads': 'leads', 'broker-commissions': 'comissoes',
      'broker-materials': 'materiais', 'broker-ranking': 'ranking', 'broker-training': 'treinamento',
      'broker-events': 'agenda', 'broker-chat': 'chat', 'broker-analytics': 'analytics',
      'broker-health': 'saude', 'broker-integrations': 'integracoes'
    };
    return <BrokerPortal profile={currentProfile} activeTab={(tabMap[activeView] || 'estoque') as 'estoque' | 'propostas' | 'leads' | 'comissoes' | 'materiais' | 'ranking' | 'treinamento' | 'agenda' | 'chat' | 'analytics' | 'saude' | 'integracoes'} />;
  }
  if (currentProfile.group === ProfileGroup.PARTNER) {
    return (
      <React.Suspense fallback={<Spinner />}>
        <PartnerPortal userEmail={session?.user?.email || ''} />
      </React.Suspense>
    );
  }

  // ── Roteamento principal ─────────────────────────────────────────────────────
  switch (activeView) {
    case 'partner-workspaces-admin':
      return (
        <React.Suspense fallback={<Spinner />}>
          <PartnerWorkspaceManager organizationId={activeOrganizationId || ''} />
        </React.Suspense>
      );

    case 'opura-docs':
      return (
        <React.Suspense fallback={<Spinner />}>
          <OpuraDocsModule
            activeOrganizationId={activeOrganizationId}
            projects={typedProjects}
            currentProfile={currentProfile}
            onChangeView={setActiveView}
          />
        </React.Suspense>
      );

    case 'opura-market':
      return (
        <React.Suspense fallback={<Spinner />}>
          <OpuraMarketModule
            organizationId={activeOrganizationId || organizations[0]?.id || ''}
            setActiveView={setActiveView}
          />
        </React.Suspense>
      );

    case 'opura-cno':
      return (
        <React.Suspense fallback={<Spinner />}>
          <OpuraCnoModule
            activeOrganizationId={activeOrganizationId}
            projectId={projectId}
            onChangeView={setActiveView}
          />
        </React.Suspense>
      );

    case 'opura-governance':
      return (
        <React.Suspense fallback={<Spinner />}>
          <OpuraGovernanceModule
            activeOrganizationId={activeOrganizationId}
            onChangeView={setActiveView}
          />
        </React.Suspense>
      );

    case 'opura-assets':
      return (
        <React.Suspense fallback={<Spinner />}>
          <OpuraAssetsModule
            activeOrganizationId={activeOrganizationId}
            onChangeView={setActiveView}
          />
        </React.Suspense>
      );

    case 'almoxarifado':
      return (
        <React.Suspense fallback={<Spinner />}>
          <InventoryModule
            activeOrganizationId={activeOrganizationId}
            onChangeView={setActiveView}
          />
        </React.Suspense>
      );

    case 'plano-aquisicoes':
      return (
        <React.Suspense fallback={<Spinner />}>
          <ProcurementModule
            activeOrganizationId={activeOrganizationId}
            onChangeView={setActiveView}
          />
        </React.Suspense>
      );

    case 'compliance-dashboard':
      return (
        <ComplianceDashboard
          organizationId={activeOrganizationId || ''}
          onNavigate={setActiveView}
        />
      );

    case 'compliance-physical-map':
      return (
        <CompliancePhysicalMap
          organizationId={activeOrganizationId || ''}
          onBack={() => setActiveView('compliance-dashboard')}
        />
      );

    case 'compliance-checklists':
      return (
        <ComplianceChecklists
          organizationId={activeOrganizationId || ''}
          onBack={() => setActiveView('compliance-dashboard')}
        />
      );

    case 'measure-ai':
      return (
        <MeasureAIModule
          userId={session?.user?.id || ''}
        />
      );

    case 'pro-dashboard':
    case 'pro-orcamento-form':
    case 'pro-servico-detalhe':
    case 'pro-clientes-lista':
    case 'pro-config':
      return (
        <ProModule
          activeView={activeView}
          onChangeView={setActiveView}
          userId={session?.user?.id || ''}
        />
      );

    case 'offices':
    case 'offices-dashboard':
    case 'offices-crm':
    case 'offices-especificador':
    case 'offices-timesheet':
    case 'offices-biblioteca':
    case 'offices-financeiro':
      return (
        <OfficesModule
          activeView={activeView}
          onChangeView={setActiveView}
          userId={session?.user?.id || ''}
        />
      );

    case 'reformas-dashboard':
    case 'reformas-diarios':
    case 'reformas-cronograma':
      return (
        <ReformasModule
          activeView={activeView}
          onChangeView={setActiveView}
          userId={session?.user?.id || ''}
        />
      );

    case 'dashboard':
      if (settingsWithId.classification === 'OBRA') {
        return (
          <ProjectOverview
            settings={settingsWithId}
            budget={budget}
            projects={typedProjects}
            onNavigate={setActiveView}
            onLoadProject={handleLoadProject}
          />
        );
      }
      return <Dashboard settings={settingsWithId} budget={budget} onNavigate={setActiveView} />;

    case 'analytic':
      return (
        <BudgetEditor
          settings={settingsWithId}
          budget={budget}
          onUpdateBudget={handleUpdateBudget}
          onUpdateSettings={handleUpdateSettings}
          onSaveProject={handleSaveProject}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          projectId={settingsWithId.id}
          organizationId={activeOrganizationId || undefined}
        />
      );

    case 'parametric':
      return (
        <ParametricEstimator
          settings={settingsWithId}
          onUpdateSettings={handleUpdateSettings}
          onUpdateBudget={handleUpdateBudget}
          onNavigate={setActiveView}
        />
      );

    case 'planning-view':
      return (
        <FinancialScheduleL
          settings={settingsWithId}
          budget={budget}
          projects={typedProjects}
          organizations={organizations}
          organizationId={activeOrganizationId || undefined}
          onLoadProject={handleLoadProject}
          onUpdateSettings={handleUpdateSettings}
          onUpdateBudget={handleUpdateBudget}
          onBack={() => setActiveView('eng-planejamento')}
        />
      );

    case 'eng-planejamento':
      return (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestão de Planejamento</h1>
              <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie seus planejamentos com infraestrutura de alta performance.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsImportModalOpenPlanning(true)}
                className="flex items-center gap-3 px-6 py-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-[1.25rem] hover:bg-emerald-600 hover:text-white font-black text-xs uppercase tracking-widest transition-all shadow-sm active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Importar Excel
              </button>
              <button
                onClick={() => handleNewProject('PLANEJAMENTO')}
                className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Novo Planejamento
              </button>
            </div>
          </div>
          <PlanningDashboard projects={typedProjects} />
          <ProjectList
            projects={typedProjects}
            onLoadProject={handleLoadProject}
            onEditProject={handleLoadAndEditProject}
            onNewProject={handleNewProject}
            onDuplicateProject={handleDuplicateProject}
            onImportProject={handleImportProject}
            onExportProject={handleExportProject}
            onRowClick={(id) => handleLoadProject(id, 'planning-view')}
            organizationId={activeOrganizationId || undefined}
            classificationFilter="PLANEJAMENTO"
            hideHeader={true}
          />
          <ExcelImportModal
            isOpen={isImportModalOpenPlanning}
            onClose={() => setIsImportModalOpenPlanning(false)}
            onImport={(data) => { handleImportProject(data); setIsImportModalOpenPlanning(false); }}
          />
        </div>
      );

    case 'project-diary':
      if (!projectId) {
        return (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestão de Diário de Obras</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Acompanhe e registre o dia a dia das suas obras com precisão.</p>
              </div>
            </div>
            <DiaryDashboard projects={typedProjects} />
            <div className="flex justify-end gap-4 pr-4">
              <button
                onClick={() => setActiveView('labor-analytics')}
                className="flex items-center gap-3 px-6 py-3 bg-white text-blue-600 border-2 border-blue-50 rounded-[1.25rem] hover:bg-blue-50 font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95"
              >
                <TrendingUp className="w-4 h-4" />
                Análise de Equipes
              </button>
              <button
                onClick={() => handleNewProject('DIARIO')}
                className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Novo Diário
              </button>
            </div>
            <ProjectList
              projects={typedProjects}
              onLoadProject={handleLoadProject}
              onEditProject={handleLoadAndEditProject}
              onNewProject={handleNewProject}
              onDuplicateProject={handleDuplicateProject}
              onImportProject={handleImportProject}
              onExportProject={handleExportProject}
              onRowClick={(id) => handleLoadProject(id, 'project-diary')}
              organizationId={activeOrganizationId || undefined}
              classificationFilter="DIARIO"
              hideHeader={true}
              isDiaryView={true}
            />
          </div>
        );
      }
      return (
        <ProjectDiaryManager
          settings={settingsWithId}
          projects={typedProjects}
          onLoadProject={handleLoadProject}
          onUpdateSettings={handleUpdateSettings}
          organizationId={activeOrganizationId || undefined}
          onBackToList={() => setProjectId(null)}
          onSave={handleSaveProject}
          onGenerateReport={() => setActiveView('reports')}
        />
      );

    case 'project-overview':
      return (
        <ProjectOverview
          settings={settingsWithId}
          budget={budget}
          projects={typedProjects}
          onNavigate={setActiveView}
          onLoadProject={handleLoadProject}
        />
      );

    case 'financial-categories':
    case 'bank-reconciliation':
    case 'financial-boletos':
    case 'contas-a-pagar':
    case 'project-financial':
      return (
        <ProjectFinancialManager
          key={`pfm-${contractsVersion}`}
          settings={!projectId ? { ...INITIAL_PROJECT_SETTINGS, name: 'Gestão Comercial', classification: 'OBRA' } : settingsWithId}
          projectId={projectId || undefined}
          organizationId={activeOrganizationId || undefined}
          organizations={organizations}
          userEmail={session?.user?.email}
          onOrgChange={(id) => setActiveOrganizationId(id)}
          budget={budget}
          onUpdateSettings={handleUpdateSettings}
          onViewOrder={(id: string) => { setSelectedOrderId(id); setActiveView('supplies-orders'); }}
        />
      );

    case 'labor-management':
    case 'labor-dashboard':
    case 'labor-cost-dashboard':
    case 'labor-employees':
    case 'labor-teams':
    case 'labor-allocations':
    case 'labor-timetracking':
    case 'labor-productivity':
    case 'labor-documents':
    case 'labor-costs':
    case 'labor-payroll':
    case 'labor-rubrics':
    case 'labor-encargos':
    case 'labor-fiscal':
    // Fase 1 extras
    case 'labor-epis':
    case 'labor-absences':
    case 'labor-trainings':
    case 'labor-rh-dashboard':
    case 'labor-termination':
    // Fase 2
    case 'labor-timebank':
    case 'labor-sst':
    case 'labor-contractors':
    case 'labor-diary':
    // Fase 3
    case 'labor-ats':
    case 'labor-portal':
    case 'labor-evaluation':
    case 'labor-comunicacao':
    case 'labor-bi-analytics':
    case 'labor-esocial':
    case 'labor-vale-refeicao':
    case 'labor-incentivos':
      return <LaborModule activeOrganizationId={activeOrganizationId || undefined} projects={typedProjects} activeSection={activeView} onChangeView={setActiveView} />;

    case 'labor-analytics':
      return <LaborDashboard projects={typedProjects} onBack={() => setActiveView('project-diary')} />;

    case 'reports':
      if (settingsWithId.classification === 'DIARIO') {
        return <DiaryReportViewer settings={settingsWithId} organizations={organizations} onBack={() => setActiveView('project-diary')} />;
      }
      return <ReportViewer settings={settingsWithId} budget={budget} organizations={organizations} onLoadProject={handleLoadProject} currentProjectId={projectId} />;

    case 'project-settings':
      return <ProjectSettingsView settings={settingsWithId} onUpdateSettings={handleUpdateSettings} />;

    // ── Suprimentos ────────────────────────────────────────────────────────────
    case 'supplies-orders':
      if (selectedOrderId) {
        return (
          <SupplyChainOrderDetails
            key={`${selectedOrderId}-${orderDetailsKey}`}
            orderId={selectedOrderId}
            onBack={() => setSelectedOrderId(null)}
            onEdit={(id) => { setEditingOrderId(id); setIsCreatingOrder(true); }}
            initialView={pendingSupplierOrderViewMode as 'details' | 'logistics'}
            currentUser={{
              email: session?.user?.email || '',
              name: session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || ''
            }}
          />
        );
      }
      return (
        <SupplyChainOrderList
          onCreateNew={() => setIsCreatingOrder(true)}
          onViewDetails={(id) => { setSelectedOrderId(id); setPendingSupplierOrderViewMode('details'); }}
          onViewLogistics={(id) => { setSelectedOrderId(id); setPendingSupplierOrderViewMode('logistics'); }}
          onEdit={(id) => { setEditingOrderId(id); setIsCreatingOrder(true); }}
          version={ordersVersion}
        />
      );

    case 'supplies-quotations':
      return (
        <SupplyChainQuotationList
          onCreateNew={() => setIsCreatingQuotation(true)}
          onViewDetails={(id) => { setEditingQuotationId(id); setIsCreatingQuotation(true); }}
          onViewComparison={(id) => { setSelectedQuotationId(id); setActiveView('supplies-quotations-comparison'); }}
        />
      );

    case 'supplies-quotations-comparison':
      return <SupplyChainQuotationComparison requestId={selectedQuotationId || ''} onBack={() => setActiveView('supplies-quotations')} />;

    case 'supplies-contracts':
      if (selectedContractId) {
        return <ContractDetailView contractId={selectedContractId} onBack={() => setSelectedContractId(null)} budget={budget} />;
      }
      return (
        <ContractsDashboardShell
          organizationId={activeOrganizationId || ''}
          projectId={projectId || ''}
          contractsVersion={contractsVersion}
          setContractsVersion={setContractsVersion}
          setSelectedContractId={setSelectedContractId}
          setIsCreatingContract={setIsCreatingContract}
          setEditingContract={setEditingContract}
          budget={budget}
        />
      );

    case 'supplies-receipts':
      return <SupplyChainReceiptManager onViewOrder={(id) => { setSelectedOrderId(id); setActiveView('supplies-orders'); }} />;

    case 'master-data':
      return <MasterDataBrowser />;

    // ── Controladoria (unificado) ──────────────────────────────────────────────
    case 'controladoria':
      return (
        <ControladoriaModule
          organizationId={activeOrganizationId || organizations[0]?.id || ''}
          organizations={organizations}
          userEmail={session?.user?.email}
          defaultTab={VIEW_TO_CONTROLADORIA_TAB[activeView] || 'dre'}
          onOrgChange={(id) => setActiveOrganizationId(id)}
        />
      );

    case 'fiscal-nfe':
      return <FiscalModuleL />;

    case 'automation':
      return <AutomationManager settings={settingsWithId} onUpdateSettings={handleUpdateSettings} organizationId={activeOrganizationId || undefined} />;

    // ── Imovib — agora gerenciado dentro do SalesManagementModule ──────────────
    case 'imovib':
      return (
        <SalesManagementModule
          organizationId={activeOrganizationId || undefined}
          profile={currentProfile}
          budget={budget}
          defaultTab="viabilidade"
          sourceView={activeView}
          onGoToProject={(id, section) => handleLoadProject(id, section ?? null)}
        />
      );

    case 'notifications-center':
      return <NotificationsCenter profile={currentProfile} onNavigate={handleNavigate} />;

    case 'settings':
      return <Settings />;

    // ── Portais (acesso admin a áreas de portal) ───────────────────────────────
    case 'client-area':
    case 'client-properties':
    case 'documentos':
      return (
        <ClientArea
          settings={settingsWithId}
          budget={budget || []}
          profile={currentProfile}
          clientProfile={clientProfile}
          clients={clients}
          organizationId={activeOrganizationId}
          onClientSelect={(c: Client) => setClientProfile(c)}
          onUpdateSettings={handleUpdateSettings}
          activeTab={activeView === 'documentos' ? 'documentos' : 'dashboard'}
        />
      );

    case 'investor-area':
    case 'holdings':
    case 'opportunities':
      return (
        <InvestorDashboard
          settings={settingsWithId}
          organizationId={activeOrganizationId || undefined}
          budget={budget}
          profile={currentProfile}
          investorProfile={investorProfile}
          activeTab={activeView === 'investor-area' ? 'dashboard' : activeView as 'dashboard' | 'holdings' | 'opportunities' | 'reports'}
        />
      );

    case 'supplier-area':
    case 'orders': {
      const adminSupplierTab = activeView === 'supplier-area' ? 'negotiations' : (activeView === 'orders' ? 'orders' : 'overview');
      return <SupplierDashboard profile={currentProfile} supplierProfile={supplierProfile} onNavigate={handleNavigate} activeTab={adminSupplierTab as 'overview' | 'negotiations' | 'quotations' | 'orders' | 'documents' | 'profile'} />;
    }

    case 'gestao-vendas':
    case 'sales':
    case 'rentals':
    case 'broker-area':
    case 'broker-proposals':
    case 'broker-leads':
    case 'broker-commissions':
    case 'broker-materials':
    case 'broker-ranking':
    case 'broker-training':
    case 'broker-events':
    case 'broker-chat':
    case 'broker-analytics':
    case 'broker-health':
    case 'broker-integrations': {
      const salesTab = VIEW_TO_SALES_TAB[activeView] ?? 'espelho';
      return (
        <SalesManagementModule
          organizationId={activeOrganizationId || undefined}
          profile={currentProfile}
          budget={budget}
          defaultTab={salesTab}
          sourceView={activeView}
          onGoToProject={(id, section) => handleLoadProject(id, section ?? null)}
        />
      );
    }

    // ── Engenharia ─────────────────────────────────────────────────────────────
    case 'eng-obras':
      return (
        <ProjectList
          projects={typedProjects}
          onLoadProject={handleLoadProject}
          onEditProject={handleLoadAndEditProject}
          onNewProject={handleNewProject}
          onDuplicateProject={handleDuplicateProject}
          onImportProject={handleImportProject}
          onExportProject={handleExportProject}
          onRowClick={(id) => handleLoadProject(id, null)}
          organizationId={activeOrganizationId || undefined}
          classificationFilter="OBRA"
          isExternalLoading={projectsLoading}
        />
      );

    case 'eng-orcamentos':
      return (
        <ProjectList
          projects={typedProjects}
          onLoadProject={handleLoadProject}
          onEditProject={handleLoadAndEditProject}
          onNewProject={handleNewProject}
          onDuplicateProject={handleDuplicateProject}
          onImportProject={handleImportProject}
          onExportProject={handleExportProject}
          onRowClick={(id) => handleLoadProject(id, null)}
          organizationId={activeOrganizationId || undefined}
          classificationFilter="ORCAMENTO"
          isExternalLoading={projectsLoading}
        />
      );

    case 'organization':
      return (
        <OrganizationList
          organizations={organizations}
          onCreate={() => setIsCreatingOrganization(true)}
          onEdit={(org: Organization) => { setEditingOrganizationId(org.id); setIsCreatingOrganization(true); }}
          onSave={(org: Organization) => handleUpsertOrganization(org, false)}
          onDelete={handleDeleteOrganization}
          activeTab={managementTab as 'organizations' | 'empresas_grupo' | 'projects' | 'clients' | 'investors' | 'suppliers' | 'users' | 'accounts' | 'cost_centers' | 'chart_of_accounts' | 'settings'}
          onTabChange={setManagementTab}
          projects={typedProjects}
          onClientsChange={fetchClients}
          onLoadProject={handleLoadProject}
          onEditProject={handleLoadAndEditProject}
          onNewProject={handleNewProject}
          onDuplicateProject={handleDuplicateProject}
          onImportProject={handleImportProject}
          onExportProject={handleExportProject}
          onSelect={(org: Organization) => setActiveOrganizationId(org?.id || null)}
        />
      );

    case 'org-type-templates':
      return (
        <ProjectTypeTemplateEditor orgId={activeOrganizationId || ''} />
      );

    case 'eng-obra-types':
      return (
        <React.Suspense fallback={<Spinner />}>
          <ObraTypesManager organizationId={activeOrganizationId || ''} />
        </React.Suspense>
      );

    case 'quality':
      return (
        <QualityModule
          organizationId={activeOrganizationId || ''}
          userId={session?.user?.id || ''}
          userName={session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || ''}
          userRole={currentProfile?.role}
          obras={typedProjects
            .filter(p => p.settings?.classification === 'OBRA' && p.name !== 'Gestão Comercial')
            .map(p => ({ id: p.id, name: p.name }))}
        />
      );

    case 'service-contracts':
    case 'services-commercial': {
      const salesTab = VIEW_TO_SALES_TAB[activeView] ?? 'contratos';
      return (
        <SalesManagementModule
          organizationId={activeOrganizationId || undefined}
          profile={currentProfile}
          budget={budget}
          defaultTab={salesTab}
          sourceView={activeView}
          onGoToProject={(id, section) => handleLoadProject(id, section ?? null)}
        />
      );
    }

    case 'explorer':
      return (
        <DatabaseExplorer
          budget={budget}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onUpdateBudget={handleUpdateBudget}
        />
      );

    // ── Tarefas (agenda pessoal) ────────────────────────────────────────────────
    case 'tarefas':
      return (
        <TasksModule
          activeOrganizationId={activeOrganizationId ?? undefined}
          organizations={organizations}
          projects={typedProjects}
          onChangeView={setActiveView}
        />
      );

    // ── Estrutural / Ferragem Armada ───────────────────────────────────────────
    case 'estrutural':
      return (
        <StructuralModule
          activeOrganizationId={activeOrganizationId ?? undefined}
          projectId={projectId}
          projects={typedProjects}
          onChangeView={setActiveView}
        />
      );

    // ── Controle Operacional ────────────────────────────────────────────────────
    case 'operacional':
    case 'operacional-dashboard':
    case 'operacional-diary':
      return (
        <OperacionalModule
          activeOrganizationId={activeOrganizationId ?? undefined}
          projectId={projectId}
          projects={typedProjects}
          activeSection={activeView}
          onChangeView={setActiveView}
        />
      );

    // ── Pós-Obra & Garantia ────────────────────────────────────────────────────
    case 'pos-obra':
      return (
        <WarrantyModule
          activeOrganizationId={activeOrganizationId ?? undefined}
          projects={typedProjects
            .filter(p => p.settings?.classification === 'OBRA')
            .map(p => ({ id: p.id, name: p.name }))}
        />
      );

    // ── BI Executivo ───────────────────────────────────────────────────────────
    case 'bi-executivo':
      return (
        <BIDashboard
          organizationId={activeOrganizationId || organizations[0]?.id || ''}
          onNavigate={setActiveView}
        />
      );

    // ── Dashboard Executivo Financeiro ─────────────────────────────────────────
    case 'financial-dashboard':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <FinancialDashboard
            organizationId={activeOrganizationId || organizations[0]?.id || ''}
            onNavigate={setActiveView}
          />
        </React.Suspense>
      );

    // ── Inteligência Financeira ────────────────────────────────────────────────
    case 'financial-intelligence':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <FinancialIntelligence
            organizationId={activeOrganizationId || organizations[0]?.id || ''}
            onNavigate={setActiveView}
          />
        </React.Suspense>
      );

    // ── Cobrança Automatizada (Dunning) ───────────────────────────────────────
    case 'dunning':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <DunningModule
            organizationId={activeOrganizationId || organizations[0]?.id || ''}
          />
        </React.Suspense>
      );

    // ── Calendário Financeiro ──────────────────────────────────────────────────
    case 'financial-calendar':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <FinancialCalendar
            organizationId={activeOrganizationId || organizations[0]?.id || ''}
          />
        </React.Suspense>
      );

    // ── Aprovação Financeira ───────────────────────────────────────────────────
    case 'financial-approval':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <FinancialApprovalModule
            organizationId={activeOrganizationId || organizations[0]?.id || ''}
            userEmail={session?.user?.email}
          />
        </React.Suspense>
      );

    // ── Contas a Receber ───────────────────────────────────────────────────────
    case 'contas-a-receber':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <ContasReceberManager
            organizationId={activeOrganizationId || organizations[0]?.id || ''}
            organizations={organizations}
            onOrgChange={(id) => setActiveOrganizationId(id)}
          />
        </React.Suspense>
      );

    // ── Financeiro — DRE & Fluxo de Caixa (redirecionam para Controladoria) ────
    case 'financial-dre':
    case 'financial-cashflow':
      return (
        <ControladoriaModule
          organizationId={activeOrganizationId || organizations[0]?.id || ''}
          organizations={organizations}
          userEmail={session?.user?.email}
          defaultTab={VIEW_TO_CONTROLADORIA_TAB[activeView] || 'dre'}
          onOrgChange={(id) => setActiveOrganizationId(id)}
        />
      );

    // ── Default ────────────────────────────────────────────────────────────────
    default:
      if (settingsWithId.classification === 'OBRA') {
        return (
          <ProjectOverview
            settings={settingsWithId}
            budget={budget}
            projects={typedProjects}
            onNavigate={setActiveView}
            onLoadProject={handleLoadProject}
          />
        );
      }
      return <Dashboard settings={settingsWithId} budget={budget} onNavigate={setActiveView} />;
  }
  }; // fim renderContent

  return (
    <React.Suspense fallback={<Spinner />}>
      {renderContent()}
    </React.Suspense>
  );
};

// ─── ContractsDashboardShell ──────────────────────────────────────────────────
// Wrapper com tabs "Carteira" (dashboard org) / "Por Obra" (lista por projeto)
interface ShellProps {
    organizationId: string;
    projectId: string;
    contractsVersion: number;
    setContractsVersion: (fn: (v: number) => number) => void;
    setSelectedContractId: (id: string | null) => void;
    setIsCreatingContract: (v: boolean) => void;
    setEditingContract: (c: Contract | null) => void;
    budget: BudgetEntry[];
}

const ContractsDashboardShell: React.FC<ShellProps> = ({
    organizationId, projectId, contractsVersion, setContractsVersion,
    setSelectedContractId, setIsCreatingContract, setEditingContract,
}) => {
    const [tab, setTab] = React.useState<'carteira' | 'obra' | 'templates' | 'indices'>('carteira');

    const TABS = [
        { id: 'carteira',  label: 'Carteira' },
        { id: 'obra',      label: 'Por Obra' },
        { id: 'templates', label: 'Templates' },
        { id: 'indices',   label: 'Índices' },
    ] as const;

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                            tab === t.id
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        }`}>
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-auto">
                {tab === 'carteira' && (
                    <ContractsDashboard
                        organizationId={organizationId}
                        onViewContract={(id) => setSelectedContractId(id)}
                        direction="INCOMING"
                    />
                )}
                {tab === 'obra' && (
                    <SupplyChainContractList
                        projectId={projectId}
                        onCreateNew={() => setIsCreatingContract(true)}
                        onViewDetails={(id) => setSelectedContractId(id)}
                        onEdit={(contract) => { setEditingContract(contract); setIsCreatingContract(true); }}
                        onDelete={() => setContractsVersion(v => v + 1)}
                        organizationId={organizationId || undefined}
                        version={contractsVersion}
                    />
                )}
                {tab === 'templates' && (
                    <ContractTemplateManager organizationId={organizationId} />
                )}
                {tab === 'indices' && (
                    <ContractIndexManager organizationId={organizationId} />
                )}
            </div>
        </div>
    );
};

export default AppRouter;
