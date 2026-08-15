import React from 'react';
import { BudgetEntry, ProjectSettings, SinapiItem, WBSPhase, SinapiType, BudgetVersion, WBSGroup, CustomDatabase, CompositionComponent } from '../types';
import { sinapiService, SinapiReference, resolveReferenceDate } from '../services/sinapiService'; // Importação do Serviço
import { Search, Plus, Trash2, ChevronDown, ChevronRight, Folder, FolderOpen, MoreVertical, X, ArrowUp, ArrowDown, Loader2, Layers, Box, History, Save, Calendar, CheckCircle, Database, Monitor, Maximize2, ChevronsUpDown, ChevronsDownUp, Pencil, Copy, AlertTriangle, Star, StarOff, FileDown, FileText, LayoutDashboard, Wrench, ClipboardList, Wallet, Percent, Banknote, AlertCircle, MoveHorizontal } from 'lucide-react';
import { KpiCard } from './ui/KpiCard';
import { customDatabaseService } from '../services/customDatabaseService';
import { parametricService } from '../services/parametricService';
import { BudgetRow } from './BudgetRow';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import SinapiRebaseModal from './SinapiRebaseModal';
import { WBSImportModal } from './WBSImportModal';
import { WBSTemplateModal } from './WBSTemplateModal';
import { useConfirm } from './ui/confirm';
import { usePersistedState, useResizableColumns } from './ui/TableUtils';
import Button from './ui/Button';
import * as XLSX from 'xlsx';

interface BudgetEditorProps {
  budget: BudgetEntry[];
  settings: ProjectSettings;
  favorites: string[];
  onToggleFavorite: (e: React.MouseEvent | React.TouchEvent, code: string) => void;
  onUpdateBudget: (newBudget: BudgetEntry[]) => void;
  onUpdateSettings: (newSettings: ProjectSettings) => void;
  onSaveProject?: (budget: BudgetEntry[], settings: ProjectSettings) => Promise<void>;
  onOpenDashboard?: () => void;
  projectId?: string;
  organizationId?: string;
}

interface AddingTarget {
  group: string;
  phase: string;
  subPhase: string;
}

interface BudgetControlRow {
  id: string;
  code: string;
  description: string;
  unit: string;
  budgeted: number;
  contracted: number;
  measured: number;
  approved: number;
  paid: number;
  balance: number;
  deviation: number;
  alerts: string[];
}

type TechnicalDashboardFilter = 'ALL' | 'NO_MEMORY' | 'NO_PRECISION' | 'PENDING_APPROVAL' | 'INACTIVE' | 'FINANCIAL';

interface TechnicalIssueRow {
  item: BudgetEntry;
  code: string;
  description: string;
  precisionClass: string;
  status: string;
  responsible: string;
  issues: string[];
  issueCodes: TechnicalDashboardFilter[];
  financialAlerts: string[];
}

const splitName = (fullName: string | null | undefined) => {
  if (!fullName) return { id: '', name: '' };
  const match = fullName.match(/^([\d\.]+)\s+(.*)$/);
  return match ? { id: match[1], name: match[2] } : { id: '', name: fullName };
};

const getTypeBadge = (type: SinapiType) => {
  if (type === SinapiType.COMPOSITION) {
    return (
      <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded font-semibold border border-blue-200">
        <Layers className="w-3 h-3" />
        COMPOSIÇÃO
      </span>
    );
  }
  if (type === SinapiType.SERVICE) {
    return (
      <span className="flex items-center gap-1 bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded font-semibold border border-purple-200">
        <Loader2 className="w-3 h-3" />
        SERVIÇO
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded font-semibold border border-amber-200">
      <Box className="w-3 h-3" />
      INSUMO
    </span>
  );
};

/** Colunas redimensionáveis, na ordem em que aparecem — "preco-total" fica fora
 *  porque vem DEPOIS do espaçador do §6.1.1. */
const WBS_COLUMN_KEYS = ['item', 'base', 'codigo', 'descricao', 'qtd', 'unid', 'custo-unit', 'custo-total', 'bdi', 'preco-unit'] as const;
const NATURE_COLUMN_KEYS = ['mo', 'mat', 'equip'] as const;
/** Coluna do drag handle: estrutural, largura fixa, não redimensionável. */
const DRAG_COL_WIDTH = 32;

/** Larguras iniciais da tabela da WBS (§6.1). A coluna de arraste é estrutural
 *  (32px, sem `data-col-key`): não é redimensionável e o autoFit a desconta do
 *  container em vez de tentar ajustá-la.
 *
 *  ⚠️ A soma tem que **aproximar a largura útil real** da tela, não ser um chute
 *  pequeno: valor baixo trunca descrição e deixa uma faixa branca à direita até
 *  o usuário descobrir o botão de autofit — primeira impressão ruim mesmo com o
 *  mecanismo certo por baixo. Aqui a soma dá 1.668px (2.004px com o
 *  detalhamento por natureza), perto da área útil de uma tela grande; em telas
 *  menores sobra scroll horizontal, que é o comportamento certo para uma
 *  planilha densa. "Descrição" é a coluna que absorve a diferença, por ser a
 *  única com texto longo. */
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  item: 96,
  base: 84,
  codigo: 104,
  descricao: 520,
  qtd: 84,
  unid: 72,
  'custo-unit': 128,
  'custo-total': 128,
  bdi: 76,
  'preco-unit': 128,
  'preco-total': 216,
  mo: 112,
  mat: 112,
  equip: 112,
};

