import React from 'react';
import {
    Search,
    Database,
    Layers,
    Package,
    Box,
    X,
    Loader2,
    Filter,
    ChevronRight,
    ChevronLeft,
    ChevronDown,
    ArrowLeft,
    BookOpen,
    Info,
    Maximize2,
    Save,
    Trash,
    Plus,
    Upload,
    Settings,
    FileSpreadsheet,
    Star,
    StarOff,
    LayoutDashboard,
    Table2,
    Edit,
    Copy,
    FolderTree,
    FolderPlus
} from 'lucide-react';
import { sinapiService } from '../services/sinapiService';
import { customDatabaseService } from '../services/customDatabaseService';
import { supabase } from '../lib/supabase';
import { SinapiItem, SinapiType, BudgetEntry, CompositionComponent } from '../types';
import SaveConfirmationModal from './SaveConfirmationModal';
import DatabasePickerModal from './DatabasePickerModal';
import DatabaseManagerModal from './DatabaseManagerModal';
import DatabaseExcelImportModal from './DatabaseExcelImportModal';
import { CustomDatabase } from '../types';
import ExcelJS from 'exceljs';

interface DatabaseExplorerProps {
    budget?: BudgetEntry[];
    favorites: string[];
    onToggleFavorite: (e: React.MouseEvent | React.TouchEvent, code: string) => void;
    onUpdateBudget?: (newBudget: BudgetEntry[]) => void;
}

