import React from 'react';
import { BudgetEntry, ProjectSettings, SinapiItem, WBSPhase, SinapiType, BudgetVersion, WBSGroup, CustomDatabase, CompositionComponent } from '../types';
import { sinapiService } from '../services/sinapiService'; // Importação do Serviço
import { Search, Plus, Trash2, ChevronDown, ChevronRight, Folder, FolderOpen, MoreVertical, X, ArrowUp, ArrowDown, Loader2, Layers, Box, History, Save, Calendar, CheckCircle, Database, Monitor, Maximize2, ChevronsUpDown, ChevronsDownUp, Pencil, Copy, AlertTriangle, Star, StarOff, FileDown, FileText } from 'lucide-react';
import { customDatabaseService } from '../services/customDatabaseService';
import { parametricService } from '../services/parametricService';
import { BudgetRow } from './BudgetRow';
import { WBSImportModal } from './WBSImportModal';
import { WBSTemplateModal } from './WBSTemplateModal';
import * as XLSX from 'xlsx';

interface BudgetEditorProps {
  budget: BudgetEntry[];
  settings: ProjectSettings;
  favorites: string[];
  onToggleFavorite: (e: React.MouseEvent | React.TouchEvent, code: string) => void;
  onUpdateBudget: (newBudget: BudgetEntry[]) => void;
  onUpdateSettings: (newSettings: ProjectSettings) => void;
  onSaveProject?: (budget: BudgetEntry[], settings: ProjectSettings) => Promise<void>;
}

interface AddingTarget {
  group: string;
  phase: string;
  subPhase: string;
}

const splitName = (fullName: string | null | undefined) => {
  if (!fullName) return { id: '', name: '' };
  const match = fullName.match(/^([\d\.]+)\s+(.*)$/);
  return match ? { id: match[1], name: match[2] } : { id: '', name: fullName };
};