const BudgetEditor: React.FC<BudgetEditorProps> = ({
  budget,
  settings,
  onUpdateBudget,
  onUpdateSettings,
  onSaveProject,
  onOpenDashboard,
  favorites,
  onToggleFavorite,
  projectId,
  organizationId,
}) => {
  const confirm = useConfirm();
  // Redimensionamento por arraste + autofit sob comando (§6.1/§6.1.2).
  const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'budgetEditorColWidths');
  const [generatingContract, setGeneratingContract] = React.useState(false);
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
  const [toolsMenuOpen, setToolsMenuOpen] = React.useState(false);

  const [expandedGroups, setExpandedGroups] = React.useState<string[]>([]);
  const [expandedPhases, setExpandedPhases] = React.useState<string[]>([]);
  const [expandedSubPhases, setExpandedSubPhases] = React.useState<string[]>([]);
  const [addingTo, setAddingTo] = React.useState<AddingTarget | null>(null);
  // §3 — preferência de busca (o que o usuário digita/alterna) sobrevive a navegação/reload.
  // searchLocation/searchCharges/searchReference/searchDatabase ficam de fora de propósito:
  // são o CONTEXTO do orçamento (região/desoneração/competência/base SINAPI), derivado de
  // `settings` — persistir em localStorage vazaria o valor de um orçamento para o próximo
  // que o usuário abrir.
  const [searchTerm, setSearchTerm] = usePersistedState('budgetEditor:searchTerm', '');
  const [searchCode, setSearchCode] = usePersistedState('budgetEditor:searchCode', '');
  const [searchGroupFilter, setSearchGroupFilter] = usePersistedState('budgetEditor:searchGroupFilter', '');
  const [searchType, setSearchType] = usePersistedState('budgetEditor:searchType', '');
  const [searchLocation, setSearchLocation] = React.useState(settings.location || 'MG');
  const [searchCharges, setSearchCharges] = React.useState(settings.socialChargesMode || 'SEM_DESONERACAO');
  const [searchReference, setSearchReference] = React.useState(settings.referenceMonth || '12/2025');
  const [references, setReferences] = React.useState<SinapiReference[]>([]);
  const [searchDatabase, setSearchDatabase] = React.useState(settings.database || 'SINAPI');
  const [searchScope, setSearchScope] = usePersistedState<'description' | 'category' | 'both'>('budgetEditor:searchScope', 'description');
  const [searchMode, setSearchMode] = usePersistedState<'exact' | 'all-words'>('budgetEditor:searchMode', 'all-words');
  const [searchResults, setSearchResults] = React.useState<SinapiItem[]>([]);
  const [selectedSearchItems, setSelectedSearchItems] = React.useState<SinapiItem[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [dbSize, setDbSize] = React.useState<number>(0);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [customDatabases, setCustomDatabases] = React.useState<CustomDatabase[]>([]);
  const [itemToSave, setItemToSave] = React.useState<SinapiItem | null>(null);
  const [isSaveDbModalOpen, setIsSaveDbModalOpen] = React.useState(false);
  const [selectedCPUItem, setSelectedCPUItem] = React.useState<BudgetEntry | null>(null);
  const [selectedDetailsItem, setSelectedDetailsItem] = React.useState<BudgetEntry | null>(null);
  const [isBudgetControlOpen, setIsBudgetControlOpen] = React.useState(false);
  const [isLoadingBudgetControl, setIsLoadingBudgetControl] = React.useState(false);
  const [budgetControlRows, setBudgetControlRows] = React.useState<BudgetControlRow[]>([]);
  const [budgetControlError, setBudgetControlError] = React.useState<string | null>(null);
  const [isTechnicalDashboardOpen, setIsTechnicalDashboardOpen] = React.useState(false);
  const [technicalDashboardFilter, setTechnicalDashboardFilter] = React.useState<TechnicalDashboardFilter>('ALL');
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isVersionModalOpen, setIsVersionModalOpen] = React.useState(false);
  const [versionDescription, setVersionDescription] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);
  const [editingVersionId, setEditingVersionId] = React.useState<string | null>(null);
  const [editingVersionDescription, setEditingVersionDescription] = React.useState('');
  const [compareVersion, setCompareVersion] = React.useState<BudgetVersion | null>(null);
  const [isCreatingItem, setIsCreatingItem] = React.useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = usePersistedState('budgetEditor:showOnlyFavorites', false);
  const [isParametricModalOpen, setIsParametricModalOpen] = React.useState(false);
  const [parametricType, setParametricType] = React.useState<'FINANCIAL' | 'QUANTITATIVE'>('FINANCIAL');
  const [parametricPreview, setParametricPreview] = React.useState<{ totalValue: number; itemsCount: number; mainMaterials?: Array<{ desc: string; qty: number; unit: string }> } | null>(null);
  const [showNatureBreakdown, setShowNatureBreakdown] = React.useState(false);
  // Busca da toolbar acoplada (§5.2) — filtra os itens da WBS por código/descrição.
  const [wbsSearch, setWbsSearch] = usePersistedState('budgetEditor:wbsSearch', '');
  const wbsQuery = wbsSearch.trim().toLowerCase();
  const isSearching_wbs = wbsQuery.length > 0;

  /** Item bate com a busca (código ou descrição). Sem busca, tudo passa. */
  const matchesWbsSearch = React.useCallback((item: BudgetEntry) => {
    if (!wbsQuery) return true;
    const it = item.sinapiItem;
    return (it?.description || '').toLowerCase().includes(wbsQuery)
      || (it?.code || '').toLowerCase().includes(wbsQuery);
  }, [wbsQuery]);

  // Largura da tabela = soma EXATA das colunas visíveis (§6.1). O espaçador não
  // entra na conta: é ele que absorve a folga quando sobra espaço no container.
  const tableTotalWidth = React.useMemo(() => {
    const base = DRAG_COL_WIDTH
      + WBS_COLUMN_KEYS.reduce((sum, key) => sum + cols.getWidth(key), 0)
      + cols.getWidth('preco-total');
    return showNatureBreakdown
      ? base + NATURE_COLUMN_KEYS.reduce((sum, key) => sum + cols.getWidth(key), 0)
      : base;
  }, [cols, showNatureBreakdown]);
  const [auxiliaryItems, setAuxiliaryItems] = React.useState<Map<string, SinapiItem>>(new Map());
  const [isLoadingAuxiliary, setIsLoadingAuxiliary] = React.useState(false);
  const [hasCPUChanges, setHasCPUChanges] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = budget.findIndex((item) => item.id === active.id);
      const newIndex = budget.findIndex((item) => item.id === over?.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onUpdateBudget(arrayMove(budget, oldIndex, newIndex));
      }
    }
  };
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

  const hasCalculationMemory = (item: BudgetEntry) => !!(
    item.calculationMemory?.formula?.trim() ||
    item.calculationMemory?.justification?.trim() ||
    item.calculationMemory?.result !== undefined
  );

  const handleOpenDetails = (item: BudgetEntry) => {
    setSelectedDetailsItem(JSON.parse(JSON.stringify(item)));
  };

  const handleSaveDetails = () => {
    if (!selectedDetailsItem) return;
    const updated = budget.map(item => item.id === selectedDetailsItem.id ? selectedDetailsItem : item);
    onUpdateBudget(updated);
    setSelectedDetailsItem(null);
    setNotification({ message: 'Memória técnica do item salva com sucesso!', type: 'success' });
    setTimeout(() => setNotification(null), 3000);
  };

  const buildTechnicalIssueRows = React.useCallback((): TechnicalIssueRow[] => {
    const controlByItem = new Map(budgetControlRows.map(row => [row.id, row]));

    return budget.map(item => {
      const issues: string[] = [];
      const issueCodes: TechnicalDashboardFilter[] = [];
      const controlRow = controlByItem.get(item.id);
      const financialAlerts = controlRow?.alerts || [];

      if (!hasCalculationMemory(item)) {
        issues.push('Sem memória de cálculo');
        issueCodes.push('NO_MEMORY');
      }
      if (!item.precisionClass) {
        issues.push('Sem classe de precisão');
        issueCodes.push('NO_PRECISION');
      }
      const itemStatus = String(item.status || '');
      if (itemStatus.includes('revis') || itemStatus.includes('aprova') || (item.calculationMemory && !item.calculationMemory.approved)) {
        issues.push('Aguardando aprovação');
        issueCodes.push('PENDING_APPROVAL');
      }
      if (itemStatus.includes('Cancelado') || itemStatus.includes('Substitu')) {
        issues.push(itemStatus || 'Inativo');
        issueCodes.push('INACTIVE');
      }
      if (financialAlerts.length > 0 || (controlRow && controlRow.balance < 0)) {
        issues.push('Divergência orçado x realizado');
        issueCodes.push('FINANCIAL');
      }

      return {
        item,
        code: item.sinapiItem?.code || '---',
        description: item.sinapiItem?.description || 'Sem descrição',
        precisionClass: item.precisionClass || '-',
        status: item.status || 'Rascunho',
        responsible: item.responsible || '-',
        issues,
        issueCodes,
        financialAlerts,
      };
    }).filter(row => row.issues.length > 0);
  }, [budget, budgetControlRows]);

  const handleOpenTechnicalItem = (item: BudgetEntry) => {
    setIsTechnicalDashboardOpen(false);
    handleOpenDetails(item);
  };

  const handleOpenBudgetControl = async () => {
    const activeProjectId = projectId || (settings as ProjectSettings & { id?: string }).id;
    setBudgetControlError(null);
    setIsBudgetControlOpen(true);

    if (!activeProjectId) {
      setBudgetControlRows([]);
      setBudgetControlError('Salve ou carregue o orçamento antes de cruzar contratos e medições.');
      return;
    }

    setIsLoadingBudgetControl(true);
    try {
      const [{ supabase }, { contractService }] = await Promise.all([
        import('../lib/supabase'),
        import('../services/contractService'),
      ]);

      const { data: contracts, error: contractsError } = await supabase
        .from('contracts')
        .select('id')
        .or(`project_id.eq.${activeProjectId},budget_id.eq.${activeProjectId}`);

      if (contractsError) throw contractsError;

      const contractIds = (contracts || []).map((contract: { id: string }) => contract.id);
      const contractedByBudgetItem = new Map<string, number>();

      if (contractIds.length > 0) {
        const { data: contractItems, error: itemsError } = await supabase
          .from('contract_items')
          .select('budget_item_id, total_price')
          .in('contract_id', contractIds)
          .not('budget_item_id', 'is', null);

        if (itemsError) throw itemsError;

        (contractItems || []).forEach((item: { budget_item_id: string | null; total_price: number | null }) => {
          if (!item.budget_item_id) return;
          contractedByBudgetItem.set(
            item.budget_item_id,
            (contractedByBudgetItem.get(item.budget_item_id) || 0) + Number(item.total_price || 0),
          );
        });
      }

      const measurementRollup = await contractService.getMeasurementRollupByBudgetItem(activeProjectId).catch(() => ({} as Record<string, { measured: number; approved: number; paid: number }>));

      const rows = budget.map(item => {
        const budgeted = calculateEntryTotal(item, settings.bdi || 0);
        const contracted = contractedByBudgetItem.get(item.id) || 0;
        const rollup = measurementRollup[item.id] || { measured: 0, approved: 0, paid: 0 };
        const measured = Number(rollup.measured || 0);
        const approved = Number(rollup.approved || 0);
        const paid = Number(rollup.paid || 0);
        const committed = Math.max(contracted, measured, paid);
        const deviation = committed - budgeted;
        const alerts: string[] = [];

        if (contracted === 0) alerts.push('Sem contrato');
        if (contracted > budgeted && budgeted > 0) alerts.push('Contratado acima do orçamento');
        if (measured > contracted && contracted > 0) alerts.push('Medido acima do contratado');
        if (paid > budgeted && budgeted > 0) alerts.push('Pago acima do orçamento');

        return {
          id: item.id,
          code: item.sinapiItem?.code || '---',
          description: item.sinapiItem?.description || 'Sem descrição',
          unit: item.sinapiItem?.unit || '',
          budgeted,
          contracted,
          measured,
          approved,
          paid,
          balance: budgeted - committed,
          deviation,
          alerts,
        };
      });

      setBudgetControlRows(rows);
    } catch (error) {
      console.error('[BudgetEditor] Falha ao carregar controle orçado x realizado:', error);
      setBudgetControlRows([]);
      setBudgetControlError('Não foi possível carregar contratos e medições vinculados a este orçamento.');
    } finally {
      setIsLoadingBudgetControl(false);
    }
  };

  const calculateEntryTotal = (entry: BudgetEntry, fallbackBdi: number) => {
    const price = entry.sinapiItem?.price || 0;
    return entry.quantity * price * (1 + (entry.bdi ?? fallbackBdi) / 100);
  };

  const buildVersionDiff = (version: BudgetVersion) => {
    const baseBudget = version.budget || [];
    const currentBudget = budget || [];
    const baseBdi = typeof version.settings?.bdi === 'number' ? version.settings.bdi : settings.bdi;
    const currentBdi = settings.bdi || 0;
    const baseMap = new Map(baseBudget.map(item => [item.id, item]));
    const currentMap = new Map(currentBudget.map(item => [item.id, item]));
    const ids = Array.from(new Set([...baseMap.keys(), ...currentMap.keys()]));

    const rows = ids.map(id => {
      const before = baseMap.get(id);
      const after = currentMap.get(id);
      const beforeTotal = before ? calculateEntryTotal(before, baseBdi) : 0;
      const afterTotal = after ? calculateEntryTotal(after, currentBdi) : 0;
      const fields: string[] = [];

      if (!before && after) fields.push('item adicionado');
      if (before && !after) fields.push('item removido');
      if (before && after) {
        if (before.quantity !== after.quantity) fields.push('quantidade');
        if ((before.sinapiItem?.price || 0) !== (after.sinapiItem?.price || 0)) fields.push('preço');
        if ((before.bdi ?? baseBdi) !== (after.bdi ?? currentBdi)) fields.push('BDI');
        if ((before.sinapiItem?.code || '') !== (after.sinapiItem?.code || '')) fields.push('código');
        if ((before.sinapiItem?.description || '') !== (after.sinapiItem?.description || '')) fields.push('descrição');
        if ((before.precisionClass || '') !== (after.precisionClass || '')) fields.push('classe de precisão');
        if ((before.status || '') !== (after.status || '')) fields.push('status');
        if ((before.discipline || '') !== (after.discipline || '')) fields.push('disciplina');
        if ((before.responsible || '') !== (after.responsible || '')) fields.push('responsável');
        if ((before.calculationMemory?.formula || '') !== (after.calculationMemory?.formula || '')) fields.push('memória de cálculo');
        if ((before.calculationMemory?.result ?? '') !== (after.calculationMemory?.result ?? '')) fields.push('resultado da memória');
        if ((before.calculationMemory?.justification || '') !== (after.calculationMemory?.justification || '')) fields.push('justificativa');
      }

      const status = !before ? 'Adicionado' : !after ? 'Removido' : fields.length > 0 ? 'Alterado' : 'Igual';
      const item = after || before;
      return {
        id,
        status,
        fields,
        code: item?.sinapiItem?.code || '---',
        description: item?.sinapiItem?.description || 'Sem descrição',
        beforeQty: before?.quantity ?? 0,
        afterQty: after?.quantity ?? 0,
        beforeTotal,
        afterTotal,
        delta: afterTotal - beforeTotal,
      };
    }).filter(row => row.status !== 'Igual');

    const baseTotal = baseBudget.reduce((sum, item) => sum + calculateEntryTotal(item, baseBdi), 0);
    const currentTotal = currentBudget.reduce((sum, item) => sum + calculateEntryTotal(item, currentBdi), 0);

    return {
      rows,
      baseTotal,
      currentTotal,
      deltaTotal: currentTotal - baseTotal,
      added: rows.filter(row => row.status === 'Adicionado').length,
      removed: rows.filter(row => row.status === 'Removido').length,
      changed: rows.filter(row => row.status === 'Alterado').length,
    };
  };
  const handleCreateItem = async () => {
    if (!newItem.description || !newItem.unit) {
      setNotification({ message: 'Por favor, preencha a descrição e a unidade.', type: 'error' });
      setTimeout(() => setNotification(null), 4000);
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
      setNotification({ message: 'Erro ao criar item.', type: 'error' });
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleSaveVersion = async () => {
    if (!versionDescription.trim()) {
      setNotification({ message: 'Por favor, insira uma descrição para a versão.', type: 'error' });
      setTimeout(() => setNotification(null), 4000);
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

  const handleLoadVersion = async (version: BudgetVersion) => {
    if (await confirm({ title: `Carregar a versão ${version.item}?`, message: 'O orçamento atual será substituído.', variant: 'warning', confirmLabel: 'Carregar' })) {
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
    const currentWBS = settings.wbs as (WBSGroup | WBSPhase)[];

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
        const wbsGroups = currentWBS as WBSGroup[];
        const allGroupIds = wbsGroups.map((g) => g.id);
        const allPhaseIds = wbsGroups.flatMap((g) => g.phases.map((p) => p.id));
        const allSubPhaseNames = wbsGroups.flatMap((g) => g.phases.flatMap((p) => p.subPhases));

        setExpandedGroups(allGroupIds);
        setExpandedPhases(allPhaseIds);
        setExpandedSubPhases(allSubPhaseNames);
      }
    }

    // Carrega base em background; cancelled evita setState em componente desmontado
    let cancelled = false;

    sinapiService.loadDatabase().then(() => {
      if (!cancelled) setDbSize(sinapiService.databaseSize);
    });

    sinapiService.getCategories().then(cats => {
      if (!cancelled) setCategories(cats);
    });

    // Competências SINAPI; normaliza a referência salva (label legado → reference_date).
    sinapiService.getReferences().then(refs => {
      if (cancelled) return;
      setReferences(refs);
      setSearchReference(prev => resolveReferenceDate(prev, refs) || refs[0]?.referenceDate || '');
    });

    customDatabaseService.listDatabases().then(dbs => {
      if (!cancelled) setCustomDatabases(dbs);
    });

    return () => { cancelled = true; };
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
            settings.socialChargesMode,
            searchReference
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
  }, [showNatureBreakdown, selectedCPUItem, settings.location, settings.socialChargesMode, searchReference]);

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
              referenceDate: searchReference,
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
  }, [searchTerm, searchCode, searchGroupFilter, searchType, searchLocation, searchCharges, searchDatabase, searchScope, searchMode, searchReference, favorites, showOnlyFavorites]);

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

    setNotification({ message: 'EAP importada com sucesso! A estrutura do projeto foi atualizada.', type: 'success' });
    setTimeout(() => setNotification(null), 4000);
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
    setNotification({ message: 'Modelo de EAP carregado com sucesso!', type: 'success' });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleClearWBS = async () => {
    if (await confirm({ title: 'Limpar toda a estrutura da EAP?', message: 'Isso não pode ser desfeito.', variant: 'danger', confirmLabel: 'Limpar' })) {
      onUpdateSettings({ ...settings, wbs: [] });
      setExpandedGroups([]);
      setExpandedPhases([]);
      setExpandedSubPhases([]);
    }
  };

  // --- Gerar Contrato de Serviço a partir do orçamento ---
  const canGenerateContract = !!(projectId || (settings as any).id) && !!(organizationId || (settings as any).organizationId) && budget.length > 0;
  const handleGenerateContract = async () => {
    const pid = projectId || (settings as any).id;
    const oid = organizationId || (settings as any).organizationId;
    if (!pid || !oid) return;
    setGeneratingContract(true);
    try {
      const { contractService } = await import('../services/contractService');
      const contract = await contractService.generateFromBudget(pid, oid, budget);
      setNotification({ message: `Contrato ${contract.number} gerado com sucesso! Acesse em Gestão de Vendas → Contratos de Serviço.`, type: 'success' });
      setTimeout(() => setNotification(null), 5000);
    } catch (e) {
      setNotification({ message: `Erro: ${e instanceof Error ? e.message : 'Tente novamente.'}`, type: 'error' });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setGeneratingContract(false);
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

  const handleDeleteGroup = async (e: React.MouseEvent, groupIndex: number) => {
    e.stopPropagation();
    if (await confirm({ title: 'Excluir este Grupo?', message: 'Todas as suas etapas e itens serão excluídos.', variant: 'danger', confirmLabel: 'Excluir' })) {
      const groupName = settings.wbs[groupIndex].name;
      const newWBS = [...settings.wbs];
      newWBS.splice(groupIndex, 1);
      const newBudget = budget.filter(item => item.group !== groupName);

      onUpdateSettings({ ...settings, wbs: newWBS });
      // We should probably renumber here too, but simpler for now just to delete
      renumberWBSAndSync(newWBS);
    }
  };

  const handleDeletePhase = async (e: React.MouseEvent, groupIndex: number, phaseIndex: number) => {
    e.stopPropagation();
    if (await confirm({ title: 'Excluir esta etapa?', message: 'Todos os seus itens serão excluídos.', variant: 'danger', confirmLabel: 'Excluir' })) {
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

  const handleDeleteSubPhase = async (e: React.MouseEvent, groupIndex: number, phaseIndex: number, subPhaseName: string) => {
    e.stopPropagation();
    if (await confirm({ title: 'Excluir esta subetapa?', message: 'Os seus itens serão excluídos.', variant: 'danger', confirmLabel: 'Excluir' })) {
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

    // Renumera todos os grupos sequencialmente inline (evita conflito de state).
    // As chaves de fase/subfase são compostas (grupo|fase) porque o grupo
    // duplicado tem fases com nomes idênticos ao original — usar só o nome da
    // fase faria a cópia sobrescrever o mapeamento do original (last-write-wins),
    // transformando os itens do grupo original em "fantasmas".
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
        const phaseKey = `${g.name}|${oldPName}`;
        const pNum = (pIdx + 1).toString().padStart(2, '0');
        const pId = `${newGId}.${pNum}`;
        const cleanP = phase.name.replace(/^[\d\.]+\s+/, '');
        const newPName = `${pId}. ${cleanP}`;
        oldToNewPhase[phaseKey] = newPName;

        const oldToNewSub: Record<string, string> = {};
        const newSubPhases = phase.subPhases.map((sub, sIdx) => {
          const subNum = (sIdx + 1).toString().padStart(2, '0');
          const cleanSub = sub.replace(/^[\d\.]+\s+/, '');
          const newSubName = `${pId}.${subNum}. ${cleanSub}`;
          oldToNewSub[sub] = newSubName;
          return newSubName;
        });
        oldToNewSubByOldPhase[phaseKey] = oldToNewSub;
        return { ...phase, id: pId, name: newPName, subPhases: newSubPhases };
      });

      return { ...g, id: newGId, name: newGName, phases: newPhases };
    });

    // Aplica renumeração ao budget combinado (existente + novos itens)
    const allBudget = newItems.length > 0 ? [...budget, ...newItems] : [...budget];
    const updatedBudget = allBudget.map(item => {
      const phaseKey = `${item.group}|${item.phase}`;
      const newG = oldToNewGroup[item.group] || item.group;
      const newP = oldToNewPhase[phaseKey] || item.phase;
      const subMap = oldToNewSubByOldPhase[phaseKey] || {};
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
      setNotification({ message: 'Não foi possível gerar o orçamento. Verifique se a área e o padrão estão definidos corretamente.', type: 'error' });
      setTimeout(() => setNotification(null), 4000);
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
    } catch (error: unknown) {
      console.error("Save error:", error);
      const msg = error instanceof Error ? error.message : JSON.stringify(error);
      setNotification({ message: `Erro ao salvar item: ${msg}`, type: 'error' });
            setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleDeleteCustomItem = async (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    if (await confirm({ title: 'Excluir este item da sua Base Própria?', variant: 'danger', confirmLabel: 'Excluir' })) {
      try {
        await customDatabaseService.deleteItem(code);
        setSearchResults(prev => prev.filter(item => item.code !== code));
        setNotification({ message: 'Item removido da Base Própria.', type: 'success' });
        setTimeout(() => setNotification(null), 3000);
      } catch (error) {
        console.error('[BudgetEditor] Falha ao excluir item:', error);
        setNotification({ message: 'Erro ao excluir item.', type: 'error' });
        setTimeout(() => setNotification(null), 4000);
      }
    }
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onUpdateBudget(budget.filter(item => item.id !== id));
  };

  // --- Calculations ---
  const totalDirectCost = budget.reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0)), 0);
  const itemsWithoutCalculationMemory = budget.filter(item => !hasCalculationMemory(item)).length;
  const itemsWithoutPrecisionClass = budget.filter(item => !item.precisionClass).length;
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

    const traverse = (item: CompositionComponent & { composition?: CompositionComponent[] }, quantity: number) => {
      if (!item) return;

      const itemType = (item.type || '') as string;
      const isComposition = itemType === 'COMPOSITION' || itemType === 'COMP' || itemType === 'SERVICE';
      let composition: CompositionComponent[] | undefined = item.composition;

      if ((!composition || composition.length === 0) && isComposition) {
        const aux = auxiliaryItems.get(item.code);
        if (aux) composition = aux.composition;
      }

      if (isComposition && composition && composition.length > 0) {
        composition.forEach((comp) => {
          const compAux = auxiliaryItems.get(comp.code);
          traverse({
            code: comp.code,
            description: comp.description,
            unit: comp.unit,
            price: comp.price,
            type: comp.type,
            quantity: comp.quantity,
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
      traverse(entry.sinapiItem as unknown as CompositionComponent & { composition?: CompositionComponent[] }, entry.quantity);
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

  const handleClearOrphanedItems = async () => {
    if (await confirm({ title: `Remover ${orphanedItems.length} itens órfãos?`, message: 'Itens que não pertencem a nenhuma etapa válida serão removidos.', variant: 'warning', confirmLabel: 'Remover' })) {
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
      setNotification({ message: `${orphanedItems.length} itens removidos com sucesso.`, type: 'success' });
      setTimeout(() => setNotification(null), 4000);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 relative">
      {orphanedItems.length > 0 && (
        <div className="mx-0 p-4 bg-amber-50 border border-amber-200 rounded-[10px] animate-in slide-in-from-top-2">
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
              className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded text-button font-bold transition-colors shadow-sm whitespace-nowrap ml-4"
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
                  <span className="text-amber-600 block text-xs mt-0.5">
                    Path: [{item.group}] &gt; [{item.phase}] &gt; [{item.subPhase}]
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {(itemsWithoutCalculationMemory > 0 || itemsWithoutPrecisionClass > 0) && (
        <div className="mx-0 p-4 bg-blue-50 border border-blue-200 rounded-[10px]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div>
                <p className="text-blue-900 font-bold text-sm">Memória técnica pendente</p>
                <p className="text-blue-700 text-xs">
                  {itemsWithoutCalculationMemory} item(s) sem memória de cálculo e {itemsWithoutPrecisionClass} item(s) sem classe de precisão.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-blue-700 bg-white border border-blue-100 rounded-full px-3 py-1 whitespace-nowrap">
              Clique no ícone de prancheta em cada item
            </span>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Orçamento Analítico</h1>
        <p className="text-gray-400 text-sm mt-1.5 font-medium">Composição detalhada com WBS (Work Breakdown Structure).</p>
      </div>

      {/* Statistics — KpiCard (§4). Preço Venda é o total do qual os outros dois são a
          decomposição (Custo Direto + BDI = Preço Venda) — quebra de simetria (§4.2). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
        <KpiCard size="lg" className="col-span-2" label="Preço Venda" value={`R$ ${totalWithBDI.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<Banknote className="w-4 h-4" />} color="emerald" />
        <KpiCard size="sm" label="Custo Direto" value={`R$ ${totalDirectCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<Wallet className="w-4 h-4" />} color="gray" />
        <KpiCard size="sm" label={`BDI (${settings.bdi}%)`} value={`+ R$ ${(totalWithBDI - totalDirectCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<Percent className="w-4 h-4" />} color="blue" />
      </div>

      {/* Banner de nova competência SINAPI + rebase */}
      <SinapiRebaseModal
        budget={budget}
        references={references}
        pinnedRaw={settings.referenceMonth}
        location={searchLocation}
        chargeType={searchCharges}
        isLocked={isLocked}
        onApply={(newBudget, targetRef) => {
          onUpdateBudget(newBudget);
          onUpdateSettings({ ...settings, referenceMonth: targetRef });
          setSearchReference(targetRef);
          setNotification({ message: `Orçamento atualizado para a competência ${references.find(r => r.referenceDate === targetRef)?.label || targetRef}.`, type: 'success' });
          setTimeout(() => setNotification(null), 5000);
        }}
      />

      {/* Toolbar acoplada à tabela (§5.2): toolbar e WBS dividem UM card —
          border/rounded/shadow/overflow só neste pai, e a régua interna sem
          moldura própria, separada do conteúdo pelo border-b. */}
      <div className="flex-1 bg-white rounded-[10px] shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-0">
      <div className="p-3 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {/* Busca da WBS — parte do conjunto padrão da toolbar acoplada */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar item por código ou descrição..."
              value={wbsSearch}
              onChange={(e) => setWbsSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            />
            {isSearching_wbs && (
              <button
                onClick={() => setWbsSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-[6px] hover:bg-gray-100"
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {isLocked && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-[6px] border border-amber-200 text-xs font-bold animate-pulse">
              <AlertTriangle className="w-4 h-4" />
              BLOQUEADO
            </div>
          )}

          {/* Grupo 1: Visualização & Configurações */}
          <div className="flex items-center gap-3 bg-gray-50/80 p-1.5 rounded-[10px] border border-gray-100 pr-4">
            <div className="flex items-center gap-2 pl-1">
              <label className="text-xs font-bold text-gray-400 uppercase whitespace-nowrap">BDI (%):</label>
              <input
                type="number"
                value={settings.bdi}
                onChange={(e) => onUpdateSettings({ ...settings, bdi: Number(e.target.value) })}
                className="w-14 h-8 rounded-[6px] border border-gray-200 bg-white text-center text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1" />

            <div className="flex bg-gray-200/50 rounded-[6px] p-0.5">
              <button
                onClick={() => onUpdateSettings({ ...settings, cpuViewMode: 'inline' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-button font-bold transition-all ${settings.cpuViewMode === 'inline' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="Ver CPU abaixo do item"
              >
                <Layers className="w-3.5 h-3.5" />
                Inline
              </button>
              <button
                onClick={() => onUpdateSettings({ ...settings, cpuViewMode: 'modal' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-button font-bold transition-all ${(!settings.cpuViewMode || settings.cpuViewMode === 'modal') ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="Ver CPU em janela flutuante"
              >
                <Monitor className="w-3.5 h-3.5" />
                Janela
              </button>
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1" />

            <button
              onClick={expandedGroups.length > 0 ? handleCollapseAll : handleExpandAll}
              title={expandedGroups.length > 0 ? 'Recolher tudo' : 'Expandir tudo'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[6px] text-button font-bold border border-slate-200 text-slate-600 hover:border-slate-300 bg-white transition-all"
            >
              {expandedGroups.length > 0 ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
              {expandedGroups.length > 0 ? 'Recolher' : 'Expandir'}
            </button>

            {/* Auto-ajuste de largura (§6.1.2) — sob comando explícito, nunca
                automático: recalcular a cada digitação faria as colunas dançarem.
                Neutro (não é toggle, não fica azul). */}
            <button
              onClick={() => cols.autoFit()}
              className="p-2 rounded-[6px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
              title="Ajustar largura das colunas ao conteúdo"
            >
              <MoveHorizontal className="w-4 h-4" />
            </button>

            <div className="h-6 w-px bg-gray-200 mx-1" />

            <button
              onClick={() => setShowNatureBreakdown(!showNatureBreakdown)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-black uppercase tracking-wider transition-all border ${showNatureBreakdown ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
              title="Mostrar detalhamento de custos (Mão de Obra, Material, Equipamento)"
            >
              <Layers className="w-3.5 h-3.5" />
              Composição
            </button>
          </div>

          <div className="h-8 w-px bg-gray-100 mx-1" />

          {/* Grupo 2: Versões & Histórico */}
          <div className="flex items-center gap-1.5 bg-gray-50/80 p-1.5 rounded-[10px] border border-gray-100">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] transition-all text-button font-bold border ${showHistory ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              <History className="w-3.5 h-3.5" />
              Histórico ({settings.versions?.length || 0})
            </button>
            <button
              onClick={() => setIsVersionModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all text-button font-bold"
              title="Salvar uma nova versão (snapshot) deste orçamento"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar versão
            </button>
            {(() => {
              const activeVersion = settings.versions?.find(v => v.id === settings.activeVersionId);
              if (!activeVersion) return null;
              return (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-[6px]" title={`Versão ativa: ${activeVersion.description}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                  <span className="text-xs font-bold text-amber-700 max-w-[120px] truncate">v{activeVersion.item} · {activeVersion.description}</span>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Grupo 3: Menu de Ferramentas (análise + import/export + contrato) */}
          <div className="relative">
            <button
              onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-[6px] text-button font-bold border transition-all ${toolsMenuOpen ? 'bg-gray-50 border-gray-300 text-gray-800 shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              title="Ferramentas de análise, importação e exportação"
            >
              <Wrench className="w-3.5 h-3.5" />
              Ferramentas
              <ChevronDown className={`w-3 h-3 transition-transform ${toolsMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {toolsMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setToolsMenuOpen(false)}></div>
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-[10px] shadow-2xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="px-4 pt-1 pb-1.5 text-xs font-black text-gray-400 uppercase tracking-wider">Análise</p>
                  <button
                    onClick={() => { handleOpenParametric(); setToolsMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 transition-colors"
                  >
                    <Box className="w-4 h-4 text-indigo-500" /> Paramétrico
                  </button>
                  {onOpenDashboard && (
                    <button
                      onClick={() => { onOpenDashboard(); setToolsMenuOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4 text-blue-500" /> Curva ABC
                    </button>
                  )}
                  <button
                    onClick={() => { handleOpenBudgetControl(); setToolsMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-500" /> Controle orçado x realizado
                  </button>
                  <button
                    onClick={() => { setIsTechnicalDashboardOpen(true); setToolsMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2 transition-colors"
                  >
                    <ClipboardList className="w-4 h-4 text-rose-500" /> Painel de pendências técnicas
                  </button>

                  <div className="border-t border-gray-100 my-1"></div>
                  <p className="px-4 pt-1 pb-1.5 text-xs font-black text-gray-400 uppercase tracking-wider">Importar / Exportar</p>
                  <button
                    onClick={() => { setIsImportModalOpen(true); setToolsMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <FileDown className="w-4 h-4 text-gray-500" /> Importar EAP
                  </button>
                  <button
                    onClick={() => { handleExportWBS(); setToolsMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-gray-500" /> Exportar EAP
                  </button>

                  {canGenerateContract && (
                    <>
                      <div className="border-t border-gray-100 my-1"></div>
                      <button
                        disabled={generatingContract}
                        onClick={() => { handleGenerateContract(); setToolsMenuOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <FileText className="w-4 h-4 text-emerald-500" /> {generatingContract ? 'Gerando contrato...' : 'Gerar Contrato'}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Grupo 4: Gestão da EAP */}
          <div className="relative">
            <button
              onClick={() => setManageEapMenuOpen(!manageEapMenuOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-[6px] transition-all text-button font-bold border ${manageEapMenuOpen ? 'bg-gray-50 border-gray-300 text-gray-800 shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              title="Gerenciar estrutura da EAP"
            >
              <Layers className="w-3.5 h-3.5" />
              Gerenciar EAP
              <ChevronDown className={`w-3 h-3 transition-transform ${manageEapMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {manageEapMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setManageEapMenuOpen(false)}></div>
                <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-[10px] shadow-2xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
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

          {/* Ação primária */}
          <Button
            onClick={handleAddGroup}
            className="gap-2 text-button"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Novo Grupo
          </Button>
        </div>
      </div>

      {
        showHistory && (
          <div className="bg-white p-4 rounded-[10px] shadow-sm border border-blue-100 animate-in fade-in slide-in-from-top-2 duration-200">
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
                    <div key={v.id} className={`border rounded-[10px] p-3 transition-all group relative ${isActive ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50/30'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-normal text-blue-700">Item {v.item}</span>
                          {isActive && (
                            <span className="flex items-center gap-1 text-sm font-normal text-amber-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Ativa
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
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
                            className="flex-1 text-sm border border-blue-300 rounded-[6px] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <Button onClick={() => handleRenameVersion(v.id)} size="sm" className="text-button">OK</Button>
                          <button onClick={() => setEditingVersionId(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-[6px] text-button hover:bg-gray-200"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-1 mb-3">
                          <p className="text-sm text-gray-700 font-medium line-clamp-2 flex-1">{v.description}</p>
                          <button onClick={() => handleStartEditVersion(v)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded-[6px]" title="Renomear versão">
                            <Pencil className="w-3 h-3 text-gray-400" />
                          </button>
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        {!isActive && (
                          <button
                            onClick={() => onUpdateSettings({ ...settings, activeVersionId: v.id })}
                            className="flex-none px-2.5 py-1.5 border border-amber-200 text-amber-600 bg-amber-50 rounded-[6px] text-button font-bold hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-colors"
                            title="Marcar como versão ativa sem restaurar o orçamento"
                          >
                            Marcar Ativa
                          </button>
                        )}
                        <button
                          onClick={() => setCompareVersion(v)}
                          className="flex-none px-2.5 py-1.5 border border-slate-200 text-slate-600 bg-white rounded-[6px] text-button font-bold hover:bg-slate-700 hover:text-white hover:border-slate-700 transition-colors"
                          title="Comparar esta versão com o orçamento atual"
                        >
                          Comparar
                        </button>
                        <button
                          onClick={() => handleLoadVersion(v)}
                          className={`flex-1 py-1.5 border rounded-[6px] text-form-input font-bold transition-colors ${isActive ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-600 hover:text-white hover:border-amber-600' : 'bg-white border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white'}`}
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

      {
        compareVersion && (() => {
          const diff = buildVersionDiff(compareVersion);
          const fmtMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-7xl h-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                      <History className="w-5 h-5 text-blue-600" />
                      Comparativo de versão
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Versão {compareVersion.item} · {compareVersion.description} contra o orçamento atual
                    </p>
                  </div>
                  <button onClick={() => setCompareVersion(null)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors" title="Fechar">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 border-b border-gray-100 grid grid-cols-1 md:grid-cols-5 gap-3 bg-white">
                  {[
                    ['Base', fmtMoney(diff.baseTotal), 'text-gray-700'],
                    ['Atual', fmtMoney(diff.currentTotal), 'text-blue-700'],
                    ['Variação', fmtMoney(diff.deltaTotal), diff.deltaTotal >= 0 ? 'text-red-600' : 'text-emerald-700'],
                    ['Alterados', String(diff.changed), 'text-amber-700'],
                    ['Adic./Rem.', `${diff.added} / ${diff.removed}`, 'text-slate-700'],
                  ].map(([label, value, color]) => (
                    <div key={label} className="border border-gray-100 rounded-[10px] p-3 bg-gray-50/50">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                      <p className={`text-lg font-black mt-1 ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex-1 overflow-auto">
                  {diff.rows.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                      Nenhuma diferença encontrada entre esta versão e o orçamento atual.
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                        <tr>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Status</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Código</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Descrição</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Qtd. base</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Qtd. atual</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Total base</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Total atual</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Variação</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Campos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {diff.rows.map(row => (
                          <tr key={row.id} className="hover:bg-blue-50/30">
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                              <span className={`text-sm font-normal ${row.status === 'Adicionado' ? 'text-emerald-700' : row.status === 'Removido' ? 'text-red-700' : 'text-amber-700'}`}>
                                {row.status}
                              </span>
                            </td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm text-gray-600">{row.code}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-gray-700 max-w-md">
                              <div className="line-clamp-2" title={row.description}>{row.description}</div>
                            </td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm text-gray-500">{row.beforeQty.toLocaleString('pt-BR')}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm text-gray-900">{row.afterQty.toLocaleString('pt-BR')}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm font-medium text-gray-500">{fmtMoney(row.beforeTotal)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm font-medium text-gray-800">{fmtMoney(row.afterTotal)}</td>
                            <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm font-medium ${row.delta >= 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtMoney(row.delta)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm text-gray-500 max-w-xs">{row.fields.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          );
        })()
      }
      
      
      {
        isTechnicalDashboardOpen && (() => {
          const issueRows = buildTechnicalIssueRows();
          const filteredRows = technicalDashboardFilter === 'ALL'
            ? issueRows
            : issueRows.filter(row => row.issueCodes.includes(technicalDashboardFilter));
          const countBy = (filter: TechnicalDashboardFilter) => issueRows.filter(row => row.issueCodes.includes(filter)).length;
          const filters: Array<{ id: TechnicalDashboardFilter; label: string; value: number; tone: string }> = [
            { id: 'ALL', label: 'Todas', value: issueRows.length, tone: 'text-gray-800' },
            { id: 'NO_MEMORY', label: 'Sem memória', value: countBy('NO_MEMORY'), tone: 'text-amber-700' },
            { id: 'NO_PRECISION', label: 'Sem classe', value: countBy('NO_PRECISION'), tone: 'text-orange-700' },
            { id: 'PENDING_APPROVAL', label: 'Aprovação', value: countBy('PENDING_APPROVAL'), tone: 'text-blue-700' },
            { id: 'INACTIVE', label: 'Inativos', value: countBy('INACTIVE'), tone: 'text-slate-700' },
            { id: 'FINANCIAL', label: 'Divergências', value: countBy('FINANCIAL'), tone: 'text-red-700' },
          ];

          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-7xl h-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-rose-600" />
                      Painel de pendências técnicas
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">Triagem dos itens sem memória, sem classe, aguardando aprovação ou com divergência financeira carregada.</p>
                  </div>
                  <button onClick={() => setIsTechnicalDashboardOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors" title="Fechar">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 border-b border-gray-100 grid grid-cols-2 md:grid-cols-6 gap-3 bg-white">
                  {filters.map(filter => (
                    <button
                      key={filter.id}
                      onClick={() => setTechnicalDashboardFilter(filter.id)}
                      className={`text-left border rounded-[10px] p-3 transition-all ${technicalDashboardFilter === filter.id ? 'border-rose-300 bg-rose-50 shadow-sm' : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'}`}
                    >
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{filter.label}</p>
                      <p className={`text-lg font-black mt-1 ${filter.tone}`}>{filter.value}</p>
                    </button>
                  ))}
                </div>

                {budgetControlRows.length === 0 && (
                  <div className="mx-6 mt-4 rounded-[10px] border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-center justify-between gap-3">
                    <span>As divergências financeiras aparecem depois de carregar o controle orçado x realizado.</span>
                    <button onClick={() => { setIsTechnicalDashboardOpen(false); handleOpenBudgetControl(); }} className="px-3 py-1.5 rounded-[6px] bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">Carregar controle</button>
                  </div>
                )}

                <div className="flex-1 overflow-auto">
                  {filteredRows.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                      Nenhuma pendência encontrada para o filtro selecionado.
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                        <tr>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Código</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Descrição</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Classe</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Status</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Responsável</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Pendências</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredRows.map(row => (
                          <tr key={row.item.id} className="hover:bg-rose-50/30">
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm text-gray-600">{row.code}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-gray-700 max-w-md"><div className="line-clamp-2" title={row.description}>{row.description}</div></td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm text-gray-700">{row.precisionClass}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-gray-600">{row.status}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-gray-600">{row.responsible}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                              <div className="flex flex-wrap gap-2">
                                {row.issues.map(issue => (
                                  <span key={issue} className="text-sm font-normal text-amber-700">{issue}</span>
                                ))}
                                {row.financialAlerts.map(alert => (
                                  <span key={alert} className="text-sm font-normal text-red-700">{alert}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right">
                              <button onClick={() => handleOpenTechnicalItem(row.item)} className="px-3 py-1.5 rounded-[6px] bg-gray-900 text-white text-xs font-bold hover:bg-gray-800">Abrir</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          );
        })()
      }
      {
        isBudgetControlOpen && (() => {
          const fmtMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const totals = budgetControlRows.reduce((acc, row) => ({
            budgeted: acc.budgeted + row.budgeted,
            contracted: acc.contracted + row.contracted,
            measured: acc.measured + row.measured,
            approved: acc.approved + row.approved,
            paid: acc.paid + row.paid,
            deviation: acc.deviation + row.deviation,
          }), { budgeted: 0, contracted: 0, measured: 0, approved: 0, paid: 0, deviation: 0 });
          const alertedRows = budgetControlRows.filter(row => row.alerts.length > 0).length;

          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-7xl h-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      Controle orçado x realizado
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">Cruzamento do orçamento atual com contratos, medições aprovadas e pagamentos vinculados.</p>
                  </div>
                  <button onClick={() => setIsBudgetControlOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors" title="Fechar">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 border-b border-gray-100 grid grid-cols-1 md:grid-cols-6 gap-3 bg-white">
                  {[
                    ['Orçado', fmtMoney(totals.budgeted), 'text-gray-800'],
                    ['Contratado', fmtMoney(totals.contracted), 'text-blue-700'],
                    ['Medido', fmtMoney(totals.measured), 'text-indigo-700'],
                    ['Aprovado', fmtMoney(totals.approved), 'text-emerald-700'],
                    ['Pago', fmtMoney(totals.paid), 'text-slate-700'],
                    ['Alertas', String(alertedRows), alertedRows > 0 ? 'text-amber-700' : 'text-emerald-700'],
                  ].map(([label, value, color]) => (
                    <div key={label} className="border border-gray-100 rounded-[10px] p-3 bg-gray-50/50">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                      <p className={`text-lg font-black mt-1 ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {budgetControlError && (
                  <div className="mx-6 mt-4 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                    {budgetControlError}
                  </div>
                )}

                <div className="flex-1 overflow-auto">
                  {isLoadingBudgetControl ? (
                    <div className="h-full flex items-center justify-center text-gray-500 text-sm gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando contratos e medições...
                    </div>
                  ) : budgetControlRows.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                      Nenhum item disponível para conferência.
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                        <tr>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Código</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Descrição</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Orçado</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Contratado</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Medido</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Aprovado</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Pago</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500 text-right">Saldo</th>
                          <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-sm font-semibold text-gray-500">Alertas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {budgetControlRows.map(row => (
                          <tr key={row.id} className="hover:bg-amber-50/30">
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm text-gray-600">{row.code}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-gray-700 max-w-md">
                              <div className="line-clamp-2" title={row.description}>{row.description}</div>
                              {row.unit && <div className="text-xs text-gray-400 mt-0.5">Unid.: {row.unit}</div>}
                            </td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm font-medium text-gray-800">{fmtMoney(row.budgeted)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm font-medium text-blue-700">{fmtMoney(row.contracted)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm font-medium text-indigo-700">{fmtMoney(row.measured)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm font-medium text-emerald-700">{fmtMoney(row.approved)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm font-medium text-slate-700">{fmtMoney(row.paid)}</td>
                            <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right tabular-nums text-sm font-medium ${row.balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtMoney(row.balance)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                              {row.alerts.length === 0 ? (
                                <span className="text-sm font-normal text-emerald-700">OK</span>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {row.alerts.map(alert => (
                                    <span key={alert} className="text-sm font-normal text-amber-700">{alert}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          );
        })()
      }
        {/* Conteúdo — SEM bg/border/rounded/shadow próprios: o card pai já supre (§5.2) */}
        <div className="flex-1 overflow-auto min-h-0">
          <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth }}>
            {/* Uma única definição de coluna para TODAS as linhas (cabeçalho, grupo,
                etapa, subetapa e item) — antes eram 3 templates de grid distintos
                (11, 9 e 12 colunas), e por isso as colunas nunca alinhavam.
                ⚠️ A tabela NUNCA usa w-full junto com table-layout:fixed (§6.1): a
                largura é a soma exata das colunas, senão o navegador redistribui a
                sobra e o arraste redimensiona a coluna errada. */}
            <colgroup>
              <col style={{ width: `${DRAG_COL_WIDTH}px` }} />
              {WBS_COLUMN_KEYS.map(key => (
                <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
              ))}
              {/* Espaçador (§6.1.1): absorve a folga ANTES do bloco final, para a
                  borda de "Preço total" não andar a cada redimensionamento. */}
              <col />
              <col data-col-key="preco-total" style={{ width: `${cols.getWidth('preco-total')}px` }} />
              {showNatureBreakdown && NATURE_COLUMN_KEYS.map(key => (
                <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-500">
                <th className="px-3 py-2 border-r border-gray-100"></th>
                <th className="px-3 py-2 border-r border-gray-100 relative overflow-hidden">Item<cols.ResizeHandle colKey="item" /></th>
                <th className="px-3 py-2 border-r border-gray-100 text-center relative overflow-hidden">Base<cols.ResizeHandle colKey="base" /></th>
                <th className="px-3 py-2 border-r border-gray-100 text-center relative overflow-hidden">Código<cols.ResizeHandle colKey="codigo" /></th>
                <th className="px-3 py-2 border-r border-gray-100 relative overflow-hidden">Descrição<cols.ResizeHandle colKey="descricao" /></th>
                <th className="px-3 py-2 border-r border-gray-100 text-center relative overflow-hidden">Qtd.<cols.ResizeHandle colKey="qtd" /></th>
                <th className="px-3 py-2 border-r border-gray-100 text-center relative overflow-hidden">Unid.<cols.ResizeHandle colKey="unid" /></th>
                <th className="px-3 py-2 border-r border-gray-100 text-center relative overflow-hidden">Custo unit.<cols.ResizeHandle colKey="custo-unit" /></th>
                <th className="px-3 py-2 border-r border-gray-100 text-right relative overflow-hidden">Custo total<cols.ResizeHandle colKey="custo-total" /></th>
                <th className="px-3 py-2 border-r border-gray-100 text-center text-red-500 relative overflow-hidden">BDI<cols.ResizeHandle colKey="bdi" /></th>
                <th className="px-3 py-2 border-r border-gray-100 text-right relative overflow-hidden">Preço unit.<cols.ResizeHandle colKey="preco-unit" /></th>
                <th aria-hidden="true" className="border-r border-gray-100"></th>
                <th className="px-3 py-2 border-r border-gray-100 last:border-r-0 text-right relative overflow-hidden">Preço total<cols.ResizeHandle colKey="preco-total" /></th>
                {showNatureBreakdown && (
                  <>
                    <th className="px-3 py-2 border-r border-gray-100 text-right text-blue-600 bg-blue-50/50 relative overflow-hidden">M.O<cols.ResizeHandle colKey="mo" /></th>
                    <th className="px-3 py-2 border-r border-gray-100 text-right text-blue-600 bg-blue-50/50 relative overflow-hidden">Mat.<cols.ResizeHandle colKey="mat" /></th>
                    <th className="px-3 py-2 border-r border-gray-100 last:border-r-0 text-right text-blue-600 bg-blue-50/50 relative overflow-hidden">Equip.<cols.ResizeHandle colKey="equip" /></th>
                  </>
                )}
              </tr>
            </thead>
          {(settings?.wbs || []).map((group, gIndex) => {
            if (!group) return null;
            // Com busca ativa, grupo sem nenhum item correspondente sai inteiro.
            if (isSearching_wbs && !budget.some(b => b.group === group.name && matchesWbsSearch(b))) return null;
            // A busca também abre a árvore: o resultado não pode ficar escondido
            // dentro de um grupo recolhido.
            const isGroupExpanded = isSearching_wbs || expandedGroups.includes(group.id);
            const groupTotal = calculateGroupTotal(group.name);
            const { name: groupNameDisplay } = splitName(group.name);

            return (
              <tbody key={group.id} className="border-b-4 border-gray-100 last:border-b-0">
                {/* GROUP HEADER */}
                <tr className="bg-gray-800 hover:bg-gray-700 transition-colors text-white group">
                  <td className="px-3 py-2.5 border-r border-gray-700"></td>
                  <td className="px-3 py-2.5 border-r border-gray-700">
                    <div className="flex items-center gap-1 cursor-pointer font-bold text-sm" onClick={() => toggleGroup(group.id)}>
                      {isGroupExpanded ? <ChevronDown className="w-4 h-4 text-gray-300 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
                      {group.id}
                    </div>
                  </td>
                  <td colSpan={3} className="px-3 py-2.5 border-r border-gray-700">
                    <div className="font-bold text-sm uppercase leading-tight tracking-wide truncate" title={groupNameDisplay}>
                      {groupNameDisplay}
                    </div>
                  </td>
                  <td colSpan={7} className="px-3 py-2.5 border-r border-gray-700"></td>
                  <td className="px-3 py-2.5 border-r border-gray-700 last:border-r-0 relative">
                    <div className="flex items-center justify-end">
                      <span className="font-bold text-base whitespace-nowrap">R$ {groupTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity items-center border-l border-gray-600 pl-2 absolute right-3 bg-gray-800 rounded-[6px] shadow-sm z-20">
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
                        <button type="button" onClick={(e) => handleDuplicateGroup(e, gIndex)} className="p-1.5 hover:bg-gray-600 rounded-[6px] text-gray-400 hover:text-white" title="Duplicar Grupo"><Copy className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={(e) => handleEditGroup(e, gIndex)} className="p-1.5 hover:bg-gray-600 rounded-[6px] text-amber-400" title="Editar Grupo"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={(e) => handleAddPhase(e, gIndex)} className="p-1.5 hover:bg-gray-600 rounded-[6px] text-blue-300" title="Nova Etapa"><Plus className="w-4 h-4" /></button>
                        <button type="button" onClick={(e) => handleDeleteGroup(e, gIndex)} className="p-1.5 hover:bg-gray-600 rounded-[6px] text-red-400" title="Excluir Grupo"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </td>
                  {showNatureBreakdown && (() => {
                    const nat = calculateGroupNatureTotal(group.name);
                    return (
                      <>
                        <td className="px-3 py-2.5 border-r border-gray-700 text-right text-sm font-medium text-blue-200 whitespace-nowrap">{nat.labor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2.5 border-r border-gray-700 text-right text-sm font-medium text-blue-200 whitespace-nowrap">{nat.material.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2.5 text-right text-sm font-medium text-blue-200 whitespace-nowrap">{nat.equipment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      </>
                    );
                  })()}
                </tr>

                {/* PHASES LOOP */}
                {isGroupExpanded && (group.phases || []).map((phase, pIndex) => {
                  if (!phase) return null;
                  if (isSearching_wbs && !budget.some(b => b.group === group.name && b.phase === phase.name && matchesWbsSearch(b))) return null;
                  const isPhaseExpanded = isSearching_wbs || expandedPhases.includes(phase.id);
                  const phaseTotal = calculatePhaseTotal(group.name, phase.name);
                  const { id: phaseIdDisplay, name: phaseNameDisplay } = splitName(phase.name);

                  return (
                    <React.Fragment key={phase.id}>
                      {/* PHASE HEADER */}
                      <tr className="bg-gray-100 hover:bg-gray-200 border-b border-gray-200 group">
                        <td className="px-3 py-2.5 border-r border-gray-200"></td>
                        <td className="px-3 py-2.5 border-r border-gray-200">
                          <div className="flex items-center gap-1 cursor-pointer font-bold text-gray-800 text-sm" onClick={() => togglePhase(phase.id)}>
                            {isPhaseExpanded ? <ChevronDown className="w-4 h-4 text-gray-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />}
                            {phaseIdDisplay}
                          </div>
                        </td>
                        <td colSpan={3} className="px-3 py-2.5 border-r border-gray-200">
                          <div className="font-bold text-gray-800 text-sm uppercase leading-tight truncate" title={phaseNameDisplay}>
                            {phaseNameDisplay}
                          </div>
                        </td>
                        <td colSpan={7} className="px-3 py-2.5 border-r border-gray-200"></td>
                        <td className="px-3 py-2.5 border-r border-gray-200 last:border-r-0 relative">
                          <div className="flex items-center justify-end">
                            <span className="font-bold text-gray-900 text-sm whitespace-nowrap">R$ {phaseTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity items-center border-l border-gray-300 pl-2 absolute right-3 bg-gray-100/95 rounded-[6px] shadow-sm z-20">
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
                              <button type="button" onClick={(e) => handleDuplicatePhase(e, gIndex, pIndex)} className="p-1.5 hover:bg-gray-200 rounded-[6px] text-gray-600" title="Duplicar Etapa"><Copy className="w-3.5 h-3.5" /></button>
                              <button type="button" onClick={(e) => handleEditPhase(e, gIndex, pIndex)} className="p-1.5 hover:bg-amber-100 rounded-[6px] text-amber-600" title="Editar Etapa"><Pencil className="w-3.5 h-3.5" /></button>
                              <button type="button" onClick={(e) => handleAddSubPhase(e, gIndex, pIndex)} className="p-1.5 hover:bg-blue-200 rounded-[6px] text-blue-700" title="Nova Subetapa"><Plus className="w-4 h-4" /></button>
                              <button type="button" onClick={(e) => handleDeletePhase(e, gIndex, pIndex)} className="p-1.5 hover:bg-red-200 rounded-[6px] text-red-600" title="Excluir Etapa"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                        </td>
                        {showNatureBreakdown && (() => {
                          const nat = calculatePhaseNatureTotal(group.name, phase.name);
                          return (
                            <>
                              <td className="px-3 py-2.5 border-r border-gray-200 text-right text-sm font-medium text-gray-500 whitespace-nowrap">{nat.labor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="px-3 py-2.5 border-r border-gray-200 text-right text-sm font-medium text-gray-500 whitespace-nowrap">{nat.material.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-500 whitespace-nowrap">{nat.equipment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            </>
                          );
                        })()}
                      </tr>

                      {/* SUBPHASES LOOP */}
                      {isPhaseExpanded && (phase.subPhases || []).map((subPhaseName, spIndex) => {
                        if (!subPhaseName) return null;
                        const isSubExpanded = isSearching_wbs || expandedSubPhases.includes(subPhaseName);
                        const subTotal = calculateSubPhaseTotal(group.name, phase.name, subPhaseName);
                        const allItems = budget.filter(b => b.group === group.name && b.phase === phase.name && b.subPhase === subPhaseName);
                        const items = isSearching_wbs ? allItems.filter(matchesWbsSearch) : allItems;
                        // Com busca ativa, subetapa sem nenhum item correspondente sai da
                        // árvore — mostrar a faixa vazia faria a busca parecer quebrada.
                        if (isSearching_wbs && items.length === 0) return null;
                        const { id: subIdDisplay, name: subNameDisplay } = splitName(subPhaseName);

                        return (
                          <React.Fragment key={subPhaseName}>
                            <tr className="bg-gray-50 hover:bg-gray-100 border-b border-gray-100 group">
                              <td className="px-3 py-2.5 border-r border-gray-100"></td>
                              <td className="px-3 py-2.5 border-r border-gray-100">
                                <div className="flex items-center gap-1 cursor-pointer font-semibold text-gray-700 text-sm" onClick={() => toggleSubPhase(subPhaseName)}>
                                  {isSubExpanded ? <FolderOpen className="w-3 h-3 text-blue-500 shrink-0" /> : <Folder className="w-3 h-3 text-blue-500 shrink-0" />}
                                  {subIdDisplay}
                                </div>
                              </td>
                              <td colSpan={3} className="px-3 py-2.5 border-r border-gray-100">
                                <div className="font-semibold text-gray-700 text-sm leading-tight truncate" title={subNameDisplay}>
                                  {subNameDisplay}
                                </div>
                              </td>
                              <td colSpan={7} className="px-3 py-2.5 border-r border-gray-100"></td>
                              <td className="px-3 py-2.5 border-r border-gray-100 last:border-r-0 relative">
                                <div className="flex items-center justify-end">
                                  <span className="font-medium text-gray-700 text-sm whitespace-nowrap">R$ {subTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity items-center border-l border-gray-200 pl-2 absolute right-3 bg-gray-50/95 rounded-[6px] shadow-sm z-20">
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
                                    <button type="button" onClick={(e) => handleDuplicateSubPhase(e, gIndex, pIndex, spIndex)} className="p-1.5 hover:bg-gray-200 rounded-[6px] text-gray-600" title="Duplicar Subetapa"><Copy className="w-3 h-3" /></button>
                                    <button type="button" onClick={(e) => handleEditSubPhase(e, gIndex, pIndex, spIndex)} className="p-1.5 hover:bg-amber-100 rounded-[6px] text-amber-600" title="Editar Subetapa"><Pencil className="w-3 h-3" /></button>
                                    <button type="button" onClick={(e) => handleOpenAddItem(e, group.name, phase.name, subPhaseName)} className="p-1.5 hover:bg-emerald-200 rounded-[6px] text-emerald-700 flex items-center gap-1 text-button px-2" title="Adicionar Item"><Plus className="w-3 h-3" /></button>
                                    <button type="button" onClick={(e) => handleDeleteSubPhase(e, gIndex, pIndex, subPhaseName)} className="p-1.5 hover:bg-red-200 rounded-[6px] text-red-600" title="Excluir Subetapa"><Trash2 className="w-3 h-3" /></button>
                                  </div>
                                </div>
                              </td>
                              {showNatureBreakdown && (() => {
                                const nat = calculateSubPhaseNatureTotal(group.name, phase.name, subPhaseName);
                                return (
                                  <>
                                    <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-600 whitespace-nowrap">{nat.labor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-600 whitespace-nowrap">{nat.material.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-600 whitespace-nowrap">{nat.equipment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  </>
                                );
                              })()}
                            </tr>

                            {isSubExpanded && (
                              items.length === 0 ? (
                                <tr className="border-b border-gray-100">
                                  <td colSpan={showNatureBreakdown ? 16 : 13} className="px-3 py-2.5 pl-16 text-sm text-gray-400 italic">
                                    Nenhum item nesta subetapa. Clique em "+ Item" para adicionar.
                                  </td>
                                </tr>
                              ) : (
                                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                  {items.map((item, itemIndex) => (
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
                                      onOpenDetails={handleOpenDetails}
                                      isFavorite={item.sinapiItem ? favorites.includes(item.sinapiItem.code) : false}
                                      onToggleFavorite={onToggleFavorite}
                                      showNatureBreakdown={showNatureBreakdown}
                                      natureBreakdown={showNatureBreakdown ? getNatureBreakdown(item) : undefined}
                                      auxiliaryItems={auxiliaryItems}
                                      isLocked={isLocked}
                                    />
                                  ))}
                                </SortableContext>
                              )
                            )}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            );
          })}

          {(!settings.wbs || settings.wbs.length === 0) && (
            <tbody>
              <tr>
                <td colSpan={showNatureBreakdown ? 16 : 13} className="p-8 text-center text-gray-400">
                  Nenhum grupo definido. Clique em "Nova Etapa" para começar.
                </td>
              </tr>
            </tbody>
          )}

          {/* Empty state da busca (§12) — sem moldura própria: está dentro do card acoplado */}
          {isSearching_wbs && !budget.some(matchesWbsSearch) && (
            <tbody>
              <tr>
                <td colSpan={showNatureBreakdown ? 16 : 13} className="text-center py-12">
                  <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum item encontrado</h3>
                  <p className="text-sm text-gray-500">Nenhum item do orçamento bate com "{wbsSearch}". Tente outro termo.</p>
                </td>
              </tr>
            </tbody>
          )}
          </table>
          <div className="h-24"></div>
        </div>
      </div>

      {
        wbsModal.isOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
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
                  <input type="text" autoFocus placeholder={wbsModal.type === 'PHASE' ? "Ex: Instalações Elétricas" : "Ex: Tubulações"} className="w-full rounded-[6px] border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={wbsModal.value} onChange={(e) => setWbsModal({ ...wbsModal, value: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleConfirmWBSAction()} />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setWbsModal({ ...wbsModal, isOpen: false })} className="flex-1 px-4 py-2 border border-gray-300 rounded-[6px] text-gray-700 hover:bg-gray-50 font-medium transition-colors">Cancelar</button>
                  <Button onClick={handleConfirmWBSAction} className="flex-1 font-medium">{wbsModal.mode === 'CREATE' ? 'Inserir' : 'Salvar'}</Button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        isSaveDbModalOpen && itemToSave && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">Salvar na Base</h3>
                <button onClick={() => setIsSaveDbModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-[6px] text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">

                <p className="text-sm text-gray-600 mb-4">
                  Selecione em qual base de dados você deseja salvar o item <strong>{itemToSave.code}</strong>.
                </p>

                <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
                  {customDatabases.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 text-sm bg-gray-50 rounded-[10px] dashed border border-gray-200">
                      Nenhuma base encontrada.
                    </div>
                  ) : (
                    customDatabases.map(db => (
                      <button
                        key={db.id}
                        onClick={() => confirmSaveToDatabase(db.id)}
                        className="flex items-center gap-3 p-3 rounded-[10px] border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                      >
                        <div className="bg-blue-100 text-blue-600 p-2 rounded-[6px] group-hover:bg-white group-hover:shadow-sm transition-all">
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
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-7xl h-full max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                <div>
                  <h3 className="font-bold text-gray-800">Adicionar Item</h3>
                  <p className="text-xs text-gray-500">Adicionando em: <span className="font-semibold text-blue-600">{addingTo.phase} &gt; {addingTo.subPhase}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsCreatingItem(!isCreatingItem)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-button font-bold transition-all border ${isCreatingItem ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 h-8 flex items-center justify-center'}`}
                  >
                    {isCreatingItem ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {isCreatingItem ? 'Cancelar Criação' : 'Criar Novo Item'}
                  </button>
                  <button
                    onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-button font-bold transition-all border ${showOnlyFavorites ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}
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
                    <div className="p-2 bg-blue-100 rounded-[6px]">
                      <Database className="w-5 h-5 text-blue-600" />
                    </div>
                    <h4 className="font-bold text-gray-800">Novo Item na Base Própria</h4>
                  </div>

                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-3">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tipo</label>
                      <select
                        className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                        value={newItem.type}
                        onChange={(e) => setNewItem({ ...newItem, type: e.target.value as SinapiType })}
                      >
                        <option value={SinapiType.INPUT}>Insumo</option>
                        <option value={SinapiType.COMPOSITION}>Composição</option>
                        <option value={SinapiType.SERVICE}>Serviço</option>
                      </select>
                    </div>
                    <div className="col-span-6">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Descrição do Item</label>
                      <input
                        type="text"
                        placeholder="Ex: Cimento Portland CP-III-40 ensacado"
                        className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                        value={newItem.description}
                        onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Unid.</label>
                      <input
                        type="text"
                        placeholder="kg"
                        className="w-full rounded-[6px] border border-gray-200 p-2 text-sm text-center focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                        value={newItem.unit}
                        onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Preço Base (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full rounded-[6px] border border-gray-200 p-2 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                        value={newItem.price}
                        onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-9">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Grupo (Categoria)</label>
                      <select
                        className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
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
                        className="w-full bg-emerald-600 text-white font-bold py-2 rounded-[6px] hover:bg-emerald-700 shadow-sm transition-all flex items-center justify-center gap-2"
                      >
                        <Save className="w-4 h-4" /> Salvar Item
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-blue-600/70 italic flex items-center gap-1">
                    <Database className="w-2.5 h-2.5" /> O item será salvo na sua Base Própria e poderá ser usado em qualquer projeto.
                  </p>
                </div>
              )}

              {/* Filtros de Busca */}
              <div className="p-4 border-b border-gray-100 bg-white">
                <div className="grid grid-cols-12 gap-3 mb-4">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Código</label>
                    <input
                      type="text"
                      placeholder="Ex: 98546"
                      className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      value={searchCode}
                      onChange={(e) => setSearchCode(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tipo</label>
                    <select
                      className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                      value={searchType}
                      onChange={(e) => setSearchType(e.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value={SinapiType.SERVICE}>Serviços / Composições</option>
                      <option value={SinapiType.INPUT}>Insumos</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Grupo</label>
                    <select
                      className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
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
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Descrição</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Buscar por descrição..."
                          className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-[6px] text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                      <select
                        className="rounded-[6px] border border-gray-200 px-3 py-2 text-form-input font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 text-gray-600 cursor-pointer min-w-[120px]"
                        value={searchScope}
                        onChange={(e) => setSearchScope(e.target.value as 'description' | 'category' | 'both')}
                        title="Escopo da busca"
                      >
                        <option value="description">Descrição</option>
                        <option value="category">Grupo</option>
                        <option value="both">Ambos</option>
                      </select>

                      <select
                        className="rounded-[6px] border border-gray-200 px-3 py-2 text-form-input font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-blue-50 text-blue-700 border-blue-100 cursor-pointer min-w-[130px]"
                        value={searchMode}
                        onChange={(e) => setSearchMode(e.target.value as 'exact' | 'all-words')}
                        title="Modo da busca"
                      >
                        <option value="exact">Frase Exata</option>
                        <option value="all-words">Palavras</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Filtros de Base/Configuração */}
                <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-50 rounded-[10px] border border-gray-100 transition-all">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Base:</label>
                    <select
                      className="bg-transparent text-form-input font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer max-w-[150px]"
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
                    <label className="text-xs font-bold text-gray-400 uppercase">Referência:</label>
                    <select
                      className="bg-transparent text-form-input font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer"
                      value={searchReference}
                      onChange={(e) => {
                        setSearchReference(e.target.value);
                        onUpdateSettings({ ...settings, referenceMonth: e.target.value });
                      }}
                    >
                      {references.map(ref => (
                        <option key={ref.referenceDate} value={ref.referenceDate}>{ref.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="h-4 w-[1px] bg-gray-200" />

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Estado:</label>
                    <select
                      className="bg-transparent text-form-input font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer"
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
                    <label className="text-xs font-bold text-gray-400 uppercase">Encargos:</label>
                    <select
                      className="bg-transparent text-form-input font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer"
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

                  <div className="ml-auto text-xs text-gray-400 flex items-center gap-3">
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
                  <label className="flex items-center gap-2.5 text-form-label font-bold text-gray-600 cursor-pointer select-none hover:text-blue-700 transition-colors">
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
                    <Button
                      onClick={handleBulkAdd}
                      className="gap-2 text-button animate-in zoom-in-95"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" /> Incluir {selectedSearchItems.length} {selectedSearchItems.length === 1 ? 'Item' : 'Itens'}
                    </Button>
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
                        className={`p-3 hover:bg-blue-50 cursor-pointer border rounded-[10px] group transition-all relative ${(!showOnlyFavorites || favorites.includes(result.code)) ? 'block' : 'hidden'} ${selectedSearchItems.find(i => i.code === result.code) ? 'border-blue-400 bg-blue-50/30 shadow-sm' : 'border-gray-100 bg-white'}`}
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
                              className="p-1 px-1.5 rounded-[6px] hover:bg-white shadow-sm transition-all z-10 border border-transparent hover:border-amber-200"
                              title={favorites.includes(result.code) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                            >
                              <Star className={`w-3.5 h-3.5 ${favorites.includes(result.code) ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}`} />
                            </button>
                            <span className="font-bold text-gray-700 text-sm">{result.code}</span>
                            {getTypeBadge(result.type)}
                            {searchDatabase === 'GENERAL' && (
                              <span className="flex items-center gap-1 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-xs font-bold border border-amber-100">
                                <Database className="w-2.5 h-2.5" /> BASE PRÓPRIA
                              </span>
                            )}
                            <span className="mx-1 text-gray-300">|</span>
                            <span className="text-xs text-gray-500 uppercase">{result.category}</span>
                          </div>
                          <span className="text-emerald-600 font-bold text-sm">R$ {result.price.toFixed(2)}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1 leading-snug whitespace-normal break-words">{result.description}</p>
                        <div className="flex justify-between items-end mt-2">
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-medium uppercase">{result.unit}</span>
                          <div className="flex items-center gap-2">
                            {searchDatabase === 'GENERAL' && (
                              <button
                                onClick={(e) => handleDeleteCustomItem(e, result.code)}
                                className="text-button text-red-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded"
                              >
                                <Trash2 className="w-3 h-3" /> Excluir
                              </button>
                            )}
                             <button
                                onClick={(e) => { e.stopPropagation(); handleAddItem(result); }}
                                className="text-button text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-blue-100/70 hover:bg-blue-200 px-2 py-1 rounded-[6px] border border-blue-200/50 shadow-sm z-10"
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
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Save className="w-5 h-5 text-emerald-600" />
                  Salvar Nova Versão
                </h3>
                <button onClick={() => setIsVersionModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-[6px] hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-[10px] flex items-center justify-between">
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
                      className="w-full rounded-[6px] border border-gray-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none text-sm resize-none"
                      value={versionDescription}
                      onChange={(e) => setVersionDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3 pt-6 border-t border-gray-100 mt-6">
                    <button onClick={() => setIsVersionModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-[6px] text-gray-700 hover:bg-gray-50 font-medium transition-colors">Cancelar</button>
                    <button onClick={handleSaveVersion} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium shadow-sm transition-all active:scale-95">Salvar Versão</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }
      {/* Modal de memória técnica do item */}
      {
        selectedDetailsItem && (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-600 p-2.5 rounded-[6px] text-white shadow-sm">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900">Memória técnica do item</h3>
                    <p className="text-xs text-gray-500 font-mono mt-1">{selectedDetailsItem.sinapiItem?.code || '---'} · {selectedDetailsItem.sinapiItem?.description || 'Sem descrição'}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedDetailsItem(null)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors" title="Fechar">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Classe de precisão</label>
                    <select
                      value={selectedDetailsItem.precisionClass || ''}
                      onChange={(e) => setSelectedDetailsItem(prev => prev ? { ...prev, precisionClass: e.target.value ? e.target.value as BudgetEntry['precisionClass'] : undefined } : prev)}
                      className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                      <option value="">Não definida</option>
                      <option value="A">A - Projeto executivo</option>
                      <option value="B">B - Projeto básico</option>
                      <option value="C">C - Anteprojeto</option>
                      <option value="D">D - Estudo preliminar</option>
                      <option value="E">E - Estimativa paramétrica</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Status do item</label>
                    <select
                      value={selectedDetailsItem.status || 'Rascunho'}
                      onChange={(e) => setSelectedDetailsItem(prev => prev ? { ...prev, status: e.target.value as BudgetEntry['status'] } : prev)}
                      className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                      {['Rascunho', 'Em revisão', 'Aguardando aprovação', 'Aprovado', 'Congelado', 'Substituído', 'Cancelado'].map(status => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Disciplina</label>
                    <input
                      value={selectedDetailsItem.discipline || ''}
                      onChange={(e) => setSelectedDetailsItem(prev => prev ? { ...prev, discipline: e.target.value } : prev)}
                      className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Ex: Estrutura"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Responsável</label>
                    <input
                      value={selectedDetailsItem.responsible || ''}
                      onChange={(e) => setSelectedDetailsItem(prev => prev ? { ...prev, responsible: e.target.value } : prev)}
                      className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Nome ou equipe"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    ['block', 'Bloco'],
                    ['tower', 'Torre'],
                    ['floor', 'Pavimento'],
                    ['room', 'Ambiente']
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">{label}</label>
                      <input
                        value={(selectedDetailsItem.location as any)?.[key] || ''}
                        onChange={(e) => setSelectedDetailsItem(prev => prev ? { ...prev, location: { ...(prev.location || {}), [key]: e.target.value } } : prev)}
                        className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Fórmula / memória de cálculo</label>
                    <textarea
                      rows={4}
                      value={selectedDetailsItem.calculationMemory?.formula || ''}
                      onChange={(e) => setSelectedDetailsItem(prev => prev ? { ...prev, calculationMemory: { ...(prev.calculationMemory || {}), formula: e.target.value } } : prev)}
                      className="w-full rounded-[6px] border border-gray-200 p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono"
                      placeholder="Ex: (comprimento x altura) - vãos"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Resultado calculado</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={selectedDetailsItem.calculationMemory?.result ?? ''}
                      onChange={(e) => setSelectedDetailsItem(prev => prev ? { ...prev, calculationMemory: { ...(prev.calculationMemory || {}), result: e.target.value === '' ? undefined : Number(e.target.value) } } : prev)}
                      className="w-full rounded-[6px] border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Quantidade auditável"
                    />
                    <label className="mt-4 flex items-center gap-2 text-sm font-bold text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!selectedDetailsItem.calculationMemory?.approved}
                        onChange={(e) => setSelectedDetailsItem(prev => prev ? { ...prev, calculationMemory: { ...(prev.calculationMemory || {}), approved: e.target.checked, approvedAt: e.target.checked ? new Date().toISOString() : undefined } } : prev)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Quantidade aprovada
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Justificativa / premissas</label>
                  <textarea
                    rows={4}
                    value={selectedDetailsItem.calculationMemory?.justification || ''}
                    onChange={(e) => setSelectedDetailsItem(prev => prev ? { ...prev, calculationMemory: { ...(prev.calculationMemory || {}), justification: e.target.value } } : prev)}
                    className="w-full rounded-[6px] border border-gray-200 p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    placeholder="Explique origem da quantidade, documentos usados, premissas, exclusões ou baixa precisão."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Observações internas</label>
                  <textarea
                    rows={3}
                    value={selectedDetailsItem.notes || ''}
                    onChange={(e) => setSelectedDetailsItem(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                    className="w-full rounded-[6px] border border-gray-200 p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                <div className="text-xs text-gray-500">
                  A quantidade principal do item continua em {selectedDetailsItem.quantity.toLocaleString('pt-BR')} {selectedDetailsItem.sinapiItem?.unit || ''}; o resultado calculado serve para auditoria e conferência.
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setSelectedDetailsItem(null)} className="px-4 py-2 border border-gray-300 rounded-[6px] text-gray-700 hover:bg-white font-medium transition-colors">Cancelar</button>
                  <button onClick={handleSaveDetails} className="px-5 py-2 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-bold shadow-sm transition-all flex items-center gap-2">
                    <Save className="w-4 h-4" /> Salvar memória
                  </button>
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
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-7xl h-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 items-center">
                  <div className="bg-blue-600 p-2.5 rounded-[6px] text-white shadow-lg shadow-blue-100 flex items-center justify-center w-12 h-12">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">Composição de Preço Unitário (CPU)</h3>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => onToggleFavorite(e, selectedCPUItem.sinapiItem?.code || '')}
                      className={`p-1.5 px-2 rounded-[6px] shadow-sm transition-all z-10 border flex items-center gap-1.5 font-bold text-xs uppercase ${favorites.includes(selectedCPUItem.sinapiItem?.code || '') ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-gray-400 border-gray-100 hover:border-amber-200'}`}
                      title={favorites.includes(selectedCPUItem.sinapiItem?.code || '') ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                    >
                      <Star className={`w-3.5 h-3.5 ${favorites.includes(selectedCPUItem.sinapiItem?.code || '') ? 'fill-amber-500 text-amber-500' : ''}`} />
                      {favorites.includes(selectedCPUItem.sinapiItem?.code || '') ? 'Favorito' : 'Favoritar'}
                    </button>
                    <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-sm">{selectedCPUItem.sinapiItem?.code || '---'}</span>
                  </div>
                  <p className="text-form-label text-gray-500 font-medium leading-tight max-w-2xl uppercase">
                    {selectedCPUItem.sinapiItem?.description || 'Sem descrição'}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right whitespace-nowrap">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Preço Unitário</p>
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
                <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-4 shadow-sm py-2 bg-gray-50 rounded-t-lg">
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
                      <div key={`${selectedCPUItem.id}-modal-comp-${idx}`} className="grid grid-cols-12 gap-2 items-center text-sm text-gray-600 hover:bg-blue-50/50 py-2.5 px-4 rounded-[6px] border border-transparent hover:border-blue-100 transition-all">
                        <div className="col-span-1 font-mono text-xs text-center text-gray-500">{comp.code}</div>
                        <div className="col-span-1 flex justify-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${comp.type === SinapiType.COMPOSITION ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                            {comp.type === SinapiType.COMPOSITION ? 'COMP' : 'INS'}
                          </span>
                        </div>
                        <div className="col-span-3 flex flex-col">
                          <span className="leading-tight text-form-label font-medium text-gray-700">{comp.description}</span>
                        </div>
                        <div className="col-span-1 text-center text-gray-400 font-medium">{comp.unit || '-'}</div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            step="0.0001"
                            value={comp.quantity || 0}
                            onChange={(e) => handleUpdateComposition(selectedCPUItem.id, idx, { quantity: Number(e.target.value) })}
                            className="w-full text-center outline-none bg-white border border-gray-200 rounded-[6px] py-1 text-sm focus:ring-2 focus:ring-blue-500 font-medium"
                          />
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center justify-center gap-1 bg-white border border-gray-200 rounded-[6px] px-1 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
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
                    <span className="bg-white px-4 py-2 rounded-[6px] border border-gray-200 shadow-sm text-blue-600">
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
                    className={`px-6 py-2.5 rounded-[6px] font-bold text-sm transition-all shadow-sm flex items-center gap-2 ${hasCPUChanges ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100' : 'bg-gray-200 text-gray-500 cursor-default'}`}
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
            <div className={`px-4 py-3 rounded-[10px] shadow-2xl flex items-center gap-3 min-w-[300px] text-white ${notification.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
              {notification.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
              <button onClick={() => setNotification(null)} className="ml-auto text-white/70 hover:text-white">
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
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Box className="w-6 h-6 text-blue-600" />
                    Orçamento Paramétrico
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">Gere estimativas baseadas em índices técnicos e de mercado.</p>
                </div>
                <button onClick={() => setIsParametricModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-[6px] text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">

                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex gap-2">
                  <button
                    onClick={() => handleOpenParametric('FINANCIAL')}
                    className={`flex-1 py-2 px-3 rounded-[6px] text-sm font-bold transition-all ${parametricType === 'FINANCIAL' ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    Estimativa Financeira (CUB)
                  </button>
                  <button
                    onClick={() => handleOpenParametric('QUANTITATIVE')}
                    className={`flex-1 py-2 px-3 rounded-[6px] text-sm font-bold transition-all ${parametricType === 'QUANTITATIVE' ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    Insumos Base (NBR 12721)
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  {parametricType === 'FINANCIAL' ? (
                    <div className="bg-blue-50/50 p-4 rounded-[10px] border border-blue-100">
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
                      <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                        Cálculo baseado no VGV estimado utilizando o CUB estadual e pesos estatísticos por fase da obra.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-indigo-50/50 p-4 rounded-[10px] border border-indigo-100">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-indigo-700 font-bold">Lote Básico NBR 12721</span>
                        <span className="bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded text-xs font-bold uppercase">{settings.standard}</span>
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

                      <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                        Cálculo de quantidades exatas de materiais e mão de obra por m² conforme a Norma NBR 12721.
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-gray-600 italic bg-amber-50 p-3 rounded-[10px] border border-amber-100 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Esta ação irá criar novos itens no seu orçamento baseados na Área ({settings.area}m²) e Padrão ({settings.standard}) definidos nas configurações.</span>
                  </div>

                  <div className="flex flex-col gap-3 mt-4">
                    <button
                      onClick={() => handleGenerateParametric('REPLACE')}
                      className="w-full py-3 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-[6px] font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Substituir Orçamento Atual
                    </button>
                    <Button
                      onClick={() => handleGenerateParametric('APPEND')}
                      className="w-full font-semibold justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar/Mesclar Itens
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end p-4 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => setIsParametricModalOpen(false)}
                    className="px-6 py-2 bg-white border border-gray-200 rounded-[6px] text-gray-600 hover:bg-gray-50 font-bold text-button uppercase tracking-widest transition-all"
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