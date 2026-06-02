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

// Views
import Dashboard from './Dashboard';
import BudgetEditor from './BudgetEditor';
import ParametricEstimator from './ParametricEstimator';
import { FinancialSchedule } from './FinancialSchedule';
import PlanningDashboard from './PlanningDashboard';
import ProjectList from './ProjectList';
import ExcelImportModal from './ExcelImportModal';
import ProjectDiaryManager from './ProjectDiaryManager';
import DiaryReportViewer from './DiaryReportViewer';
import DiaryDashboard from './DiaryDashboard';
import LaborDashboard from './LaborDashboard';
import LaborModule from './LaborModule';
import ProjectOverview from './ProjectOverview';
import ProjectFinancialManager from './ProjectFinancialManager';
import ReportViewer from './ReportViewer';
import ProjectSettingsView from './ProjectSettingsView';
import SupplyChainOrderList from './SupplyChainOrderList';
import SupplyChainOrderDetails from './SupplyChainOrderDetails';
import SupplyChainQuotationList from './SupplyChainQuotationList';
import SupplyChainQuotationComparison from './SupplyChainQuotationComparison';
import SupplyChainContractList from './SupplyChainContractList';
import ContractDetailView from './ContractDetailView';
import SupplyChainReceiptManager from './SupplyChainReceiptManager';
import AutomationManager from './AutomationManager';
import ImovibDashboard from './ImovibDashboard';
import ImovibForm from './ImovibForm';
import ImovibDetailView from './ImovibDetailView';
import Settings from './Settings';
import { ClientArea } from './ClientArea';
import InvestorDashboard from './InvestorDashboard';
import SupplierDashboard from './SupplierDashboard';
import BrokerPortal from './BrokerPortal';
import OrganizationList from './OrganizationList';
import SalesModule from './SalesModule';
import RentalsModule from './RentalsModule';
import DatabaseExplorer from './DatabaseExplorer';
import QualityModule from './QualityModule';
import BoletoManager from './BoletoManager';
import ContasPagarManager from './ContasPagarManager';
import FinancialCategoriesManager from './FinancialCategoriesManager';
import BankReconciliation from './BankReconciliation';
import { FiscalModule } from './fiscal/FiscalModule';
import OperacionalModule from './OperacionalModule';
import StructuralModule from './StructuralModule';
import TasksModule from './TasksModule';
import ServicesCommercialModule from './ServicesCommercialModule';
import NotificationsCenter from './NotificationsCenter';
import ProjectTypeTemplateEditor from './ProjectTypeTemplateEditor';
import WarrantyModule from './WarrantyModule';
import DREReport from './DREReport';
import CashFlowDashboard from './CashFlowDashboard';
import BIDashboard from './BIDashboard';

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

  // ── Portais de perfil específico (acesso direto sem switch) ─────────────────
  if (currentProfile.group === ProfileGroup.CLIENT) {
    return (
      <ClientArea
        settings={settingsWithId}
        budget={budget || []}
        profile={currentProfile}
        clientProfile={clientProfile}
        clients={clients}
        onClientSelect={(c: Client) => setClientProfile(c)}
        activeTab={activeView as 'dashboard' | 'clientes' | 'jornada' | 'visual' | 'personalizacao' | 'diario' | 'documentos' | 'financeiro' | 'suporte'}
      />
    );
  }
  if (currentProfile.group === ProfileGroup.INVESTOR) {
    return (
      <InvestorDashboard
        settings={settingsWithId}
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

  // ── Roteamento principal ─────────────────────────────────────────────────────
  switch (activeView) {
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
        <FinancialSchedule
          settings={settingsWithId}
          budget={budget}
          projects={typedProjects}
          organizations={organizations}
          onLoadProject={handleLoadProject}
          onUpdateSettings={handleUpdateSettings}
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

    case 'project-financial':
      return (
        <ProjectFinancialManager
          key={`pfm-${contractsVersion}`}
          settings={!projectId ? { ...INITIAL_PROJECT_SETTINGS, name: 'Gestão Comercial', classification: 'OBRA' } : settingsWithId}
          projectId={projectId || undefined}
          organizationId={activeOrganizationId || undefined}
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
        <SupplyChainContractList
          projectId={projectId || ''}
          onCreateNew={() => setIsCreatingContract(true)}
          onViewDetails={(id) => setSelectedContractId(id)}
          onEdit={(contract) => { setEditingContract(contract); setIsCreatingContract(true); }}
          onDelete={() => setContractsVersion(v => v + 1)}
          organizationId={activeOrganizationId || undefined}
          version={contractsVersion}
        />
      );

    case 'supplies-receipts':
      return <SupplyChainReceiptManager onViewOrder={(id) => { setSelectedOrderId(id); setActiveView('supplies-orders'); }} />;

    case 'financial-categories':
      return <FinancialCategoriesManager />;

    case 'bank-reconciliation':
      return (
        <BankReconciliation
          organizationId={activeOrganizationId || organizations[0]?.id || ''}
        />
      );

    case 'financial-boletos':
      return (
        <BoletoManager
          organizationId={activeOrganizationId || organizations[0]?.id || ''}
          userEmail={session?.user?.email}
          organizations={organizations}
          onOrgChange={(id) => setActiveOrganizationId(id)}
        />
      );

    case 'contas-a-pagar':
      return (
        <ContasPagarManager
          organizationId={activeOrganizationId || undefined}
          organizations={organizations}
          onOrgChange={(id) => setActiveOrganizationId(id)}
        />
      );

    case 'fiscal-nfe':
      return <FiscalModule />;

    case 'automation':
      return <AutomationManager settings={settingsWithId} onUpdateSettings={handleUpdateSettings} organizationId={activeOrganizationId || undefined} />;

    // ── Imovib ─────────────────────────────────────────────────────────────────
    case 'imovib':
      if (isCreatingImovibStudy) {
        return (
          <ImovibForm
            organizationId={activeOrganizationId || undefined}
            studyId={editingImovibStudyId || undefined}
            onBack={() => { setIsCreatingImovibStudy(false); setEditingImovibStudyId(null); }}
            onSaved={() => { setIsCreatingImovibStudy(false); setEditingImovibStudyId(null); }}
          />
        );
      }
      if (viewingImovibStudyId) {
        return <ImovibDetailView studyId={viewingImovibStudyId} onBack={() => setViewingImovibStudyId(null)} />;
      }
      return (
        <ImovibDashboard
          organizationId={activeOrganizationId || undefined}
          onNewStudy={() => { setEditingImovibStudyId(null); setIsCreatingImovibStudy(true); }}
          onViewStudy={(id: string) => setViewingImovibStudyId(id)}
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
          onClientSelect={(c: Client) => setClientProfile(c)}
          activeTab={activeView === 'documentos' ? 'documentos' : 'dashboard'}
        />
      );

    case 'investor-area':
    case 'holdings':
    case 'opportunities':
      return (
        <InvestorDashboard
          settings={settingsWithId}
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
      const brokerTabMap: Record<string, string> = {
        'broker-proposals': 'propostas', 'broker-leads': 'leads', 'broker-commissions': 'comissoes',
        'broker-materials': 'materiais', 'broker-ranking': 'ranking', 'broker-training': 'treinamento',
        'broker-events': 'agenda', 'broker-chat': 'chat', 'broker-analytics': 'analytics',
        'broker-health': 'saude', 'broker-integrations': 'integracoes'
      };
      return <BrokerPortal profile={currentProfile} activeTab={(brokerTabMap[activeView] || 'estoque') as 'estoque' | 'propostas' | 'leads' | 'comissoes' | 'materiais' | 'ranking' | 'treinamento' | 'agenda' | 'chat' | 'analytics' | 'saude' | 'integracoes'} organizationId={activeOrganizationId || undefined} />;
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

    case 'services-commercial':
      if (!activeOrganizationId) return (
        <div className="flex items-center justify-center h-full text-sm text-gray-400">
          Selecione uma organização para acessar o módulo comercial.
        </div>
      );
      return (
        <ServicesCommercialModule
          organizationId={activeOrganizationId}
          onGoToProject={(projectId) => handleLoadProject(projectId, 'analytic')}
        />
      );

    case 'sales':
      return <SalesModule organizationId={activeOrganizationId || undefined} />;

    case 'rentals':
      return <RentalsModule organizationId={activeOrganizationId || undefined} />;

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

    // ── Financeiro — DRE & Fluxo de Caixa ─────────────────────────────────────
    case 'financial-dre':
      return (
        <DREReport
          organizationId={activeOrganizationId || organizations[0]?.id || ''}
        />
      );

    case 'financial-cashflow':
      return (
        <CashFlowDashboard
          organizationId={activeOrganizationId || organizations[0]?.id || ''}
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
};

export default AppRouter;
