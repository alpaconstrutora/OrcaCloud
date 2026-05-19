import { useEffect } from 'react';
import { projectService } from '../services/projectService';
import { BudgetEntry, ProjectSettings } from '../types';
import { INITIAL_BUDGET, INITIAL_PROJECT_SETTINGS } from '../constants';

interface UsePersistenceSyncProps {
  projectSettings: ProjectSettings | null;
  budget: BudgetEntry[];
  projectId: string | null;
  session: any;
  isRehydrating: boolean;
  activeView: string;
  selectedQuotationId: string | null;
  selectedContractId: string | null;
  selectedOrderId: string | null;
  isCreatingImovibStudy: boolean;
  editingImovibStudyId: string | null;
  viewingImovibStudyId: string | null;
  favorites: string[];
  setFavorites: (favs: string[]) => void;
  setSelectedQuotationId: (id: string | null) => void;
  setSelectedContractId: (id: string | null) => void;
  setSelectedOrderId: (id: string | null) => void;
  setIsCreatingImovibStudy: (val: boolean) => void;
  setEditingImovibStudyId: (id: string | null) => void;
  setViewingImovibStudyId: (id: string | null) => void;
  setIsRehydrating: (val: boolean) => void;
  setProjectId: (id: string | null) => void;
  setProjectSettings: (settings: ProjectSettings) => void;
  setBudget: (budget: BudgetEntry[]) => void;
}

