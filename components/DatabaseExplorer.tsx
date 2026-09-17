import React from 'react';
import { useStore } from '../store/useStore';
import {
    Search,
    Database,
    Layers,
    Package,
    Box,
    X,
    ArrowLeft,
    Info,
    Maximize2,
    Save,
    Trash,
    Plus,
    Upload,
    FileSpreadsheet,
    Star,
    Edit,
    Copy,
    FolderTree,
    FolderPlus,
    Calendar
} from 'lucide-react';
import { sinapiService, SinapiReference } from '../services/sinapiService';
import { customDatabaseService } from '../services/customDatabaseService';
import { supabase } from '../lib/supabase';
import { SinapiItem, SinapiType, BudgetEntry, CompositionComponent } from '../types';
import SaveConfirmationModal from './SaveConfirmationModal';
import DatabasePickerModal from './DatabasePickerModal';
import DatabaseManagerModal from './DatabaseManagerModal';
import DatabaseExcelImportModal from './DatabaseExcelImportModal';
import SinapiImportModal from './SinapiImportModal';
import { CustomDatabase } from '../types';
import ExcelJS from 'exceljs';
import { formatMoney } from './ui/Format';
import { usePersistedState } from './ui/TableUtils';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import { TabsBar } from './ui/TabsBar';
import { FilterPopover } from './ui/FilterPopover';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';

// As duas abas (§19.1) são as duas bases que a tela consulta. O id persiste na
// mesma chave do antigo <select> "Base de Dados", então quem já tinha a base
// própria escolhida continua nela.
type BaseTab = 'SINAPI' | 'GENERAL';

const BASE_TABS: { id: BaseTab; label: string }[] = [
    { id: 'SINAPI', label: 'SINAPI' },
    { id: 'GENERAL', label: 'Base própria' },
];

// Título/subtítulo acompanham a aba ativa (§19.1/§20).
const VIEW_HEADERS: Record<BaseTab, { title: string; subtitle: string }> = {
    SINAPI: { title: 'Composições', subtitle: 'Pesquise e consulte composições, serviços e insumos do SINAPI.' },
    GENERAL: { title: 'Composições', subtitle: 'Pesquise e mantenha composições, serviços e insumos da sua base própria.' },
};

// Colunas de DADO (§6.10) — "Ações" entra por `actions`. Larguras iniciais
// aproximam a largura útil da tela; o autofit/arraste ajustam a partir daqui.
const EXPLORER_COLUMNS: StandardTableColumn[] = [
    { key: 'code', label: 'Item', sortable: true, width: 150 },
    { key: 'type', label: 'Tipo', sortable: true, width: 130 },
    { key: 'nature', label: 'Natureza', sortable: true, width: 130 },
    { key: 'description', label: 'Descrição', sortable: true, width: 520 },
    { key: 'unit', label: 'Unid.', sortable: true, width: 90, align: 'center' },
    { key: 'price', label: 'Preço unitário', sortable: true, width: 150, align: 'right' },
    { key: 'category', label: 'Grupo', sortable: true, width: 200, defaultHidden: true },
];

// Status em texto colorido simples (§8) — sem pílula, sem fundo, sem caixa alta.
const TYPE_LABEL: Record<string, string> = {
    [SinapiType.COMPOSITION]: 'Composição',
    [SinapiType.SERVICE]: 'Serviço',
    [SinapiType.INPUT]: 'Insumo',
};
const TYPE_COLOR: Record<string, string> = {
    [SinapiType.COMPOSITION]: 'text-blue-700',
    [SinapiType.SERVICE]: 'text-purple-700',
    [SinapiType.INPUT]: 'text-amber-700',
};
const NATURE_COLOR: Record<string, string> = {
    'Mão de Obra': 'text-orange-700',
    'Material': 'text-blue-700',
    'Equipamento': 'text-emerald-700',
};

// Filtros de escolha única da toolbar acoplada (§5.4) — primeira opção é sempre "sem recorte".
const TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: SinapiType.SERVICE, label: 'Serviços / Composições' },
    { value: SinapiType.INPUT, label: 'Insumos' },
];
const NATURE_FILTER_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'Todas' },
    { value: 'Mão de Obra', label: 'Mão de obra' },
    { value: 'Material', label: 'Materiais' },
    { value: 'Equipamento', label: 'Equipamentos' },
];
type SearchScope = 'description' | 'category' | 'both';
type SearchMode = 'exact' | 'all-words';
const SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
    { value: 'description', label: 'Descrição' },
    { value: 'category', label: 'Grupo' },
    { value: 'both', label: 'Ambos' },
];
const MODE_OPTIONS: { value: SearchMode; label: string }[] = [
    { value: 'all-words', label: 'Palavras' },
    { value: 'exact', label: 'Frase exata' },
];
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

// Controles da barra de escopo (§5.3) e da toolbar acoplada: todos h-9, radius 6px (§16).
const SCOPE_SELECT_CLASS = 'h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer';
const SECONDARY_BUTTON_CLASS = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 shrink-0';
const PRIMARY_BUTTON_CLASS = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0';

interface DatabaseExplorerProps {
    budget?: BudgetEntry[];
    favorites: string[];
    onToggleFavorite: (e: React.MouseEvent | React.TouchEvent, code: string) => void;
    onUpdateBudget?: (newBudget: BudgetEntry[]) => void;
}