const DatabaseExplorer: React.FC<DatabaseExplorerProps> = ({ budget, favorites, onToggleFavorite, onUpdateBudget }) => {
    // Estados de Busca
    const [searchTerm, setSearchTerm] = React.useState('');
    const [searchCode, setSearchCode] = React.useState('');
    const [searchType, setSearchType] = React.useState('');
    const [searchGroup, setSearchGroup] = React.useState('');
    const [searchDatabase, setSearchDatabase] = React.useState('SINAPI');
    const [searchLocation, setSearchLocation] = React.useState('MG');
    const [searchCharges, setSearchCharges] = React.useState('SEM_DESONERACAO');
    const [searchReference, setSearchReference] = React.useState('12/2025');
    const [searchNature, setSearchNature] = React.useState('');
    const [searchScope, setSearchScope] = React.useState<'description' | 'category' | 'both'>('description');
    const [searchMode, setSearchMode] = React.useState<'exact' | 'all-words'>('all-words');
    const [searchResults, setSearchResults] = React.useState<SinapiItem[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);
    const [dbSize, setDbSize] = React.useState(0);
    const [categories, setCategories] = React.useState<string[]>([]);
    const [customCategories, setCustomCategories] = React.useState<Set<string>>(new Set());
    const [isGroupManagerOpen, setIsGroupManagerOpen] = React.useState(false);
    const [showOnlyFavorites, setShowOnlyFavorites] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('list');

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
            await customDatabaseService.renameGroup(oldName, newName);
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
            await customDatabaseService.deleteGroup(name, deleteItems);
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
                        searchCharges
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
    }, [selectedItem?.code, searchLocation, searchCharges]);

    // Lógica de Busca
    const handleSearch = React.useCallback(async () => {
        if (searchDatabase === 'SINAPI' && !searchTerm && !searchCode && !searchGroup && !searchType && !showOnlyFavorites) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
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
                codes: showOnlyFavorites ? favorites : undefined
            };

            if (searchDatabase === 'SINAPI') {
                results = await sinapiService.search(searchTerm, filters);
            } else {
                // Se for Base Própria, permite busca mesmo sem database selecionado (será a Base Geral)
                // Bug 5: currentDatabase é null quando "Base Geral" está selecionada;
                // passar 'GENERAL' para que o service filtre database_id IS NULL
                results = await customDatabaseService.search(searchTerm, {
                    type: searchType,
                    category: searchGroup,
                    code: searchCode,
                    searchScope: searchScope,
                    searchMode: searchMode,
                    databaseId: currentDatabase?.id ?? 'GENERAL',
                    codes: showOnlyFavorites ? favorites : undefined
                });
            }
            setSearchResults(results.map(item => ({
                ...item,
                isFavorite: favorites.includes(item.code)
            })));
        } catch (error) {
            console.error("Erro na busca:", error);
        } finally {
            setIsSearching(false);
        }
    }, [searchTerm, searchCode, searchType, searchNature, searchGroup, searchDatabase, searchLocation, searchCharges, favorites, showOnlyFavorites, currentDatabase]);

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
        setSearchResults(prev => prev.map(item =>
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

                // Muda para base própria se não estiver nela
                if (searchDatabase !== 'GENERAL') {
                    setSearchDatabase('GENERAL');
                    setSearchCode(newItem.code);
                    // O search será disparado pelo useEffect/debounce ou manual depois
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

                // Recarrega a busca para refletir a mudança
                if (searchDatabase === 'GENERAL') {
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

        const confirmMessage = item.isOverride
            ? `Deseja restaurar o item ${item.code} para o padrão original do SINAPI? Suas alterações serão perdidas.`
            : `Tem certeza que deseja excluir o item ${item.code}? Esta ação não pode ser desfeita.`;

        if (window.confirm(confirmMessage)) {
            try {
                await customDatabaseService.deleteItem(item.code, currentDatabase?.id);
                notify(item.isOverride ? 'Item restaurado ao padrão original!' : 'Item excluído com sucesso!', 'success');
                if (selectedItem?.code === item.code) setSelectedItem(null);
                handleSearch(); // Atualiza a lista
            } catch (error) {
                console.error("Erro ao excluir:", error);
                notify('Erro ao excluir item.', 'error');
            }
        }
    };

    // Lógica de Exclusão
    const handleDelete = async () => {
        if (!selectedItem) return;

        const isCustom = searchDatabase === 'GENERAL';
        const isOverride = selectedItem.isOverride;

        if (!isCustom && !isOverride) return;

        const confirmMessage = isOverride
            ? `Deseja restaurar o item ${selectedItem.code} para o padrão original do SINAPI? Suas alterações serão perdidas.`
            : `Tem certeza que deseja excluir o item ${selectedItem.code}? Esta ação não pode ser desfeita.`;

        if (confirm(confirmMessage)) {
            try {
                await customDatabaseService.deleteItem(selectedItem.code, currentDatabase?.id);
                notify(isOverride ? 'Item restaurado ao padrão original!' : 'Item excluído com sucesso!', 'success');
                setSelectedItem(null);
                handleSearch(); // Atualiza a lista
            } catch (error) {
                console.error("Erro ao excluir:", error);
                notify('Erro ao excluir item.', 'error');
            }
        }
    };

    // Debounce da busca
    React.useEffect(() => {
        const timer = setTimeout(() => {
            handleSearch();
        }, 400);
        return () => clearTimeout(timer);
    }, [handleSearch, favorites, showOnlyFavorites]); // Search depends on favorites to update icons and filtering


    const getTypeBadge = (type: SinapiType) => {
        switch (type) {
            case SinapiType.COMPOSITION:
                return <span className="flex items-center gap-1 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-100"><Layers className="w-2.5 h-2.5" /> COMPOSIÇÃO</span>;
            case SinapiType.SERVICE:
                return <span className="flex items-center gap-1 bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-purple-100"><Package className="w-2.5 h-2.5" /> SERVIÇO</span>;
            default:
                return <span className="flex items-center gap-1 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-100"><Box className="w-2.5 h-2.5" /> INSUMO</span>;
        }
    };

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
            alert(`Erro ao gerar arquivo de exportação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-4 relative">
            {/* Cabeçalho */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <BookOpen className="w-7 h-7 text-blue-600" />
                    Composições
                </h1>
                <div className="flex justify-between items-end">
                    <p className="text-gray-500">Pesquise e consulte composições, serviços e insumos do SINAPI ou da sua Base Própria.</p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleCreate(SinapiType.INPUT)}
                            className="bg-white text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-50 flex items-center gap-2 shadow-sm"
                        >
                            <Box className="w-3.5 h-3.5" />
                            Novo Insumo
                        </button>
                        <button
                            onClick={() => handleCreate(SinapiType.COMPOSITION)}
                            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center gap-2 shadow-sm shadow-blue-200"
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Nova Composição
                        </button>
                    </div>
                </div>
            </div>

            {/* Área de Busca e Filtros */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-0">
                <div className="p-4 border-b border-gray-100">
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
                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Natureza</label>
                            <select
                                className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                                value={searchNature}
                                onChange={(e) => setSearchNature(e.target.value)}
                            >
                                <option value="">Todos</option>
                                <option value="Mão de Obra">Mão de Obra</option>
                                <option value="Material">Materiais</option>
                                <option value="Equipamento">Equipamentos</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Grupo</label>
                            <select
                                className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                                value={searchGroup}
                                onChange={(e) => setSearchGroup(e.target.value)}
                            >
                                <option value="">Todos os Grupos</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-5">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Descrição</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Buscar por descrição..."
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <select
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 text-gray-600 cursor-pointer min-w-[120px]"
                                    value={searchScope}
                                    onChange={(e) => setSearchScope(e.target.value as 'description' | 'category' | 'both')}
                                    title="Escopo da busca"
                                >
                                    <option value="description">Descrição</option>
                                    <option value="category">Grupo</option>
                                    <option value="both">Ambos</option>
                                </select>

                                <select
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-blue-50 text-blue-700 border-blue-100 cursor-pointer min-w-[130px]"
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

                    <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Base de Dados:</label>
                            <select
                                className="bg-transparent text-xs font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer"
                                value={searchDatabase}
                                onChange={(e) => setSearchDatabase(e.target.value)}
                            >
                                <option value="SINAPI">SINAPI</option>
                                <option value="GENERAL">Minha Base Própria</option>
                            </select>
                        </div>

                        {searchDatabase === 'GENERAL' && (
                            <>
                                <div className="flex items-center gap-2 ml-2 border-l border-gray-200 pl-4">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Selecione:</label>
                                    <div className="flex items-center gap-2">
                                        <select
                                            className="bg-white text-xs font-bold text-gray-800 outline-none border border-gray-200 rounded-md py-1 px-2 hover:border-blue-300 max-w-[150px]"
                                            value={currentDatabase?.id || ''}
                                            onChange={(e) => {
                                                const db = databases.find(d => d.id === e.target.value);
                                                setCurrentDatabase(db || null);
                                            }}
                                        >
                                            <option value="GENERAL">Base Geral (Itens Avulsos)</option>
                                            {databases.map(db => (
                                                <option key={db.id} value={db.id}>{db.name}</option>
                                            ))}
                                            {databases.length === 0 && <option value="">Nenhuma base</option>}
                                        </select>
                                        <button
                                            onClick={() => setIsDbManagerOpen(true)}
                                            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                                            title="Gerenciar Bases"
                                        >
                                            <Settings className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setIsGroupManagerOpen(true)}
                                            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors text-blue-500 hover:text-blue-700"
                                            title="Gerenciar Grupos"
                                        >
                                            <FolderTree className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {currentDatabase && (
                                    <div className="flex items-center gap-2 ml-2">
                                        <button
                                            onClick={() => setIsImportModalOpen(true)}
                                            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold hover:bg-emerald-100 transition-colors border border-emerald-100"
                                            title="Importar itens via Excel"
                                        >
                                            <FileSpreadsheet className="w-3.5 h-3.5" />
                                            Importar
                                        </button>
                                        <button
                                            onClick={handleExportDatabase}
                                            className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-100 transition-colors border border-blue-100"
                                            title="Exportar base para Excel"
                                        >
                                            <Upload className="w-3.5 h-3.5" />
                                            Exportar
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        <div className="h-4 w-[1px] bg-gray-200" />

                        <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Referência:</label>
                            <select
                                className="bg-transparent text-xs font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer"
                                value={searchReference}
                                onChange={(e) => setSearchReference(e.target.value)}
                            >
                                <option value="12/2025">12/2025</option>
                            </select>
                        </div>

                        <div className="h-4 w-[1px] bg-gray-200" />

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold transition-colors border ${showOnlyFavorites ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}
                            >
                                <Star className={`w-3.5 h-3.5 ${showOnlyFavorites ? 'fill-amber-500 text-amber-500' : ''}`} />
                                Favoritos
                            </button>
                        </div>

                        <div className="h-4 w-[1px] bg-gray-200" />

                        {/* View Toggle */}
                        <div className="flex bg-white rounded-lg border border-gray-200 p-0.5 shadow-sm">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1 rounded-md transition-all ${viewMode === 'grid'
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                                title="Visualização em Grade"
                            >
                                <LayoutDashboard className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1 rounded-md transition-all ${viewMode === 'list'
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                                title="Visualização em Lista"
                            >
                                <Table2 className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <div className="h-4 w-[1px] bg-gray-200" />

                        <div className="h-4 w-[1px] bg-gray-200" />

                        <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Estado:</label>
                            <select
                                className="bg-transparent text-xs font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer"
                                value={searchLocation}
                                onChange={(e) => setSearchLocation(e.target.value)}
                            >
                                {['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'].map(uf => (
                                    <option key={uf} value={uf}>{uf}</option>
                                ))}
                            </select>
                        </div>

                        <div className="h-4 w-[1px] bg-gray-200" />

                        <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Encargos Sociais:</label>
                            <select
                                className="bg-transparent text-xs font-medium text-blue-600 outline-none border-b border-dashed border-blue-200 hover:border-blue-500 cursor-pointer"
                                value={searchCharges}
                                onChange={(e) => setSearchCharges(e.target.value)}
                            >
                                <option value="SEM_DESONERACAO">Sem Desoneração</option>
                                <option value="COM_DESONERACAO">Com Desoneração</option>
                            </select>
                        </div>

                        <div className="ml-auto text-[10px] text-gray-400 flex items-center gap-3">
                            {searchResults.length > 0 && (
                                <div className="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold border border-blue-100">
                                    <Search className="w-3 h-3" />
                                    {searchResults.length} encontrados
                                </div>
                            )}
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {dbSize.toLocaleString('pt-BR')} itens catalogados
                            </div>
                        </div>
                    </div>
                </div>

                {/* Resultados */}
                <div className="flex-1 overflow-y-auto p-4 bg-white">
                    {searchResults.length > 0 ? (
                        viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {searchResults
                                    .map(result => (
                                        <div
                                            key={result.code}
                                            className="p-4 hover:bg-blue-50/50 cursor-pointer border border-gray-100 rounded-xl group transition-all flex flex-col justify-between relative"
                                            onClick={() => handleSelectItem(result)}
                                        >
                                            <div className="flex justify-between items-start mb-2 pt-1">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => onToggleFavorite(e, result.code)}
                                                        className="p-1 px-1.5 rounded-lg hover:bg-white shadow-sm transition-all z-10 border border-transparent hover:border-amber-200"
                                                        title={favorites.includes(result.code) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                                    >
                                                        <Star className={`w-3.5 h-3.5 ${favorites.includes(result.code) ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}`} />
                                                    </button>
                                                    <span className="font-mono font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-sm">{result.code}</span>
                                                    {getTypeBadge(result.type)}
                                                </div>
                                                <span className="text-emerald-600 font-bold text-lg">R$ {result.price.toFixed(2)}</span>
                                            </div>
                                            <p className="text-sm text-gray-700 font-medium leading-tight group-hover:text-blue-700 transition-colors uppercase">{result.description}</p>
                                            <div className="mt-2 flex items-center gap-3">
                                                <span className="text-[10px] bg-white border border-gray-200 px-2 py-0.5 rounded text-gray-500 font-bold uppercase tracking-wider">{result.unit}</span>
                                                <span className="text-[10px] text-gray-400 uppercase font-medium">{result.category}</span>
                                            </div>

                                            <div className="mt-3 flex items-center justify-between">
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {(searchDatabase === 'GENERAL' || result.isOverride) && (
                                                        <button
                                                            onClick={(e) => handleDeleteItem(e, result)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title={result.isOverride ? "Restaurar item SINAPI" : "Excluir item"}
                                                        >
                                                            <Trash className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                                <span className="text-xs text-blue-600 font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Ver Detalhes <ChevronRight className="w-3 h-3" />
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50/50 border-b border-gray-200">
                                        <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Item</th>
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-center">Tipo</th>
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Descrição</th>
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-center">Unid</th>
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-right whitespace-nowrap">Preço Unitário</th>
                                            <th className="px-6 py-2 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {searchResults.map(result => (
                                            <tr
                                                key={result.code}
                                                className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                                                onClick={() => handleSelectItem(result)}
                                            >
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => onToggleFavorite(e, result.code)}
                                                            className="p-1 rounded-lg hover:bg-white shadow-sm transition-all z-10"
                                                        >
                                                            <Star className={`w-3 h-3 ${favorites.includes(result.code) ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}`} />
                                                        </button>
                                                        <span className="font-mono text-sm font-bold text-gray-600">{result.code}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                                    <span className={`
                                                        px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest inline-block
                                                        ${result.nature === 'Mão de Obra' ? 'bg-orange-50 text-orange-600' :
                                                            result.nature === 'Material' ? 'bg-blue-50 text-blue-600' :
                                                                'bg-purple-50 text-purple-600'}
                                                    `}>
                                                        {result.nature}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <span className="text-sm font-medium text-gray-800 group-hover:text-blue-600 transition-colors leading-tight">{result.description}</span>
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                                    <span className="text-sm font-bold text-gray-600 uppercase">{result.unit}</span>
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right">
                                                    <span className="text-sm font-black text-gray-900">R$ {result.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                </td>
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {(searchDatabase === 'GENERAL' || result.isOverride) && (
                                                            <button
                                                                onClick={(e) => handleDeleteItem(e, result)}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                title={result.isOverride ? "Restaurar item SINAPI" : "Excluir item"}
                                                            >
                                                                <Trash className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <ChevronRight className="w-4 h-4 text-blue-500" />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20">
                            {isSearching ? (
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                                    <span className="text-sm font-bold animate-pulse uppercase tracking-widest">Consultando {searchDatabase}...</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="p-6 bg-gray-50 rounded-full border border-gray-100">
                                        <Search className="w-12 h-12 text-gray-200" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-bold text-gray-500">Pronto para buscar</p>
                                        <p className="text-sm">Use os filtros acima para explorar a base de dados.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

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
                                                    className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-sm w-full text-center outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            ) : (
                                                <div className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-sm text-center">
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
                                                        className="bg-transparent text-[10px] font-bold text-gray-600 outline-none cursor-pointer uppercase"
                                                        value={selectedItem.category}
                                                        onChange={(e) => setSelectedItem({ ...selectedItem, category: e.target.value })}
                                                    >
                                                        <option value="">Sem Grupo</option>
                                                        {categories.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-gray-600 uppercase truncate max-w-[200px]">{selectedItem.category || 'Geral'}</span>
                                                )}
                                            </div>
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
                                        <p className="text-[10px] text-gray-400 font-bold uppercase whitespace-nowrap">Unidade</p>
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
                                        <p className="text-[10px] text-gray-400 font-bold uppercase whitespace-nowrap">Preço Unitário</p>
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
                                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm shrink-0"
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
                                                        className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition-colors flex items-center gap-1"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        Adicionar Componente
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                                            <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 bg-gray-50 border-b border-gray-100">
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
                                                                        className="w-full text-[12px] font-medium text-gray-700 uppercase outline-none bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 leading-tight"
                                                                    />
                                                                ) : (
                                                                    <span className="leading-tight text-[12px] font-medium text-gray-700 uppercase">{comp.description}</span>
                                                                )}
                                                            </div>
                                                            <div className="col-span-1 text-center text-gray-400 font-bold text-[10px]">
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
                                                                    className="w-full text-center outline-none bg-white border border-gray-200 rounded py-1 text-xs font-bold text-blue-600 focus:ring-2 focus:ring-blue-500"
                                                                />
                                                            </div>
                                                            <div className="col-span-1">
                                                                <div className="flex items-center justify-center gap-1 bg-white border border-gray-200 rounded px-1 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                                                    <span className="text-[10px] text-gray-400">R$</span>
                                                                    <input
                                                                        type="number"
                                                                        step="0.01"
                                                                        value={resolvedPrice}
                                                                        onChange={(e) => handleUpdateComposition({ price: Number(e.target.value) }, idx)}
                                                                        className={`w-full text-right outline-none bg-transparent py-1 text-xs font-bold ${isLoadingAuxiliary && resolvedPrice === 0 ? 'animate-pulse text-gray-300' : 'text-gray-700'}`}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="col-span-1 text-right font-black text-gray-900">
                                                                R$ {(comp.quantity * resolvedPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                                    Valores baseados na referência {searchReference} para o estado de {searchLocation}.
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
                                hasBudget={!!budget && budget.length > 0}
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
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-sm font-bold border animate-in slide-in-from-bottom-2 duration-200 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white border-emerald-700' :
                    notification.type === 'error'   ? 'bg-red-600 text-white border-red-700' :
                                                      'bg-blue-600 text-white border-blue-700'
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
                                                <button onClick={() => { if (!newName.trim()) return; onRename(group, newName).then(() => setEditingGroup(null)); }} className="text-[10px] font-bold text-blue-600">Salvar</button>
                                                <button onClick={() => setEditingGroup(null)} className="text-[10px] font-bold text-gray-400">Cancelar</button>
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
                                                    className="px-2 py-1 text-xs border border-gray-200 rounded outline-none"
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
                                                                if (confirm(`Deseja excluir o grupo "${group}"? Os itens associados serão movidos para "Itens Avulsos".`)) {
                                                                    await onDelete(group, false);
                                                                }
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