export const usePersistenceSync = ({
  projectSettings, budget, projectId, session, isRehydrating, activeView,
  selectedQuotationId, selectedContractId, selectedOrderId,
  isCreatingImovibStudy, editingImovibStudyId, viewingImovibStudyId,
  favorites, setFavorites,
  setSelectedQuotationId, setSelectedContractId, setSelectedOrderId,
  setIsCreatingImovibStudy, setEditingImovibStudyId, setViewingImovibStudyId,
  setIsRehydrating, setProjectId, setProjectSettings, setBudget
}: UsePersistenceSyncProps) => {

  // Persistence to LocalStorage
  useEffect(() => {
    if (projectSettings) {
      localStorage.setItem('orca_projectSettings', JSON.stringify(projectSettings));
    }
  }, [projectSettings]);

  // Persistência de estados locais do App
  useEffect(() => {
    if (selectedQuotationId) localStorage.setItem('app_selected_quotation_id', selectedQuotationId);
    else localStorage.removeItem('app_selected_quotation_id');
  }, [selectedQuotationId]);

  useEffect(() => {
    if (selectedContractId) localStorage.setItem('app_selected_contract_id', selectedContractId);
    else localStorage.removeItem('app_selected_contract_id');
  }, [selectedContractId]);

  useEffect(() => {
    if (selectedOrderId) localStorage.setItem('app_selected_order_id', selectedOrderId);
    else localStorage.removeItem('app_selected_order_id');
  }, [selectedOrderId]);

  useEffect(() => {
    localStorage.setItem('app_is_creating_imovib', isCreatingImovibStudy.toString());
  }, [isCreatingImovibStudy]);

  useEffect(() => {
    if (editingImovibStudyId) localStorage.setItem('app_editing_imovib_id', editingImovibStudyId);
    else localStorage.removeItem('app_editing_imovib_id');
  }, [editingImovibStudyId]);

  useEffect(() => {
    if (viewingImovibStudyId) localStorage.setItem('app_viewing_imovib_id', viewingImovibStudyId);
    else localStorage.removeItem('app_viewing_imovib_id');
  }, [viewingImovibStudyId]);

  useEffect(() => {
    localStorage.setItem('orca_budget', JSON.stringify(budget));
  }, [budget]);

  useEffect(() => {
    localStorage.setItem('orca_favorites', JSON.stringify(favorites));
  }, [favorites]);

  // Sync favorites from other tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'orca_favorites' && e.newValue) {
        try {
          setFavorites(JSON.parse(e.newValue));
        } catch (err) {
          console.error("Error syncing favorites:", err);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [setFavorites]);

  // Reset de estado do módulo de vendas ao trocar de visão (módulo)
  useEffect(() => {
    const isSalesView = activeView === 'sales';
    const isRentalView = activeView === 'rentals';
    const isSuppliesView = ['supplies-orders', 'supplies-quotations', 'supplies-contracts', 'supplies-receipts'].includes(activeView);
    const isImovibView = activeView === 'imovib';
    const isDiaryView = activeView === 'project-diary';

    // Limpeza se NÃO for a visão correspondente
    if (!isSalesView && !isRentalView) {
      localStorage.removeItem('sales_selected_building_id');
      localStorage.removeItem('sales_active_tab');
    }

    if (!isRentalView && !isSalesView) {
      localStorage.removeItem('commercial_active_tab');
      localStorage.removeItem('commercial_view_mode');
    }

    if (!isSuppliesView) {
      localStorage.removeItem('app_selected_quotation_id');
      localStorage.removeItem('app_selected_contract_id');
      localStorage.removeItem('app_selected_order_id');
      setSelectedQuotationId(null);
      setSelectedContractId(null);
      setSelectedOrderId(null);
    }

    if (!isImovibView) {
      localStorage.removeItem('app_is_creating_imovib');
      localStorage.removeItem('app_editing_imovib_id');
      localStorage.removeItem('app_viewing_imovib_id');
      setIsCreatingImovibStudy(false);
      setEditingImovibStudyId(null);
      setViewingImovibStudyId(null);
    }

    if (!isRentalView) {
      localStorage.removeItem('rentals_selected_building_id');
      localStorage.removeItem('rentals_active_tab');
    }

    if (!isDiaryView) {
      localStorage.removeItem('diary_is_adding');
      localStorage.removeItem('diary_editing_id');
      localStorage.removeItem('diary_active_tab');
      localStorage.removeItem('diary_view_mode');
    }
  }, [
    activeView,
    setSelectedQuotationId,
    setSelectedContractId,
    setSelectedOrderId,
    setIsCreatingImovibStudy,
    setEditingImovibStudyId,
    setViewingImovibStudyId
  ]);

  // Auto-save logic — fires whenever budget or settings change while logged in with an active project.
  // Does NOT depend on projectSettings.autoSave: that toggle is reserved for UI hints only.
  // isRehydrating guard prevents saving stale data while loading a project from Supabase.
  useEffect(() => {
    if (!projectId || !session?.user?.id || isRehydrating || !projectSettings) return;
    const timeoutId = setTimeout(async () => {
      try {
        await projectService.saveProject({
          id: projectId,
          name: projectSettings.name,
          settings: projectSettings,
          budget: budget
        });
      } catch (error) {
        console.error("Erro no salvamento automático:", error);
      }
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [budget, projectSettings, projectId, session?.user?.id, isRehydrating]);

  // Rehydrate project data
  useEffect(() => {
    const rehydrateProject = async () => {
      if (projectId && session?.user?.id) {
        setIsRehydrating(true);
        try {
          const projectData = await projectService.loadProject(projectId);
          if (projectData) {
            const loadedSettings = { ...INITIAL_PROJECT_SETTINGS, ...projectData.settings };
            setProjectSettings(loadedSettings);
            setBudget(projectData.budget || []);
          } else {
            setProjectId(null);
            setProjectSettings(INITIAL_PROJECT_SETTINGS);
            setBudget(INITIAL_BUDGET);
          }
        } catch (error: any) {
          console.error("[Rehydratação] Erro ao carregar projeto:", error);
        } finally {
          setIsRehydrating(false);
        }
      } else {
        setIsRehydrating(false);
      }
    };
    rehydrateProject();
  }, [session?.user?.id, projectId, setProjectId, setProjectSettings, setBudget, setIsRehydrating]);
};