const DatabaseExplorer: React.FC<DatabaseExplorerProps> = ({ budget, favorites, onToggleFavorite, onUpdateBudget }) => {
    /**
     * Achado C2-01 — importar competência SINAPI reescreve a tabela de preços
     * GLOBAL, que alimenta os orçamentos de todos os tenants (o upsert é por
     * `code, reference_date`: sobrescreve preço existente). Até 2026-09-02 o
     * botão aparecia para qualquer usuário e a Edge Function só conferia que
     * existia uma sessão.
     *
     * Este gate é de USABILIDADE, não de segurança: quem manda é o
     * `exigirGestorDeQualquerOrg` em `supabase/functions/sinapi-import`. Aqui
     * só evita oferecer um botão que vai responder 403 — esconder no navegador
     * nunca protege nada (é a categoria 2 da própria auditoria).
     */
    const session = useStore(s => s.session);
    const organizations = useStore(s => s.organizations);
    const podeImportarSinapi = React.useMemo(() => {
        const email = session?.user?.email?.toLowerCase();
        if (!email) return false;
        return organizations.some(org =>
            (org.members ?? []).some(m =>
                m.email?.toLowerCase() === email && (m.role === 'owner' || m.role === 'admin')
            )
        );
    }, [session, organizations]);

    // Estados de Busca — F2: sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('databaseExplorerFilters:term', '');
    const [searchCode, setSearchCode] = usePersistedState('databaseExplorerFilters:code', '');
    const [searchType, setSearchType] = usePersistedState('databaseExplorerFilters:type', '');
    const [searchGroup, setSearchGroup] = usePersistedState('databaseExplorerFilters:group', '');
    const [searchDatabase, setSearchDatabase] = usePersistedState<BaseTab>('databaseExplorerFilters:database', 'SINAPI');
    const [searchLocation, setSearchLocation] = usePersistedState('databaseExplorerFilters:location', 'MG');
    const [searchCharges, setSearchCharges] = usePersistedState('databaseExplorerFilters:charges', 'SEM_DESONERACAO');
    const [searchReference, setSearchReference] = usePersistedState('databaseExplorerFilters:reference', '');
    const [references, setReferences] = React.useState<SinapiReference[]>([]);
    const [searchNature, setSearchNature] = usePersistedState('databaseExplorerFilters:nature', '');
    const [searchScope, setSearchScope] = usePersistedState<SearchScope>('databaseExplorerFilters:scope', 'description');
    const [searchMode, setSearchMode] = usePersistedState<SearchMode>('databaseExplorerFilters:mode', 'all-words');
    const [results, setResults] = React.useState<SinapiItem[]>([]);
    const [loadingResults, setLoadingResults] = React.useState(false);
    const [dbSize, setDbSize] = React.useState(0);
    const [categories, setCategories] = React.useState<string[]>([]);
    const [customCategories, setCustomCategories] = React.useState<Set<string>>(new Set());
    const [isGroupManagerOpen, setIsGroupManagerOpen] = React.useState(false);
    const [showOnlyFavorites, setShowOnlyFavorites] = usePersistedState('databaseExplorerFilters:onlyFavorites', false);
    const confirm = useConfirm();

    // Notificações inline (substitui alert() nativo)
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const notify = React.useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4000);
    }, []);

    // Estado para visualização da CPU (detalhes do item)
    const [selectedItem, setSelectedItem] = React.useState<SinapiItem | null>(null);
    const [auxiliaryItems, setAuxiliaryItems] = React.useState<Map<string, SinapiItem>>(new Map());
    const [isLoadingAuxiliary, setIsLoadingAuxiliary] = React.useState(false);
    const [navigationHistory, setNavigationHistory] = React.useState<SinapiItem[]>([]);

    const handleSelectItem = (item: SinapiItem) => {
        setNavigationHistory([]);
        setAuxiliaryItems(new Map()); // Bug 4: reset ao trocar de item
        setSelectedItem(item);
    };

    const handleDrillDown = (item: SinapiItem) => {
        if (selectedItem) {
            setNavigationHistory(prev => [...prev, selectedItem]);
        }
        setSelectedItem(item);
    };

    const handleGoBack = () => {
        if (navigationHistory.length === 0) return;
        const prevHistory = [...navigationHistory];
        const lastItem = prevHistory.pop();
        setNavigationHistory(prevHistory);
        setSelectedItem(lastItem || null);
    };

    const handleCloseModal = () => {
        setSelectedItem(null);
        setNavigationHistory([]);
    };

    // Estados de Salvamento
    const [isSaveModalOpen, setIsSaveModalOpen] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);


    // Estado do Picker de Componentes
    const [isPickerOpen, setIsPickerOpen] = React.useState(false);

    // Estado da Base de Dados
    const [currentDatabase, setCurrentDatabase] = React.useState<CustomDatabase | null>(null);
    const [isDbManagerOpen, setIsDbManagerOpen] = React.useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
    const [isSinapiImportOpen, setIsSinapiImportOpen] = React.useState(false);
    const [databases, setDatabases] = React.useState<CustomDatabase[]>([]);


    // Carregar bases de dados
    const loadDatabases = React.useCallback(async () => {
        try {
            const dbs = await customDatabaseService.listDatabases();
            setDatabases(dbs);

            // Se tivermos bases e nenhuma selecionada, selecione a primeira
            setCurrentDatabase(prev => (prev === null && dbs.length > 0) ? dbs[0] : prev);
        } catch (error) {
            console.error("Erro ao carregar bases:", error);
        }
    }, []);

    // Inicialização
    React.useEffect(() => {
        const init = async () => {
            setDbSize(sinapiService.databaseSize);

            // Competências SINAPI disponíveis (mais recente como default).
            const refs = await sinapiService.getReferences();
            setReferences(refs);
            setSearchReference(prev => prev || refs[0]?.referenceDate || '');

            const cats = await sinapiService.getCategories();
            setCategories(cats);

            // Identificar categorias que existem na base própria
            try {
                const { data: customData } = await supabase
                    .from('custom_items')
                    .select('category')
                    .not('category', 'is', null)
                    .neq('category', '');

                const customSet = new Set<string>();
                (customData || []).forEach((d: { category: string }) => customSet.add(d.category));
                setCustomCategories(customSet);
            } catch (error) {
                console.error("Erro ao carregar categorias customizadas:", error);
            }

            await loadDatabases();
        };
        init();
    }, []);

    const handleRenameGroup = async (oldName: string, newName: string) => {
        try {
            await customDatabaseService.renameGroup(oldName, newName, currentDatabase?.id);
            // Atualiza o estado local das categorias
            setCategories(prev => prev.map(c => c === oldName ? newName : c).sort());
            if (customCategories.has(oldName)) {
                const newCustom = new Set(customCategories);
                newCustom.delete(oldName);
                newCustom.add(newName);
                setCustomCategories(newCustom);
            }
            // Se o filtro atual for o grupo renomeado, atualiza ele também
            if (searchGroup === oldName) setSearchGroup(newName);
        } catch (error) {
            console.error("Erro ao renomear grupo:", error);
            notify("Erro ao renomear grupo.", 'error');
        }
    };

    const handleDeleteGroup = async (name: string, deleteItems: boolean) => {
        try {
            await customDatabaseService.deleteGroup(name, deleteItems, currentDatabase?.id);
            // Atualiza o estado local
            setCategories(prev => prev.filter(c => c !== name));
            const newCustom = new Set(customCategories);
            newCustom.delete(name);
            setCustomCategories(newCustom);
            // Limpa filtro se necessário
            if (searchGroup === name) setSearchGroup('');
        } catch (error) {
            console.error("Erro ao excluir grupo:", error);
            notify("Erro ao excluir grupo.", 'error');
        }
    };

    const handleDuplicateGroup = async (sourceName: string, targetName: string) => {
        try {
            // Verifica se a origem é customizada ou SINAPI
            const isCustom = customCategories.has(sourceName);
            const count = await customDatabaseService.duplicateGroup(sourceName, targetName, {
                sourceBase: isCustom ? 'CUSTOM' : 'SINAPI',
                targetDatabaseId: currentDatabase?.id
            });

            if (count > 0) {
                // Adiciona às categorias se for nova
                if (!categories.includes(targetName)) {
                    setCategories(prev => [...prev, targetName].sort());
                }
                const newCustom = new Set(customCategories);
                newCustom.add(targetName);
                setCustomCategories(newCustom);

                notify(`${count} itens duplicados para o grupo "${targetName}".`, 'success');
            }
        } catch (error) {
            console.error("Erro ao duplicar grupo:", error);
            notify("Erro ao duplicar grupo.", 'error');
        }
    };

    const handleCreateGroup = (name: string) => {
        if (!name) return;
        if (categories.includes(name)) {
            notify("Este grupo já existe.", 'error');
            return;
        }
        setCategories(prev => [...prev, name].sort());
        const newCustom = new Set(customCategories);
        newCustom.add(name);
        setCustomCategories(newCustom);
    };

    // Recarregar quando o modal de gerenciamento fechar
    React.useEffect(() => {
        if (!isDbManagerOpen) {
            loadDatabases();
        }
    }, [isDbManagerOpen, loadDatabases]);

    // Effect to recursively fetch missing compositions for CPU view
    React.useEffect(() => {
        if (!selectedItem || !selectedItem.composition || selectedItem.composition.length === 0) return;

        let cancelled = false;

        const loadAuxiliaryItems = async () => {
            setIsLoadingAuxiliary(true);

            // Bug 4: sempre inicia com mapa limpo — Bug 3: não usa auxiliaryItems do closure
            const currentMap = new Map<string, SinapiItem>();
            const resolvedCodes = new Set<string>();
            const itemsToResolve = new Set<string>();

            selectedItem.composition!.forEach((comp: CompositionComponent) => {
                itemsToResolve.add(comp.code);
            });

            let safety = 0;

            while (itemsToResolve.size > 0 && safety < 5 && !cancelled) {
                safety++;
                const batch = Array.from(itemsToResolve);
                itemsToResolve.clear();

                if (batch.length === 0) break;

                try {
                    const fetched = await sinapiService.getItemsByCodes(
                        batch,
                        searchLocation,
                        searchCharges,
                        searchReference
                    );

                    if (cancelled) break;

                    fetched.forEach(item => {
                        const existing = currentMap.get(item.code);
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
                    console.error("Error batch fetching compositions in Explorer:", error);
                    break;
                }
            }

            // Bug 3: só atualiza estado se o efeito ainda é válido
            if (!cancelled) {
                setAuxiliaryItems(currentMap);
                setIsLoadingAuxiliary(false);
            }
        };

        loadAuxiliaryItems();
        return () => { cancelled = true; };
    }, [selectedItem?.code, searchLocation, searchCharges, searchReference]);

    // Lógica de Busca
    const handleSearch = React.useCallback(async () => {
        if (searchDatabase === 'SINAPI' && !searchTerm && !searchCode && !searchGroup && !searchType && !showOnlyFavorites) {
            setResults([]);
            return;
        }

        setLoadingResults(true);
        try {
            let results: SinapiItem[] = [];
            const filters = {
                code: searchCode,
                group: searchGroup,
                type: searchType,
                state: searchLocation,
                chargeType: searchCharges,
                searchScope: searchScope,
                searchMode: searchMode,
                nature: searchNature,
                referenceDate: searchReference,
                codes: showOnlyFavorites ? favorites : undefined
            };

            if (searchDatabase === 'SINAPI') {
                results = await sinapiService.search(searchTerm, filters);
            } else {
                // currentDatabase=null significa "Base Geral" — sem filtro de database_id para
                // mostrar TODOS os itens próprios (legados com null e novos com UUID).
                results = await customDatabaseService.search(searchTerm, {
                    type: searchType,
                    category: searchGroup,
                    code: searchCode,
                    searchScope: searchScope,
                    searchMode: searchMode,
                    databaseId: currentDatabase?.id,
                    codes: showOnlyFavorites ? favorites : undefined
                });
            }
            setResults(results.map(item => ({
                ...item,
                isFavorite: favorites.includes(item.code)
            })));
        } catch (error) {
            console.error("Erro na busca:", error);
        } finally {
            setLoadingResults(false);
        }
    }, [searchTerm, searchCode, searchType, searchNature, searchGroup, searchDatabase, searchLocation, searchCharges, searchReference, favorites, showOnlyFavorites, currentDatabase]);

    // Lógica para atualizar a composição (simulação no explorador)
    const handleUpdateComposition = (updates: Partial<CompositionComponent>, index: number) => {
        if (!selectedItem || !selectedItem.composition) return;

        const newComposition = [...selectedItem.composition];
        newComposition[index] = { ...newComposition[index], ...updates };

        // Recalcular o preço do item pai baseado na nova composição
        // Usa o mesmo fallback do display: comp.price tem precedência, senão busca em auxiliaryItems
        const newPrice = newComposition.reduce((sum, comp) => {
            const resolvedPrice = comp.price || auxiliaryItems.get(comp.code)?.price || 0;
            return sum + (comp.quantity * resolvedPrice);
        }, 0);

        setSelectedItem({
            ...selectedItem,
            composition: newComposition,
            price: newPrice
        });

        // Também atualiza na lista de resultados para manter consistência visual
        setResults(prev => prev.map(item =>
            item.code === selectedItem.code ? { ...item, composition: newComposition, price: newPrice } : item
        ));
    };

    // Função para resolver natureza do category ou nature field
    const resolveNatureFromCategory = (item: SinapiItem | undefined | null): string | null => {
        const cat = (item?.category || '').toLowerCase();
        if (cat.includes('equipamento') || cat.includes('custos horários') || cat.includes('custos horarios')) return 'Equipamento';
        if (cat.includes('cálculos e parâmetros') || cat.includes('calculos e parametros') || cat.includes('encargos') || cat.includes('mão de obra') || cat.includes('mao de obra')) return 'Mão de Obra';
        return item?.nature || null;
    };

    // Função recursiva para encontrar naturezas dos itens folha
    const getLeafNatures = React.useCallback((itemCode: string, visited = new Set<string>()): Set<string> => {
        if (visited.has(itemCode)) return new Set();
        visited.add(itemCode);

        const item = auxiliaryItems.get(itemCode);
        if (!item) return new Set();

        // Se for leaf (INPUT ou não-COMPOSITION), retorna sua natureza
        if (item.type !== SinapiType.COMPOSITION) {
            const nature = resolveNatureFromCategory(item);
            return new Set(nature ? [nature] : []);
        }

        // Se for COMPOSITION, expande seus componentes
        const leafNatures = new Set<string>();
        for (const comp of (item.composition || [])) {
            const childNatures = getLeafNatures(comp.code, visited);
            childNatures.forEach(n => leafNatures.add(n));
        }

        return leafNatures;
    }, [auxiliaryItems]);

    const handleAddComponent = () => {
        setIsPickerOpen(true);
    };

    const handleComponentSelect = (item: SinapiItem) => {
        if (!selectedItem) return;

        const newComp = {
            code: item.code,
            description: item.description,
            unit: item.unit,
            price: item.price,
            quantity: 1,
            type: item.type,
            source: item.source || 'SINAPI'
        };

        const newComposition = [...(selectedItem.composition || []), newComp];
        setSelectedItem({ ...selectedItem, composition: newComposition });
        setIsPickerOpen(false);
    };

    const handleRemoveComponent = (index: number) => {
        if (!selectedItem || !selectedItem.composition) return;
        const newComposition = selectedItem.composition.filter((_, i) => i !== index);
        setSelectedItem({ ...selectedItem, composition: newComposition });
    };

    // Lógica de Salvamento
    const handleSave = async (target: 'budget' | 'origin' | 'new_copy') => {
        if (!selectedItem) return;

        if (selectedItem.code === 'NOVO' && (target === 'origin' || target === 'new_copy')) {
            notify('Por favor, defina um código válido para o item antes de salvar.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            if (target === 'budget') {
                if (budget && onUpdateBudget) {
                    const itemInBudget = budget.some(entry => entry.sinapiItem.code === selectedItem.code);
                    if (!itemInBudget) {
                        notify('Este item não está no orçamento ativo. Selecione "Atualizar na Base de Dados" para salvar.', 'error');
                        return;
                    }
                    const updatedBudget = budget.map(entry => {
                        if (entry.sinapiItem.code === selectedItem.code) {
                            return {
                                ...entry,
                                sinapiItem: selectedItem // Atualiza com o item modificado
                            };
                        }
                        return entry;
                    });
                    onUpdateBudget(updatedBudget);
                    notify('Orçamento atualizado com sucesso!', 'success');
                }
            } else if (target === 'new_copy') {
                const newItem = { ...selectedItem };
                // Garante que é tratado como um novo item
                delete (newItem as SinapiItem & { id?: string }).id; // Remove ID técnico se existir

                // Gera um novo código se for SINAPI (pois não podemos sobrescrever SINAPI na base custom)
                // Se já for custom, o usuário pode estar querendo criar uma cópia
                newItem.code = `${newItem.code}-COPY`;
                newItem.description = `${newItem.description} (Cópia)`;

                // Resolve o banco de destino: usa selecionado, senão primeiro disponível
                const targetDb = currentDatabase || databases[0] || null;
                if (!targetDb) {
                    notify("Por favor, selecione ou crie uma Base Própria antes de salvar cópias.", 'error');
                    setIsSaveModalOpen(false);
                    setIsSaving(false);
                    return;
                }
                if (!currentDatabase) {
                    setCurrentDatabase(targetDb);
                }
                newItem.database_id = targetDb.id;

                await customDatabaseService.saveItem(newItem);
                setSelectedItem(newItem); // Muda o foco para o novo item
                notify(`Novo item criado com código: ${newItem.code}`, 'success');

                // Garante que a lista reflita o novo item
                if (searchDatabase !== 'GENERAL') {
                    setSearchDatabase('GENERAL');
                    setSearchCode(newItem.code);
                } else {
                    handleSearch();
                }
            } else if (target === 'origin') {
                // Bug 2: não mutar selectedItem diretamente — criar cópia
                const itemToSave = (!selectedItem.database_id && currentDatabase)
                    ? { ...selectedItem, database_id: currentDatabase.id }
                    : selectedItem;

                if (!selectedItem.database_id && currentDatabase) {
                    setSelectedItem(itemToSave);
                }

                await customDatabaseService.saveItem(itemToSave);
                notify('Item atualizado na base de dados com sucesso!', 'success');

                // Recarrega a lista (muda para base própria se necessário)
                if (searchDatabase !== 'GENERAL') {
                    setSearchDatabase('GENERAL');
                } else {
                    handleSearch();
                }
            }
            setIsSaveModalOpen(false);
        } catch (error) {
            console.error('Erro ao salvar:', error);
            notify('Erro ao processar o salvamento.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteItem = async (e: React.MouseEvent, item: SinapiItem) => {
        e.stopPropagation(); // Evita abrir o modal ao clicar em excluir

        const isCustomMode = searchDatabase === 'GENERAL';
        if (!isCustomMode && !item.isOverride) return;

        // §14 — useConfirm(), nunca confirm() nativo
        const ok = await confirm(item.isOverride
            ? { title: `Restaurar o item ${item.code}?`, message: 'O item volta ao padrão original do SINAPI. Suas alterações serão perdidas.', variant: 'warning', confirmLabel: 'Restaurar' }
            : { title: `Excluir o item ${item.code}?`, message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' });
        if (!ok) return;

        try {
            await customDatabaseService.deleteItem(item.code, currentDatabase?.id);
            notify(item.isOverride ? 'Item restaurado ao padrão original!' : 'Item excluído com sucesso!', 'success');
            if (selectedItem?.code === item.code) setSelectedItem(null);
            handleSearch(); // Atualiza a lista
        } catch (error) {
            console.error("Erro ao excluir:", error);
            notify('Erro ao excluir item.', 'error');
        }
    };

    // Lógica de Exclusão
    const handleDelete = async () => {
        if (!selectedItem) return;

        const isCustom = searchDatabase === 'GENERAL';
        const isOverride = selectedItem.isOverride;

        if (!isCustom && !isOverride) return;

        // §14 — useConfirm(), nunca confirm() nativo
        const ok = await confirm(isOverride
            ? { title: `Restaurar o item ${selectedItem.code}?`, message: 'O item volta ao padrão original do SINAPI. Suas alterações serão perdidas.', variant: 'warning', confirmLabel: 'Restaurar' }
            : { title: `Excluir o item ${selectedItem.code}?`, message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' });
        if (!ok) return;

        try {
            await customDatabaseService.deleteItem(selectedItem.code, currentDatabase?.id);
            notify(isOverride ? 'Item restaurado ao padrão original!' : 'Item excluído com sucesso!', 'success');
            setSelectedItem(null);
            handleSearch(); // Atualiza a lista
        } catch (error) {
            console.error("Erro ao excluir:", error);
            notify('Erro ao excluir item.', 'error');
        }
    };

    // Debounce da busca
    React.useEffect(() => {
        const timer = setTimeout(() => {
            handleSearch();
        }, 400);
        return () => clearTimeout(timer);
    }, [handleSearch, favorites, showOnlyFavorites]); // Search depends on favorites to update icons and filtering


    const handleCreate = (type: SinapiType) => {
        if (!currentDatabase) {
            notify("Crie uma base de dados própria primeiro.", 'info');
            setIsDbManagerOpen(true);
            return;
        }

        const newItem: SinapiItem = {
            code: 'NOVO',
            description: 'NOVA DESCRIÇÃO',
            unit: 'UN',
            price: 0,
            type: type,
            source: 'Própria',
            composition: type === SinapiType.COMPOSITION ? [] : undefined,
            category: 'DIVERSOS',
            database_id: currentDatabase.id
        };
        setSelectedItem(newItem);
    };

    const handleImportItems = async (items: SinapiItem[]) => {
        if (!currentDatabase) return;

        // Ensure all items have the database ID
        const itemsWithDb = items.map(item => ({
            ...item,
            database_id: currentDatabase.id
        }));

        try {
            await customDatabaseService.saveBatch(itemsWithDb);
            notify(`${items.length} itens importados com sucesso para ${currentDatabase.name}!`, 'success');
            handleSearch();
        } catch (error) {
            console.error("Erro ao importar:", error);
            notify("Erro ao salvar itens importados. Verifique se o formato do arquivo está correto.", 'error');
        }
    };

    const handleExportDatabase = async () => {
        if (!currentDatabase) return;

        try {
            // Fetch all items from DB (might need pagination or get all endpoint)
            const allItems = await customDatabaseService.search('', { databaseId: currentDatabase.id });

            const workbook = new ExcelJS.Workbook();
            // Remove invalid characters for Excel sheet names: \ / ? * [ ] :
            const sanitizedName = currentDatabase.name.replace(/[\\/?*[\]:]/g, '_').substring(0, 31);
            const worksheet = workbook.addWorksheet(sanitizedName);

            worksheet.columns = [
                { header: 'Código', key: 'code', width: 15 },
                { header: 'Descrição', key: 'description', width: 50 },
                { header: 'Unidade', key: 'unit', width: 10 },
                { header: 'Preço Unitário', key: 'price', width: 15 },
                { header: 'Tipo', key: 'type', width: 15 },
                { header: 'Grupo', key: 'category', width: 20 },
            ];

            allItems.forEach(item => {
                worksheet.addRow({
                    code: item.code,
                    description: item.description,
                    unit: item.unit,
                    price: item.price,
                    type: item.type === SinapiType.COMPOSITION ? 'COMPOSIÇÃO' : 'INSUMO',
                    category: item.category
                });
            });

            // Styling
            worksheet.getRow(1).font = { bold: true };

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${currentDatabase.name}_export.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error("Erro ao exportar:", error);
            notify(`Erro ao gerar arquivo de exportação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, 'error');
        }
    };

    // Um "pronto para buscar" só faz sentido no SINAPI sem nenhum recorte — a base
    // própria lista tudo de cara, então lá lista vazia é "nenhum item" mesmo.
    const hasQuery = searchDatabase === 'GENERAL' || !!searchTerm || !!searchCode || !!searchGroup || !!searchType || showOnlyFavorites;
    const header = VIEW_HEADERS[searchDatabase];

    // Célula por coluna — tipografia §7: `text-sm font-normal`, `font-medium` só no preço.
    const renderCell = (key: string, item: SinapiItem): React.ReactNode => {
        switch (key) {
            case 'code': {
                const fav = favorites.includes(item.code);
                return (
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleFavorite(e, item.code); }}
                            className="p-1 rounded-[6px] hover:bg-amber-50 transition-colors shrink-0"
                            title={fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        >
                            <Star className={`w-3.5 h-3.5 ${fav ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}`} />
                        </button>
                        <span className="block truncate text-sm font-normal text-gray-600" title={item.code}>{item.code}</span>
                    </div>
                );
            }
            case 'type':
                return <span className={`text-sm font-normal ${TYPE_COLOR[item.type] ?? 'text-gray-600'}`}>{TYPE_LABEL[item.type] ?? item.type}</span>;
            case 'nature':
                return item.nature
                    ? <span className={`text-sm font-normal ${NATURE_COLOR[item.nature] ?? 'text-gray-600'}`}>{item.nature}</span>
                    : <span className="text-sm font-normal text-gray-300">—</span>;
            case 'description':
                return <span className="block truncate text-sm font-normal text-gray-700" title={item.description}>{item.description}</span>;
            case 'unit':
                return <span className="text-sm font-normal text-gray-600">{item.unit}</span>;
            case 'price':
                return <span className="text-sm font-medium text-gray-800">{formatMoney(item.price)}</span>;
            case 'category':
                return <span className="block truncate text-sm font-normal text-gray-600" title={item.category || ''}>{item.category || '—'}</span>;
            default:
                return null;
        }
    };

    const sortValue = (key: string, item: SinapiItem): string | number | null => {
        switch (key) {
            case 'code': return item.code;
            case 'type': return TYPE_LABEL[item.type] ?? item.type;
            case 'nature': return item.nature || '';
            case 'description': return item.description;
            case 'unit': return item.unit || '';
            case 'price': return item.price || 0;
            case 'category': return item.category || '';
            default: return null;
        }
    };

    return (
        // `h-full flex flex-col relative` fica por causa do modal de detalhe
        // (`absolute inset-0` logo abaixo), que ancora neste bloco — fora do
        // escopo desta tela de lista. O ritmo vertical é o do §20 (`space-y-6`).
        <div className="h-full flex flex-col space-y-6 relative">
            {/* 1. Título — §20 */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{header.title}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{header.subtitle}</p>
            </div>

            {/* 2. Abas — §19.1: qual base está sendo consultada */}
            <TabsBar<BaseTab> tabs={BASE_TABS} value={searchDatabase} onChange={setSearchDatabase}>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                    {results.length > 0 && <>{results.length.toLocaleString('pt-BR')} encontrados · </>}
                    {dbSize.toLocaleString('pt-BR')} itens catalogados
                </span>
            </TabsBar>

            {/* 3. Barra de escopo — §5.3: define QUAL conjunto de dados a tela olha; ação primária à direita (§17) */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    {searchDatabase === 'SINAPI' ? (
                        <>
                            <select
                                className={SCOPE_SELECT_CLASS}
                                value={searchReference}
                                onChange={(e) => setSearchReference(e.target.value)}
                                title="Competência de referência"
                            >
                                {references.map(ref => (
                                    <option key={ref.referenceDate} value={ref.referenceDate}>{ref.label}</option>
                                ))}
                            </select>
                            <select
                                className={SCOPE_SELECT_CLASS}
                                value={searchLocation}
                                onChange={(e) => setSearchLocation(e.target.value)}
                                title="Estado (UF)"
                            >
                                {UFS.map(uf => (
                                    <option key={uf} value={uf}>{uf}</option>
                                ))}
                            </select>
                            <select
                                className={SCOPE_SELECT_CLASS}
                                value={searchCharges}
                                onChange={(e) => setSearchCharges(e.target.value)}
                                title="Encargos sociais"
                            >
                                <option value="SEM_DESONERACAO">Sem desoneração</option>
                                <option value="COM_DESONERACAO">Com desoneração</option>
                            </select>
                            {podeImportarSinapi && (
                                <button
                                    onClick={() => setIsSinapiImportOpen(true)}
                                    className={SECONDARY_BUTTON_CLASS}
                                    title="Importar nova competência SINAPI via planilha"
                                >
                                    <Upload className="w-[15px] h-[15px]" />
                                    Nova competência
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <select
                                className={`${SCOPE_SELECT_CLASS} max-w-[240px]`}
                                value={currentDatabase?.id || ''}
                                onChange={(e) => {
                                    const db = databases.find(d => d.id === e.target.value);
                                    setCurrentDatabase(db || null);
                                }}
                                title="Base própria"
                            >
                                <option value="">Base geral (itens avulsos)</option>
                                {databases.map(db => (
                                    <option key={db.id} value={db.id}>{db.name}</option>
                                ))}
                            </select>
                            <ActionIconButton kind="settings" title="Gerenciar bases" onClick={() => setIsDbManagerOpen(true)} />
                            <ActionIconButton kind="settings" title="Gerenciar grupos" icon={<FolderTree className="w-4 h-4" />} onClick={() => setIsGroupManagerOpen(true)} />
                            {currentDatabase && (
                                <>
                                    <button onClick={() => setIsImportModalOpen(true)} className={SECONDARY_BUTTON_CLASS} title="Importar itens via Excel">
                                        <FileSpreadsheet className="w-[15px] h-[15px]" />
                                        Importar
                                    </button>
                                    <button onClick={handleExportDatabase} className={SECONDARY_BUTTON_CLASS} title="Exportar base para Excel">
                                        <Upload className="w-[15px] h-[15px]" />
                                        Exportar
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleCreate(SinapiType.INPUT)} className={SECONDARY_BUTTON_CLASS}>
                        <Box className="w-[15px] h-[15px]" />
                        Novo insumo
                    </button>
                    <button onClick={() => handleCreate(SinapiType.COMPOSITION)} className={PRIMARY_BUTTON_CLASS}>
                        <Layers className="w-[15px] h-[15px]" />
                        Nova composição
                    </button>
                </div>
            </div>

            {/* 4. Tabela padrão (§6.10) com toolbar acoplada (§5.2): busca no servidor
                (controlada, sem filtro local) + recortes (§5.4) + engrenagem + autofit (§6.1.2) */}
            <StandardTable<SinapiItem>
                storageKey="engenharia:composicoes:tabela"
                columns={EXPLORER_COLUMNS}
                rows={results}
                rowKey={item => item.code}
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder={searchScope === 'category' ? 'Buscar por grupo...' : searchScope === 'both' ? 'Buscar por descrição ou grupo...' : 'Buscar por descrição...'}
                filters={
                    <>
                        <input
                            type="text"
                            placeholder="Código"
                            value={searchCode}
                            onChange={(e) => setSearchCode(e.target.value)}
                            className="h-9 w-28 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            title="Filtrar por código"
                        />
                        <FilterPopover<string> label="Tipo" value={searchType} onChange={setSearchType} options={TYPE_FILTER_OPTIONS} />
                        {searchDatabase === 'SINAPI' && (
                            <FilterPopover<string> label="Natureza" value={searchNature} onChange={setSearchNature} options={NATURE_FILTER_OPTIONS} />
                        )}
                        <select
                            className={`${SCOPE_SELECT_CLASS} max-w-[220px]`}
                            value={searchGroup}
                            onChange={(e) => setSearchGroup(e.target.value)}
                            title="Grupo"
                        >
                            <option value="">Todos os grupos</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <FilterPopover<SearchScope> label="Buscar em" value={searchScope} onChange={setSearchScope} options={SCOPE_OPTIONS} allValue="description" icon={<Search className="w-4 h-4" />} />
                        <FilterPopover<SearchMode> label="Modo" value={searchMode} onChange={setSearchMode} options={MODE_OPTIONS} allValue="all-words" icon={<Search className="w-4 h-4" />} />
                        <button
                            onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                            className={`flex items-center gap-1.5 h-9 px-3 rounded-[6px] border text-sm font-medium whitespace-nowrap transition-all ${
                                showOnlyFavorites ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                            title="Mostrar só os favoritos"
                        >
                            <Star className={`w-4 h-4 ${showOnlyFavorites ? 'fill-amber-500 text-amber-500' : ''}`} />
                            Favoritos
                        </button>
                    </>
                }
                sortValue={sortValue}
                renderCell={renderCell}
                onRowClick={handleSelectItem}
                actions={{
                    width: 190,
                    render: item => (
                        <>
                            <button
                                onClick={() => handleSelectItem(item)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all whitespace-nowrap"
                            >
                                Ver detalhes
                            </button>
                            {(searchDatabase === 'GENERAL' || item.isOverride) && (
                                <ActionIconButton
                                    kind="delete"
                                    size="sm"
                                    title={item.isOverride ? 'Restaurar item SINAPI' : 'Excluir item'}
                                    onClick={(e) => handleDeleteItem(e, item)}
                                />
                            )}
                        </>
                    ),
                }}
                // Só mostra o spinner enquanto ainda não há nada na tela — a cada
                // tecla a busca refaz a consulta e trocar a tabela por spinner piscaria.
                loading={loadingResults && results.length === 0}
                empty={hasQuery
                    ? { icon: <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum item encontrado', subtitle: 'Tente ajustar a busca ou os filtros.' }
                    : { icon: <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Pronto para buscar', subtitle: 'Digite uma descrição ou use os filtros para explorar a base.' }}
                maxHeight="max(320px, calc(100vh - 400px))"
            />

            {/* Modal de Detalhes do Item */}
            {
                selectedItem && (
                    <div className="absolute inset-0 z-[100] flex items-center justify-center p-12 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full h-full flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
                            {/* Header Modal */}
                            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-start gap-6">
                                <div className="flex items-start gap-5 flex-1 min-w-0">
                                    {/* Bloco de Identidade: Ícone + Código */}
                                    <div className="flex flex-col items-center gap-2 shrink-0">
                                        <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-100 flex items-center justify-center w-12 h-12">
                                            <Layers className="w-6 h-6" />
                                        </div>
                                        <div className="w-full">
                                            {selectedItem.source === 'Própria' ? (
                                                <input
                                                    type="text"
                                                    value={selectedItem.code}
                                                    onChange={(e) => setSelectedItem({ ...selectedItem, code: e.target.value })}
                                                    className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-sm w-full text-center outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            ) : (
                                                <div className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-sm text-center">
                                                    {selectedItem.code}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bloco de Informação: Título, Grupo e Descrição */}
                                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <h3 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                                                {selectedItem.source === 'Própria' ? (
                                                    <select
                                                        value={selectedItem.type}
                                                        onChange={(e) => setSelectedItem({ ...selectedItem, type: e.target.value as SinapiType })}
                                                        className="bg-transparent text-xl font-extrabold text-gray-900 outline-none border-b border-dashed border-gray-300 hover:border-blue-500 cursor-pointer"
                                                    >
                                                        <option value={SinapiType.COMPOSITION}>Composição de Preço Unitário</option>
                                                        <option value={SinapiType.INPUT}>Detalhes do Insumo</option>
                                                    </select>
                                                ) : (
                                                    selectedItem.type === SinapiType.COMPOSITION ? 'Composição de Preço Unitário' : 'Detalhes do Insumo'
                                                )}
                                            </h3>

                                            {/* Grupo Badge */}
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-md border border-gray-200 shadow-sm">
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Grupo:</span>
                                                {selectedItem.source === 'Própria' ? (
                                                    <select
                                                        className="bg-transparent text-xs font-bold text-gray-600 outline-none cursor-pointer uppercase"
                                                        value={selectedItem.category}
                                                        onChange={(e) => setSelectedItem({ ...selectedItem, category: e.target.value })}
                                                    >
                                                        <option value="">Sem Grupo</option>
                                                        {categories.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className="text-xs font-bold text-gray-600 uppercase truncate max-w-[200px]">{selectedItem.category || 'Geral'}</span>
                                                )}
                                            </div>

                                            {/* Competência Badge — só para itens SINAPI com versionamento ativo */}
                                            {selectedItem.source !== 'Própria' && searchReference && (
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 rounded-md border border-blue-100 shadow-sm">
                                                    <Calendar className="w-3 h-3 text-blue-400" />
                                                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-tighter">Ref:</span>
                                                    <span className="text-xs font-bold text-blue-600">
                                                        {references.find(r => r.referenceDate === searchReference)?.label || searchReference}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {selectedItem.source === 'Própria' ? (
                                            <input
                                                type="text"
                                                value={selectedItem.description}
                                                onChange={(e) => setSelectedItem({ ...selectedItem, description: e.target.value })}
                                                className="text-sm text-gray-900 font-medium leading-tight w-full uppercase outline-none border-b border-gray-200 focus:border-blue-500 bg-transparent py-0.5"
                                                placeholder="DESCRIÇÃO DO ITEM"
                                            />
                                        ) : (
                                            <p className="text-sm text-gray-500 font-medium leading-tight max-w-4xl uppercase">
                                                {selectedItem.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400 font-bold uppercase whitespace-nowrap">Unidade</p>
                                        {selectedItem.source === 'Própria' ? (
                                            <input
                                                type="text"
                                                value={selectedItem.unit}
                                                onChange={(e) => setSelectedItem({ ...selectedItem, unit: e.target.value })}
                                                className="text-xl font-black text-gray-700 bg-transparent text-right outline-none border-b border-transparent hover:border-blue-200 focus:border-blue-500 transition-colors w-16 px-1"
                                            />
                                        ) : (
                                            <span className="text-xl font-black text-gray-700 block px-1">{selectedItem.unit}</span>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400 font-bold uppercase whitespace-nowrap">Preço Unitário</p>
                                        <div className="flex items-center justify-end gap-1 group/price">
                                            <span className="text-xl font-black text-emerald-600">R$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={selectedItem.price}
                                                onChange={(e) => setSelectedItem({ ...selectedItem, price: Number(e.target.value) })}
                                                className="text-xl font-black text-emerald-600 bg-transparent text-right outline-none border-b border-transparent hover:border-blue-200 focus:border-blue-500 transition-colors w-32 px-1"
                                            />
                                        </div>
                                    </div>
                                    {navigationHistory.length > 0 && (
                                        <button
                                            onClick={handleGoBack}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-button font-bold text-gray-600 hover:bg-gray-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm shrink-0"
                                        >
                                            <ArrowLeft className="w-3.5 h-3.5" />
                                            Voltar
                                        </button>
                                    )}
                                    <button
                                        onClick={handleCloseModal}
                                        className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                    <button
                                        onClick={(e) => onToggleFavorite(e, selectedItem.code)}
                                        className={`p-2 rounded-full transition-colors ${favorites.includes(selectedItem.code) ? 'bg-amber-50 text-amber-500 hover:bg-amber-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                                        title={favorites.includes(selectedItem.code) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                    >
                                        <Star className={`w-6 h-6 ${favorites.includes(selectedItem.code) ? 'fill-amber-500' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Conteúdo Modal */}
                            <div className="flex-1 overflow-y-auto p-6 bg-white">
                                {selectedItem.type === SinapiType.COMPOSITION || (selectedItem.composition && selectedItem.composition.length > 0) ? (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                                <Layers className="w-5 h-5 text-blue-600" />
                                                Composição de Preço Unitário (CPU)
                                            </h4>
                                            <div className="flex items-center gap-4">
                                                <span className="text-xs text-gray-400 font-medium">Este item é composto por {selectedItem.composition ? selectedItem.composition.length : 0} componentes</span>
                                                {selectedItem.source === 'Própria' && (
                                                    <button
                                                        onClick={handleAddComponent}
                                                        className="text-button bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition-colors flex items-center gap-1"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        Adicionar Componente
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                                            <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider px-4 py-3 bg-gray-50 border-b border-gray-100">
                                                <div className="col-span-1 text-center">Código</div>
                                                <div className="col-span-1 text-center">Tipo</div>
                                                <div className="col-span-1 text-center font-bold">Base</div>
                                                <div className="col-span-1 text-center">Natureza</div>
                                                <div className="col-span-4">Insumo/Composição</div>
                                                <div className="col-span-1 text-center">Unid.</div>
                                                <div className="col-span-1 text-center whitespace-nowrap">Coefic.</div>
                                                <div className="col-span-1 text-center whitespace-nowrap">Unitário</div>
                                                <div className="col-span-1 text-right">Subtotal</div>
                                            </div>

                                            <div className="divide-y divide-gray-50">
                                                {(selectedItem.composition || []).map((comp, idx) => {
                                                    const resolvedPrice = comp.price || auxiliaryItems.get(comp.code)?.price || 0;
                                                    const auxItem = auxiliaryItems.get(comp.code);
                                                    const isComposition = comp.type === SinapiType.COMPOSITION;
                                                    const leafNatures = isComposition ? getLeafNatures(comp.code) : new Set<string>();
                                                    const natures = isComposition ? leafNatures : new Set([resolveNatureFromCategory(auxItem) || null].filter(Boolean));
                                                    return (
                                                        <div key={`${selectedItem.code}-comp-${idx}`} className="grid grid-cols-12 gap-2 items-center text-sm py-2.5 px-4 hover:bg-blue-50/30 transition-colors">
                                                            <div className="col-span-1 font-mono text-xs text-center">
                                                                {selectedItem.source === 'Própria' ? (
                                                                    <div className="flex items-center justify-center gap-1 group/code">
                                                                        <input
                                                                            type="text"
                                                                            value={comp.code}
                                                                            onChange={(e) => handleUpdateComposition({ code: e.target.value }, idx)}
                                                                            className="w-full text-center outline-none bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-gray-400"
                                                                        />
                                                                        {auxiliaryItems.has(comp.code) && (
                                                                            <button
                                                                                onClick={() => handleDrillDown(auxiliaryItems.get(comp.code)!)}
                                                                                className="opacity-0 group-hover/code:opacity-100 text-blue-500 hover:text-blue-700 transition-all p-0.5 rounded hover:bg-blue-50"
                                                                                title="Navegar para este item"
                                                                            >
                                                                                <Maximize2 className="w-3 h-3" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => {
                                                                            const item = auxiliaryItems.get(comp.code);
                                                                            if (item) handleDrillDown(item);
                                                                        }}
                                                                        className={`hover:text-blue-600 hover:underline transition-colors font-bold ${auxiliaryItems.has(comp.code) ? 'text-blue-500' : 'text-gray-400'}`}
                                                                        title={auxiliaryItems.has(comp.code) ? "Clique para ver detalhes" : "Carregando..."}
                                                                    >
                                                                        {comp.code}
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div className="col-span-1 flex justify-center">
                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${comp.type === SinapiType.COMPOSITION ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                                    {comp.type === SinapiType.COMPOSITION ? 'COMP' : 'INS'}
                                                                </span>
                                                            </div>
                                                            <div className="col-span-1 text-center">
                                                                <span className="text-[9px] font-bold text-gray-400 tracking-tighter uppercase">SINAPI</span>
                                                            </div>
                                                            <div className="col-span-1 flex justify-center gap-0.5 flex-wrap">
                                                                {natures.size > 0 ? (
                                                                    Array.from(natures).map((nature, nIdx) => (
                                                                        <span key={nIdx} className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide border ${
                                                                            nature === 'Mão de Obra'
                                                                                ? 'bg-blue-50 text-blue-600 border-blue-100'
                                                                                : nature === 'Material'
                                                                                ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                                                : nature === 'Equipamento'
                                                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                                                : 'bg-gray-50 text-gray-400 border-gray-100'
                                                                        }`}>
                                                                            {nature === 'Mão de Obra' ? 'M.O.' : nature === 'Material' ? 'MAT' : 'EQP'}
                                                                        </span>
                                                                    ))
                                                                ) : (
                                                                    <span className="text-gray-300 text-[9px]">—</span>
                                                                )}
                                                            </div>
                                                            <div className="col-span-4 flex flex-col">
                                                                {selectedItem.source === 'Própria' ? (
                                                                    <input
                                                                        type="text"
                                                                        value={comp.description}
                                                                        onChange={(e) => handleUpdateComposition({ description: e.target.value }, idx)}
                                                                        className="w-full text-form-input font-medium text-gray-700 uppercase outline-none bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 leading-tight"
                                                                    />
                                                                ) : (
                                                                    <span className="leading-tight text-xs font-medium text-gray-700 uppercase">{comp.description}</span>
                                                                )}
                                                            </div>
                                                            <div className="col-span-1 text-center text-gray-400 font-bold text-xs">
                                                                {selectedItem.source === 'Própria' ? (
                                                                    <input
                                                                        type="text"
                                                                        value={comp.unit || ''}
                                                                        onChange={(e) => handleUpdateComposition({ unit: e.target.value }, idx)}
                                                                        className="w-full text-center outline-none bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500"
                                                                    />
                                                                ) : comp.unit || '-'}
                                                            </div>
                                                            <div className="col-span-1">
                                                                <input
                                                                    type="number"
                                                                    step="0.0001"
                                                                    value={comp.quantity || 0}
                                                                    onChange={(e) => handleUpdateComposition({ quantity: Number(e.target.value) }, idx)}
                                                                    className="w-full text-center outline-none bg-white border border-gray-200 rounded py-1 text-form-input font-bold text-blue-600 focus:ring-2 focus:ring-blue-500"
                                                                />
                                                            </div>
                                                            <div className="col-span-1">
                                                                <div className="flex items-center justify-center gap-1 bg-white border border-gray-200 rounded px-1 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                                                    <span className="text-xs text-gray-400">R$</span>
                                                                    <input
                                                                        type="number"
                                                                        step="0.01"
                                                                        value={resolvedPrice}
                                                                        onChange={(e) => handleUpdateComposition({ price: Number(e.target.value) }, idx)}
                                                                        className={`w-full text-right outline-none bg-transparent py-1 text-form-input font-bold ${isLoadingAuxiliary && resolvedPrice === 0 ? 'animate-pulse text-gray-300' : 'text-gray-700'}`}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="col-span-1 text-right font-black text-gray-900">
                                                                {formatMoney(comp.quantity * resolvedPrice)}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center py-20 text-gray-400 bg-gray-50/30 rounded-2xl border border-dashed border-gray-200">
                                        <Box className="w-16 h-16 mb-4 opacity-20" />
                                        <p className="text-lg font-bold">Este item é um insumo básico</p>
                                        <p className="text-sm">Não possui composição de custos detalhada.</p>
                                    </div>
                                )}
                            </div>

                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                                <div className="flex items-center gap-2 text-xs text-gray-400 bg-white px-3 py-1.5 rounded-full border border-gray-200 italic shadow-sm">
                                    <Info className="w-3.5 h-3.5" />
                                    Valores baseados na referência {references.find(r => r.referenceDate === searchReference)?.label || searchReference} para o estado de {searchLocation}.
                                </div>
                                <div className="flex items-center gap-2">
                                    {(searchDatabase === 'GENERAL' || (selectedItem && selectedItem.isOverride)) && (
                                        <button
                                            onClick={handleDelete}
                                            className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center gap-2 border border-red-100 mr-2"
                                            title={selectedItem.isOverride ? "Restaurar item original do SINAPI" : "Excluir item da base própria"}
                                        >
                                            <Trash className="w-4 h-4" />
                                            {selectedItem.isOverride ? 'Restaurar' : 'Excluir'}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setSelectedItem(null)}
                                        className="px-6 py-2 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg shadow-gray-200"
                                    >
                                        Fechar Consulta
                                    </button>
                                    <button
                                        onClick={() => setIsSaveModalOpen(true)}
                                        className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2"
                                    >
                                        <Save className="w-4 h-4" />
                                        Salvar Alterações
                                    </button>
                                </div>
                            </div>

                            {/* Picker Modal */}
                            <DatabasePickerModal
                                isOpen={isPickerOpen}
                                onClose={() => setIsPickerOpen(false)}
                                onSelect={handleComponentSelect}
                            />

                            {/* Modal de Confirmação de Salvamento */}
                            <SaveConfirmationModal
                                isOpen={isSaveModalOpen}
                                onClose={() => setIsSaveModalOpen(false)}
                                onConfirm={handleSave}
                                isSaving={isSaving}
                                hasBudget={!!budget?.some(e => e.sinapiItem.code === selectedItem?.code)}
                                isCustomItem={true}
                            />



                        </div>
                    </div >
                )
            }
            {/* Database Manager Modal - Moved to root level */}
            <DatabaseManagerModal
                isOpen={isDbManagerOpen}
                onClose={() => setIsDbManagerOpen(false)}
                onSelect={(db) => {
                    setCurrentDatabase(db);
                    setIsDbManagerOpen(false);
                }}
                currentDbId={currentDatabase?.id}
            />

            {/* Import Modal */}
            <DatabaseExcelImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={handleImportItems}
            />

            <SinapiImportModal
                isOpen={isSinapiImportOpen}
                onClose={() => setIsSinapiImportOpen(false)}
                onSuccess={async () => {
                    // Recarrega competências e invalida cache do service
                    (sinapiService as any)._latestReference = undefined;
                    (sinapiService as any)._versioningEnabled = false;
                    const refs = await sinapiService.getReferences();
                    setReferences(refs);
                    setSearchReference(refs[0]?.referenceDate || '');
                    setIsSinapiImportOpen(false);
                }}
            />

            {/* Gerenciar Grupos Modal */}
            <GroupManagerModal
                isOpen={isGroupManagerOpen}
                onClose={() => setIsGroupManagerOpen(false)}
                categories={categories}
                customCategories={customCategories}
                onRename={handleRenameGroup}
                onDelete={handleDeleteGroup}
                onDuplicate={handleDuplicateGroup}
                onCreate={handleCreateGroup}
            />

            {/* Toast de notificação — Bug 10 */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' :
                    notification.type === 'error'   ? 'bg-red-600 text-white' :
                                                      'bg-blue-600 text-white'
                }`}>
                    {notification.message}
                    <button onClick={() => setNotification(null)} className="ml-2 opacity-70 hover:opacity-100">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div >
    );
};

// --- Group Manager Modal Component ---

interface GroupManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: string[];
    customCategories: Set<string>;
    onRename: (oldName: string, newName: string) => Promise<void>;
    onDelete: (name: string, deleteItems: boolean) => Promise<void>;
    onDuplicate: (sourceName: string, targetName: string) => Promise<void>;
    onCreate: (name: string) => void;
}

const GroupManagerModal: React.FC<GroupManagerModalProps> = ({
    isOpen, onClose, categories, customCategories, onRename, onDelete, onDuplicate, onCreate
}) => {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [newGroupName, setNewGroupName] = React.useState('');
    const [editingGroup, setEditingGroup] = React.useState<string | null>(null);
    const [newName, setNewName] = React.useState('');
    const [isDuplicating, setIsDuplicating] = React.useState<string | null>(null);
    const [duplicateName, setDuplicateName] = React.useState('');
    const confirm = useConfirm();

    if (!isOpen) return null;

    const filtered = categories.filter(c => c.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600 p-2 rounded-lg text-white">
                            <FolderTree className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Gerenciar Grupos</h3>
                            <p className="text-xs text-gray-500">Organize os agrupamentos técnicos dos seus itens</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Nome do novo grupo..."
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-blue-50/30 border border-blue-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={() => { onCreate(newGroupName); setNewGroupName(''); }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
                        >
                            <FolderPlus className="w-4 h-4" />
                            Criar
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar grupo existente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    <div className="grid grid-cols-1 gap-1">
                        {filtered.map(group => {
                            const isCustom = customCategories.has(group);
                            return (
                                <div key={group} className="group flex items-center justify-between p-3 rounded-xl hover:bg-blue-50/50 transition-all border border-transparent hover:border-blue-100">
                                    <div className="flex flex-col">
                                        {editingGroup === group ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={newName}
                                                    onChange={(e) => setNewName(e.target.value)}
                                                    className="px-2 py-1 text-sm border border-blue-500 rounded outline-none"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            if (!newName.trim()) return;
                                                            onRename(group, newName).then(() => setEditingGroup(null));
                                                        }
                                                    }}
                                                />
                                                <button onClick={() => { if (!newName.trim()) return; onRename(group, newName).then(() => setEditingGroup(null)); }} className="text-xs font-bold text-blue-600">Salvar</button>
                                                <button onClick={() => setEditingGroup(null)} className="text-xs font-bold text-gray-400">Cancelar</button>
                                            </div>
                                        ) : (
                                            <>
                                                <span className="text-sm font-semibold text-gray-800">{group}</span>
                                                <span className={`text-[9px] font-bold uppercase w-fit px-1.5 rounded ${isCustom ? 'text-blue-600 bg-blue-50' : 'text-gray-400 bg-gray-100'}`}>
                                                    {isCustom ? 'Minha Base' : 'SINAPI (Sistema)'}
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {isDuplicating === group ? (
                                            <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-blue-200 shadow-sm">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    placeholder="Nome da cópia..."
                                                    value={duplicateName}
                                                    onChange={(e) => setDuplicateName(e.target.value)}
                                                    className="px-2 py-1 text-form-input border border-gray-200 rounded outline-none"
                                                />
                                                <button
                                                    onClick={() => { if (!duplicateName.trim()) return; onDuplicate(group, duplicateName).then(() => setIsDuplicating(null)); }}
                                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => setIsDuplicating(null)} className="p-1 text-gray-400 hover:bg-gray-50 rounded">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => { setIsDuplicating(group); setDuplicateName(`${group} (Cópia)`); }}
                                                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                    title="Duplicar Grupo"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                                {isCustom && (
                                                    <>
                                                        <button
                                                            onClick={() => { setEditingGroup(group); setNewName(group); }}
                                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Editar Nome"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                // §14 — useConfirm(), nunca confirm() nativo
                                                                const ok = await confirm({
                                                                    title: `Excluir o grupo "${group}"?`,
                                                                    message: 'Os itens associados serão movidos para "Itens Avulsos".',
                                                                    variant: 'danger',
                                                                    confirmLabel: 'Excluir',
                                                                });
                                                                if (ok) await onDelete(group, false);
                                                            }}
                                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Remover Agrupamento"
                                                        >
                                                            <Trash className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DatabaseExplorer;
