import React from 'react';
import { Plus, FileSpreadsheet, FileText } from 'lucide-react';
import Button from './ui/Button';
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
const FpaModule             = React.lazy(() => import('./fpa/FpaModule'));
const Dashboard             = React.lazy(() => import('./Dashboard'));
const ProjectList           = React.lazy(() => import('./ProjectList'));
const ProjectOverview       = React.lazy(() => import('./ProjectOverview'));
const Settings              = React.lazy(() => import('./Settings'));
const ClientArea            = React.lazy(() => import('./ClientArea').then(m => ({ default: m.ClientArea })));
const OrganizationList      = React.lazy(() => import('./OrganizationList'));
const OrganizationCreateSheet = React.lazy(() => import('./OrganizationCreateSheet'));
const BudgetEditor          = React.lazy(() => import('./BudgetEditor'));
const ParametricEstimator   = React.lazy(() => import('./ParametricEstimator'));
const FinancialScheduleL    = React.lazy(() => import('./FinancialSchedule').then(m => ({ default: m.FinancialSchedule })));
const PlanningDashboard     = React.lazy(() => import('./PlanningDashboard'));
const ExcelImportModal      = React.lazy(() => import('./ExcelImportModal'));
const ProjectDiaryManager   = React.lazy(() => import('./ProjectDiaryManager'));
const DiaryReportViewer     = React.lazy(() => import('./DiaryReportViewer'));
const DiaryProjectsList     = React.lazy(() => import('./DiaryProjectsList'));
const LaborDashboard        = React.lazy(() => import('./LaborDashboard'));
const LaborModule           = React.lazy(() => import('./LaborModule'));
const ProjectFinancialManager = React.lazy(() => import('./ProjectFinancialManager'));
const ReportViewer          = React.lazy(() => import('./ReportViewer'));
const ProjectSettingsView   = React.lazy(() => import('./ProjectSettingsView'));
const SupplyChainOrderList  = React.lazy(() => import('./SupplyChainOrderList'));
const SupplyChainOrderDetails = React.lazy(() => import('./SupplyChainOrderDetails'));
const SupplyChainQuotationList = React.lazy(() => import('./SupplyChainQuotationList'));
const SupplyChainQuotationForm = React.lazy(() => import('./SupplyChainQuotationForm'));
const SupplyChainQuotationComparison = React.lazy(() => import('./SupplyChainQuotationComparison'));
const SupplyChainContractList = React.lazy(() => import('./SupplyChainContractList'));
const ContractDetailView    = React.lazy(() => import('./ContractDetailView'));
const ContractTemplateManager = React.lazy(() => import('./ContractTemplateManager'));
const ContractReajusteDue  = React.lazy(() => import('./ContractReajusteDue'));
const SupplyChainReceiptManager = React.lazy(() => import('./SupplyChainReceiptManager'));
const AutomationManager     = React.lazy(() => import('./AutomationManager'));
const ImovibDashboard       = React.lazy(() => import('./ImovibDashboard'));
const ImovibForm            = React.lazy(() => import('./ImovibForm'));
const ImovibDetailView      = React.lazy(() => import('./ImovibDetailView'));
const InvestorDashboard     = React.lazy(() => import('./InvestorDashboard'));
const InvestorModule        = React.lazy(() => import('./InvestorModule'));
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
const MeusTreinamentosView  = React.lazy(() => import('./academy/MeusTreinamentosView'));
const ServicesCommercialModule = React.lazy(() => import('./ServicesCommercialModule'));
const ServiceContractsModule   = React.lazy(() => import('./ServiceContractsModule'));
const SalesManagementModule    = React.lazy(() => import('./SalesManagementModule'));
import { VIEW_TO_SALES_TAB } from '../constants/salesTabs';
import { VIEW_TO_CONTROLADORIA_TAB } from '../constants/controladoríaTabs';
const NotificationsCenter   = React.lazy(() => import('./NotificationsCenter'));
const ProjectTypeTemplateEditor = React.lazy(() => import('./ProjectTypeTemplateEditor'));
const AreaEngineModule = React.lazy(() => import('./AreaEngineModule'));
const AppraisalModule = React.lazy(() => import('./AppraisalModule'));
const WarrantyModule        = React.lazy(() => import('./WarrantyModule'));
const BIDashboard           = React.lazy(() => import('./BIDashboard'));
const CentralControle       = React.lazy(() => import('./CentralControle'));
const OpuraReports          = React.lazy(() => import('./OpuraReports'));
const CentralObra           = React.lazy(() => import('./CentralObra'));
const CentralCliente        = React.lazy(() => import('./CentralCliente'));
const CentralFornecedor     = React.lazy(() => import('./CentralFornecedor'));
const ControladoriaModule   = React.lazy(() => import('./ControladoriaModule'));
const FinancialDashboard       = React.lazy(() => import('./FinancialDashboard'));
const FinancialIntelligence    = React.lazy(() => import('./FinancialIntelligence'));
const ClientChargesModule      = React.lazy(() => import('./ClientChargesModule'));
const BoletoManager            = React.lazy(() => import('./BoletoManager'));
const BankReconciliation       = React.lazy(() => import('./BankReconciliation'));
const ContasReceberManager  = React.lazy(() => import('./ContasReceberManager'));
const TributosAPagarManager  = React.lazy(() => import('./TributosAPagarManager'));
const FinancialApprovalModule = React.lazy(() => import('./FinancialApprovalModule'));
const ProcessosModule        = React.lazy(() => import('./ProcessosModule'));
const FinancialCalendar       = React.lazy(() => import('./FinancialCalendar'));
const DunningModule           = React.lazy(() => import('./DunningModule'));
const MasterDataBrowser     = React.lazy(() => import('./MasterDataBrowser'));
const ProModule             = React.lazy(() => import('./ProModule'));
const OfficesModule         = React.lazy(() => import('./OfficesModule'));
const ReformasModule        = React.lazy(() => import('./ReformasModule'));
const MeasureAIModule       = React.lazy(() => import('./MeasureAIModule'));
const EcommerceDashboard    = React.lazy(() => import('./EcommerceDashboard'));
const EcommercePhysicalMap  = React.lazy(() => import('./EcommercePhysicalMap'));
const EcommerceChecklists   = React.lazy(() => import('./EcommerceChecklists'));
const OpuraDocsModule       = React.lazy(() => import('./OpuraDocsModule'));
const OpuraCnoModule        = React.lazy(() => import('./OpuraCnoModule'));
const ObraTypesManager      = React.lazy(() => import('./ObraTypesManager'));
const OpuraMarketModule     = React.lazy(() => import('./OpuraMarketModule'));
const OpuraGovernanceModule = React.lazy(() => import('./OpuraGovernanceModule'));
const OpuraAssetsModule     = React.lazy(() => import('./OpuraAssetsModule'));
const EmpreendimentoModule  = React.lazy(() => import('./empreendimento/EmpreendimentoModule'));
const RegulatoryMapModule   = React.lazy(() => import('./regulatoryMap/RegulatoryMapModule'));
const InventoryModule       = React.lazy(() => import('./InventoryModule').then(m => ({ default: m.InventoryModule })));
const ProcurementModule     = React.lazy(() => import('./ProcurementModule').then(m => ({ default: m.ProcurementModule })));
const P2PFlowBoard          = React.lazy(() => import('./P2PFlowBoard').then(m => ({ default: m.P2PFlowBoard })));
const PartnerPortal         = React.lazy(() => import('./partner/PartnerPortal').then(m => ({ default: m.PartnerPortal })));
const PartnerWorkspaceManager = React.lazy(() => import('./partner/PartnerWorkspaceManager').then(m => ({ default: m.PartnerWorkspaceManager })));
const SupplierPortalManager = React.lazy(() => import('./supplier/SupplierPortalManager').then(m => ({ default: m.SupplierPortalManager })));
const PlantaAiDashboard     = React.lazy(() => import('./planta_ai/PlantaAiDashboard'));
const BlueprintModule       = React.lazy(() => import('./blueprint/BlueprintModule'));
const DataTablePrototype    = React.lazy(() => import('./DataTablePrototype'));
const ElectricalProjectsView = React.lazy(() => import('./electrical/ElectricalProjectsView'));
const ElectricalEditorView   = React.lazy(() => import('./electrical/ElectricalEditorView'));



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
  /** SÓ obras — ver store/useStore.ts e utils/projectClassification.ts */
  projects: ProjectData[];
  /** Todos os tipos (obra/orçamento/planejamento/diário), para as telas explícitas */
  allProjects: ProjectData[];
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
    activeView, setActiveView, currentProfile, settingsWithId, budget, projects, allProjects, organizations,
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
  // Lista completa (obra + orçamento + planejamento + diário). Passe esta APENAS
  // para telas que são explicitamente sobre os outros tipos — ProjectList (que
  // filtra por `classificationFilter`), PlanningDashboard, DiaryProjectsList,
  // LaborDashboard, ProjectOverview. Todo o resto usa `typedProjects` (só obras).
  const typedAllProjects = allProjects.filter(p => p.id).map(p => p as any as (typeof p & { id: string }));

  // Force SupplyChainOrderDetails to remount (and refetch) after returning from edit
  const [orderDetailsKey, setOrderDetailsKey] = React.useState(0);
  const prevEditingOrderIdRef = React.useRef(editingOrderId);
  React.useEffect(() => {
    if (prevEditingOrderIdRef.current !== null && editingOrderId === null) {
      setOrderDetailsKey(k => k + 1);
    }
    prevEditingOrderIdRef.current = editingOrderId;
  }, [editingOrderId]);

  const [activeElectricalProjectId, setActiveElectricalProjectId] = React.useState<string | null>(null);

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
    } else if (activeView === 'rentals') {
      // Locações tem permissão própria; cai em Vendas só como fallback (retrocompatível)
      allowed = isModuleAllowed('canViewRentals', 'rentals');
    } else if (['sales', 'gestao-vendas'].includes(activeView)) {
      allowed = isModuleAllowed('canViewSales', 'crm');
    } else if (activeView === 'imovib' || activeView === 'empreendimentos' || activeView === 'laudo-avaliacao' || activeView === 'regulatory-maps') {
      allowed = isModuleAllowed('canViewImovib', 'incorporacao');
    } else if (activeView === 'fiscal-nfe') {
      allowed = isModuleAllowed('canViewFiscal', 'fiscal');
    } else if (['quality', 'pos-obra'].includes(activeView)) {
      allowed = isModuleAllowed('canViewQuality', 'quality');
    } else if (['eng-obras', 'eng-orcamentos', 'analytic', 'parametric', 'explorer', 'area-engine'].includes(activeView)) {
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
    return <SupplierDashboard profile={currentProfile} supplierProfile={supplierProfile} onNavigate={handleNavigate} activeTab={supplierTab as 'overview' | 'negotiations' | 'quotations' | 'orders' | 'documents'} />;
  }
  if (currentProfile.group === ProfileGroup.BROKER) {
    const tabMap: Record<string, string> = {
      'broker-proposals': 'propostas', 'broker-leads': 'leads', 'broker-commissions': 'comissoes',
      'broker-materials': 'materiais', 'broker-ranking': 'ranking', 'broker-training': 'treinamento',
      'broker-events': 'agenda', 'broker-chat': 'chat', 'broker-analytics': 'analytics',
      'broker-health': 'saude', 'broker-integrations': 'integracoes'
    };
    return <BrokerPortal profile={currentProfile} organizationId={activeOrganizationId || undefined} activeTab={(tabMap[activeView] || 'analytics') as 'estoque' | 'propostas' | 'leads' | 'comissoes' | 'materiais' | 'ranking' | 'treinamento' | 'agenda' | 'chat' | 'analytics' | 'saude' | 'integracoes'} />;
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
    case 'fpa-module':
      return (
        <React.Suspense fallback={<Spinner />}>
          <FpaModule organizationId={activeOrganizationId || undefined} projectId={projectId || undefined} />
        </React.Suspense>
      );
    case 'partner-workspaces-admin':
      return (
        <React.Suspense fallback={<Spinner />}>
          <PartnerWorkspaceManager organizationId={activeOrganizationId || ''} currentUserEmail={currentProfile.email} />
        </React.Suspense>
      );

    case 'electrical-projects':
      return (
        <React.Suspense fallback={<Spinner />}>
          <ElectricalProjectsView
            organizationId={activeOrganizationId || undefined}
            projectId={projectId || undefined}
            obras={typedProjects}
            setProjectId={setProjectId}
            onChangeView={setActiveView}
            onSelectProject={setActiveElectricalProjectId}
          />
        </React.Suspense>
      );

    case 'electrical-editor':
      if (!activeElectricalProjectId) {
         setActiveView('electrical-projects');
         return null;
      }
      return (
        <React.Suspense fallback={<Spinner />}>
          <ElectricalEditorView
            organizationId={activeOrganizationId || ''}
            projectId={projectId || ''}
            electricalProjectId={activeElectricalProjectId}
            onBack={() => setActiveView('electrical-projects')}
          />
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
            organizationId={activeOrganizationId || ''}
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

    case 'empreendimentos':
      return (
        <React.Suspense fallback={<Spinner />}>
          <EmpreendimentoModule
            activeOrganizationId={activeOrganizationId}
            onChangeView={setActiveView}
            // Aba Vinculações: abrir obra/orçamento/planejamento/contratos/financeiro
            // exige o projeto CARREGADO — setActiveView sozinho não basta.
            onLoadProject={handleLoadProject}
          />
        </React.Suspense>
      );

    case 'regulatory-maps':
      return (
        <React.Suspense fallback={<Spinner />}>
          <RegulatoryMapModule
            activeOrganizationId={activeOrganizationId}
            onChangeView={setActiveView}
          />
        </React.Suspense>
      );

    case 'planta-ai':
      return (
        <React.Suspense fallback={<Spinner />}>
          <PlantaAiDashboard />
        </React.Suspense>
      );

    case 'blueprint':
      return (
        <React.Suspense fallback={<Spinner />}>
          <BlueprintModule />
        </React.Suspense>
      );

    case 'table-prototype':
      return (
        <React.Suspense fallback={<Spinner />}>
          <DataTablePrototype onBack={() => setActiveView('dashboard')} />
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

    case 'fluxo-p2p':
      return (
        <React.Suspense fallback={<Spinner />}>
          <P2PFlowBoard
            activeOrganizationId={activeOrganizationId}
            onChangeView={setActiveView}
          />
        </React.Suspense>
      );

    case 'ecommerce-dashboard':
      return (
        <EcommerceDashboard
          organizationId={activeOrganizationId || ''}
          onNavigate={setActiveView}
        />
      );

    case 'ecommerce-physical-map':
      return (
        <EcommercePhysicalMap
          organizationId={activeOrganizationId || ''}
          onBack={() => setActiveView('ecommerce-dashboard')}
        />
      );

    case 'ecommerce-checklists':
      return (
        <EcommerceChecklists
          organizationId={activeOrganizationId || ''}
          onBack={() => setActiveView('ecommerce-dashboard')}
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
            projects={typedAllProjects}
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
          onOpenDashboard={() => handleLoadProject(settingsWithId.id || '', 'dashboard')}
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
          projects={typedAllProjects}
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
            {/* Variante compacta do CTA primário (ui_ux_guia_unificado.md §17) — ação de
                criação é o fluxo principal desta tela, então fica isolada junto ao título,
                mas no tamanho compacto (h-9), não mais nos 50px da escala antiga. */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsImportModalOpenPlanning(true)}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-[6px] hover:bg-emerald-600 hover:text-white font-medium text-[13px] transition-all active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Importar Excel
              </button>
              <button
                onClick={() => handleNewProject('PLANEJAMENTO')}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
              >
                <Plus className="w-[15px] h-[15px]" />
                Novo planejamento
              </button>
            </div>
          </div>
          <PlanningDashboard projects={typedAllProjects} />
          <ProjectList
            projects={typedAllProjects}
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
          <DiaryProjectsList
            projects={typedAllProjects}
            organizations={organizations}
            onOpenDiary={(id) => handleLoadProject(id, 'project-diary')}
            onEditProject={handleLoadAndEditProject}
            onNewProject={() => handleNewProject('DIARIO')}
            onDuplicateProject={handleDuplicateProject}
            onExportProject={handleExportProject}
            onOpenLaborAnalytics={() => setActiveView('labor-analytics')}
          />
        );
      }
      return (
        <ProjectDiaryManager
          settings={settingsWithId}
          projects={typedAllProjects}
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
          projects={typedAllProjects}
          onNavigate={setActiveView}
          onLoadProject={handleLoadProject}
        />
      );

    case 'financial-categories':
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
          /* `contas-a-pagar` é rota explícita (item de menu "Contas a pagar" e
             deep-link do Fiscal): abre na aba certa em vez da última visitada.
             `project-financial` é a tela consolidada — respeita o localStorage. */
          initialTab={activeView === 'contas-a-pagar' ? 'contas_pagar' : undefined}
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
    case 'labor-cargos':
    case 'labor-remuneracao-societaria':
      return <LaborModule activeOrganizationId={activeOrganizationId || undefined} projects={typedProjects} activeSection={activeView} onChangeView={setActiveView} />;

    case 'labor-analytics':
      return <LaborDashboard projects={typedAllProjects} onBack={() => setActiveView('project-diary')} />;

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
      if (isCreatingQuotation) {
        return (
          <SupplyChainQuotationForm
            onBack={() => { setIsCreatingQuotation(false); setEditingQuotationId(null); }}
            onSave={() => { setIsCreatingQuotation(false); setEditingQuotationId(null); }}
            editingQuotationId={editingQuotationId || null}
          />
        );
      }
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
        return <ContractDetailView contractId={selectedContractId} onBack={() => setSelectedContractId(null)} budget={budget} onEdit={(contract) => { setSelectedContractId(null); setEditingContract(contract); setIsCreatingContract(true); }} />;
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

    // Acessado via alerta da Central de Controle (Faixa 1) — não tem entrada
    // própria na sidebar, só deep-link a partir do alerta de reajuste vencido.
    case 'contracts-reajuste':
      return (
        <div className="space-y-6">
          <div>
            <button onClick={() => setActiveView('supplies-contracts')}
              className="text-sm text-gray-400 hover:text-gray-600 font-medium mb-2">
              ← Contratos
            </button>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Reajustes de Contrato</h1>
            <p className="text-gray-400 text-sm mt-1.5 font-medium">Contratos com reajuste vencido — aplique a correção monetária.</p>
          </div>
          <React.Suspense fallback={<Spinner />}>
            <ContractReajusteDue organizationId={activeOrganizationId || ''} />
          </React.Suspense>
        </div>
      );

    case 'supplies-receipts':
      return <SupplyChainReceiptManager onViewOrder={(id) => { setSelectedOrderId(id); setActiveView('supplies-orders'); }} />;

    case 'master-data':
      return <MasterDataBrowser />;

    // ── Controladoria (unificado) ──────────────────────────────────────────────
    case 'controladoria':
      return (
        <ControladoriaModule
          organizationId={activeOrganizationId || ''}
          organizations={organizations}
          userEmail={session?.user?.email}
          defaultTab={VIEW_TO_CONTROLADORIA_TAB[activeView] || 'dre'}
          onOrgChange={(id) => setActiveOrganizationId(id)}
        />
      );

    case 'fiscal-nfe':
      return (
        <FiscalModuleL
          onViewOrder={(id: string) => { setSelectedOrderId(id); setActiveView('supplies-orders'); }}
          onViewPayable={(pid: string | null) => { setProjectId(pid); setActiveView('contas-a-pagar'); }}
        />
      );

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

    case 'investor-portal':
      return (
        <InvestorModule
          organizationId={activeOrganizationId || undefined}
          profile={currentProfile}
          settings={settingsWithId}
          budget={budget}
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
      return (
        <React.Suspense fallback={<Spinner />}>
          <SupplierPortalManager organizationId={activeOrganizationId || ''} profile={currentProfile} onNavigate={handleNavigate} />
        </React.Suspense>
      );

    case 'orders':
      return <SupplierDashboard profile={currentProfile} supplierProfile={supplierProfile} onNavigate={handleNavigate} activeTab="orders" />;

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
          projects={typedAllProjects}
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
          projects={typedAllProjects}
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
        <>
        <OrganizationList
          organizations={organizations}
          // Zera editingOrganizationId: handleUpsertOrganization usa
          // `editingOrganizationId || data.id` para decidir criar × atualizar, então um
          // id remanescente de uma edição anterior faria "Nova empresa" sobrescrever
          // aquela organização em vez de criar uma nova.
          onCreate={() => { setEditingOrganizationId(null); setIsCreatingOrganization(true); }}
          onEdit={(org: Organization) => { setEditingOrganizationId(org.id); setIsCreatingOrganization(true); }}
          onSave={(org: Organization) => handleUpsertOrganization(org, false)}
          onDelete={handleDeleteOrganization}
          activeTab={managementTab as 'organizations' | 'empresas_grupo' | 'projects' | 'clients' | 'investors' | 'suppliers' | 'users' | 'accounts' | 'cost_centers' | 'chart_of_accounts' | 'plano_contas' | 'settings'}
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
        {/* O botão "Nova empresa" só ligava o estado abaixo; nada renderizava o
            formulário. Ver OrganizationCreateSheet.tsx.
            Montado só quando aberto: o componente é lazy e o Suspense que o cobre é o
            da tela inteira — mantê-lo sempre montado trocaria a lista por um spinner
            enquanto o chunk carrega. */}
        {isCreatingOrganization && (
          <OrganizationCreateSheet
            open
            onClose={() => { setIsCreatingOrganization(false); setEditingOrganizationId(null); }}
            onCreate={(org: Organization) => handleUpsertOrganization(org, true)}
          />
        )}
        </>
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

    case 'area-engine':
      return (
        <React.Suspense fallback={<Spinner />}>
          <AreaEngineModule organizationId={activeOrganizationId || undefined} />
        </React.Suspense>
      );
    case 'laudo-avaliacao':
      return (
        <React.Suspense fallback={<Spinner />}>
          <AppraisalModule organizationId={activeOrganizationId || ''} userEmail={currentProfile.email} />
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
            /* typedProjects já é só OBRA e já exclui projeto de sistema */
            .map(p => ({ id: p.id, name: p.name, organizationId: p.settings?.organizationId }))}
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

    // ── Meus Treinamentos (área pessoal do colaborador) ────────────────────────
    // Sem guarda de módulo, igual a 'tarefas': quem precisa FAZER treinamento
    // não tem permissão de RH. A gestão continua em RH › Treinamentos.
    case 'meus-treinamentos':
      return <MeusTreinamentosView orgId={activeOrganizationId ?? undefined} />;

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
          organizations={organizations}
          isProjectsLoading={projectsLoading}
          onLoadProject={handleLoadProject}
          onEditProject={handleLoadAndEditProject}
          onNewProject={handleNewProject}
          onDuplicateProject={handleDuplicateProject}
          onImportProject={handleImportProject}
          onExportProject={handleExportProject}
        />
      );

    // ── Pós-Obra & Garantia ────────────────────────────────────────────────────
    case 'pos-obra':
      return (
        <WarrantyModule
          activeOrganizationId={activeOrganizationId ?? undefined}
          projects={typedProjects
            .map(p => ({ id: p.id, name: p.name }))}
        />
      );

    // ── Central de Controle ─────────────────────────────────────────────────────
    case 'central':
      return (
        <CentralControle
          organizationId={activeOrganizationId || ''}
          userEmail={session?.user?.email}
          onNavigate={setActiveView}
        />
      );

    // ── BI Executivo ───────────────────────────────────────────────────────────
    case 'bi-executivo':
      return (
        <BIDashboard
          organizationId={activeOrganizationId || ''}
          onNavigate={setActiveView}
        />
      );

    // ── ÒPURA · Relatórios (analytics multidimensional) ────────────────────────
    case 'opura-reports':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <OpuraReports
            organizationId={activeOrganizationId || ''}
          />
        </React.Suspense>
      );

    // ── ÒPURA · Central de Obras ───────────────────────────────────────────────
    case 'opura-central-obra':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}>
          <CentralObra
            organizationId={activeOrganizationId || ''}
          />
        </React.Suspense>
      );

    // ── ÒPURA · Central de Clientes ────────────────────────────────────────────
    case 'opura-central-cliente':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <CentralCliente
            organizationId={activeOrganizationId || ''}
          />
        </React.Suspense>
      );

    // ── ÒPURA · Central de Fornecedores ────────────────────────────────────────
    case 'opura-central-fornecedor':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <CentralFornecedor
            organizationId={activeOrganizationId || ''}
          />
        </React.Suspense>
      );

    // ── Dashboard Executivo Financeiro ─────────────────────────────────────────
    case 'financial-dashboard':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <FinancialDashboard
            organizationId={activeOrganizationId || ''}
            onNavigate={setActiveView}
          />
        </React.Suspense>
      );

    // ── Cobranças / Boletos ao cliente ─────────────────────────────────────────
    case 'financial-boletos':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <ClientChargesModule
            organizationId={activeOrganizationId || ''}
          />
        </React.Suspense>
      );

    // ── Boletos a Pagar (fornecedores) ─────────────────────────────────────────
    case 'boletos-pagar':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <BoletoManager
            organizationId={activeOrganizationId || ''}
            userEmail={session?.user?.email}
            organizations={organizations}
            onOrgChange={(id) => setActiveOrganizationId(id)}
          />
        </React.Suspense>
      );

    // ── Extrato + Conciliação Bancária ─────────────────────────────────────────
    case 'extrato-bancario':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <BankReconciliation
            organizationId={activeOrganizationId || ''}
            defaultView="statement"
          />
        </React.Suspense>
      );
    case 'bank-reconciliation':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <BankReconciliation
            organizationId={activeOrganizationId || ''}
            defaultView="dashboard"
          />
        </React.Suspense>
      );

    // ── Inteligência Financeira ────────────────────────────────────────────────
    case 'financial-intelligence':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <FinancialIntelligence
            organizationId={activeOrganizationId || ''}
            onNavigate={setActiveView}
          />
        </React.Suspense>
      );

    // ── Cobrança Automatizada (Dunning) ───────────────────────────────────────
    case 'dunning':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <DunningModule
            organizationId={activeOrganizationId || ''}
          />
        </React.Suspense>
      );

    // ── Calendário Financeiro ──────────────────────────────────────────────────
    case 'financial-calendar':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <FinancialCalendar
            organizationId={activeOrganizationId || ''}
          />
        </React.Suspense>
      );

    // ── Aprovação Financeira ───────────────────────────────────────────────────
    case 'financial-approval':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <FinancialApprovalModule
            organizationId={activeOrganizationId || ''}
            userEmail={session?.user?.email}
          />
        </React.Suspense>
      );

    // ── Processos ────────────────────────────────────────────────────────────
    case 'opura-processos':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <ProcessosModule
            organizationId={activeOrganizationId || ''}
            userId={session?.user?.id || ''}
            userEmail={session?.user?.email || ''}
          />
        </React.Suspense>
      );

    // ── Contas a Receber ───────────────────────────────────────────────────────
    case 'contas-a-receber':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <ContasReceberManager
            organizationId={activeOrganizationId || ''}
            organizations={organizations}
          />
        </React.Suspense>
      );

    // ── Tributos a Pagar (Comercial: Vendas de Ativos / Locações) ──────────────
    case 'tributos-a-pagar':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" /></div>}>
          <TributosAPagarManager
            organizationId={activeOrganizationId || ''}
            organizations={organizations}
          />
        </React.Suspense>
      );

    // ── Financeiro — DRE & Fluxo de Caixa (redirecionam para Controladoria) ────
    case 'financial-dre':
    case 'financial-cashflow':
      return (
        <ControladoriaModule
          organizationId={activeOrganizationId || ''}
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
            projects={typedAllProjects}
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
// Wrapper com tabs "Por Obra" (lista por projeto) / "Templates".
// Reajustes vencidos não é mais aba fixa aqui — vira alerta na Central de
// Controle (Faixa 1), que já é a home de exceções do sistema; ao clicar no
// alerta o usuário cai direto na view 'contracts-reajuste' (ver switch acima).
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
    const [templatesOpen, setTemplatesOpen] = React.useState(false);

    return (
        <>
            <SupplyChainContractList
                projectId={projectId}
                domain="SUPRIMENTOS"
                onCreateNew={() => setIsCreatingContract(true)}
                onViewDetails={(id) => setSelectedContractId(id)}
                onEdit={(contract) => { setEditingContract(contract); setIsCreatingContract(true); }}
                onDelete={() => setContractsVersion(v => v + 1)}
                organizationId={organizationId || undefined}
                version={contractsVersion}
                extraActions={
                    <button
                        onClick={() => setTemplatesOpen(true)}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-50 text-gray-600 rounded-[6px] hover:bg-gray-100 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <FileText className="w-[15px] h-[15px]" />
                        Templates
                    </button>
                }
            />
            <React.Suspense fallback={null}>
                <ContractTemplateManager
                    organizationId={organizationId}
                    open={templatesOpen}
                    onClose={() => setTemplatesOpen(false)}
                />
            </React.Suspense>
        </>
    );
};

export default AppRouter;
