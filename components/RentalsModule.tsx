import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Home, Key, TrendingUp, Plus, Search, Filter, RefreshCw, Home as HomeIcon, MapPin, Maximize2, DollarSign, Tag, User, Edit, Trash2, LayoutGrid, List, ChevronDown, X, AlertCircle } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { commercialService } from '../services/commercialService';
import { Property, PropertyStatus, PropertyDeal, Client } from '../types';
import { TowerMatrixConfig, GridCellConfig, TowerNumberingConfig } from '../types/imovib';
import { usePersistedState } from './ui/TableUtils';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';


interface BulkConfig {
    matrix?: TowerMatrixConfig[];
    count?: number;
    startingNumber?: number;
    increment?: number;
    prefix?: string;
    connectedTowers?: boolean;
    connectionDirection?: 'HORIZONTAL' | 'VERTICAL';
}

type PropertyFormData = Partial<Property> & {
    _bulkConfig?: BulkConfig;
};
import { clientService } from '../services/clientService';
import PropertyModal from './PropertyModal';
import DealModal from './DealModal';
import { RentalsDashboard } from './RentalsDashboard';
import PropertyUnitMap from './common/PropertyUnitMap';

interface RentalsModuleProps {
    organizationId?: string;
}

const RentalsModule: React.FC<RentalsModuleProps> = ({ organizationId }) => {
    const [activeTab, setActiveTab] = useState<'inventory' | 'deals' | 'dashboard'>(
        (localStorage.getItem('rentals_active_tab') as 'inventory' | 'deals' | 'dashboard') || 'inventory'
    );
    const [properties, setProperties] = useState<Property[]>([]);
    const [deals, setDeals] = useState<PropertyDeal[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('rentalsModuleFilters:search', '');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list' | 'tower'>('rentalsModuleFilters:viewMode', 'list');
    const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
    const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(() => {
        const saved = localStorage.getItem('rentals_selected_building_id');
        return (saved && saved !== 'undefined') ? saved : null;
    });
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    // Modals Control
    const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
    const [isDealModalOpen, setIsDealModalOpen] = useState(false);
    const [editingProperty, setEditingProperty] = useState<Property | undefined>(undefined);
    const [editingDeal, setEditingDeal] = useState<PropertyDeal | undefined>(undefined);
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [bulkPriceValue, setBulkPriceValue] = useState('');

    const confirm = useConfirm();
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const loadData = async () => {
        console.log('[Commercial] Loading data for organization:', organizationId);
        setLoading(true);
        try {
            const [propsData, dealsData, clientsData] = await Promise.all([
                commercialService.listProperties(organizationId),
                commercialService.listDeals(),
                clientService.listClients()
            ]);
            setProperties(propsData.filter(p => !p.purpose || p.purpose === 'RENTAL' || p.purpose === 'BOTH'));
            setDeals(dealsData.filter(d => d.type === 'RENTAL'));
            setClients(clientsData);
        } catch (err) {
            console.error('[Commercial] Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [organizationId]);

    // Persistência de estado
    useEffect(() => {
        if (activeTab) localStorage.setItem('rentals_active_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (selectedBuildingId) {
            localStorage.setItem('rentals_selected_building_id', selectedBuildingId);
        } else {
            localStorage.removeItem('rentals_selected_building_id');
        }
    }, [selectedBuildingId]);

    // Reset de navegação se o edifício for removido
    useEffect(() => {
        if (!selectedBuildingId) {
            if (activeTab !== 'inventory') setActiveTab('inventory');
            if (sortConfig) setSortConfig(null);
            if (viewMode === 'tower') setViewMode('grid');
        }
    }, [selectedBuildingId, activeTab, sortConfig, viewMode]);


    const handleSaveProperty = async (data: PropertyFormData) => {
        if (!organizationId && !data.organization_id) {
            notify('Erro: Nenhuma organização ativa selecionada. Por favor, selecione uma empresa no menu lateral.', 'error');
            return;
        }

        try {
            const { _bulkConfig, ...propertyData } = data;

            // Garantir que a organização está vinculada ao criar novo imóvel
            const propertyToSave: Partial<Property> & { organization_id?: string } = {
                ...propertyData,
                organization_id: propertyData.organization_id || organizationId
            };

            if (propertyToSave.type === 'BUILDING' && _bulkConfig && _bulkConfig.matrix) {
                propertyToSave.specs = {
                    ...(propertyToSave.specs || {}),
                    matrixConfig: _bulkConfig.matrix,
                    connectedTowers: _bulkConfig.connectedTowers,
                    connectionDirection: _bulkConfig.connectionDirection
                };
            }

            console.log('[Commercial] Saving property with organization:', propertyToSave.organization_id);
            const savedProperty = await commercialService.saveProperty(propertyToSave);

            // Se for Edifício e houver configuração de unidades em lote via Matriz
            if (propertyToSave.type === 'BUILDING' && _bulkConfig && _bulkConfig.matrix) {
                // 1. Buscar unidades existentes para preservar IDs e status (especialmente VENDIDO/ALUGADO)
                let existingUnits: Property[] = [];
                if (savedProperty.id) {
                    existingUnits = await commercialService.listProperties(undefined, undefined);
                    existingUnits = existingUnits.filter(u => u.parent_id === savedProperty.id);
                }

                const units: Partial<Property>[] = [];
                let totalCount = 0;
                const usedIds: string[] = [];
                
                _bulkConfig.matrix.forEach((tower: TowerMatrixConfig) => {
                    const floors = tower.floors || 0;
                    const gridCells = tower.gridCells || [];

                    for (let f = 1; f <= floors; f++) {
                        gridCells.forEach((cell: GridCellConfig) => {
                            const numCfg: TowerNumberingConfig = tower.numberingConfig || { type: 'FLOOR_BASED', startNumber: 101, prefix: 'Apto ' };
                            let displayNum = 0;
                            if (numCfg.type === 'FLOOR_BASED') {
                                const unitOffset = numCfg.startNumber % 100;
                                displayNum = (f * 100) + (cell.unitIndex - 1 + unitOffset);
                            } else {
                                displayNum = numCfg.startNumber + ((f - 1) * gridCells.length + (cell.unitIndex - 1));
                            }
                            const finalName = `${numCfg.prefix || ''}${displayNum}${numCfg.suffix || ''}`;
                            
                            // TENTAR ENCONTRAR UNIDADE EXISTENTE PARA PRESERVAR ID E STATUS
                            const existing = existingUnits.find(u => 
                                String(u.name).trim().toUpperCase() === finalName.trim().toUpperCase() && 
                                String(u.block || '').trim().toUpperCase() === String(tower.name).trim().toUpperCase()
                            );

                            if (existing?.id) usedIds.push(existing.id);

                            totalCount++;
                            units.push({
                                id: existing?.id,
                                name: finalName,
                                type: 'APARTMENT',
                                purpose: propertyToSave.purpose || 'BOTH',
                                address: propertyToSave.address,
                                area: propertyToSave.area || 0,
                                private_area: propertyToSave.private_area || 0,
                                common_area: propertyToSave.common_area || 0,
                                total_area: propertyToSave.total_area || 0,
                                block: tower.name,
                                floor: f,
                                number: String(displayNum),
                                position_type: (cell.position_type === 'NONE' ? undefined : cell.position_type) || 'LATERAL',
                                sun_orientation: cell.sun_orientation,
                                price: propertyToSave.price || 0,
                                initial_price: propertyToSave.initial_price || propertyToSave.price || 0,
                                status: existing?.status || PropertyStatus.AVAILABLE,
                                organization_id: propertyToSave.organization_id,
                                parent_id: savedProperty.id,
                                specs: { 
                                    ...(propertyToSave.specs || {}),
                                    grid_x: cell.x,
                                    grid_y: cell.y 
                                }
                            });
                        });
                    }
                });

                if (units.length > 0) {
                    await commercialService.savePropertiesBatch(units);

                    // 2. Limpar unidades que NÃO estão mais na matriz e NÃO têm negócios
                    const unusedIds = existingUnits
                        .filter(u => u.id && !usedIds.includes(u.id))
                        .map(u => u.id as string);
                    
                    if (unusedIds.length > 0) {
                        for(const id of unusedIds) {
                            try {
                                await commercialService.deleteProperty(id);
                            } catch (e) {
                                console.log(`[RentalsModule] Could not delete unused unit ${id}`);
                            }
                        }
                    }

                    notify(`Edifício e ${totalCount} unidades processados com sucesso!`);
                }
            } 
            // Fallback legado
            else if (propertyToSave.type === 'BUILDING' && _bulkConfig && (_bulkConfig.count ?? 0) > 0) {
                const units: Partial<Property>[] = [];
                for (let i = 0; i < (_bulkConfig.count ?? 0); i++) {
                    const unitNumber = (_bulkConfig.startingNumber ?? 1) + (i * (_bulkConfig.increment || 1));
                    units.push({
                        name: `${_bulkConfig.prefix}${unitNumber}`,
                        type: 'APARTMENT',
                        address: propertyToSave.address,
                        area: propertyToSave.area || 0,
                        private_area: propertyToSave.private_area || 0,
                        common_area: propertyToSave.common_area || 0,
                        total_area: propertyToSave.total_area || 0,
                        block: propertyToSave.block,
                        floor: propertyToSave.floor,
                        price: propertyToSave.price || 0,
                        initial_price: propertyToSave.initial_price || propertyToSave.price || 0,
                        status: PropertyStatus.AVAILABLE,
                        organization_id: propertyToSave.organization_id,
                        parent_id: savedProperty.id,
                        specs: { ...(propertyToSave.specs || {}) }
                    });
                }
                await commercialService.savePropertiesBatch(units);
                notify(`Edifício e ${_bulkConfig.count} unidades cadastrados com sucesso!`);
            } else {
                notify(editingProperty ? 'Imóvel atualizado com sucesso!' : 'Imóvel cadastrado com sucesso!');
            }

            setIsPropertyModalOpen(false);
            setEditingProperty(undefined);
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('[Commercial] Save Error:', error);
            notify('Erro ao salvar imóvel: ' + error.message, 'error');
        }
    };

    // Excluir direto (sem diálogo) — usado pelo InlineDisclosureMenu, se necessário no futuro.
    const handleDeleteDeal = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir negociação?',
            message: 'Tem certeza que deseja excluir esta negociação?',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await commercialService.deleteDeal(id);
            notify('Negociação excluída!');
            loadData();
        } catch (err: any) {
            notify('Erro ao excluir: ' + (err.message || 'Erro desconhecido'), 'error');
        }
    };

    const handleDeleteProperty = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir imóvel?',
            message: 'Tem certeza que deseja excluir este imóvel?',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (ok) {
            try {
                await commercialService.deleteProperty(id);
                notify('Imóvel excluído!');
                loadData();
            } catch (err: any) {
                notify('Erro ao excluir: ' + (err.message || 'Erro desconhecido'), 'error');
            }
        }
    };

    const filteredProperties = useMemo(() => {
        let result = properties.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.address.toLowerCase().includes(searchTerm.toLowerCase());
            
            if (!selectedBuildingId) {
                // Master View: Mostrar apenas Edifícios ou unidades que NÃO são filhas de edifícios (parent_id null)
                // Se o termo de busca for preenchido, mostrar tudo que bater com o nome para facilitar a localização
                if (searchTerm) return matchesSearch;
                
                // Relaxamos a regra: se for BUILDING, mostramos sempre na visão mestre (mesmo que tenha parent_id por erro)
                return matchesSearch && (p.type === 'BUILDING' || !p.parent_id);
            }
            
            // Detail View: Mostrar apenas filhos do edifício selecionado
            return matchesSearch && String(p.parent_id).toLowerCase() === String(selectedBuildingId).toLowerCase();
        });

        if (sortConfig) {
            result.sort((a: any, b: any) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                if (aValue === null || aValue === undefined) aValue = sortConfig.direction === 'asc' ? Infinity : -Infinity;
                if (bValue === null || bValue === undefined) bValue = sortConfig.direction === 'asc' ? Infinity : -Infinity;

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [properties, searchTerm, selectedBuildingId, sortConfig]);

    const currentBuilding = selectedBuildingId ? properties.find(p => String(p.id).toLowerCase() === String(selectedBuildingId).toLowerCase()) : null;

    const stats = useMemo(() => {
        const totalValue = properties.reduce((acc, p) => acc + (p.price || 0), 0);
        const activeRentals = deals.filter(d => d.type === 'RENTAL' && d.status === 'COMPLETED');
        const monthlyRevenue = activeRentals.reduce((acc, d) => acc + (d.value || 0), 0);
        
        // Unidades totais (excluindo os containers de 'BUILDING')
        const allUnits = properties.filter(p => p.type !== 'BUILDING');
        const totalUnitsCount = allUnits.length || properties.length;
        const rentedCount = allUnits.filter(p => p.status === PropertyStatus.RENTED).length;
        
        const occupancyRate = totalUnitsCount > 0 ? ((rentedCount / totalUnitsCount) * 100).toFixed(1) : '0.0';
        const yieldValue = totalValue > 0 ? ((monthlyRevenue / totalValue) * 100).toFixed(2) : '0.00';

        return {
            activeAssets: properties.filter(p => p.type === 'BUILDING' || !p.parent_id).length,
            monthlyRevenue,
            monthlyYield: yieldValue,
            occupancyRate,
            totalValue
        };
    }, [properties, deals]);

    // Texto simples colorido — sem pílula/fundo/uppercase (ui_ux_standard_guide.md §8).
    const getStatusColor = (status: PropertyStatus) => {
        switch (status) {
            case PropertyStatus.AVAILABLE: return 'text-emerald-600';
            case PropertyStatus.SOLD: return 'text-blue-600';
            case PropertyStatus.RENTED: return 'text-purple-600';
            case PropertyStatus.RESERVED: return 'text-amber-600';
            case PropertyStatus.EXCHANGED: return 'text-blue-600';
            default: return 'text-gray-600';
        }
    };

    const getStatusLabel = (status: PropertyStatus) => {
        switch (status) {
            case PropertyStatus.AVAILABLE: return 'Disponível';
            case PropertyStatus.SOLD: return 'Vendido';
            case PropertyStatus.RENTED: return 'Alugado';
            case PropertyStatus.RESERVED: return 'Reservado';
            case PropertyStatus.EXCHANGED: return 'Permutado';
            default: return status;
        }
    };

    const handleBulkUpdate = async (updates: Partial<Property>) => {
        if (selectedProperties.length === 0) return;

        try {
            setLoading(true);
            await commercialService.updatePropertiesBatch(selectedProperties, updates);
            notify(`${selectedProperties.length} imóveis atualizados com sucesso!`);
            setSelectedProperties([]);
            loadData();
        } catch (err: any) {
            notify('Erro na atualização em massa: ' + (err.message || 'Erro desconhecido'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectProperty = (id: string) => {
        setSelectedProperties(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };



    const PropertyCard: React.FC<{
        property: Property,
        onEdit: () => void,
        onDelete: () => void,
        onRegisterDeal: () => void,
        getStatusColor: (s: PropertyStatus) => string,
        getStatusLabel: (s: PropertyStatus) => string,
        selected?: boolean,
        onSelect?: () => void,
        compact?: boolean
    }> = ({ property, onEdit, onDelete, onRegisterDeal, getStatusColor, getStatusLabel, selected, onSelect, compact }) => (
        <div 
            onClick={() => {
                if (property.type === 'BUILDING' && !selectedBuildingId) {
                    setSelectedBuildingId(property.id);
                }
            }}
            className={`bg-white border rounded-[10px] overflow-hidden group hover:shadow-lg transition-all duration-300 cursor-pointer ${compact ? 'scale-95 origin-top' : ''} ${selected ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-200'}`}
        >
            <div className="aspect-[16/11] bg-gray-100 relative overflow-hidden">
                <div className="absolute top-6 left-6 z-10" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => { e.stopPropagation(); onSelect?.(); }}
                        className="w-6 h-6 rounded-lg border-white/20 bg-white/10 backdrop-blur-md text-blue-600 focus:ring-blue-500 cursor-pointer shadow-xl transition-all accent-blue-600"
                    />
                </div>
                <div className="absolute top-6 right-6 z-10 flex flex-col gap-2 scale-90 origin-top-right">
                    <span className={`text-sm font-normal drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${getStatusColor(property.status)}`}>
                        {getStatusLabel(property.status)}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-2 bg-white/90 backdrop-blur-md rounded-xl text-gray-600 hover:text-blue-600 shadow-lg transition-all"><Edit className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 bg-white/90 backdrop-blur-md rounded-xl text-gray-600 hover:text-red-500 shadow-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                </div>
                {property.client_id && (
                    <div className="absolute top-24 left-6 z-10 animate-in fade-in zoom-in duration-500">
                        <div className="px-4 py-2 bg-white/90 backdrop-blur-md rounded-2xl border border-white shadow-xl flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[9px] font-black text-blue-900 uppercase tracking-widest leading-none">
                                {clients.find(c => c.id === property.client_id)?.name || 'Proprietário'}
                            </span>
                        </div>
                    </div>
                )}
                {property.images?.[0] ? (
                    <img src={property.images[0]} alt={property.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                ) : <div className="w-full h-full flex items-center justify-center"><Home className="w-16 h-16 text-gray-200" /></div>}
                <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white">
                    <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-black text-blue-200 uppercase tracking-widest leading-none">
                            {property.type === 'BUILDING' ? (property.address.split('-')[1]?.trim() || property.address) : (properties.find(p => p.id === property.parent_id)?.name || 'Unidade Independente')}
                        </span>
                    </div>
                    <h3 className="text-xl font-black leading-tight mb-2 group-hover:text-blue-400 transition-colors uppercase">{property.name}</h3>
                    <div className="flex items-center gap-4 text-gray-300 font-bold text-xs uppercase tracking-widest">
                        <span>{property.type === 'BUILDING' ? 'Edifício' : property.type}</span>
                        <span>• {property.area} m²</span>
                    </div>
                </div>
            </div>
            <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Preço Sugerido</span>
                        <span className="text-2xl font-black text-gray-900 font-mono tracking-tighter">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(property.price || 0)}
                        </span>
                    </div>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-6">
                    <div className="flex-1 bg-gray-50 p-3 rounded-2xl flex flex-col items-center justify-center border border-gray-100">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Valor m²</span>
                        <span className="text-xs font-black text-gray-700">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format((property.price || 0) / (property.private_area || property.area || 1))}
                        </span>
                    </div>
                    {property.position_type && (
                        <div className="bg-blue-50 p-3 rounded-2xl flex flex-col items-center justify-center border border-blue-100">
                            <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest mb-1">Posição</span>
                            <span className="text-xs font-black text-blue-700 uppercase">
                                {property.position_type === 'FRONT' ? 'Frente' : property.position_type === 'BACK' ? 'Fundo' : 'Lat.'}
                            </span>
                        </div>
                    )}
                    {property.sun_orientation && (
                        <div className="bg-amber-50 p-3 rounded-2xl flex flex-col items-center justify-center border border-amber-100">
                            <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1">Sol</span>
                            <span className="text-xs font-black text-amber-700 uppercase">
                                {property.sun_orientation === 'NORTH' ? 'Norte' : property.sun_orientation === 'EAST' ? 'Leste' : 'Oeste'}
                            </span>
                        </div>
                    )}
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onRegisterDeal(); }}
                    className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-button uppercase tracking-[0.2em] hover:bg-blue-600 transition-all active:scale-95 shadow-xl shadow-gray-900/10 hover:shadow-blue-600/20"
                >
                    Registrar Negócio
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 pb-20">
            {/* Header — §20 (flat, sem hero) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {selectedBuildingId && (
                        <button
                            onClick={() => setSelectedBuildingId(null)}
                            className="h-9 w-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-[6px] transition-all"
                            title="Voltar para Edifícios"
                        >
                            <ChevronDown className="w-4 h-4 rotate-90" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                            {currentBuilding ? 'Gestão de Unidades' : 'Gestão de Locações'}
                        </h1>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium">
                            {currentBuilding ? `Administração de ativos para ${currentBuilding.name}` : 'Controle de inventário, ocupação e performance imobiliária.'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all">
                        <Maximize2 className="w-4 h-4" />
                        Relatórios
                    </button>
                    <button
                        onClick={() => {
                            setEditingProperty(undefined);
                            setIsPropertyModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo {selectedBuildingId ? 'imóvel' : 'edifício'}
                    </button>
                </div>
            </div>

            {/* Tabs internas (só quando um edifício está selecionado) — vocabulário compacto §19 */}
            {selectedBuildingId && (
                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 w-fit">
                    <button
                        onClick={() => setActiveTab('inventory')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'inventory' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <HomeIcon className="w-3.5 h-3.5" />
                        Unidades
                    </button>
                    <button
                        onClick={() => setActiveTab('deals')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'deals' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <Tag className="w-3.5 h-3.5" />
                        Contratos
                    </button>
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <TrendingUp className="w-3.5 h-3.5" />
                        Resultados
                    </button>
                </div>
            )}

            {/* Content */}
            {(!selectedBuildingId || activeTab === 'inventory') && (
                <div className="space-y-6">
                    {/* Stats Summary Row */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <KpiCard shadow={false} size="sm" label="Ativos sob gestão" value={stats.activeAssets} icon={<Building2 className="w-4 h-4" />} color="blue" />
                        <KpiCard shadow={false} size="sm" label="Receita mensal" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.monthlyRevenue)} icon={<DollarSign className="w-4 h-4" />} color="emerald" />
                        <KpiCard shadow={false} size="sm" label="Yield mensal" value={`${stats.monthlyYield}%`} icon={<TrendingUp className="w-4 h-4" />} color="indigo" />
                        <KpiCard shadow={false} size="sm" label="Taxa de ocupação" value={`${stats.occupancyRate}%`} icon={<Key className="w-4 h-4" />} color="purple" />
                        <KpiCard shadow={false} size="sm" label="Valor patrimonial" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.totalValue)} icon={<Home className="w-4 h-4" />} color="amber" />
                    </div>

                    {/* Toolbar acoplada à tabela (§5.2, padrão OpuraDocsModule/GED) — toolbar e
                        conteúdo dividem um único card (border/rounded/shadow só no container
                        pai); a costura visível entre os dois é o border-b da toolbar. */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center p-4 border-b border-gray-100 bg-white">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder={selectedBuildingId ? "Buscar por unidade ou bloco..." : "Escolha um empreendimento para gerenciar..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all whitespace-nowrap">
                            <Filter className="w-4 h-4" />
                            Mais filtros
                        </button>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Grade"><LayoutGrid className="w-4 h-4" /></button>
                            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Lista"><List className="w-4 h-4" /></button>
                            {selectedBuildingId && (
                                <button onClick={() => setViewMode('tower')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'tower' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Torre"><Building2 className="w-4 h-4" /></button>
                            )}
                        </div>
                    </div>

                    {/* Property Display — sem bg/border/rounded próprios: já está dentro do
                        card acoplado toolbar+conteúdo (ver abertura acima) */}
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Consultando inventário...</p>
                        </div>
                    ) : filteredProperties.length > 0 ? (
                        <>
                            {viewMode === 'grid' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-4">
                                    {filteredProperties.map((property) => (
                                        <PropertyCard
                                            key={property.id}
                                            property={property}
                                            selected={selectedProperties.includes(property.id)}
                                            onSelect={() => handleSelectProperty(property.id)}
                                            onEdit={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }}
                                            onDelete={() => handleDeleteProperty(property.id)}
                                            onRegisterDeal={() => {
                                                setEditingDeal({ id: '', property_id: property.id, client_id: '', type: 'RENTAL', value: property.price, date: new Date().toISOString().split('T')[0], status: 'PENDING' });
                                                setIsDealModalOpen(true);
                                            }}
                                            getStatusColor={getStatusColor}
                                            getStatusLabel={getStatusLabel}
                                        />
                                    ))}
                                </div>
                            )}

                            {viewMode === 'list' && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        {/* thead em sentence case (§6.2) — escala compacta */}
                                        <thead>
                                            <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Imóvel</th>
                                                {!selectedBuildingId ? (
                                                    <>
                                                        <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Endereço / referência</th>
                                                        <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-right">Patrimônio</th>
                                                        <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-center">Ocupação</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-center">Bloco</th>
                                                        <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-center">Pav.</th>
                                                        <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-center whitespace-nowrap">Á. priv.</th>
                                                        <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-right whitespace-nowrap">Aluguel base</th>
                                                    </>
                                                )}
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-center">Status</th>
                                                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {filteredProperties.map((property) => (
                                                <tr
                                                    key={property.id}
                                                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                                    onClick={() => {
                                                        if (property.type === 'BUILDING' && !selectedBuildingId) {
                                                            setSelectedBuildingId(property.id);
                                                        } else {
                                                            setEditingProperty(property);
                                                            setIsPropertyModalOpen(true);
                                                        }
                                                    }}
                                                >
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        <div className="flex items-center gap-2">
                                                            {property.type === 'BUILDING' ? (
                                                                <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                                                            ) : (
                                                                <Home className="w-4 h-4 text-gray-400 shrink-0" />
                                                            )}
                                                            <span className="text-sm font-normal text-gray-900 group-hover:text-blue-600 transition-colors">{property.name}</span>
                                                        </div>
                                                    </td>

                                                    {!selectedBuildingId ? (
                                                        <>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                                {property.address}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800 text-right">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(property.price || 0)}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                                                {(() => {
                                                                    const bUnits = properties.filter(u => u.parent_id === property.id);
                                                                    const rentedCount = bUnits.filter(u => u.status === PropertyStatus.RENTED).length;
                                                                    const pct = bUnits.length > 0 ? (rentedCount / bUnits.length) * 100 : 0;
                                                                    return (
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            <span className="text-sm font-normal text-blue-600">{pct.toFixed(0)}%</span>
                                                                            <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                                                                                <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 text-center">
                                                                {property.block || '-'}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 text-center">
                                                                {property.floor ? `${property.floor}º` : 'T'}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 text-center">
                                                                {property.private_area ? `${property.private_area}m²` : '-'}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-indigo-600 text-right">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(property.price || 0)}
                                                            </td>
                                                        </>
                                                    )}

                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                                        <span className={`text-sm font-normal ${getStatusColor(property.status)}`}>
                                                            {getStatusLabel(property.status)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-2.5 text-right">
                                                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                            <ActionIconButton kind="edit" onClick={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }} />
                                                            <ActionIconButton kind="delete" onClick={() => handleDeleteProperty(property.id)} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}


                            {viewMode === 'tower' && (
                                <div className="p-4">
                                <PropertyUnitMap
                                    units={properties.filter(p => String(p.parent_id).toLowerCase() === String(selectedBuildingId).toLowerCase())}
                                    parentProperty={properties.find(p => p.id === selectedBuildingId)}
                                    deals={deals}
                                    mode="admin"
                                    onEditUnit={(unit) => {
                                        setEditingProperty(unit);
                                        setIsPropertyModalOpen(true);
                                    }}
                                    onSelectUnit={(unit) => {
                                        setEditingDeal({ 
                                            id: '', 
                                            property_id: unit.id, 
                                            client_id: '', 
                                            type: 'RENTAL', 
                                            value: unit.price, 
                                            date: new Date().toISOString().split('T')[0], 
                                            status: 'PENDING' 
                                        });
                                        setIsDealModalOpen(true);
                                    }}
                                />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-12">
                            <Home className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">
                                {searchTerm ? 'Nenhum resultado encontrado' : 'Nenhum imóvel cadastrado'}
                            </h3>
                            <p className="text-sm text-gray-500 mb-6">
                                {searchTerm
                                    ? `Não encontramos imóveis para "${searchTerm}" nesta organização. Verifique os filtros ou tente outro termo.`
                                    : 'Adicione o primeiro imóvel para iniciar a gestão de locações.'}
                            </p>
                            <button
                                onClick={() => setIsPropertyModalOpen(true)}
                                className="text-blue-600 font-bold hover:underline"
                            >
                                Cadastrar primeiro imóvel
                            </button>
                        </div>
                    )}
                    </div>

                    {/* Barra de ações em lote (§10) */}
                    {selectedProperties.length > 0 && (
                        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                            <span className="flex-1 text-sm font-bold whitespace-nowrap">
                                {selectedProperties.length} selecionado{selectedProperties.length !== 1 ? 's' : ''}
                            </span>
                            <button
                                onClick={() => setIsBulkEditOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 transition-colors"
                            >
                                <Edit className="w-3.5 h-3.5" />
                                Editar em Lote
                            </button>
                            <button
                                onClick={() => setSelectedProperties([])}
                                className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-blue-400 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                                Desmarcar
                            </button>
                        </div>
                    )}

                    {/* Modal de Edição em Lote (§10) */}
                    {isBulkEditOpen && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm" onClick={() => setIsBulkEditOpen(false)}>
                            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Editar {selectedProperties.length} imóve{selectedProperties.length !== 1 ? 'is' : 'l'} em lote</h3>
                                <p className="text-sm text-gray-500 mb-5">Escolha uma ação para aplicar a todos os imóveis selecionados.</p>

                                <div className="space-y-2 mb-5">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alterar status para</span>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => { handleBulkUpdate({ status: PropertyStatus.AVAILABLE }); setIsBulkEditOpen(false); }}
                                            className="h-9 px-3 rounded-[6px] text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
                                        >
                                            Disponível
                                        </button>
                                        <button
                                            onClick={() => { handleBulkUpdate({ status: PropertyStatus.RESERVED }); setIsBulkEditOpen(false); }}
                                            className="h-9 px-3 rounded-[6px] text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all"
                                        >
                                            Reservar
                                        </button>
                                        <button
                                            onClick={() => { handleBulkUpdate({ status: PropertyStatus.EXCHANGED }); setIsBulkEditOpen(false); }}
                                            className="h-9 px-3 rounded-[6px] text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all"
                                        >
                                            Permutar
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mudar preço sugerido para</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            value={bulkPriceValue}
                                            onChange={(e) => setBulkPriceValue(e.target.value)}
                                            placeholder="Novo preço (R$)"
                                            className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        />
                                        <button
                                            onClick={() => {
                                                const price = parseFloat(bulkPriceValue);
                                                if (!isNaN(price)) {
                                                    handleBulkUpdate({ price });
                                                    setBulkPriceValue('');
                                                    setIsBulkEditOpen(false);
                                                }
                                            }}
                                            disabled={!bulkPriceValue || isNaN(parseFloat(bulkPriceValue))}
                                            className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Aplicar
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setIsBulkEditOpen(false)}
                                    className="w-full mt-6 px-6 py-2.5 bg-gray-50 text-gray-500 rounded-[6px] text-sm font-medium hover:bg-gray-100 transition-all"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {
                (selectedBuildingId && activeTab === 'deals') && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Tag className="w-5 h-5 text-blue-600" />
                                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Registro de contratos</h3>
                            </div>
                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Grade"><LayoutGrid className="w-4 h-4" /></button>
                                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Lista"><List className="w-4 h-4" /></button>
                            </div>
                        </div>

                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {deals.map(deal => {
                                    const property = properties.find(p => p.id === deal.property_id);
                                    return (
                                        <div key={deal.id} className="bg-white p-6 rounded-[10px] border border-gray-100 hover:border-blue-200 transition-colors relative group">
                                            <div className="absolute top-6 right-6 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                <ActionIconButton kind="edit" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }} />
                                                <ActionIconButton kind="delete" onClick={() => handleDeleteDeal(deal.id)} />
                                            </div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className={`text-sm font-normal ${deal.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                    {deal.status === 'COMPLETED' ? 'Concluído' :
                                                        deal.status === 'PENDING' ? 'Pendente' :
                                                            deal.status === 'CANCELLED' ? 'Cancelado' : 'Pendente'}
                                                </span>
                                                <div className="flex flex-col items-end ml-auto">
                                                    <span className="text-xs font-medium text-blue-600">#{deal.id.substring(0, 8).toUpperCase()}</span>
                                                    <span className="text-xs text-gray-400 mt-0.5">
                                                        {new Date(deal.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mb-6">
                                                <span className="text-xs font-medium text-purple-600 mb-1 inline-block">
                                                    Locação ativa
                                                </span>
                                                <h4 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{property?.name || 'Imóvel em referência'}</h4>
                                                <div className="flex items-center gap-2 mt-2 text-gray-500">
                                                    <User className="w-4 h-4" />
                                                    <span className="text-sm font-normal">
                                                        {deal.client_id ? (clients.find(c => c.id === deal.client_id)?.name || `ID: ${deal.client_id.substring(0, 8)}`) : 'Cliente não informado'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="p-4 bg-blue-50/50 rounded-[10px] border border-blue-100 flex items-center justify-between mb-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium text-blue-600 mb-1">Valor do contrato</span>
                                                    <span className="text-xl font-bold text-gray-900">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value)}
                                                    </span>
                                                </div>
                                                <DollarSign className="w-5 h-5 text-emerald-500" />
                                            </div>

                                            {deal.notes && (
                                                <div className="p-3 bg-gray-50 rounded-[10px] italic text-gray-500 text-sm font-normal border-l-2 border-gray-200">
                                                    "{deal.notes}"
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Add New Deal Placeholder */}
                                <button
                                    onClick={() => {
                                        setEditingDeal({ id: '', property_id: '', client_id: '', type: 'RENTAL', value: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING' } as any);
                                        setIsDealModalOpen(true);
                                    }}
                                    className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[10px] p-6 flex flex-col items-center justify-center group hover:bg-white hover:border-blue-200 transition-all min-h-[220px]"
                                >
                                    <Plus className="w-8 h-8 text-gray-300 group-hover:text-blue-600 mb-3" />
                                    <span className="text-sm font-bold text-gray-400 group-hover:text-gray-900">Novo contrato</span>
                                    <p className="text-xs text-gray-400 text-center mt-1 px-4">Inicie o registro de um novo contrato de aluguel.</p>
                                </button>
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-100 rounded-[10px] overflow-hidden">
                                <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    {/* thead em sentence case (§6.2) — escala compacta */}
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">ID</th>
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Imóvel</th>
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Cliente</th>
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Tipo</th>
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Valor</th>
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Data</th>
                                            <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Status</th>
                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {deals.map(deal => {
                                            const property = properties.find(p => p.id === deal.property_id);
                                            const client = clients.find(c => c.id === deal.client_id);
                                            return (
                                                <tr key={deal.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer group" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }}>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-blue-600">
                                                        #{deal.id.substring(0, 8).toUpperCase()}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-900 group-hover:text-blue-600 transition-colors">
                                                        {property?.name || '---'}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                        {client?.name || 'Não vinculado'}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                        {deal.type === 'SALE' ? 'Venda' : 'Locação'}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value)}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                        {new Date(deal.date).toLocaleDateString('pt-BR')}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        <span className={`text-sm font-normal ${deal.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                            {deal.status === 'COMPLETED' ? 'Concluído' : 'Pendente'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-2.5 text-right">
                                                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                            <ActionIconButton kind="edit" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }} />
                                                            <ActionIconButton kind="delete" onClick={() => handleDeleteDeal(deal.id)} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingDeal({ type: 'RENTAL' } as any);
                                        setIsDealModalOpen(true);
                                    }}
                                    className="w-full py-4 bg-gray-50/50 hover:bg-gray-50 text-gray-500 font-medium text-sm transition-all border-t border-gray-100 flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                                    Registrar Novo Contrato
                                </button>
                            </div>
                        )}
                    </div>
                )
            }

            {
                activeTab === 'dashboard' && (
                    <RentalsDashboard 
                        selectedBuildingId={selectedBuildingId} 
                        organizationId={currentBuilding?.organization_id || organizationId}
                    />
                )
            }


            <PropertyModal
                isOpen={isPropertyModalOpen}
                onClose={() => { setIsPropertyModalOpen(false); setEditingProperty(undefined); }}
                onSubmit={handleSaveProperty}
                initialData={editingProperty}
                defaultPurpose="RENTAL"
                organizationId={organizationId}
            />

            <DealModal
                isOpen={isDealModalOpen}
                onClose={() => { setIsDealModalOpen(false); setEditingDeal(undefined); }}
                onSave={() => loadData()}
                initialData={editingDeal}
                organizationId={organizationId}
            />

            {/* Toast de Notificação — §13 */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div >
    );
};

export default RentalsModule;
