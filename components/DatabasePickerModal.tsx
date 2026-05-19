import React from 'react';
import {
    Search,
    X,
    Loader2,
    ChevronRight,
    Layers,
    Package,
    Box
} from 'lucide-react';
import { sinapiService } from '../services/sinapiService';
import { customDatabaseService } from '../services/customDatabaseService';
import { SinapiItem, SinapiType, CustomDatabase } from '../types';

interface DatabasePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (item: SinapiItem) => void;
    title?: string;
    subtitle?: string;
    zIndex?: number;
}

const DatabasePickerModal: React.FC<DatabasePickerModalProps> = ({ isOpen, onClose, onSelect, title, subtitle, zIndex = 110 }) => {
    // Search States (Replicated from DatabaseExplorer)
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
    const [categories, setCategories] = React.useState<string[]>([]);

    // Custom Databases State
    const [customDatabases, setCustomDatabases] = React.useState<CustomDatabase[]>([]);

    // Load categories and custom databases only when modal opens or once
    React.useEffect(() => {
        if (isOpen) {
            if (categories.length === 0) {
                const loadCats = async () => {
                    const cats = await sinapiService.getCategories();
                    setCategories(cats);
                };
                loadCats();
            }

            // Load custom databases
            const loadCustomDbs = async () => {
                const dbs = await customDatabaseService.listDatabases();
                setCustomDatabases(dbs);
            };
            loadCustomDbs();
        }
    }, [isOpen]);

    const handleSearch = React.useCallback(async () => {
        if (!searchTerm && !searchCode && !searchGroup && !searchType && !searchNature) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            let results: SinapiItem[] = [];

            // Override scope/mode for code search if present?? No, keep same logic as Explorer
            const filters = {
                code: searchCode,
                group: searchGroup,
                type: searchType,
                state: searchLocation,
                chargeType: searchCharges,
                searchScope: searchScope,
                searchMode: searchMode,
                nature: searchNature
            };

            if (searchDatabase === 'SINAPI') {
                results = await sinapiService.search(searchTerm, filters);
            } else {
                // Find the selected custom database to get its ID
                // searchDatabase holds the ID for custom databases
                results = await customDatabaseService.search(searchTerm, {
                    type: searchType,
                    category: searchGroup,
                    code: searchCode,
                    searchScope: searchScope,
                    searchMode: searchMode,
                    databaseId: searchDatabase // Pass the ID directly
                });
            }
            setSearchResults(results);
        } catch (error) {
            console.error("Picker Search Error:", error);
        } finally {
            setIsSearching(false);
        }
    }, [searchTerm, searchCode, searchType, searchGroup, searchNature, searchDatabase, searchLocation, searchCharges, searchScope, searchMode]);

    // Debounce
    React.useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => {
            handleSearch();
        }, 400);
        return () => clearTimeout(timer);
    }, [handleSearch, isOpen]);

    if (!isOpen) return null;

    const getTypeBadge = (type: SinapiType) => {
        switch (type) {
            case SinapiType.COMPOSITION:
                return <span className="flex items-center gap-1 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-100"><Layers className="w-2.5 h-2.5" /> COMP</span>;
            case SinapiType.SERVICE:
                return <span className="flex items-center gap-1 bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-purple-100"><Package className="w-2.5 h-2.5" /> SERV</span>;
            default:
                return <span className="flex items-center gap-1 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-100"><Box className="w-2.5 h-2.5" /> INS</span>;
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" style={{ zIndex }} onClick={e => { e.stopPropagation(); onClose(); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">{title ?? 'Adicionar Componente'}</h3>
                        <p className="text-xs text-gray-500">{subtitle ?? 'Selecione um item da base de dados para adicionar à composição.'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Filters Area (Identical to Explorer) */}
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
                                <option value={SinapiType.SERVICE}>Serviços</option>
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
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 text-gray-600 cursor-pointer min-w-[100px]"
                                    value={searchScope}
                                    onChange={(e) => setSearchScope(e.target.value as any)}
                                >
                                    <option value="description">Descrição</option>
                                    <option value="category">Grupo</option>
                                    <option value="both">Ambos</option>
                                </select>
                                <select
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-blue-50 text-blue-700 border-blue-100 cursor-pointer min-w-[100px]"
                                    value={searchMode}
                                    onChange={(e) => setSearchMode(e.target.value as any)}
                                >
                                    <option value="all-words">Palavras</option>
                                    <option value="exact">Exata</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 p-2 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                        <div className="flex items-center gap-2">
                            <label className="font-bold text-gray-400 uppercase">Base:</label>
                            <select
                                className="bg-transparent font-medium text-blue-600 outline-none border-b border-dashed border-blue-200"
                                value={searchDatabase}
                                onChange={(e) => setSearchDatabase(e.target.value)}
                            >
                                <option value="SINAPI">SINAPI</option>
                                <optgroup label="Minhas Bases">
                                    {customDatabases.map(db => (
                                        <option key={db.id} value={db.id}>{db.name}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>
                        <div className="h-3 w-[1px] bg-gray-200" />
                        <div className="flex items-center gap-2">
                            <label className="font-bold text-gray-400 uppercase">Ref:</label>
                            <span className="font-medium text-blue-600">12/2025</span>
                        </div>
                        <div className="h-3 w-[1px] bg-gray-200" />
                        <div className="flex items-center gap-2">
                            <label className="font-bold text-gray-400 uppercase">UF:</label>
                            <select
                                className="bg-transparent font-medium text-blue-600 outline-none border-b border-dashed border-blue-200"
                                value={searchLocation}
                                onChange={(e) => setSearchLocation(e.target.value)}
                            >
                                {['MG', 'SP', 'RJ', 'BA', 'RS', 'SC', 'PR'].map(uf => (
                                    <option key={uf} value={uf}>{uf}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                    {isSearching ? (
                        <div className="flex flex-col items-center justify-center h-full gap-2">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Buscando...</span>
                        </div>
                    ) : searchResults.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                            {searchResults.map(result => (
                                <div
                                    key={result.code}
                                    onClick={() => onSelect(result)}
                                    className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all group flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="font-mono text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                            {result.code}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-0.5">
                                                {getTypeBadge(result.type)}
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{result.unit}</span>
                                            </div>
                                            <p className="text-sm font-medium text-gray-800 uppercase leading-snug group-hover:text-blue-700">
                                                {result.description}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">
                                            R$ {result.price.toFixed(2)}
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <Search className="w-12 h-12 mb-2 opacity-20" />
                            <p className="text-sm font-medium">Nenhum item encontrado.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DatabasePickerModal;
