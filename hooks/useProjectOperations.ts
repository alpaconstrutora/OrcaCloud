import { useState, useCallback } from 'react';
import { projectService } from '../services/projectService';
import { contractService } from '../services/contractService';
import { organizationService } from '../services/organizationService';
import { projectTypeTemplatesService } from '../services/projectTypeTemplatesService';
import { BudgetEntry, ProjectSettings, Organization, Contract } from '../types';
import { TipoObra } from '../types/project';
import { WBSGroup, WBSPhase } from '../types/budget';
import { INITIAL_PROJECT_SETTINGS, INITIAL_BUDGET, BASE_CUB_RATES, CUB_STANDARDS_DATA } from '../constants';

interface UseProjectOperationsProps {
  organizations: Organization[];
  projects: { id: string; name: string; settings?: ProjectSettings }[];
  projectSettings: ProjectSettings | null;
  projectModalMode: 'create' | 'edit' | 'import';
  projectId: string | null;
  budget: BudgetEntry[];
  activeOrganizationId: string | null;
  activeView: string;
  session: { user?: { email?: string } } | null;
  fetchProjects: (orgs: Organization[]) => void;
  fetchOrganizations: () => void;
  setProjectSettings: (settings: ProjectSettings) => void;
  setBudget: (budget: BudgetEntry[]) => void;
  setProjectId: (id: string | null) => void;
  setIsProjectModalOpen: (isOpen: boolean, mode?: 'create' | 'edit') => void;
  setProjectModalInitialClassification: (classification?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO') => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  setActiveView: (view: string) => void;
  editingOrganizationId: string | null;
  setIsCreatingOrganization: (val: boolean) => void;
  setEditingOrganizationId: (id: string | null) => void;
  editingContract: Contract | null;
  setIsCreatingContract: (val: boolean) => void;
  setEditingContract: (contract: Contract | null) => void;
  setContractsVersion: React.Dispatch<React.SetStateAction<number>>;
}

export const useProjectOperations = ({
  organizations, projects, projectSettings, projectModalMode, projectId, budget, activeOrganizationId, activeView, session,
  fetchProjects, fetchOrganizations, setProjectSettings, setBudget, setProjectId,
  setIsProjectModalOpen, setProjectModalInitialClassification, showToast, setActiveView,
  editingOrganizationId, setIsCreatingOrganization, setEditingOrganizationId,
  editingContract, setIsCreatingContract, setEditingContract, setContractsVersion
}: UseProjectOperationsProps) => {

  const [isSaving, setIsSaving] = useState(false);

  const handleNewProject = useCallback((classification?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO') => {
    setProjectModalInitialClassification(classification);
    setIsProjectModalOpen(true, 'create');
  }, [setProjectModalInitialClassification, setIsProjectModalOpen]);

  const handleEditActiveProject = useCallback(() => {
    if (projectSettings) setProjectModalInitialClassification(projectSettings.classification);
    setIsProjectModalOpen(true, 'edit');
  }, [projectSettings, setProjectModalInitialClassification, setIsProjectModalOpen]);

  const handleUpsertProject = async (data: Partial<ProjectSettings> & { organizationId?: string; code?: string }) => {
    setIsSaving(true);
    try {
      const baseRate = BASE_CUB_RATES[data.location as keyof typeof BASE_CUB_RATES] || 2000.00;
      const multiplier = CUB_STANDARDS_DATA[data.standard as keyof typeof CUB_STANDARDS_DATA]?.multiplier || 1.0;
      const estimatedCubRate = baseRate * multiplier;
      const newSettings = {
        ...(projectModalMode === 'edit' ? projectSettings : INITIAL_PROJECT_SETTINGS),
        ...data,
        cubRate: estimatedCubRate,
        organizationId: data.organizationId || organizations[0]?.id,
        ...(data.code ? { code: data.code } : {})
      } as ProjectSettings;
      // Auto-populate WBS from tipo_obra template when creating an ORCAMENTO linked to an OBRA
      if (projectModalMode === 'create' && newSettings.classification === 'ORCAMENTO' && newSettings.linkedProjectId) {
        try {
          const linkedProject = await projectService.loadProject(newSettings.linkedProjectId);
          const tipoObra = (linkedProject?.settings as any)?.tipoObra as TipoObra | undefined;
          if (tipoObra) {
            const tmpl = await projectTypeTemplatesService.getTemplate(tipoObra, newSettings.organizationId);
            if (tmpl && tmpl.eap_phases.length > 0 && (!newSettings.wbs || newSettings.wbs.length === 0)) {
              const phases: WBSPhase[] = tmpl.eap_phases.map(p => ({
                id: `eap-${p.code}`,
                name: `${p.code} ${p.name}`,
                subPhases: [],
              }));
              const wbsGroup: WBSGroup = {
                id: 'eap-padrao',
                name: 'EAP Padrão',
                phases,
              };
              newSettings.wbs = [wbsGroup];
            }
          }
        } catch {
          // Non-critical: proceed without WBS pre-population if template fetch fails
        }
      }

      if (projectModalMode === 'create') {
        const savedProject = await projectService.saveProject({
          name: newSettings.name,
          settings: newSettings,
          budget: []
        });
        if (savedProject) {
          setProjectSettings(newSettings);
          setBudget([]);
          setProjectId(savedProject.id);
          showToast(`"${newSettings.name}" criado com sucesso!`, 'success');
          setIsProjectModalOpen(false);
          fetchProjects(organizations);
        }
      } else if (projectId) {
        await projectService.saveProject({ id: projectId, name: newSettings.name, settings: newSettings, budget });
        showToast(`Alterações em "${newSettings.name}" salvas com sucesso!`, 'success');
        setProjectSettings(newSettings);
        setIsProjectModalOpen(false);
        fetchProjects(organizations);
      }
    } catch (error) {
      console.error(error);
      showToast('Erro ao salvar projeto.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProject = async (explicitBudget?: BudgetEntry[], explicitSettings?: ProjectSettings) => {
    setIsSaving(true);
    const b = explicitBudget ?? budget;
    const s = explicitSettings ?? projectSettings;
    try {
      const savedProject = await projectService.saveProject({
        id: projectId || undefined,
        name: s?.name || 'Projeto sem nome',
        settings: s || INITIAL_PROJECT_SETTINGS,
        budget: b
      });
      if (savedProject) {
        // Só atualiza projectId se estava nulo (novo projeto) — evita disparar rehydrate
        if (!projectId) setProjectId(savedProject.id);
        if (!explicitBudget) alert(`Obra "${s?.name}" salva com sucesso na nuvem!`);
      }
    } catch (error: unknown) {
      console.error("Erro ao salvar obra:", error);
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      if (!explicitBudget) alert("Erro ao salvar obra: " + message);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProject = () => {
    const confirmMsg = "ATENÇÃO: EXCLUSÃO DE DADOS LOCAL\n\nTem certeza que deseja excluir a obra atual da memória do navegador?";
    if (window.confirm(confirmMsg)) {
      setProjectId(null);
      setProjectSettings(INITIAL_PROJECT_SETTINGS);
      setBudget(INITIAL_BUDGET);
      localStorage.removeItem('orca_currentProjectId');
      localStorage.removeItem('orca_projectSettings');
      localStorage.removeItem('orca_budget');
      window.location.reload();
    }
  };

  const handleDeleteProjectFromList = async (id: string) => {
    if (window.confirm(`Deseja excluir este projeto?`)) {
      setIsSaving(true);
      try {
        await projectService.deleteProject(id);
        fetchProjects(organizations);
      } catch (error) {
        console.error(error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDuplicateProject = async (id: string) => {
    setIsSaving(true);
    try {
      const originalProject = await projectService.loadProject(id);
      if (!originalProject) throw new Error("Projeto original não encontrado.");
      const newSettings = { ...originalProject.settings, name: `${originalProject.settings.name} (Cópia)` };
      const savedProject = await projectService.saveProject({
        name: newSettings.name,
        settings: newSettings,
        budget: originalProject.budget || []
      });
      if (savedProject) {
        alert("Projeto duplicado com sucesso!");
        fetchProjects(organizations);
      }
    } catch (error) {
      console.error("Erro ao duplicar projeto:", error);
      alert("Erro ao duplicar projeto.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportProject = async (data: { name: string; settings?: Partial<ProjectSettings>; budget: BudgetEntry[] }) => {
    setIsSaving(true);
    try {
      const savedProject = await projectService.saveProject({
        name: data.name,
        settings: { ...INITIAL_PROJECT_SETTINGS, name: data.name, ...(data.settings || {}) },
        budget: data.budget
      });
      if (savedProject) {
        alert(`Projeto "${savedProject.name}" importado com sucesso!`);
        fetchProjects(organizations);
      }
    } catch (error) {
      console.error("Erro ao importar projeto:", error);
      alert("Erro ao importar projeto.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportProject = async (id: string) => {
    try {
      const projectData = await projectService.loadProject(id);
      if (!projectData) return alert("Erro: Projeto não encontrado.");
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Dados da Obra');
      worksheet.columns = [{ header: 'Campo', key: 'field', width: 30 }, { header: 'Valor', key: 'value', width: 50 }];
      const settings = projectData.settings;
      worksheet.addRow(['Nome da Obra', settings.name || '']);
      worksheet.addRow(['Cliente', settings.client || '']);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet' });
      const { saveAs } = await import('file-saver');
      saveAs(blob, `Export_${projectData.name.replace(/\s+/g, '_')}.xlsx`);
    } catch (error) {
      console.error("Erro ao exportar projeto:", error);
      alert("Erro ao exportar projeto.");
    }
  };

  const handleLoadProject = async (id: string, targetView: string | null = null) => {
    try {
      const projectData = await projectService.loadProject(id);
      if (projectData) {
        const loadedSettings = { ...INITIAL_PROJECT_SETTINGS, ...projectData.settings, ...(projectData.code ? { code: projectData.code } : {}) };
        setProjectId(id);
        setProjectSettings(loadedSettings);
        let projectBudget = projectData.budget || [];
        if (loadedSettings.classification === 'PLANEJAMENTO' && projectBudget.length === 0) {
          const linkedId = loadedSettings.linkedProjectId;
          const linkedName = loadedSettings.linkedProjectName;

          if (linkedId || linkedName) {
            try {
              let linkedData = null;
              if (linkedId) {
                linkedData = await projectService.loadProject(linkedId);
              } else if (linkedName) {
                const linkedProject = projects.find((p) => p.name === linkedName && (p.settings?.classification === 'ORCAMENTO' || p.settings?.classification === 'OBRA'));
                if (linkedProject) {
                  linkedData = await projectService.loadProject(linkedProject.id);
                }
              }

              if (linkedData?.budget && linkedData.budget.length > 0) {
                projectBudget = linkedData.budget;
              }
            } catch (err) {
              console.error("Erro ao carregar orçamento vinculado:", err);
            }
          }
        }
        setBudget(projectBudget);

        let finalView = targetView === 'schedule' ? null : targetView;
        if (!finalView) {
          if (loadedSettings.budgetType === 'PARAMETRIC') finalView = 'parametric';
          else if (loadedSettings.classification === 'OBRA') finalView = 'project-overview';
          else if (loadedSettings.classification === 'PLANEJAMENTO') finalView = 'planning-view';
          else if (loadedSettings.classification === 'DIARIO') finalView = 'project-diary';
          else finalView = 'analytic';
        } else if (finalView === 'analytic' && loadedSettings.budgetType === 'PARAMETRIC') {
          finalView = 'parametric';
        }

        if (finalView) setActiveView(finalView);
        return loadedSettings;
      }
      return null;
    } catch (error) {
      console.error("Erro ao carregar projeto:", error);
      alert("Erro ao carregar projeto.");
      return null;
    }
  };

  const handleLoadAndEditProject = async (id: string) => {
    const viewBeforeEdit = activeView;
    const settings = await handleLoadProject(id, null);
    if (settings) {
      setActiveView(viewBeforeEdit);
      setProjectModalInitialClassification(settings.classification);
      setIsProjectModalOpen(true, 'edit');
    }
  };

  const handleUpsertOrganization = async (data: Organization, shouldClose: boolean = true) => {
    setIsSaving(true);
    try {
      const orgId = editingOrganizationId || data.id;
      if (orgId) {
        await organizationService.updateOrganization(orgId, data);
        if (shouldClose) alert("Organização atualizada!");
      } else {
        await organizationService.createOrganization(data, session?.user?.email);
        alert("Organização criada!");
      }
      fetchOrganizations();
      if (shouldClose) {
        setIsCreatingOrganization(false);
        setEditingOrganizationId(null);
      }
    } catch (error: unknown) {
      console.error(error);
      alert("Erro ao salvar organização.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOrganization = async (id: string) => {
    if (window.confirm("Deseja EXCLUIR PERMANENTEMENTE esta organização?\n\nAção irreversível e pode falhar se houver projetos ou dados vinculados.")) {
      try {
        await organizationService.deleteOrganization(id);
        fetchOrganizations();
        showToast("Organização excluída com sucesso!", "success");
      } catch (error: unknown) {
        console.error("Erro ao excluir organização:", error);
        const pgError = error as { code?: string; message?: string };
        if (pgError.code === '23503') {
            alert("Não é possível excluir esta organização pois existem dados vinculados a ela (Projetos, Colaboradores, Fornecedores, etc.).\n\nConsidere inativar a empresa ou remover os vínculos primeiro.");
        } else {
            alert("Erro ao excluir organização: " + (pgError.message || "Erro desconhecido"));
        }
      }
    }
  };

  const handleContractSubmit = async (data: Omit<Contract, 'id'> & { id?: string }) => {
    try {
      if (editingContract) {
        await contractService.updateContract(editingContract.id, data);
      } else {
        await contractService.createContract({
          ...data,
          project_id: data.project_id || projectId || '',
          organization_id: activeOrganizationId || undefined
        } as Contract);
      }
      setIsCreatingContract(false);
      setEditingContract(null);
      setContractsVersion((v: number) => v + 1);
      
      if (projectId) {
        const refreshedProject = await projectService.loadProject(projectId);
        if (refreshedProject) {
          setProjectSettings({ ...INITIAL_PROJECT_SETTINGS, ...refreshedProject.settings });
          setBudget(refreshedProject.budget || []);
        }
      }
    } catch (error) {
      console.error("Erro ao salvar contrato:", error);
      throw error;
    }
  };

  return {
    isSaving,
    setIsSaving,
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
  };
};