const getTypeBadge = (type: SinapiType) => {
  if (type === SinapiType.COMPOSITION) {
    return (
      <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-semibold border border-blue-200">
        <Layers className="w-3 h-3" />
        COMPOSIÇÃO
      </span>
    );
  }
  if (type === SinapiType.SERVICE) {
    return (
      <span className="flex items-center gap-1 bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-semibold border border-purple-200">
        <Loader2 className="w-3 h-3" />
        SERVIÇO
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded font-semibold border border-amber-200">
      <Box className="w-3 h-3" />
      INSUMO
    </span>
  );
};

const BudgetEditor: React.FC<BudgetEditorProps> = ({
  budget,
  settings,
  onUpdateBudget,
  onUpdateSettings,
  onSaveProject,
  favorites,
  onToggleFavorite,
}) => {
  const [wbsModal, setWbsModal] = React.useState<{
    isOpen: boolean;
    type: 'GROUP' | 'PHASE' | 'SUBPHASE';
    mode: 'CREATE' | 'EDIT';
    groupIndex?: number;
    phaseIndex?: number;
    subPhaseIndex?: number;
    value: string;
  }>({ isOpen: false, type: 'GROUP', mode: 'CREATE', value: '' });

  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = React.useState(false);
  const [manageEapMenuOpen, setManageEapMenuOpen] = React.useState(false);

  const [expandedGroups, setExpandedGroups] = React.useState<string[]>([]);
  const [expandedPhases, setExpandedPhases] = React.useState<string[]>([]);
  const [expandedSubPhases, setExpandedSubPhases] = React.useState<string[]>([]);
  const [addingTo, setAddingTo] = React.useState<AddingTarget | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [searchCode, setSearchCode] = React.useState('');
  const [searchGroupFilter, setSearchGroupFilter] = React.useState('');
  const [searchType, setSearchType] = React.useState('');
  const [searchLocation, setSearchLocation] = React.useState(settings.location || 'MG');
  const [searchCharges, setSearchCharges] = React.useState(settings.socialChargesMode || 'SEM_DESONERACAO');
  const [searchReference, setSearchReference] = React.useState(settings.referenceMonth || '12/2025');
  const [searchDatabase, setSearchDatabase] = React.useState(settings.database || 'SINAPI');
  const [searchScope, setSearchScope] = React.useState<'description' | 'category' | 'both'>('description');
  const [searchMode, setSearchMode] = React.useState<'exact' | 'all-words'>('all-words');
  const [searchResults, setSearchResults] = React.useState<SinapiItem[]>([]);
  const [selectedSearchItems, setSelectedSearchItems] = React.useState<SinapiItem[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [dbSize, setDbSize] = React.useState<number>(0);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [customDatabases, setCustomDatabases] = React.useState<CustomDatabase[]>([]);
  const [itemToSave, setItemToSave] = React.useState<SinapiItem | null>(null);
  const [isSaveDbModalOpen, setIsSaveDbModalOpen] = React.useState(false);
  const [selectedCPUItem, setSelectedCPUItem] = React.useState<BudgetEntry | null>(null);
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isVersionModalOpen, setIsVersionModalOpen] = React.useState(false);
  const [versionDescription, setVersionDescription] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);
  const [editingVersionId, setEditingVersionId] = React.useState<string | null>(null);
  const [editingVersionDescription, setEditingVersionDescription] = React.useState('');
  const [isCreatingItem, setIsCreatingItem] = React.useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = React.useState(false);
  const [isParametricModalOpen, setIsParametricModalOpen] = React.useState(false);
  const [parametricType, setParametricType] = React.useState<'FINANCIAL' | 'QUANTITATIVE'>('FINANCIAL');
  const [parametricPreview, setParametricPreview] = React.useState<{ totalValue: number; itemsCount: number; mainMaterials?: Array<{ desc: string; qty: number; unit: string }> } | null>(null);
  const [showNatureBreakdown, setShowNatureBreakdown] = React.useState(false);
  const [auxiliaryItems, setAuxiliaryItems] = React.useState<Map<string, SinapiItem>>(new Map());
  const [isLoadingAuxiliary, setIsLoadingAuxiliary] = React.useState(false);
  const [hasCPUChanges, setHasCPUChanges] = React.useState(false);
  const isLocked = settings.budgetStatus === 'Fechado';


  const [newItem, setNewItem] = React.useState<Partial<SinapiItem>>({
    type: SinapiType.INPUT,
    description: '',
    unit: 'un',
    price: 0,
    category: 'Própria'
  });

  const handleOpenCPU = (item: BudgetEntry) => {
    setSelectedCPUItem(item);
    setHasCPUChanges(false);
  };
  const handleCloseCPU = () => {
    setSelectedCPUItem(null);
    setHasCPUChanges(false);
  };
  const handleCreateItem = async () => {
    if (!newItem.description || !newItem.unit) {
      alert("Por favor, preencha a descrição e a unidade.");
      return;
    }

    try {
      // Se estivermos em uma base customizada específica, associe o novo item a ela
      const dbId = searchDatabase !== 'SINAPI' && searchDatabase !== 'GENERAL' ? searchDatabase : undefined;
      const itemToSave = { ...newItem, database_id: dbId };

      const savedItem = await customDatabaseService.saveItem(itemToSave as SinapiItem);
      setIsCreatingItem(false);
      setNewItem({ type: SinapiType.INPUT, description: '', unit: 'un', price: 0, category: 'Própria' });
      setNotification({ message: `Item criado com sucesso na Base ${dbId ? 'selecionada' : 'Própria'}!`, type: 'success' });
      setTimeout(() => setNotification(null), 3000);

      // Se não houver dbId, forçamos 'GENERAL' (Base Geral) para ver o item
      const targetDb = dbId || 'GENERAL';
      setSearchDatabase(targetDb);
      onUpdateSettings({ ...settings, database: targetDb });
      setSearchTerm(savedItem.description);
      setSearchCode(savedItem.code);
    } catch (error) {
      console.error('[BudgetEditor] Falha ao criar item:', error);
      alert("Erro ao criar item.");
    }
  };

  const handleSaveVersion = async () => {
    if (!versionDescription.trim()) {
      alert("Por favor, insira uma descrição para a versão.");
      return;
    }

    const currentVersions = settings.versions || [];
    const nextItemNumber = currentVersions.length > 0
      ? Math.max(...currentVersions.map(v => v.item)) + 1
      : 1;

    const newId = crypto.randomUUID();
    const newVersion: BudgetVersion = {
      id: newId,
      item: nextItemNumber,
      date: new Date().toISOString(),
      description: versionDescription,
      budget: JSON.parse(JSON.stringify(budget)),
      settings: { ...settings, versions: undefined }
    };

    const newSettings: ProjectSettings = {
      ...settings,
      versions: [...currentVersions, newVersion],
      activeVersionId: newId,
    };

    onUpdateSettings(newSettings);
    setVersionDescription('');
    setIsVersionModalOpen(false);

    // Persiste imediatamente no Supabase passando os dados explicitamente
    // para evitar closure stale no handler do pai
    if (onSaveProject) {
      try {
        await onSaveProject(budget, newSettings);
        setNotification({ message: `Versão ${nextItemNumber} salva com sucesso!`, type: 'success' });
      } catch {
        setNotification({ message: `Versão ${nextItemNumber} salva localmente. Erro ao salvar na nuvem.`, type: 'error' });
      }
    } else {
      setNotification({ message: `Versão ${nextItemNumber} salva com sucesso!`, type: 'success' });
    }
    setTimeout(() => setNotification(null), 4000);
  };

  const handleLoadVersion = (version: BudgetVersion) => {
    if (window.confirm(`Deseja carregar a versão ${version.item}? O orçamento atual será substituído.`)) {
      // Congela o budget atual no snapshot da versão ativa antes de trocar
      const currentActiveId = settings.activeVersionId;
      let newVersions = settings.versions || [];
      if (currentActiveId && currentActiveId !== version.id) {
        newVersions = newVersions.map(v =>
          v.id === currentActiveId
            ? { ...v, budget: JSON.parse(JSON.stringify(budget)) }
            : v
        );
      }

      const restoredBudget: BudgetEntry[] = JSON.parse(JSON.stringify(version.budget));
      const newSettings = { ...settings, versions: newVersions, activeVersionId: version.id };

      onUpdateBudget(restoredBudget);
      onUpdateSettings(newSettings);
      setShowHistory(false);

      // Persiste imediatamente para garantir que o freeze da versão anterior chegue ao Supabase
      if (onSaveProject) {
        onSaveProject(restoredBudget, newSettings).catch(console.error);
      }

      setNotification({ message: `Versão ${version.item} carregada.`, type: 'success' });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleRenameVersion = (id: string) => {
    if (!editingVersionDescription.trim()) return;
    const updated = (settings.versions || []).map(v =>
      v.id === id ? { ...v, description: editingVersionDescription.trim() } : v
    );
    onUpdateSettings({ ...settings, versions: updated });
    setEditingVersionId(null);
    setEditingVersionDescription('');
  };

  const handleStartEditVersion = (v: BudgetVersion) => {
    setEditingVersionId(v.id);
    setEditingVersionDescription(v.description);
  };

  // Inicializa WBS e Migração
  React.useEffect(() => {
    // Migration Logic: Check if we need to migrate from Phase[] to WBSGroup[]
    // We check if the first item has 'phases' property. If NOT, it's the old structure.
    // However, due to TS types, we might need to cast or check structure at runtime.
    const currentWBS = settings.wbs as any[];

    if (!currentWBS || currentWBS.length === 0) {
      const defaultWBS: WBSGroup[] = [
        {
          id: '01',
          name: '01. GRUPO GERAL',
          phases: [
            { id: '01.01', name: '01.01. Serviços Preliminares', subPhases: ['01.01.01. Geral'] }
          ]
        }
      ];
      onUpdateSettings({ ...settings, wbs: defaultWBS });
    } else {
      // Check if it's the old structure (WBSPhase does not have 'phases')
      const isOldStructure = currentWBS.length > 0 && !('phases' in currentWBS[0]);

      if (isOldStructure) {
        // MIGRATE
        const oldPhases = currentWBS as WBSPhase[];

        // Create a wrapper Group
        const newGroup: WBSGroup = {
          id: '01',
          name: '01. Serviços Preliminares',
          phases: oldPhases.map(p => ({
            ...p,
            // We might need to renumber phases to 01.01 format if they were just 01
            name: p.name.startsWith('01.') ? p.name : `01.${p.name}`
          }))
        };

        // Update Budget Items
        const newBudget = budget.map(item => ({
          ...item,
          group: '01. Serviços Preliminares'
        }));

        onUpdateSettings({ ...settings, wbs: [newGroup] });
        onUpdateBudget(newBudget);
        setExpandedGroups(['01']);
      } else {
        // It's already new structure - Expand ALL by default
        const allGroupIds = currentWBS.map((g: any) => g.id);
        const allPhaseIds = currentWBS.flatMap((g: any) => g.phases.map((p: any) => p.id));
        const allSubPhaseNames = currentWBS.flatMap((g: any) => g.phases.flatMap((p: any) => p.subPhases));

        setExpandedGroups(allGroupIds);
        setExpandedPhases(allPhaseIds);
        setExpandedSubPhases(allSubPhaseNames);
      }
    }

    // Tenta carregar a base em background para atualizar o contador e categorias
    sinapiService.loadDatabase().then(() => {
      setDbSize(sinapiService.databaseSize);
    });

    sinapiService.getCategories().then(cats => setCategories(cats));

    // Load custom databases
    customDatabaseService.listDatabases().then(dbs => setCustomDatabases(dbs));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ref para aceder ao budget mais recente dentro do effect sem torná-lo dependência
  // (evita race condition: cada edição de item disparava novo fetch ao SINAPI)
  const budgetRef = React.useRef(budget);
  budgetRef.current = budget;

  // Effect to recursively fetch missing compositions for nature breakdown
  React.useEffect(() => {
    if (!showNatureBreakdown && !selectedCPUItem) return;

    let cancelled = false;

    const loadAuxiliaryItems = async () => {
      setIsLoadingAuxiliary(true);
      const resolvedCodes = new Set<string>();
      const itemsToResolve = new Set<string>();

      // Initialize with all children from budget compositions
      budgetRef.current.forEach(entry => {
        entry.sinapiItem?.composition?.forEach(comp => {
          itemsToResolve.add(comp.code);
        });
      });

      // Also include children from currently selected CPU item modal
      if (selectedCPUItem?.sinapiItem?.composition) {
        selectedCPUItem.sinapiItem.composition.forEach(comp => {
          itemsToResolve.add(comp.code);
        });
      }

      // Filter out items we already have in auxiliaryItems
      auxiliaryItems.forEach((_, code) => {
        if (itemsToResolve.has(code)) {
          itemsToResolve.delete(code);
        }
        resolvedCodes.add(code);
      });

      let currentMap = new Map(auxiliaryItems);
      let safety = 0;

      while (itemsToResolve.size > 0 && safety < 10 && !cancelled) {
        safety++;
        const batch = Array.from(itemsToResolve);
        itemsToResolve.clear();

        if (batch.length === 0) break;

        try {
          const fetched = await sinapiService.getItemsByCodes(
            batch,
            settings.location,
            settings.socialChargesMode
          );

          if (cancelled) break;

          fetched.forEach(item => {
            const existing = currentMap.get(item.code);
            // Update if not exists or if existing has zero price but fetched has price
            if (!existing || (existing.price === 0 && item.price > 0)) {
              currentMap.set(item.code, item);
            }
            resolvedCodes.add(item.code);

            item.composition?.forEach(child => {
              if (!resolvedCodes.has(child.code) && !currentMap.has(child.code)) {
                itemsToResolve.add(child.code);
              }
            });
          });
        } catch (error) {
          console.error('[BudgetEditor] Falha ao carregar composições auxiliares:', error);
          if (!cancelled) {
            setNotification({ message: 'Não foi possível carregar todas as composições. Alguns valores podem estar incompletos.', type: 'error' });
            setTimeout(() => setNotification(null), 5000);
          }
          break;
        }
      }

      if (!cancelled) {
        setAuxiliaryItems(currentMap);
        setIsLoadingAuxiliary(false);
      }
    };

    loadAuxiliaryItems();
    return () => { cancelled = true; };
  }, [showNatureBreakdown, selectedCPUItem, settings.location, settings.socialChargesMode]);

  // --- Search Effect (Debounce) ---
  React.useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      // Dispara busca se houver termo, código, grupo selecionado, favoritos ativo, OU SE não for SINAPI (base própria carrega tudo)
      if (searchTerm.length > 2 || searchCode.length > 0 || String(searchGroupFilter) !== '' || showOnlyFavorites || searchDatabase !== 'SINAPI') {
        setIsSearching(true);
        try {
          let results = [];

          if (searchDatabase === 'SINAPI') {
            results = await sinapiService.search(searchTerm, {
              code: searchCode,
              group: searchGroupFilter,
              type: searchType as SinapiType,
              state: searchLocation,
              chargeType: searchCharges,
              searchScope: searchScope,
              searchMode: searchMode,
              codes: showOnlyFavorites ? favorites : undefined
            });
          } else {
            // Find the selected custom database to get its ID if needed,
            // but searchDatabase ALREADY holds the ID for custom databases (or 'CURRICULO' for legacy?)
            // Actually 'CURRICULO' was the hardcoded value for "Própria".
            // Now searchDatabase will hold the UUID of the custom database.

            // If it's the legacy 'CURRICULO', we might want to handle it (maybe list all custom items?)
            // But for now let's assume the user selects a specific base.

            results = await customDatabaseService.search(searchTerm, {
              type: searchType,
              category: searchGroupFilter,
              code: searchCode, // Pass code filter
              searchScope: searchScope,
              searchMode: searchMode,
              databaseId: searchDatabase === 'GENERAL' ? 'GENERAL' : searchDatabase,
              codes: showOnlyFavorites ? favorites : undefined
            });
          }

          setSearchResults(results.map(item => ({
            ...item,
            isFavorite: favorites.includes(item.code)
          })));
          setSelectedSearchItems([]); // Clear selection on new search
          // Atualiza o contador caso tenha mudado após o load completo
          setDbSize(sinapiService.databaseSize);
        } catch (error) {
          console.error("Erro na busca:", error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setSelectedSearchItems([]);
      }
    }, 300); // Aguarda 300ms após o usuário parar de digitar

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, searchCode, searchGroupFilter, searchType, searchLocation, searchCharges, searchDatabase, searchScope, searchMode, favorites, showOnlyFavorites]);

  const handleExpandAll = () => {
    const allGroupIds = settings.wbs.map(g => g.id);
    const allPhaseIds = settings.wbs.flatMap(g => g.phases.map(p => p.id));
    const allSubPhaseNames = settings.wbs.flatMap(g => g.phases.flatMap(p => p.subPhases));

    setExpandedGroups(allGroupIds);
    setExpandedPhases(allPhaseIds);
    setExpandedSubPhases(allSubPhaseNames);
  };

  const handleCollapseAll = () => {
    setExpandedGroups([]);
    setExpandedPhases([]);
    setExpandedSubPhases([]);
  };

  const toggleGroup = (id: string) => {
    if (expandedGroups.includes(id)) {
      setExpandedGroups(expandedGroups.filter(g => g !== id));
    } else {
      setExpandedGroups([...expandedGroups, id]);
    }
  };

  const togglePhase = (id: string) => {
    if (expandedPhases.includes(id)) {
      setExpandedPhases(expandedPhases.filter(p => p !== id));
    } else {
      setExpandedPhases([...expandedPhases, id]);
    }
  };

  const toggleSubPhase = (name: string) => {
    if (expandedSubPhases.includes(name)) {
      setExpandedSubPhases(expandedSubPhases.filter(p => p !== name));
    } else {
      setExpandedSubPhases([...expandedSubPhases, name]);
    }
  };

  // --- Helpers de Renumeração ---
  const renumberWBSAndSync = (currentWBS: WBSGroup[]) => {
    const oldToNewGroup: Record<string, string> = {};
    const oldToNewPhase: Record<string, string> = {};
    const oldToNewSub: Record<string, Record<string, string>> = {};

    const renumberedWBS = currentWBS.map((group, gIdx) => {
      const newGroupId = (gIdx + 1).toString().padStart(2, '0');
      const cleanGroupName = group.name.replace(/^[\d\.]+\s+/, '');
      const newGroupName = `${newGroupId}. ${cleanGroupName}`;

      oldToNewGroup[group.name] = newGroupName;

      const newPhases = group.phases.map((phase, pIdx) => {
        const newPhaseId = (pIdx + 1).toString().padStart(2, '0');
        const cleanPhaseName = phase.name.replace(/^[\d\.]+\s+/, '');
        const newPhaseName = `${newGroupId}.${newPhaseId}. ${cleanPhaseName}`;

        oldToNewPhase[phase.name] = newPhaseName;
        oldToNewSub[phase.name] = {};

        const newSubPhases = phase.subPhases.map((sub, sIdx) => {
          const subId = (sIdx + 1).toString().padStart(2, '0');
          const cleanSub = sub.replace(/^[\d\.]+\s+/, '');
          const newSubName = `${newGroupId}.${newPhaseId}.${subId}. ${cleanSub}`;
          oldToNewSub[phase.name][sub] = newSubName;
          return newSubName;
        });

        return { ...phase, id: `${newGroupId}.${newPhaseId}`, name: newPhaseName, subPhases: newSubPhases };
      });

      return { ...group, id: newGroupId, name: newGroupName, phases: newPhases };
    });

    const newBudget = budget.map(item => {
      const newGroup = oldToNewGroup[item.group] || item.group;
      const newPhase = oldToNewPhase[item.phase] || item.phase;
      let newSubPhase = item.subPhase;
      if (item.subPhase && oldToNewSub[item.phase] && oldToNewSub[item.phase][item.subPhase]) {
        newSubPhase = oldToNewSub[item.phase][item.subPhase];
      }
      return { ...item, group: newGroup, phase: newPhase, subPhase: newSubPhase };
    });

    onUpdateSettings({ ...settings, wbs: renumberedWBS });
    onUpdateBudget(newBudget);
  };



  const handleImportWBS = (importedWBS: WBSGroup[]) => {
    // Replace current WBS
    onUpdateSettings({ ...settings, wbs: importedWBS });
    setIsImportModalOpen(false);

    // Optional: Renumber to ensure consistency immediately
    // renumberWBSAndSync(importedWBS); 
    // For now, trusting the import logic or letting the user trigger renumber if needed.
    // Actually, renumberWBSAndSync depends on current budget state mapping which might be broken.
    // So better just update settings.wbs and let the user manage items.

    alert('EAP importada com sucesso! A estrutura do projeto foi atualizada.');
  };

  const handleExportWBS = () => {
    const rows = [['Grupo', 'Etapa', 'Subetapa']];

    settings.wbs.forEach(group => {
      // If group has no phases, export just the group
      if (group.phases.length === 0) {
        rows.push([group.name, '', '']);
      } else {
        group.phases.forEach(phase => {
          // If phase has no subphases, export group and phase
          if (phase.subPhases.length === 0) {
            rows.push([group.name, phase.name, '']);
          } else {
            phase.subPhases.forEach(subPhase => {
              rows.push([group.name, phase.name, subPhase]);
            });
          }
        });
      }
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "EAP");
    XLSX.writeFile(wb, "EAP_Exportada.xlsx");
  };

  const handleLoadTemplate = (wbs: WBSGroup[]) => {
    onUpdateSettings({ ...settings, wbs });
    // renumberWBSAndSync(wbs); // Optional
    alert('Modelo de EAP carregado com sucesso!');
  };

  const handleClearWBS = () => {
    if (confirm('Tem certeza que deseja limpar toda a estrutura da EAP? Isso não pode ser desfeito.')) {
      onUpdateSettings({ ...settings, wbs: [] });
      setExpandedGroups([]);
      setExpandedPhases([]);
      setExpandedSubPhases([]);
    }
  };

  // --- Handlers de Estrutura (WBS) ---
  const handleAddGroup = () => setWbsModal({ isOpen: true, type: 'GROUP', mode: 'CREATE', value: '' });

  const handleAddPhase = (e: React.MouseEvent, groupIndex: number) => {
    e.stopPropagation();
    setWbsModal({ isOpen: true, type: 'PHASE', mode: 'CREATE', groupIndex: groupIndex, value: '' });
  };

  const handleAddSubPhase = (e: React.MouseEvent, groupIndex: number, phaseIndex: number) => {
    e.stopPropagation();
    setWbsModal({ isOpen: true, type: 'SUBPHASE', mode: 'CREATE', groupIndex: groupIndex, phaseIndex: phaseIndex, value: '' });
  };

  const handleEditGroup = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const group = settings.wbs[index];
    const { name } = splitName(group.name);
    setWbsModal({ isOpen: true, type: 'GROUP', mode: 'EDIT', groupIndex: index, value: name });
  };

  const handleEditPhase = (e: React.MouseEvent, groupIndex: number, phaseIndex: number) => {
    e.stopPropagation();
    const phase = settings.wbs[groupIndex].phases[phaseIndex];
    const { name } = splitName(phase.name);
    setWbsModal({ isOpen: true, type: 'PHASE', mode: 'EDIT', groupIndex, phaseIndex, value: name });
  };

  const handleEditSubPhase = (e: React.MouseEvent, groupIndex: number, phaseIndex: number, spIndex: number) => {
    e.stopPropagation();
    const subPhase = settings.wbs[groupIndex].phases[phaseIndex].subPhases[spIndex];
    const { name } = splitName(subPhase);
    setWbsModal({ isOpen: true, type: 'SUBPHASE', mode: 'EDIT', groupIndex, phaseIndex, subPhaseIndex: spIndex, value: name });
  };

  const handleConfirmWBSAction = () => {
    const name = wbsModal.value.trim();
    if (!name) return;

    if (wbsModal.mode === 'CREATE') {
      if (wbsModal.type === 'GROUP') {
        const newId = (settings.wbs.length + 1).toString().padStart(2, '0');
        const hasPrefix = /^[\d\.]+\s+/.test(name);
        const newName = hasPrefix ? name : `${newId}. ${name}`;
        const newGroup: WBSGroup = {
          id: newId,
          name: newName,
          phases: [{ id: `${newId}.01`, name: `${newId}.01. Geral`, subPhases: [`${newId}.01.01. Geral`] }]
        };
        onUpdateSettings({ ...settings, wbs: [...settings.wbs, newGroup] });
        setExpandedGroups([...expandedGroups, newId]);
      } else if (wbsModal.type === 'PHASE' && wbsModal.groupIndex !== undefined) {
        const newWBS = [...settings.wbs];
        const currentGroup = newWBS[wbsModal.groupIndex];
        const phaseId = (currentGroup.phases.length + 1).toString().padStart(2, '0');
        const hasPrefix = /^[\d\.]+\s+/.test(name);
        const newName = hasPrefix ? name : `${currentGroup.id}.${phaseId}. ${name}`;
        const newPhase: WBSPhase = { id: `${currentGroup.id}.${phaseId}`, name: newName, subPhases: [`${currentGroup.id}.${phaseId}.01. Geral`] };

        currentGroup.phases.push(newPhase);
        onUpdateSettings({ ...settings, wbs: newWBS });
        setExpandedPhases([...expandedPhases, newPhase.id]);
      } else if (wbsModal.type === 'SUBPHASE' && wbsModal.groupIndex !== undefined && wbsModal.phaseIndex !== undefined) {
        const newWBS = [...settings.wbs];
        const currentPhase = newWBS[wbsModal.groupIndex].phases[wbsModal.phaseIndex];
        const subId = (currentPhase.subPhases.length + 1).toString().padStart(2, '0');
        const hasPrefix = /^[\d\.]+\s+/.test(name);
        const newSubName = hasPrefix ? name : `${currentPhase.id}.${subId}. ${name}`;

        if (!currentPhase.subPhases.includes(newSubName)) {
          currentPhase.subPhases.push(newSubName);
          onUpdateSettings({ ...settings, wbs: newWBS });
          setExpandedSubPhases([...expandedSubPhases, newSubName]);
        }
      }
    } else {
      // EDIT Mode
      const newWBS = [...settings.wbs];
      let oldName = '';
      let newName = '';

      if (wbsModal.type === 'GROUP' && wbsModal.groupIndex !== undefined) {
        const group = newWBS[wbsModal.groupIndex];
        oldName = group.name;
        const currentId = group.id;
        const hasPrefix = /^[\d\.]+\s+/.test(name);
        newName = hasPrefix ? name : `${currentId}. ${name}`;
        group.name = newName;
      } else if (wbsModal.type === 'PHASE' && wbsModal.groupIndex !== undefined && wbsModal.phaseIndex !== undefined) {
        const phase = newWBS[wbsModal.groupIndex].phases[wbsModal.phaseIndex];
        oldName = phase.name;
        const currentId = phase.id;
        const hasPrefix = /^[\d\.]+\s+/.test(name);
        newName = hasPrefix ? name : `${currentId}. ${name}`;
        phase.name = newName;
      } else if (wbsModal.type === 'SUBPHASE' && wbsModal.groupIndex !== undefined && wbsModal.phaseIndex !== undefined && wbsModal.subPhaseIndex !== undefined) {
        const phase = newWBS[wbsModal.groupIndex].phases[wbsModal.phaseIndex];
        oldName = phase.subPhases[wbsModal.subPhaseIndex];
        const { id: subId } = splitName(oldName);
        const hasPrefix = /^[\d\.]+\s+/.test(name);
        newName = hasPrefix ? name : `${subId}. ${name}`;
        phase.subPhases[wbsModal.subPhaseIndex] = newName;
      }

      if (oldName && newName && oldName !== newName) {
        const updatedBudget = budget.map(item => ({
          ...item,
          group: item.group === oldName ? newName : item.group, // Update group name if changed
          phase: item.phase === oldName ? newName : item.phase, // Update phase name if changed
          subPhase: item.subPhase === oldName ? newName : item.subPhase // Update subphase name if changed
        }));
        onUpdateBudget(updatedBudget);
      }
      onUpdateSettings({ ...settings, wbs: newWBS });
    }
    setWbsModal({ ...wbsModal, isOpen: false, value: '' });
  };

  const handleMoveGroup = (e: React.MouseEvent, index: number, direction: 'UP' | 'DOWN') => {
    e.stopPropagation();
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === settings.wbs.length - 1) return;
    const newWBS = [...settings.wbs];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    [newWBS[index], newWBS[targetIndex]] = [newWBS[targetIndex], newWBS[index]];
    renumberWBSAndSync(newWBS);
  };

  const handleMovePhase = (e: React.MouseEvent, groupIndex: number, phaseIndex: number, direction: 'UP' | 'DOWN') => {
    e.stopPropagation();
    if (direction === 'UP' && phaseIndex === 0) return;
    if (direction === 'DOWN' && phaseIndex === settings.wbs[groupIndex].phases.length - 1) return;

    const newWBS = [...settings.wbs];
    const currentGroup = newWBS[groupIndex];
    const newPhases = [...currentGroup.phases];

    const targetIndex = direction === 'UP' ? phaseIndex - 1 : phaseIndex + 1;
    [newPhases[phaseIndex], newPhases[targetIndex]] = [newPhases[targetIndex], newPhases[phaseIndex]];

    newWBS[groupIndex] = { ...currentGroup, phases: newPhases };
    renumberWBSAndSync(newWBS);
  };

  const handleMoveSubPhase = (e: React.MouseEvent, groupIndex: number, phaseIndex: number, subIndex: number, direction: 'UP' | 'DOWN') => {
    e.stopPropagation();
    const currentPhase = settings.wbs[groupIndex].phases[phaseIndex];
    if (direction === 'UP' && subIndex === 0) return;
    if (direction === 'DOWN' && subIndex === currentPhase.subPhases.length - 1) return;

    const newWBS = [...settings.wbs];
    const newPhases = [...settings.wbs[groupIndex].phases];
    const newSubPhases = [...currentPhase.subPhases];

    const targetIndex = direction === 'UP' ? subIndex - 1 : subIndex + 1;
    [newSubPhases[subIndex], newSubPhases[targetIndex]] = [newSubPhases[targetIndex], newSubPhases[subIndex]];

    newPhases[phaseIndex] = { ...currentPhase, subPhases: newSubPhases };
    newWBS[groupIndex] = { ...settings.wbs[groupIndex], phases: newPhases };

    renumberWBSAndSync(newWBS);
  };

  const handleDeleteGroup = (e: React.MouseEvent, groupIndex: number) => {
    e.stopPropagation();
    if (window.confirm("Deseja excluir este Grupo e TODAS as suas etapas e itens?")) {
      const groupName = settings.wbs[groupIndex].name;
      const newWBS = [...settings.wbs];
      newWBS.splice(groupIndex, 1);
      const newBudget = budget.filter(item => item.group !== groupName);

      onUpdateSettings({ ...settings, wbs: newWBS });
      // We should probably renumber here too, but simpler for now just to delete
      renumberWBSAndSync(newWBS);
    }
  };

  const handleDeletePhase = (e: React.MouseEvent, groupIndex: number, phaseIndex: number) => {
    e.stopPropagation();
    if (window.confirm("Deseja excluir esta etapa e todos os seus itens?")) {
      const phaseName = settings.wbs[groupIndex].phases[phaseIndex].name;
      const newWBS = [...settings.wbs];
      newWBS[groupIndex].phases.splice(phaseIndex, 1);

      const newBudget = budget.filter(item => item.phase !== phaseName);

      // Renumber phases within the group could be done by renumberWBSAndSync
      const updatedGroup = newWBS[groupIndex]; // It's mutated already

      onUpdateSettings({ ...settings, wbs: newWBS });
      renumberWBSAndSync(newWBS);
    }
  };

  const handleDeleteSubPhase = (e: React.MouseEvent, groupIndex: number, phaseIndex: number, subPhaseName: string) => {
    e.stopPropagation();
    if (window.confirm("Deseja excluir esta subetapa e seus itens?")) {
      const newWBS = [...settings.wbs];
      const phase = newWBS[groupIndex].phases[phaseIndex];

      // Remove a subetapa excluída
      phase.subPhases = phase.subPhases.filter(sp => sp !== subPhaseName);

      // Remove os itens do orçamento que pertenciam à subetapa excluída
      const filteredBudget = budget.filter(
        item => !(item.phase === phase.name && item.subPhase === subPhaseName)
      );

      // Renumera sequencialmente as subetapas restantes e mapeia nomes antigos → novos
      const oldToNewSub: Record<string, string> = {};
      phase.subPhases = phase.subPhases.map((sub, sIdx) => {
        const subId = (sIdx + 1).toString().padStart(2, '0');
        const cleanSub = sub.replace(/^[\d\.]+\s+/, '');
        const newSubName = `${phase.id}.${subId}. ${cleanSub}`;
        oldToNewSub[sub] = newSubName;
        return newSubName;
      });

      // Atualiza as referências de subetapa nos itens do orçamento
      const updatedBudget = filteredBudget.map(item => {
        if (item.phase === phase.name && item.subPhase && oldToNewSub[item.subPhase]) {
          return { ...item, subPhase: oldToNewSub[item.subPhase] };
        }
        return item;
      });

      onUpdateSettings({ ...settings, wbs: newWBS });
      onUpdateBudget(updatedBudget);
    }
  };

  // --- Duplicate Handlers ---
  const handleDuplicateGroup = (e: React.MouseEvent, groupIndex: number) => {
    e.stopPropagation();
    const groupToCopy = settings.wbs[groupIndex];
    const newGroupName = `${groupToCopy.name} (Cópia)`;

    // Deep copy e insere o novo grupo logo após o original
    const newGroup = JSON.parse(JSON.stringify(groupToCopy));
    newGroup.name = newGroupName;

    const newWBS = [...settings.wbs];
    newWBS.splice(groupIndex + 1, 0, newGroup);

    // Duplica itens do orçamento para o novo grupo
    const itemsToDuplicate = budget.filter(b => b.group === groupToCopy.name);
    const newItems = itemsToDuplicate.map(item => ({
      ...item,
      id: crypto.randomUUID(),
      group: newGroupName
    }));

    // Renumera todos os grupos sequencialmente inline (evita conflito de state)
    const oldToNewGroup: Record<string, string> = {};
    const oldToNewPhase: Record<string, string> = {};
    const oldToNewSubByOldPhase: Record<string, Record<string, string>> = {};

    const renumberedWBS = newWBS.map((g, gIdx) => {
      const newGId = (gIdx + 1).toString().padStart(2, '0');
      const cleanG = g.name.replace(/^[\d\.]+\s+/, '');
      const newGName = `${newGId}. ${cleanG}`;
      oldToNewGroup[g.name] = newGName;

      const newPhases = g.phases.map((phase, pIdx) => {
        const oldPName = phase.name;
        const pNum = (pIdx + 1).toString().padStart(2, '0');
        const pId = `${newGId}.${pNum}`;
        const cleanP = phase.name.replace(/^[\d\.]+\s+/, '');
        const newPName = `${pId}. ${cleanP}`;
        oldToNewPhase[oldPName] = newPName;

        const oldToNewSub: Record<string, string> = {};
        const newSubPhases = phase.subPhases.map((sub, sIdx) => {
          const subNum = (sIdx + 1).toString().padStart(2, '0');
          const cleanSub = sub.replace(/^[\d\.]+\s+/, '');
          const newSubName = `${pId}.${subNum}. ${cleanSub}`;
          oldToNewSub[sub] = newSubName;
          return newSubName;
        });
        oldToNewSubByOldPhase[oldPName] = oldToNewSub;
        return { ...phase, id: pId, name: newPName, subPhases: newSubPhases };
      });

      return { ...g, id: newGId, name: newGName, phases: newPhases };
    });

    // Aplica renumeração ao budget combinado (existente + novos itens)
    const allBudget = newItems.length > 0 ? [...budget, ...newItems] : [...budget];
    const updatedBudget = allBudget.map(item => {
      const newG = oldToNewGroup[item.group] || item.group;
      const newP = oldToNewPhase[item.phase] || item.phase;
      const subMap = oldToNewSubByOldPhase[item.phase] || {};
      const newSub = (item.subPhase && subMap[item.subPhase]) ? subMap[item.subPhase] : item.subPhase;
      return { ...item, group: newG, phase: newP, subPhase: newSub };
    });

    onUpdateSettings({ ...settings, wbs: renumberedWBS });
    onUpdateBudget(updatedBudget);
    setNotification({ message: 'Grupo duplicado com sucesso!', type: 'success' });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDuplicatePhase = (e: React.MouseEvent, groupIndex: number, phaseIndex: number) => {
    e.stopPropagation();
    const group = settings.wbs[groupIndex];
    const phaseToCopy = group.phases[phaseIndex];
    const newPhaseName = `${phaseToCopy.name} (Cópia)`;

    // Duplica itens do orçamento para a nova etapa
    const itemsToDuplicate = budget.filter(b => b.group === group.name && b.phase === phaseToCopy.name);
    const newItems = itemsToDuplicate.map(item => ({
      ...item,
      id: crypto.randomUUID(),
      phase: newPhaseName,
    }));

    // Insere a nova etapa na WBS
    const newWBS = [...settings.wbs];
    newWBS[groupIndex].phases.splice(phaseIndex + 1, 0, {
      ...phaseToCopy,
      id: crypto.randomUUID(),
      name: newPhaseName,
      subPhases: [...phaseToCopy.subPhases]
    });

    // Renumera sequencialmente todas as etapas do grupo inline
    const groupRef = newWBS[groupIndex];
    const oldToNewPhase: Record<string, string> = {};
    const oldToNewSubByOldPhase: Record<string, Record<string, string>> = {};

    groupRef.phases = groupRef.phases.map((phase, pIdx) => {
      const oldPName = phase.name;
      const pNum = (pIdx + 1).toString().padStart(2, '0');
      const pId = `${groupRef.id}.${pNum}`;
      const cleanP = phase.name.replace(/^[\d\.]+\s+/, '');
      const newPName = `${pId}. ${cleanP}`;
      oldToNewPhase[oldPName] = newPName;

      const oldToNewSub: Record<string, string> = {};
      const newSubPhases = phase.subPhases.map((sub, sIdx) => {
        const subNum = (sIdx + 1).toString().padStart(2, '0');
        const cleanSub = sub.replace(/^[\d\.]+\s+/, '');
        const newSubName = `${pId}.${subNum}. ${cleanSub}`;
        oldToNewSub[sub] = newSubName;
        return newSubName;
      });
      oldToNewSubByOldPhase[oldPName] = oldToNewSub;
      return { ...phase, id: pId, name: newPName, subPhases: newSubPhases };
    });

    // Aplica renumeração ao budget combinado (existente + novos itens)
    const allBudget = newItems.length > 0 ? [...budget, ...newItems] : [...budget];
    const updatedBudget = allBudget.map(item => {
      if (item.group !== group.name) return item;
      const newP = oldToNewPhase[item.phase] || item.phase;
      const subMap = oldToNewSubByOldPhase[item.phase] || {};
      const newSub = (item.subPhase && subMap[item.subPhase]) ? subMap[item.subPhase] : item.subPhase;
      return { ...item, phase: newP, subPhase: newSub };
    });

    onUpdateSettings({ ...settings, wbs: newWBS });
    onUpdateBudget(updatedBudget);
    setNotification({ message: 'Etapa duplicada com sucesso!', type: 'success' });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDuplicateSubPhase = (e: React.MouseEvent, groupIndex: number, phaseIndex: number, subPhaseIndex: number) => {
    e.stopPropagation();
    const group = settings.wbs[groupIndex];
    const phase = group.phases[phaseIndex];
    const subPhaseName = phase.subPhases[subPhaseIndex];
    const newSubPhaseName = `${subPhaseName} (Cópia)`;

    // Duplica itens do orçamento para a nova subetapa
    const itemsToDuplicate = budget.filter(b => b.group === group.name && b.phase === phase.name && b.subPhase === subPhaseName);
    const newItems = itemsToDuplicate.map(item => ({
      ...item,
      id: crypto.randomUUID(),
      subPhase: newSubPhaseName
    }));

    // Insere a nova subetapa na WBS
    const newWBS = [...settings.wbs];
    const phaseRef = newWBS[groupIndex].phases[phaseIndex];
    phaseRef.subPhases.splice(subPhaseIndex + 1, 0, newSubPhaseName);

    // Renumera sequencialmente todas as subetapas da etapa inline
    const oldToNewSub: Record<string, string> = {};
    phaseRef.subPhases = phaseRef.subPhases.map((sub, sIdx) => {
      const subId = (sIdx + 1).toString().padStart(2, '0');
      const cleanSub = sub.replace(/^[\d\.]+\s+/, '');
      const newSubName = `${phaseRef.id}.${subId}. ${cleanSub}`;
      oldToNewSub[sub] = newSubName;
      return newSubName;
    });

    // Aplica renumeração ao budget combinado (existente + novos itens)
    const allBudget = newItems.length > 0 ? [...budget, ...newItems] : [...budget];
    const updatedBudget = allBudget.map(item => {
      if (item.phase === phase.name && item.subPhase && oldToNewSub[item.subPhase]) {
        return { ...item, subPhase: oldToNewSub[item.subPhase] };
      }
      return item;
    });

    onUpdateSettings({ ...settings, wbs: newWBS });
    onUpdateBudget(updatedBudget);
    setNotification({ message: 'Subetapa duplicada com sucesso!', type: 'success' });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDuplicateItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const itemIndex = budget.findIndex(b => b.id === id);
    if (itemIndex === -1) return;

    const itemToCopy = budget[itemIndex];
    const newItem = {
      ...itemToCopy,
      id: crypto.randomUUID()
    };

    const newBudget = [...budget];
    newBudget.splice(itemIndex + 1, 0, newItem);

    onUpdateBudget(newBudget);
    setNotification({ message: 'Item duplicado com sucesso!', type: 'success' });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleMoveItem = (e: React.MouseEvent, id: string, direction: 'UP' | 'DOWN') => {
    e.stopPropagation();

    // Encontra o item alvo
    const item = budget.find(b => b.id === id);
    if (!item) return;

    // Filtra apenas os itens da mesma subetapa (contexto do item)
    const siblingIds = budget
      .filter(b => b.group === item.group && b.phase === item.phase && b.subPhase === item.subPhase)
      .map(b => b.id);

    const localIndex = siblingIds.indexOf(id);
    if (localIndex === -1) return;
    if (direction === 'UP' && localIndex === 0) return;
    if (direction === 'DOWN' && localIndex === siblingIds.length - 1) return;

    // Troca os IDs de posição dentro dos irmãos
    const targetLocalIndex = direction === 'UP' ? localIndex - 1 : localIndex + 1;
    [siblingIds[localIndex], siblingIds[targetLocalIndex]] = [siblingIds[targetLocalIndex], siblingIds[localIndex]];

    // Reconstrói o array global de budget mantendo a ordem dos não-irmãos
    const siblingSet = new Set(siblingIds);
    const reorderedSiblings = siblingIds.map(sid => budget.find(b => b.id === sid)!);

    // Reinsere os irmãos reordenados nas posições globais originais dos irmãos
    const globalSiblingPositions: number[] = [];
    budget.forEach((b, idx) => { if (siblingSet.has(b.id)) globalSiblingPositions.push(idx); });

    const newBudget = [...budget];
    globalSiblingPositions.forEach((pos, i) => {
      newBudget[pos] = reorderedSiblings[i];
    });

    onUpdateBudget(newBudget);
  };

  const handleOpenParametric = async (type: 'FINANCIAL' | 'QUANTITATIVE' = 'FINANCIAL') => {
    setParametricType(type);

    if (type === 'FINANCIAL') {
      const totalValue = await parametricService.calculateTotalEstimatedValueAsync(settings);
      const previewItems = await parametricService.generateParametricBudgetAsync(settings);
      setParametricPreview({ totalValue, itemsCount: previewItems.length });
    } else {
      const previewItems = parametricService.generateQuantitativeBudget(settings);

      // Extract main materials for preview
      const mainMaterials = previewItems
        .filter(item => ['Aço', 'Concreto', 'Cimento', 'Areia', 'Brita', 'Bloco', 'Pedreiro', 'Servente'].some(keyword => item.sinapiItem?.description.includes(keyword)))
        .slice(0, 6)
        .map(item => ({
          desc: item.sinapiItem?.description.replace('NBR 12721 - ', '') || '',
          qty: item.quantity,
          unit: item.sinapiItem?.unit || ''
        }));

      setParametricPreview({
        totalValue: 0,
        itemsCount: previewItems.length,
        mainMaterials
      });
    }
    setIsParametricModalOpen(true);
  };

  const handleGenerateParametric = async (mode: 'REPLACE' | 'APPEND') => {
    const newItems = parametricType === 'FINANCIAL'
      ? await parametricService.generateParametricBudgetAsync(settings)
      : parametricService.generateQuantitativeBudget(settings);

    if (newItems.length === 0) {
      alert("Não foi possível gerar o orçamento. Verifique se a área e o padrão estão definidos correctly.");
      return;
    }

    if (mode === 'REPLACE') {
      onUpdateBudget(newItems);
      setNotification({ message: 'Orçamento paramétrico gerado com sucesso (Substituído)!', type: 'success' });
    } else {
      // Re-generate IDs to avoid conflicts just in case (though parametricService uses local counter)
      // parametricService IDs are "1", "2"... existing budget might have random strings or numbers. 
      // Safest is to uuid them or offset.
      const existingIds = new Set(budget.map(b => b.id));
      const appendItems = newItems.map(item => {
        let newId = item.id;
        while (existingIds.has(newId)) {
          newId = Math.random().toString(36).substr(2, 9);
        }
        return { ...item, id: newId };
      });
      onUpdateBudget([...budget, ...appendItems]);
      setNotification({ message: 'Itens paramétricos adicionados ao orçamento!', type: 'success' });
    }
    setIsParametricModalOpen(false);
    setTimeout(() => setNotification(null), 3000);
  };

  // --- Handlers de Itens ---
  const handleAddItem = (item: SinapiItem) => {
    if (!addingTo) return;
    const newEntry: BudgetEntry = {
      id: crypto.randomUUID(),
      sinapiItem: item,
      quantity: 1,
      group: addingTo.group,
      phase: addingTo.phase,
      subPhase: addingTo.subPhase
    };
    onUpdateBudget([...budget, newEntry]);

    // Mostra aviso de sucesso
    setNotification({ message: `"${item.description.substring(0, 30)}..." adicionado com sucesso!`, type: 'success' });
    setTimeout(() => setNotification(null), 3000); // Remove após 3s
  };


  const handleOpenAddItem = (e: React.MouseEvent, groupName: string, phaseName: string, subPhaseName: string) => {
    e.stopPropagation();
    setAddingTo({ group: groupName, phase: phaseName, subPhase: subPhaseName });
    setSelectedSearchItems([]);
    // Força atualização visual do contador caso já esteja carregado
    setDbSize(sinapiService.databaseSize);
  };

  const handleToggleSelectItem = (e: React.MouseEvent, item: SinapiItem) => {
    e.stopPropagation();
    setSelectedSearchItems(prev =>
      prev.find(i => i.code === item.code)
        ? prev.filter(i => i.code !== item.code)
        : [...prev, item]
    );
  };

  const handleToggleSelectAll = () => {
    const visibleResults = searchResults.filter(r => !showOnlyFavorites || favorites.includes(r.code));
    const allSelected = visibleResults.length > 0 && selectedSearchItems.length === visibleResults.length;

    if (allSelected) {
      setSelectedSearchItems([]);
    } else {
      setSelectedSearchItems(visibleResults);
    }
  };

  const handleBulkAdd = () => {
    if (!addingTo || selectedSearchItems.length === 0) return;

    const newEntries: BudgetEntry[] = selectedSearchItems.map(item => ({
      id: crypto.randomUUID(),
      sinapiItem: item,
      quantity: 1,
      group: addingTo.group,
      phase: addingTo.phase,
      subPhase: addingTo.subPhase
    }));

    onUpdateBudget([...budget, ...newEntries]);
    setSelectedSearchItems([]);
    setNotification({ message: `${newEntries.length} itens adicionados com sucesso!`, type: 'success' });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleUpdateQuantity = (id: string, qtd: number) => {
    const updated = budget.map(item => item.id === id ? { ...item, quantity: qtd } : item);
    onUpdateBudget(updated);
  };

  const handleUpdateItemPrice = (id: string, price: number) => {
    const updated = budget.map(item => {
      if (item.id === id) {
        return {
          ...item,
          sinapiItem: item.sinapiItem ? { ...item.sinapiItem, price: price, isOverride: true } : {
            code: '---',
            description: '---',
            unit: '---',
            price: price,
            type: SinapiType.INPUT,
            category: '---',
            isOverride: true
          } as SinapiItem
        };
      }
      return item;
    });
    onUpdateBudget(updated);
  };

  const handleUpdateBDI = (id: string, bdi: number | undefined) => {
    const updated = budget.map(item => item.id === id ? { ...item, bdi: bdi } : item);
    onUpdateBudget(updated);
  };

  const handleUpdateComposition = (itemId: string, compIndex: number, updates: Partial<CompositionComponent>) => {
    const updated = budget.map(item => {
      if (item.id === itemId) {
        const newComposition = [...(item.sinapiItem?.composition || [])];
        newComposition[compIndex] = { ...newComposition[compIndex], ...updates };

        // Recalcular preço total da composição pai usando fallback de auxiliaryItems
        const newPrice = newComposition.reduce((acc, comp) => {
          const fallbackPrice = auxiliaryItems.get(comp.code)?.price || 0;
          const price = comp.price || fallbackPrice;
          return acc + (comp.quantity || 0) * price;
        }, 0);

        const updatedEntry = {
          ...item,
          sinapiItem: item.sinapiItem ? {
            ...item.sinapiItem,
            composition: newComposition,
            price: newPrice,
            isOverride: true
          } : item.sinapiItem
        } as BudgetEntry;

        // Sincroniza com o modal se estiver aberto
        if (selectedCPUItem?.id === itemId) {
          setSelectedCPUItem(updatedEntry);
          setHasCPUChanges(true);
        }

        return updatedEntry;
      }
      return item;
    });
    onUpdateBudget(updated as BudgetEntry[]);
  };

  const handleSaveToCustomDB = (item: SinapiItem) => {
    setItemToSave(item);
    setIsSaveDbModalOpen(true);
  };

  const confirmSaveToDatabase = async (databaseId: string) => {
    if (!itemToSave) return;
    try {
      // Create a copy of the item with the selected database_id
      const itemWithDb = { ...itemToSave, database_id: databaseId };
      await customDatabaseService.saveItem(itemWithDb);
      setNotification({ message: `"${itemToSave.description.substring(0, 30)}..." salvo com sucesso!`, type: 'success' });
      setTimeout(() => setNotification(null), 3000);
      setIsSaveDbModalOpen(false);
      setItemToSave(null);
    } catch (error: any) {
      console.error("Save error:", error);
      alert(`Erro ao salvar item: ${error.message || JSON.stringify(error)}`);
    }
  };

  const handleDeleteCustomItem = async (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    if (window.confirm('Deseja excluir este item da sua Base Própria?')) {
      try {
        await customDatabaseService.deleteItem(code);
        setSearchResults(prev => prev.filter(item => item.code !== code));
        setNotification({ message: 'Item removido da Base Própria.', type: 'success' });
        setTimeout(() => setNotification(null), 3000);
      } catch (error) {
        console.error('[BudgetEditor] Falha ao excluir item:', error);
        alert('Erro ao excluir item.');
      }
    }
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onUpdateBudget(budget.filter(item => item.id !== id));
  };

  // --- Calculations ---
  const totalDirectCost = budget.reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0)), 0);
  const totalWithBDI = budget.reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? settings.bdi) / 100)), 0);

  const calculateSubPhaseTotal = (groupName: string, phaseName: string, subPhaseName: string) => {
    return budget
      .filter(item => item.group === groupName && item.phase === phaseName && item.subPhase === subPhaseName)
      .reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? settings.bdi) / 100)), 0);
  };

  const calculatePhaseTotal = (groupName: string, phaseName: string) => {
    return budget
      .filter(item => item.group === groupName && item.phase === phaseName)
      .reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? settings.bdi) / 100)), 0);
  };

  const calculateGroupTotal = (groupName: string) => {
    return budget
      .filter(item => item.group === groupName)
      .reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? settings.bdi) / 100)), 0);
  };

  const calculateSubPhaseNatureTotal = (groupName: string, phaseName: string, subPhaseName: string) => {
    const total = { labor: 0, material: 0, equipment: 0 };
    budget
      .filter(item => item.group === groupName && item.phase === phaseName && item.subPhase === subPhaseName)
      .forEach(item => {
        const breakdown = getNatureBreakdown(item);
        total.labor += breakdown.labor;
        total.material += breakdown.material;
        total.equipment += breakdown.equipment;
      });
    return total;
  };

  const calculatePhaseNatureTotal = (groupName: string, phaseName: string) => {
    const total = { labor: 0, material: 0, equipment: 0 };
    budget
      .filter(item => item.group === groupName && item.phase === phaseName)
      .forEach(item => {
        const breakdown = getNatureBreakdown(item);
        total.labor += breakdown.labor;
        total.material += breakdown.material;
        total.equipment += breakdown.equipment;
      });
    return total;
  };

  const calculateGroupNatureTotal = (groupName: string) => {
    const total = { labor: 0, material: 0, equipment: 0 };
    budget
      .filter(item => item.group === groupName)
      .forEach(item => {
        const breakdown = getNatureBreakdown(item);
        total.labor += breakdown.labor;
        total.material += breakdown.material;
        total.equipment += breakdown.equipment;
      });
    return total;
  };

  const getNatureBreakdown = (entry: BudgetEntry) => {
    const breakdown = { material: 0, labor: 0, equipment: 0, other: 0 };

    const traverse = (item: any, quantity: number) => {
      if (!item) return;

      const itemType = (item.type || '') as string;
      const isComposition = itemType === 'COMPOSITION' || itemType === 'COMP' || itemType === 'SERVICE';
      let composition = item.composition;

      if ((!composition || composition.length === 0) && isComposition) {
        const aux = auxiliaryItems.get(item.code);
        if (aux) composition = aux.composition;
      }

      if (isComposition && composition && composition.length > 0) {
        composition.forEach((comp: any) => {
          const compAux = auxiliaryItems.get(comp.code);
          traverse({
            code: comp.code,
            description: comp.description,
            unit: comp.unit,
            price: comp.price,
            type: comp.type,
            nature: comp.nature,
            category: compAux?.category || comp.category
          }, quantity * comp.quantity);
        });
      } else {
        const authItem = auxiliaryItems.get(item.code);
        const nature = (() => {
          const src = authItem || item;
          const cat = (src?.category || '').toLowerCase();
          if (cat.includes('equipamento') || cat.includes('custos horários') || cat.includes('custos horarios')) return 'Equipamento';
          if (cat.includes('cálculos e parâmetros') || cat.includes('calculos e parametros') || cat.includes('encargos') || cat.includes('mão de obra') || cat.includes('mao de obra')) return 'Mão de Obra';
          return authItem?.nature || item.nature || null;
        })();
        const price = authItem ? authItem.price : (item.price || 0);
        const bdiFactor = 1 + (entry.bdi ?? (settings.bdi || 0)) / 100;
        const total = price * quantity * bdiFactor;

        if (nature === 'Material') breakdown.material += total;
        else if (nature === 'Mão de Obra') breakdown.labor += total;
        else if (nature === 'Equipamento') breakdown.equipment += total;
        else breakdown.other += total;
      }
    };

    if (entry.sinapiItem) {
      traverse(entry.sinapiItem, entry.quantity);
    }
    return breakdown;
  };



  const orphanedItems = React.useMemo(() => {
    if (!settings?.wbs) return [];

    // Create a set of valid paths "Group|Phase|SubPhase"
    const validPaths = new Set<string>();
    (settings.wbs || []).forEach(group => {
      if (!group) return;
      (group.phases || []).forEach(phase => {
        if (!phase) return;
        (phase.subPhases || []).forEach(sub => {
          if (!sub) return;
          validPaths.add(`${(group.name || '').trim().toLowerCase()}|${(phase.name || '').trim().toLowerCase()}|${sub.trim().toLowerCase()}`);
        });
      });
    });

    return (budget || []).filter(item => {
      if (!item) return false;
      const path = `${(item.group || '').trim().toLowerCase()}|${(item.phase || '').trim().toLowerCase()}|${(item.subPhase || '').trim().toLowerCase()}`;
      return !validPaths.has(path);
    });
  }, [budget, settings?.wbs]);

  const handleClearOrphanedItems = () => {
    if (confirm(`Deseja remover ${orphanedItems.length} itens que não pertencem a nenhuma etapa válida?`)) {
      const validItems = budget.filter(item => {
        const path = `${(item.group || '').trim().toLowerCase()}|${(item.phase || '').trim().toLowerCase()}|${(item.subPhase || '').trim().toLowerCase()}`;
        const isValid = settings.wbs?.some(g =>
          g.phases.some(p =>
            p.subPhases.some(s => `${g.name.trim().toLowerCase()}|${p.name.trim().toLowerCase()}|${s.trim().toLowerCase()}` === path)
          )
        );
        return isValid;
      });
      onUpdateBudget(validItems);
      alert(`${orphanedItems.length} itens removidos com sucesso.`);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 relative">
      {orphanedItems.length > 0 && (
        <div className="mx-0 p-4 bg-amber-50 border border-amber-200 rounded-lg animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-amber-800 font-bold text-sm">Itens "Fantasmas" Detectados</p>
                <p className="text-amber-600 text-xs">
                  Encontramos {orphanedItems.length} item(s) no orçamento que não pertencem à estrutura atual (Etapas).
                  Eles não aparecem na lista mas estão sendo contabilizados nos relatórios.
                </p>
              </div>
            </div>
            <button
              onClick={handleClearOrphanedItems}
              className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded text-xs font-bold transition-colors shadow-sm whitespace-nowrap ml-4"
            >
              Remover {orphanedItems.length} Itens
            </button>
          </div>
          <div className="mt-3 px-3 py-2 bg-white/50 border border-amber-100 rounded text-xs text-amber-800 font-mono max-h-32 overflow-y-auto">
            <strong>Detalhes:</strong>
            <ul className="list-disc pl-4 mt-1 space-y-1">
              {orphanedItems.map((item, idx) => (
                <li key={idx}>
                  {item.sinapiItem?.code || 'N/A'} - {(item.sinapiItem?.description || 'Sem descrição').substring(0, 50)}...
                  <span className="text-amber-600 block text-[10px] mt-0.5">
                    Path: [{item.group}] &gt; [{item.phase}] &gt; [{item.subPhase}]
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Orçamento Analítico</h1>
          <p className="text-gray-500 text-sm">Composição detalhada com WBS (Work Breakdown Structure).</p>
        </div>

        {/* Statistics Card */}
        <div className="flex items-stretch bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden divide-x divide-gray-100">
          <div className="px-5 py-2.5 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Custo Direto</span>
            <span className="font-bold text-gray-700 text-lg">R$ {totalDirectCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="px-5 py-2.5 flex flex-col justify-center bg-blue-50/30">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-0.5 whitespace-nowrap">BDI ({settings.bdi}%)</span>
            <span className="font-bold text-blue-600 text-lg">+ R$ {(totalWithBDI - totalDirectCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="px-6 py-2.5 flex flex-col justify-center bg-gray-50/50">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Preço Venda</span>
            <span className="font-black text-emerald-600 text-2xl">R$ {totalWithBDI.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* Main Toolbar */}
      <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {isLocked && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-200 text-xs font-bold animate-pulse">
              <AlertTriangle className="w-4 h-4" />
              BLOQUEADO
            </div>
          )}

          {/* Grupo 1: Visualização & Configurações */}
          <div className="flex items-center gap-3 bg-gray-50/80 p-1.5 rounded-lg border border-gray-100 pr-4">
            <div className="flex items-center gap-2 pl-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase whitespace-nowrap">BDI (%):</label>
              <input
                type="number"
                value={settings.bdi}
                onChange={(e) => onUpdateSettings({ ...settings, bdi: Number(e.target.value) })}
                className="w-14 h-8 rounded-md border border-gray-200 bg-white text-center text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1" />

            <div className="flex bg-gray-200/50 rounded-lg p-0.5">
              <button
                onClick={() => onUpdateSettings({ ...settings, cpuViewMode: 'inline' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${settings.cpuViewMode === 'inline' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="Ver CPU abaixo do item"
              >
                <Layers className="w-3.5 h-3.5" />
                Inline
              </button>
              <button
                onClick={() => onUpdateSettings({ ...settings, cpuViewMode: 'modal' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${(!settings.cpuViewMode || settings.cpuViewMode === 'modal') ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="Ver CPU em janela flutuante"
              >
                <Monitor className="w-3.5 h-3.5" />
                Janela
              </button>
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1" />

            <div className="flex gap-1">
              <button
                onClick={handleExpandAll}
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-blue-600 group"
                title="Expandir Tudo"
              >
                <ChevronsUpDown className="w-4 h-4" />
              </button>
              <button
                onClick={handleCollapseAll}
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-400 group"
                title="Recolher Tudo"
              >
                <ChevronsDownUp className="w-4 h-4" />
              </button>
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1" />

            <button
              onClick={() => setShowNatureBreakdown(!showNatureBreakdown)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${showNatureBreakdown ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
              title="Mostrar detalhamento de custos (Mão de Obra, Material, Equipamento)"
            >
              <Layers className="w-3.5 h-3.5" />
              Composição
            </button>
          </div>

          <div className="h-8 w-px bg-gray-100 mx-1" />

          {/* Grupo 2: Versões & Histórico */}
          <div className="flex items-center gap-1.5 bg-gray-50/80 p-1.5 rounded-lg border border-gray-100">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-xs font-bold border ${showHistory ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              <History className="w-3.5 h-3.5" />
              Histórico ({settings.versions?.length || 0})
            </button>
            <button
              onClick={() => setIsVersionModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md hover:bg-emerald-100 transition-all text-xs font-bold"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar
            </button>
            {(() => {
              const activeVersion = settings.versions?.find(v => v.id === settings.activeVersionId);
              if (!activeVersion) return null;
              return (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-md" title={`Versão ativa: ${activeVersion.description}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                  <span className="text-[10px] font-bold text-amber-700 max-w-[120px] truncate">v{activeVersion.item} · {activeVersion.description}</span>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Grupo 3: Ferramentas & Exportação */}
          <div className="flex items-center gap-1.5 p-1.5 rounded-lg border border-dashed border-gray-200">
            <button
              onClick={() => handleOpenParametric()}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md text-xs font-bold transition-all border border-indigo-100"
              title="Estimativa CUB/NBR"
            >
              <Box className="w-4 h-4" />
              Paramétrico
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 transition-all text-xs font-bold"
            >
              <FileDown className="w-3.5 h-3.5" />
              Importar
            </button>

            <button
              onClick={handleExportWBS}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 transition-all text-xs font-bold"
            >
              <FileText className="w-3.5 h-3.5" />
              Exportar
            </button>
          </div>

          <div className="h-8 w-px bg-gray-100 mx-1" />

          {/* Grupo 4: Gestão da EAP */}
          <div className="flex items-center gap-1.5 p-1.5 bg-blue-50/30 border border-blue-100 rounded-lg">
            <div className="relative">
              <button
                onClick={() => setManageEapMenuOpen(!manageEapMenuOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-xs font-bold border ${manageEapMenuOpen ? 'bg-white border-blue-300 text-blue-700 shadow-sm' : 'bg-transparent text-blue-600 border-transparent hover:bg-blue-50'}`}
              >
                <Layers className="w-3.5 h-3.5" />
                Gerenciar EAP
                <ChevronDown className={`w-3 h-3 transition-transform ${manageEapMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {manageEapMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setManageEapMenuOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <button
                      onClick={() => { setIsTemplateModalOpen(true); setManageEapMenuOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
                    >
                      <Save className="w-4 h-4 text-blue-500" /> Modelos de EAP
                    </button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button
                      onClick={() => { handleClearWBS(); setManageEapMenuOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Limpar Toda EAP
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleAddGroup}
              className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all text-xs font-bold shadow-sm"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              Novo Grupo
            </button>
          </div>
        </div>
      </div>

      {
        showHistory && (
          <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-100 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-blue-900 flex items-center gap-2">
                <History className="w-4 h-4" />
                Histórico de Versões
              </h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            {(!settings.versions || settings.versions.length === 0) ? (
              <p className="text-sm text-gray-500 italic py-2">Nenhuma versão salva ainda.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...settings.versions].reverse().map((v) => {
                  const isActive = v.id === settings.activeVersionId;
                  const isEditing = editingVersionId === v.id;
                  return (
                    <div key={v.id} className={`border rounded-lg p-3 transition-all group relative ${isActive ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50/30'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">Item {v.item}</span>
                          {isActive && (
                            <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Ativa
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(v.date).toLocaleDateString()} {new Date(v.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {isEditing ? (
                        <div className="flex gap-1.5 mb-3">
                          <input
                            autoFocus
                            value={editingVersionDescription}
                            onChange={e => setEditingVersionDescription(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameVersion(v.id); if (e.key === 'Escape') setEditingVersionId(null); }}
                            className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <button onClick={() => handleRenameVersion(v.id)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700">OK</button>
                          <button onClick={() => setEditingVersionId(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-1 mb-3">
                          <p className="text-sm text-gray-700 font-medium line-clamp-2 flex-1">{v.description}</p>
                          <button onClick={() => handleStartEditVersion(v)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded" title="Renomear versão">
                            <Pencil className="w-3 h-3 text-gray-400" />
                          </button>
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        {!isActive && (
                          <button
                            onClick={() => onUpdateSettings({ ...settings, activeVersionId: v.id })}
                            className="flex-none px-2.5 py-1.5 border border-amber-200 text-amber-600 bg-amber-50 rounded text-xs font-bold hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-colors"
                            title="Marcar como versão ativa sem restaurar o orçamento"
                          >
                            Marcar Ativa
                          </button>
                        )}
                        <button
                          onClick={() => handleLoadVersion(v)}
                          className={`flex-1 py-1.5 border rounded text-xs font-bold transition-colors ${isActive ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-600 hover:text-white hover:border-amber-600' : 'bg-white border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white'}`}
                        >
                          {isActive ? 'Recarregar Versão' : 'Restaurar Versão'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      }

      <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="flex flex-col">
          <div className={`grid ${showNatureBreakdown ? 'grid-cols-[0.8fr_0.6fr_0.8fr_7fr_0.6fr_0.6fr_1fr_1fr_0.6fr_1fr_1.2fr_2.4fr]' : 'grid-cols-[0.8fr_0.6fr_0.8fr_7fr_0.6fr_0.6fr_1fr_1fr_0.6fr_1fr_1.2fr]'} gap-2 px-4 pt-2`}>
            {showNatureBreakdown && (
              <>
                <div className="col-span-11"></div>
                <div className="text-center text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50/50 rounded-t-lg py-1 border-x border-t border-blue-100/50 ml-2">Distribuição de Custos</div>
              </>
            )}
          </div>
          <div className={`bg-gray-50 border-y border-gray-200 px-4 py-3 grid ${showNatureBreakdown ? 'grid-cols-[0.8fr_0.6fr_0.8fr_7fr_0.6fr_0.6fr_1fr_1fr_0.6fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr]' : 'grid-cols-[0.8fr_0.6fr_0.8fr_7fr_0.6fr_0.6fr_1fr_1fr_0.6fr_1fr_1.2fr]'} gap-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider`}>
            <div>Item</div>
            <div className="text-center">Base</div>
            <div className="text-center">Código</div>
            <div>Descrição</div>
            <div className="text-center">Qtd.</div>
            <div className="text-center">Unid.</div>
            <div className="text-center">Custo Unit.</div>
            <div className="text-center">Custo Total</div>
            <div className="text-center text-red-500">BDI</div>
            <div className="text-center">Preço Unit.</div>
            <div className="text-right">Preço Total</div>
            {showNatureBreakdown && (
              <>
                <div className="text-center text-blue-600 bg-blue-50/50 py-1 px-1 border-x border-blue-100/50 ml-2">M.O</div>
                <div className="text-center text-blue-600 bg-blue-50/50 py-1 px-1 border-x border-blue-100/50">Mat.</div>
                <div className="text-center text-blue-600 bg-blue-50/50 py-1 px-1 border-x border-blue-100/50">Equip.</div>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {(settings?.wbs || []).map((group, gIndex) => {
            if (!group) return null;
            const isGroupExpanded = expandedGroups.includes(group.id);
            const groupTotal = calculateGroupTotal(group.name);
            const { name: groupNameDisplay } = splitName(group.name);

            return (
              <div key={group.id} className="border-b-4 border-gray-100 last:border-0 mb-4 bg-white shadow-sm rounded-lg overflow-hidden">
                {/* GROUP HEADER */}
                <div className={`bg-gray-800 hover:bg-gray-700 px-4 py-3 grid ${showNatureBreakdown ? 'grid-cols-[0.8fr_0.6fr_0.8fr_8.2fr_1fr_1fr_0.6fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr]' : 'grid-cols-[0.8fr_0.6fr_0.8fr_8.2fr_1fr_1fr_0.6fr_1fr_1.2fr]'} gap-2 items-center group relative transition-colors text-white`}>
                  <div className="flex items-center gap-1 cursor-pointer font-bold text-sm" onClick={() => toggleGroup(group.id)}>
                    {isGroupExpanded ? <ChevronDown className="w-4 h-4 text-gray-300" /> : <ChevronRight className="w-4 h-4 text-gray-300" />}
                    {group.id}
                  </div>
                  <div></div>
                  <div></div>
                  <div className="font-bold text-sm uppercase leading-tight tracking-wide" title={groupNameDisplay}>
                    {groupNameDisplay}
                  </div>
                  <div></div>
                  <div></div>
                  <div></div>
                  <div></div>
                  <div className="flex items-center justify-end gap-4">
                    <span className="font-bold text-base">R$ {groupTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>

                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity items-center border-l border-gray-600 pl-2 absolute right-4 bg-gray-800 rounded shadow-sm z-20">
                      <div className="flex flex-col mr-1">
                        {gIndex > 0 && (
                          <button type="button" onClick={(e) => handleMoveGroup(e, gIndex, 'UP')} className="text-gray-400 hover:text-white p-1" title="Mover para Cima">
                            <ArrowUp className="w-3 h-3" />
                          </button>
                        )}
                        {gIndex < settings.wbs.length - 1 && (
                          <button type="button" onClick={(e) => handleMoveGroup(e, gIndex, 'DOWN')} className="text-gray-400 hover:text-white p-1" title="Mover para Baixo">
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <button type="button" onClick={(e) => handleDuplicateGroup(e, gIndex)} className="p-1.5 hover:bg-gray-600 rounded text-gray-400 hover:text-white" title="Duplicar Grupo"><Copy className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={(e) => handleEditGroup(e, gIndex)} className="p-1.5 hover:bg-gray-600 rounded text-amber-400" title="Editar Grupo"><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={(e) => handleAddPhase(e, gIndex)} className="p-1.5 hover:bg-gray-600 rounded text-blue-300" title="Nova Etapa"><Plus className="w-4 h-4" /></button>
                      <button type="button" onClick={(e) => handleDeleteGroup(e, gIndex)} className="p-1.5 hover:bg-gray-600 rounded text-red-400" title="Excluir Grupo"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {showNatureBreakdown && (() => {
                    const nat = calculateGroupNatureTotal(group.name);
                    return (
                      <>
                        <div className="text-right text-[11px] font-bold text-blue-200 ml-2">{nat.labor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div className="text-right text-[11px] font-bold text-blue-200">{nat.material.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div className="text-right text-[11px] font-bold text-blue-200">{nat.equipment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </>
                    );
                  })()}
                </div>

                {/* PHASES LOOP */}
                {isGroupExpanded && (group.phases || []).map((phase, pIndex) => {
                  if (!phase) return null;
                  const isPhaseExpanded = expandedPhases.includes(phase.id);
                  const phaseTotal = calculatePhaseTotal(group.name, phase.name);
                  const { id: phaseIdDisplay, name: phaseNameDisplay } = splitName(phase.name);

                  return (
                    <div key={phase.id} className="border-t border-gray-100">
                      {/* PHASE HEADER */}
                      <div className={`bg-gray-100 hover:bg-gray-200 px-4 py-2 grid ${showNatureBreakdown ? 'grid-cols-[0.8fr_0.6fr_0.8fr_8.2fr_1fr_1fr_0.6fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr]' : 'grid-cols-[0.8fr_0.6fr_0.8fr_8.2fr_1fr_1fr_0.6fr_1fr_1.2fr]'} gap-2 items-center group relative`}>
                        <div className="flex items-center gap-1 cursor-pointer font-bold text-gray-800 text-sm pl-4" onClick={() => togglePhase(phase.id)}>
                          {isPhaseExpanded ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
                          {phaseIdDisplay}
                        </div>
                        <div></div>
                        <div></div>
                        <div className="font-bold text-gray-800 text-xs uppercase leading-tight" title={phaseNameDisplay}>
                          {phaseNameDisplay}
                        </div>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div className="flex items-center justify-end gap-4">
                          <span className="font-bold text-gray-900 text-sm">R$ {phaseTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity items-center border-l border-gray-300 pl-2 absolute right-4 bg-gray-100/90 rounded shadow-sm z-20">
                            <div className="flex flex-col mr-1">
                              {pIndex > 0 && (
                                <button type="button" onClick={(e) => handleMovePhase(e, gIndex, pIndex, 'UP')} className="text-gray-500 hover:text-blue-600 p-1" title="Mover para Cima">
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                              )}
                              {pIndex < group.phases.length - 1 && (
                                <button type="button" onClick={(e) => handleMovePhase(e, gIndex, pIndex, 'DOWN')} className="text-gray-500 hover:text-blue-600 p-1" title="Mover para Baixo">
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <button type="button" onClick={(e) => handleDuplicatePhase(e, gIndex, pIndex)} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Duplicar Etapa"><Copy className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={(e) => handleEditPhase(e, gIndex, pIndex)} className="p-1.5 hover:bg-amber-100 rounded text-amber-600" title="Editar Etapa"><Pencil className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={(e) => handleAddSubPhase(e, gIndex, pIndex)} className="p-1.5 hover:bg-blue-200 rounded text-blue-700" title="Nova Subetapa"><Plus className="w-4 h-4" /></button>
                            <button type="button" onClick={(e) => handleDeletePhase(e, gIndex, pIndex)} className="p-1.5 hover:bg-red-200 rounded text-red-600" title="Excluir Etapa"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                        {showNatureBreakdown && (() => {
                          const nat = calculatePhaseNatureTotal(group.name, phase.name);
                          return (
                            <>
                              <div className="text-right text-[11px] font-bold text-gray-500 ml-2">{nat.labor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                              <div className="text-right text-[11px] font-bold text-gray-500">{nat.material.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                              <div className="text-right text-[11px] font-bold text-gray-500">{nat.equipment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            </>
                          );
                        })()}
                      </div>

                      {/* SUBPHASES LOOP */}
                      {isPhaseExpanded && (phase.subPhases || []).map((subPhaseName, spIndex) => {
                        if (!subPhaseName) return null;
                        const isSubExpanded = expandedSubPhases.includes(subPhaseName);
                        const subTotal = calculateSubPhaseTotal(group.name, phase.name, subPhaseName);
                        const items = budget.filter(b => b.group === group.name && b.phase === phase.name && b.subPhase === subPhaseName);
                        const { id: subIdDisplay, name: subNameDisplay } = splitName(subPhaseName);

                        return (
                          <div key={subPhaseName} className="border-t border-gray-100">
                            <div className={`bg-gray-50 hover:bg-gray-100 px-4 py-2 grid ${showNatureBreakdown ? 'grid-cols-[0.8fr_0.6fr_0.8fr_8.2fr_1fr_1fr_0.6fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr]' : 'grid-cols-[0.8fr_0.6fr_0.8fr_8.2fr_1fr_1fr_0.6fr_1fr_1.2fr]'} gap-2 items-center group relative`}>
                              <div className="flex items-center gap-1 cursor-pointer font-semibold text-gray-700 text-sm pl-7" onClick={() => toggleSubPhase(subPhaseName)}>
                                {isSubExpanded ? <FolderOpen className="w-3 h-3 text-blue-500" /> : <Folder className="w-3 h-3 text-blue-500" />}
                                {subIdDisplay}
                              </div>
                              <div></div>
                              <div></div>
                              <div className="font-semibold text-gray-700 text-xs leading-tight" title={subNameDisplay}>
                                {subNameDisplay}
                              </div>
                              <div></div>
                              <div></div>
                              <div></div>
                              <div></div>
                              <div className="flex items-center justify-end gap-4">
                                <span className="font-medium text-gray-700 text-sm">R$ {subTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity items-center border-l border-gray-200 pl-2 absolute right-4 bg-gray-50/90 rounded shadow-sm z-20">
                                  <div className="flex flex-col mr-1">
                                    {spIndex > 0 && (
                                      <button type="button" onClick={(e) => handleMoveSubPhase(e, gIndex, pIndex, spIndex, 'UP')} className="text-gray-400 hover:text-blue-600 p-1" title="Mover para Cima">
                                        <ArrowUp className="w-3 h-3" />
                                      </button>
                                    )}
                                    {spIndex < phase.subPhases.length - 1 && (
                                      <button type="button" onClick={(e) => handleMoveSubPhase(e, gIndex, pIndex, spIndex, 'DOWN')} className="text-gray-400 hover:text-blue-600 p-1" title="Mover para Baixo">
                                        <ArrowDown className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  <button type="button" onClick={(e) => handleDuplicateSubPhase(e, gIndex, pIndex, spIndex)} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Duplicar Subetapa"><Copy className="w-3 h-3" /></button>
                                  <button type="button" onClick={(e) => handleEditSubPhase(e, gIndex, pIndex, spIndex)} className="p-1.5 hover:bg-amber-100 rounded text-amber-600" title="Editar Subetapa"><Pencil className="w-3 h-3" /></button>
                                  <button type="button" onClick={(e) => handleOpenAddItem(e, group.name, phase.name, subPhaseName)} className="p-1.5 hover:bg-emerald-200 rounded text-emerald-700 flex items-center gap-1 text-xs px-2" title="Adicionar Item"><Plus className="w-3 h-3" /></button>
                                  <button type="button" onClick={(e) => handleDeleteSubPhase(e, gIndex, pIndex, subPhaseName)} className="p-1.5 hover:bg-red-200 rounded text-red-600" title="Excluir Subetapa"><Trash2 className="w-3 h-3" /></button>
                                </div>
                              </div>
                              {showNatureBreakdown && (() => {
                                const nat = calculateSubPhaseNatureTotal(group.name, phase.name, subPhaseName);
                                return (
                                  <>
                                    <div className="text-right text-[11px] font-medium text-gray-600 ml-2">{nat.labor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <div className="text-right text-[11px] font-medium text-gray-600">{nat.material.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <div className="text-right text-[11px] font-medium text-gray-600">{nat.equipment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                  </>
                                );
                              })()}
                            </div>

                            {isSubExpanded && (
                              <div className="bg-white">
                                {items.length === 0 ? (
                                  <div className="pl-16 py-2 text-xs text-gray-400 italic">
                                    Nenhum item nesta subetapa. Clique em "+ Item" para adicionar.
                                  </div>
                                ) : (
                                  items.map((item, itemIndex) => (
                                    <BudgetRow
                                      key={item.id}
                                      item={item}
                                      itemIndex={itemIndex}
                                      subIdDisplay={subIdDisplay}
                                      onUpdateQuantity={handleUpdateQuantity}
                                      onUpdatePrice={handleUpdateItemPrice}
                                      onUpdateBDI={handleUpdateBDI}
                                      onUpdateComposition={handleUpdateComposition}
                                      onSaveToCustomDB={handleSaveToCustomDB}
                                      onDeleteItem={handleDeleteItem}
                                      onMoveItem={!isLocked ? handleMoveItem : undefined}
                                      isFirst={itemIndex === 0}
                                      isLast={itemIndex === items.length - 1}
                                      globalBDI={settings.bdi}
                                      viewMode={settings.cpuViewMode}
                                      onOpenModal={handleOpenCPU}
                                      onDuplicateItem={handleDuplicateItem}
                                      isFavorite={item.sinapiItem ? favorites.includes(item.sinapiItem.code) : false}
                                      onToggleFavorite={onToggleFavorite}
                                      showNatureBreakdown={showNatureBreakdown}
                                      natureBreakdown={showNatureBreakdown ? getNatureBreakdown(item) : undefined}
                                      auxiliaryItems={auxiliaryItems}
                                      isLocked={isLocked}
                                    />
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {(!settings.wbs || settings.wbs.length === 0) && (
            <div className="p-8 text-center text-gray-400">Nenhum grupo definido. Clique em "Nova Etapa" para começar.</div>
          )}
          <div className="h-24"></div>
        </div>
      </div>

      {
        wbsModal.isOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800">
                  {wbsModal.mode === 'CREATE' ? 'Nova ' : 'Editar '}
                  {wbsModal.type === 'PHASE' ? 'Etapa' : 'Subetapa'}
                </h3>
                <button onClick={() => setWbsModal({ ...wbsModal, isOpen: false })} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome {wbsModal.type === 'PHASE' ? 'da Etapa' : 'da Subetapa'}</label>
                  <input type="text" autoFocus placeholder={wbsModal.type === 'PHASE' ? "Ex: Instalações Elétricas" : "Ex: Tubulações"} className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={wbsModal.value} onChange={(e) => setWbsModal({ ...wbsModal, value: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleConfirmWBSAction()} />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setWbsModal({ ...wbsModal, isOpen: false })} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">Cancelar</button>
                  <button onClick={handleConfirmWBSAction} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors">{wbsModal.mode === 'CREATE' ? 'Inserir' : 'Salvar'}</button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        isSaveDbModalOpen && itemToSave && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">Salvar na Base</h3>
                <button onClick={() => setIsSaveDbModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">

                <p className="text-sm text-gray-600 mb-4">
                  Selecione em qual base de dados você deseja salvar o item <strong>{itemToSave.code}</strong>.
                </p>

                <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
                  {customDatabases.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 text-sm bg-gray-50 rounded-lg dashed border border-gray-200">
                      Nenhuma base encontrada.
                    </div>
                  ) : (
                    customDatabases.map(db => (
                      <button
                        key={db.id}
                        onClick={() => confirmSaveToDatabase(db.id)}
                        className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                      >
                        <div className="bg-blue-100 text-blue-600 p-2 rounded-lg group-hover:bg-white group-hover:shadow-sm transition-all">
                          <Database className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-gray-700 group-hover:text-blue-700">{db.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        addingTo && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-[1px]">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-full max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                <div>
                  <h3 className="font-bold text-gray-800">Adicionar Item</h3>
                  <p className="text-xs text-gray-500">Adicionando em: <span className="font-semibold text-blue-600">{addingTo.phase} &gt; {addingTo.subPhase}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsCreatingItem(!isCreatingItem)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isCreatingItem ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 h-8 flex items-center justify-center'}`}
                  >
                    {isCreatingItem ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {isCreatingItem ? 'Cancelar Criação' : 'Criar Novo Item'}
                  </button>
                  <button
                    onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${showOnlyFavorites ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${showOnlyFavorites ? 'fill-amber-500 text-amber-500' : ''}`} />
                    Apenas Favoritos
                  </button>
                  <div className="w-[1px] h-6 bg-gray-200 mx-1" />
                  <button onClick={() => { setAddingTo(null); setIsCreatingItem(false); }} className="p-1 hover:bg-gray-200 rounded-full text-gray-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Form de Criação */}
              {isCreatingItem && (
                <div className="p-6 bg-gradient-to-br from-blue-50/50 to-white border-b border-blue-100 animate-in slide-in-from-top-4 duration-300">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Database className="w-5 h-5 text-blue-600" />
                    </div>
                    <h4 className="font-bold text-gray-800">Novo Item na Base Própria</h4>
                  </div>

                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-3">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tipo</label>
                      <select
                        className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                        value={newItem.type}
                        onChange={(e) => setNewItem({ ...newItem, type: e.target.value as SinapiType })}
                      >
                        <option value={SinapiType.INPUT}>Insumo</option>
                        <option value={SinapiType.COMPOSITION}>Composição</option>
                        <option value={SinapiType.SERVICE}>Serviço</option>
                      </select>
                    </div>
                    <div className="col-span-6">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Descrição do Item</label>
                      <input
                        type="text"
                        placeholder="Ex: Cimento Portland CP-III-40 ensacado"
                        className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                        value={newItem.description}
                        onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Unid.</label>
                      <input
                        type="text"
                        placeholder="kg"
                        className="w-full rounded-lg border border-gray-200 p-2 text-sm text-center focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                        value={newItem.unit}
                        onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Preço Base (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-200 p-2 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                        value={newItem.price}
                        onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-9">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Grupo (Categoria)</label>
                      <select
                        className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                        value={newItem.category}
                        onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                      >
                        <option value="">Selecione o Grupo...</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3 flex items-end">
                      <button
                        onClick={handleCreateItem}
                        className="w-full bg-emerald-600 text-white font-bold py-2 rounded-lg hover:bg-emerald-700 shadow-sm transition-all flex items-center justify-center gap-2"
                      >
                        <Save className="w-4 h-4" /> Salvar Item
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] text-blue-600/70 italic flex items-center gap-1">
                    <Database className="w-2.5 h-2.5" /> O item será salvo na sua Base Própria e poderá ser usado em qualquer projeto.
                  </p>
                </div>
              )}

              {/* Filtros de Busca */}
              <div className="p-4 border-b border-gray-100 bg-white">
                <div className="grid grid-cols-12 gap-3 mb-4">
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Código</label>
                    <input
                      type="text"
                      placeholder="Ex: 98546"
                      className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      value={searchCode}
                      onChange={(e) => setSearchCode(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tipo</label>
                    <select
                      className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                      value={searchType}
                      onChange={(e) => setSearchType(e.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value={SinapiType.SERVICE}>Serviços / Composições</option>
                      <option value={SinapiType.INPUT}>Insumos</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Grupo</label>
                    <select
                      className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                      value={searchGroupFilter}
                      onChange={(e) => setSearchGroupFilter(e.target.value)}
                    >
                      <option value="">Todos os Grupos</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Descrição</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Buscar por descrição..."
                          className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                      <select
                        className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 text-gray-600 cursor-pointer min-w-[120px]"
                        value={searchScope}
                        onChange={(e) => setSearchScope(e.target.value as any)}
                        title="Escopo da busca"
                      >
                        <option value="description">Descrição</option>
                        <option value="category">Grupo</option>
                        <option value="both">Ambos</option>
                      </select>

                      <select
                        className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-blue-50 text-blue-700 border-blue-100 cursor-pointer min-w-[130px]"
                        value={searchMode}
                        onChange={(e) => setSearchMode(e.target.value as any)}
                        title="Modo da busca"
                      >
                        <option value="exact">Frase Exata</option>
                        <option value="all-words">Palavras</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Filtros de Base/Configuração */}
                <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100 transition-all">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Base:</label>
                    <select
                      className="bg-transparent text-xs font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer max-w-[150px]"
                      value={searchDatabase}
                      onChange={(e) => {
                        setSearchDatabase(e.target.value);
                        onUpdateSettings({ ...settings, database: e.target.value });
                      }}
                    >
                      <option value="SINAPI">SINAPI</option>
                      <optgroup label="Minhas Bases">
                        <option value="GENERAL">Base Geral (Itens Avulsos)</option>
                        {customDatabases.map(db => (
                          <option key={db.id} value={db.id}>{db.name}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="h-4 w-[1px] bg-gray-200" />

                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Referência:</label>
                    <select
                      className="bg-transparent text-xs font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer"
                      value={searchReference}
                      onChange={(e) => {
                        setSearchReference(e.target.value);
                        onUpdateSettings({ ...settings, referenceMonth: e.target.value });
                      }}
                    >
                      <option value="12/2025">12/2025</option>
                    </select>
                  </div>

                  <div className="h-4 w-[1px] bg-gray-200" />

                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Estado:</label>
                    <select
                      className="bg-transparent text-xs font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer"
                      value={searchLocation}
                      onChange={(e) => {
                        const newLoc = e.target.value;
                        setSearchLocation(newLoc);
                        onUpdateSettings({ ...settings, location: newLoc });
                      }}
                    >
                      {['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'].map(uf => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>

                  <div className="h-4 w-[1px] bg-gray-200" />

                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Encargos:</label>
                    <select
                      className="bg-transparent text-xs font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer"
                      value={searchCharges}
                      onChange={(e) => {
                        const newCharges = e.target.value;
                        setSearchCharges(newCharges);
                        onUpdateSettings({ ...settings, socialChargesMode: newCharges });
                      }}
                    >
                      <option value="SEM_DESONERACAO">Sem Desoneração</option>
                      <option value="COM_DESONERACAO">Com Desoneração</option>
                    </select>
                  </div>

                  <div className="ml-auto text-[10px] text-gray-400 flex items-center gap-3">
                    {searchResults.length > 0 && (
                      <div className="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold border border-blue-100">
                        <Search className="w-3 h-3" />
                        {searchResults.length} itens encontrados
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {dbSize.toLocaleString('pt-BR')} itens no total
                    </div>
                  </div>
                </div>
              </div>

              {/* Barra de Seleção em Massa */}
              {searchResults.length > 0 && (
                <div className="px-6 py-2.5 bg-blue-50/50 border-b border-blue-100/50 flex justify-between items-center animate-in slide-in-from-top-1 duration-200">
                  <label className="flex items-center gap-2.5 text-xs font-bold text-gray-600 cursor-pointer select-none hover:text-blue-700 transition-colors">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                      checked={(() => {
                        const visible = searchResults.filter(r => !showOnlyFavorites || favorites.includes(r.code));
                        return visible.length > 0 && selectedSearchItems.length === visible.length;
                      })()}
                      onChange={handleToggleSelectAll}
                    />
                    {(() => {
                      const visibleCount = searchResults.filter(r => !showOnlyFavorites || favorites.includes(r.code)).length;
                      const selectedCount = selectedSearchItems.length;
                      if (selectedCount === 0) return `Selecionar Todos (${visibleCount})`;
                      return `Selecionados ${selectedCount} de ${visibleCount}`;
                    })()}
                  </label>

                  {selectedSearchItems.length > 0 && (
                    <button
                      onClick={handleBulkAdd}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider py-2 px-4 rounded-lg shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2 active:scale-95 animate-in zoom-in-95"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" /> Incluir {selectedSearchItems.length} {selectedSearchItems.length === 1 ? 'Item' : 'Itens'}
                    </button>
                  )}
                </div>
              )}

              {/* Resultados */}
              <div className="flex-1 overflow-y-auto p-4 bg-white rounded-b-xl">
                {searchResults.length > 0 ? (
                  <div className="space-y-3">
                    {searchResults.map(result => (
                      <div
                        key={result.code}
                        className={`p-3 hover:bg-blue-50 cursor-pointer border rounded-lg group transition-all relative ${(!showOnlyFavorites || favorites.includes(result.code)) ? 'block' : 'hidden'} ${selectedSearchItems.find(i => i.code === result.code) ? 'border-blue-400 bg-blue-50/30 shadow-sm' : 'border-gray-100 bg-white'}`}
                        onClick={(e) => handleToggleSelectItem(e, result)}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all mr-1 cursor-pointer"
                              checked={!!selectedSearchItems.find(i => i.code === result.code)}
                              onChange={(e) => { /* Handled by parent onClick to increase hit area */ }}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); onToggleFavorite(e, result.code); }}
                              className="p-1 px-1.5 rounded-lg hover:bg-white shadow-sm transition-all z-10 border border-transparent hover:border-amber-200"
                              title={favorites.includes(result.code) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                            >
                              <Star className={`w-3.5 h-3.5 ${favorites.includes(result.code) ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}`} />
                            </button>
                            <span className="font-bold text-gray-700 text-sm">{result.code}</span>
                            {getTypeBadge(result.type)}
                            {searchDatabase === 'GENERAL' && (
                              <span className="flex items-center gap-1 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-100">
                                <Database className="w-2.5 h-2.5" /> BASE PRÓPRIA
                              </span>
                            )}
                            <span className="mx-1 text-gray-300">|</span>
                            <span className="text-[10px] text-gray-500 uppercase">{result.category}</span>
                          </div>
                          <span className="text-emerald-600 font-bold text-sm">R$ {result.price.toFixed(2)}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1 leading-snug whitespace-normal break-words">{result.description}</p>
                        <div className="flex justify-between items-end mt-2">
                          <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-medium uppercase">{result.unit}</span>
                          <div className="flex items-center gap-2">
                            {searchDatabase === 'GENERAL' && (
                              <button
                                onClick={(e) => handleDeleteCustomItem(e, result.code)}
                                className="text-xs text-red-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded"
                              >
                                <Trash2 className="w-3 h-3" /> Excluir
                              </button>
                            )}
                             <button
                                onClick={(e) => { e.stopPropagation(); handleAddItem(result); }}
                                className="text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-blue-100/70 hover:bg-blue-200 px-2 py-1 rounded-md border border-blue-200/50 shadow-sm z-10"
                              >
                                <Plus className="w-3 h-3" /> Adicionar
                              </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 text-gray-400">
                    {isSearching ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                        <span className="text-sm font-medium">Buscando na base {searchDatabase}...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="p-4 bg-gray-50 rounded-full">
                          <Search className="w-8 h-8 text-gray-300" />
                        </div>
                        <p className="text-sm font-medium">
                          {searchTerm || searchCode || searchGroupFilter || searchType || showOnlyFavorites
                            ? "Nenhum item encontrado para os filtros selecionados."
                            : "Digite os termos acima para começar a buscar."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      {
        isVersionModalOpen && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Save className="w-5 h-5 text-emerald-600" />
                  Salvar Nova Versão
                </h3>
                <button onClick={() => setIsVersionModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-center justify-between">
                    <span className="text-sm text-emerald-800 font-medium">Próximo Item:</span>
                    <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                      {(settings.versions?.length || 0) + 1}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição da Versão</label>
                    <textarea
                      autoFocus
                      rows={3}
                      placeholder="Ex: Orçamento inicial, Revisão após alteração de acabamentos..."
                      className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none text-sm resize-none"
                      value={versionDescription}
                      onChange={(e) => setVersionDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3 pt-6 border-t border-gray-100 mt-6">
                    <button onClick={() => setIsVersionModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">Cancelar</button>
                    <button onClick={handleSaveVersion} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-sm transition-all active:scale-95">Salvar Versão</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }
      {/* Modal de CPU (Janela) */}
      {
        selectedCPUItem && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 items-center">
                  <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-100 flex items-center justify-center w-12 h-12">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">Composição de Preço Unitário (CPU)</h3>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => onToggleFavorite(e, selectedCPUItem.sinapiItem?.code || '')}
                      className={`p-1.5 px-2 rounded-lg shadow-sm transition-all z-10 border flex items-center gap-1.5 font-bold text-[10px] uppercase ${favorites.includes(selectedCPUItem.sinapiItem?.code || '') ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-gray-400 border-gray-100 hover:border-amber-200'}`}
                      title={favorites.includes(selectedCPUItem.sinapiItem?.code || '') ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                    >
                      <Star className={`w-3.5 h-3.5 ${favorites.includes(selectedCPUItem.sinapiItem?.code || '') ? 'fill-amber-500 text-amber-500' : ''}`} />
                      {favorites.includes(selectedCPUItem.sinapiItem?.code || '') ? 'Favorito' : 'Favoritar'}
                    </button>
                    <span className="text-[11px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-sm">{selectedCPUItem.sinapiItem?.code || '---'}</span>
                  </div>
                  <p className="text-[13px] text-gray-500 font-medium leading-tight max-w-2xl uppercase">
                    {selectedCPUItem.sinapiItem?.description || 'Sem descrição'}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right whitespace-nowrap">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Preço Unitário</p>
                    <p className="text-2xl font-black text-emerald-600">
                      R$ {(selectedCPUItem.sinapiItem?.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <button
                    onClick={handleCloseCPU}
                    className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
                    title="Fechar (Esc)"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-4 shadow-sm py-2 bg-gray-50 rounded-t-lg">
                  <div className="col-span-1 text-center">Código</div>
                  <div className="col-span-1 text-center font-bold">Tipo</div>
                  <div className="col-span-3">Insumo/Composição</div>
                  <div className="col-span-1 text-center">Unid.</div>
                  <div className="col-span-2 text-center">Qtd</div>
                  <div className="col-span-2 text-center">R$ Unitário</div>
                  <div className="col-span-2 text-right">Subtotal</div>
                </div>

                <div className="space-y-1">
                  {selectedCPUItem.sinapiItem?.composition?.map((comp, idx) => {
                    // Fallback to auxiliary items if price is 0
                    const auxItem = auxiliaryItems.get(comp.code);
                    const displayPrice = comp.price || auxItem?.price || 0;
                    const displaySubtotal = selectedCPUItem.quantity * (comp.quantity || 0) * displayPrice;

                    return (
                      <div key={`${selectedCPUItem.id}-modal-comp-${idx}`} className="grid grid-cols-12 gap-2 items-center text-sm text-gray-600 hover:bg-blue-50/50 py-2.5 px-4 rounded-lg border border-transparent hover:border-blue-100 transition-all">
                        <div className="col-span-1 font-mono text-xs text-center text-gray-500">{comp.code}</div>
                        <div className="col-span-1 flex justify-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${comp.type === SinapiType.COMPOSITION ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                            {comp.type === SinapiType.COMPOSITION ? 'COMP' : 'INS'}
                          </span>
                        </div>
                        <div className="col-span-3 flex flex-col">
                          <span className="leading-tight text-[13px] font-medium text-gray-700">{comp.description}</span>
                        </div>
                        <div className="col-span-1 text-center text-gray-400 font-medium">{comp.unit || '-'}</div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            step="0.0001"
                            value={comp.quantity || 0}
                            onChange={(e) => handleUpdateComposition(selectedCPUItem.id, idx, { quantity: Number(e.target.value) })}
                            className="w-full text-center outline-none bg-white border border-gray-200 rounded-md py-1 text-sm focus:ring-2 focus:ring-blue-500 font-medium"
                          />
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center justify-center gap-1 bg-white border border-gray-200 rounded-md px-1 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                            <span className="text-xs text-gray-400">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={displayPrice.toFixed(2)}
                              onChange={(e) => handleUpdateComposition(selectedCPUItem.id, idx, { price: Number(e.target.value) })}
                              className="w-full text-center outline-none bg-transparent py-1 text-sm font-medium"
                            />
                          </div>
                        </div>
                        <div className="col-span-2 text-right font-bold text-blue-600">
                          R$ {((selectedCPUItem.quantity * (comp.quantity || 0)) * displayPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-xs font-medium text-gray-500 italic">
                <div className="flex flex-col gap-1">
                  <div>* Os valores mostrados referem-se à quantidade total de {selectedCPUItem.quantity} {selectedCPUItem.sinapiItem?.unit || 'un'} no projeto.</div>
                  {hasCPUChanges && <div className="text-amber-600 font-bold not-italic flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Alterações pendentes</div>}
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-gray-900 not-italic font-bold text-base flex items-center gap-4">
                    <span className="text-gray-500 font-medium text-xs uppercase tracking-wider">Custo Total do Item:</span>
                    <span className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm text-blue-600">
                      R$ {(selectedCPUItem.quantity * (selectedCPUItem.sinapiItem?.price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (hasCPUChanges) {
                        setNotification({ message: 'Alterações na composição salvas com sucesso!', type: 'success' });
                        setTimeout(() => setNotification(null), 3000);
                      }
                      handleCloseCPU();
                    }}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm flex items-center gap-2 ${hasCPUChanges ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100' : 'bg-gray-200 text-gray-500 cursor-default'}`}
                  >
                    <Save className="w-4 h-4" />
                    Salvar Alterações
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Notificação Toast */}
      {
        notification && (
          <div className="fixed bottom-6 right-6 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-gray-900 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 border border-gray-800 min-w-[300px]">
              <div className="bg-emerald-500 p-1 rounded-full">
                <CheckCircle className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
              <button onClick={() => setNotification(null)} className="ml-auto text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      }

      {/* Modal de Importação de EAP */}
      <WBSImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportWBS}
      />
      {/* Modal de Modelos de EAP */}
      <WBSTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        currentWBS={settings.wbs}
        onLoadTemplate={handleLoadTemplate}
      />
      {/* Modal de confirmação orç. paramétrico */}
      {
        isParametricModalOpen && parametricPreview && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Box className="w-6 h-6 text-blue-600" />
                    Orçamento Paramétrico
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">Gere estimativas baseadas em índices técnicos e de mercado.</p>
                </div>
                <button onClick={() => setIsParametricModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">

                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex gap-2">
                  <button
                    onClick={() => handleOpenParametric('FINANCIAL')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all ${parametricType === 'FINANCIAL' ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    Estimativa Financeira (CUB)
                  </button>
                  <button
                    onClick={() => handleOpenParametric('QUANTITATIVE')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all ${parametricType === 'QUANTITATIVE' ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    Insumos Base (NBR 12721)
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  {parametricType === 'FINANCIAL' ? (
                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-600 font-medium">Valor Total Estimado:</span>
                        <span className="text-lg font-bold text-blue-700">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parametricPreview.totalValue)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 font-medium">Etapas a Gerar:</span>
                        <span className="font-bold text-gray-800">{parametricPreview.itemsCount}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
                        Cálculo baseado no VGV estimado utilizando o CUB estadual e pesos estatísticos por fase da obra.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-indigo-700 font-bold">Lote Básico NBR 12721</span>
                        <span className="bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{settings.standard}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                        {parametricPreview.mainMaterials?.map((m, idx) => (
                          <div key={idx} className="flex justify-between text-xs border-b border-indigo-100/50 pb-1">
                            <span className="text-gray-600 truncate mr-2" title={m.desc}>{m.desc.split(',')[0]}</span>
                            <span className="font-bold text-gray-900 whitespace-nowrap">{m.qty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {m.unit}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex justify-between items-center pt-3 border-t border-indigo-200/40">
                        <span className="text-gray-600 text-sm font-medium">Itens Totais:</span>
                        <span className="font-bold text-indigo-700">{parametricPreview.itemsCount} insumos</span>
                      </div>

                      <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
                        Cálculo de quantidades exatas de materiais e mão de obra por m² conforme a Norma NBR 12721.
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-gray-600 italic bg-amber-50 p-3 rounded-md border border-amber-100 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Esta ação irá criar novos itens no seu orçamento baseados na Área ({settings.area}m²) e Padrão ({settings.standard}) definidos nas configurações.</span>
                  </div>

                  <div className="flex flex-col gap-3 mt-4">
                    <button
                      onClick={() => handleGenerateParametric('REPLACE')}
                      className="w-full py-3 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Substituir Orçamento Atual
                    </button>
                    <button
                      onClick={() => handleGenerateParametric('APPEND')}
                      className="w-full py-3 bg-blue-600 text-white hover:bg-blue-700 shadow-md rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar/Mesclar Itens
                    </button>
                  </div>
                </div>

                <div className="flex justify-end p-4 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => setIsParametricModalOpen(false)}
                    className="px-6 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-bold text-xs uppercase tracking-widest transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

    </div >
  );
};

export default BudgetEditor;