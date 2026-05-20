import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Home, Key, TrendingUp, Plus, Search, Filter, Home as HomeIcon, MapPin, Maximize2, DollarSign, Tag, User, Edit, Trash2, LayoutGrid, List, ChevronDown, X } from 'lucide-react';
import { commercialService } from '../services/commercialService';
import { Property, PropertyStatus, PropertyDeal, Client } from '../types';
import { TowerMatrixConfig, GridCellConfig, TowerNumberingConfig } from '../types/imovib';


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
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'tower'>('list');
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
            alert('Erro: Nenhuma organização ativa selecionada. Por favor, selecione uma empresa no menu lateral.');
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

                    alert(`Edifício e ${totalCount} unidades processados com sucesso!`);
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
                alert(`Edifício e ${_bulkConfig.count} unidades cadastrados com sucesso!`);
            } else {
                alert(editingProperty ? 'Imóvel atualizado com sucesso!' : 'Imóvel cadastrado com sucesso!');
            }

            setIsPropertyModalOpen(false);
            setEditingProperty(undefined);
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('[Commercial] Save Error:', error);
            alert('Erro ao salvar imóvel: ' + error.message);
        }
    };


    const handleDeleteDeal = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir esta negociação?')) {
            try {
                await commercialService.deleteDeal(id);
                alert('Negociação excluída!');
                loadData();
            } catch (err: any) {
                alert('Erro ao excluir: ' + (err.message || 'Erro desconhecido'));
            }
        }
    };

    const handleDeleteProperty = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir este imóvel?')) {
            try {
                await commercialService.deleteProperty(id);
                alert('Imóvel excluído!');
                loadData();
            } catch (err: any) {
                alert('Erro ao excluir: ' + (err.message || 'Erro desconhecido'));
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

    const getStatusColor = (status: PropertyStatus) => {
        switch (status) {
            case PropertyStatus.AVAILABLE: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case PropertyStatus.SOLD: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case PropertyStatus.RENTED: return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
            case PropertyStatus.RESERVED: return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            case PropertyStatus.EXCHANGED: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
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
            alert(`${selectedProperties.length} imóveis atualizados com sucesso!`);
            setSelectedProperties([]);
            loadData();
        } catch (err: any) {
            alert('Erro na atualização em massa: ' + (err.message || 'Erro desconhecido'));
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
            className={`bg-white border rounded-[2.5rem] overflow-hidden group hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] hover:-translate-y-2 transition-all duration-500 cursor-pointer ${compact ? 'scale-95 origin-top' : ''} ${selected ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-200'}`}
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
                    <span className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusColor(property.status)} backdrop-blur-xl shadow-xl`}>
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
                        <span className="text-[10px] font-black text-blue-200 uppercase tracking-widest leading-none">
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
                    className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-blue-600 transition-all active:scale-95 shadow-xl shadow-gray-900/10 hover:shadow-blue-600/20"
                >
                    Registrar Negócio
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0B1727] p-8 rounded-[2.5rem] border border-white/5 relative overflow-hidden shadow-2xl shadow-blue-900/10">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[120px] -mr-48 -mt-48 animate-pulse" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600/5 blur-[100px] -ml-32 -mb-32" />
                
                <div className="relative z-10 flex items-center gap-6">
                    {selectedBuildingId && (
                        <button 
                            onClick={() => setSelectedBuildingId(null)}
                            className="p-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/10 transition-all group"
                            title="Voltar para Edifícios"
                        >
                            <ChevronDown className="w-6 h-6 rotate-90 group-hover:-translate-x-1 transition-transform" />
                        </button>
                    )}
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
                                <Building2 className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">
                                {currentBuilding ? `Edifício: ${currentBuilding.name}` : 'Comercial • Aluguéis'}
                            </span>
                        </div>
                        <h1 className="text-4xl font-black text-white tracking-tight">
                            {currentBuilding ? 'Gestão de Unidades' : 'Gestão de Locações'}
                        </h1>
                        <p className="text-white/40 font-bold mt-2 uppercase text-[10px] tracking-widest">
                            {currentBuilding ? `Administração de ativos para ${currentBuilding.name}` : 'Controle de inventário, ocupação e performance imobiliária.'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 relative z-10">
                    <button className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black transition-all border border-white/10 group">
                        <Maximize2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        Relatórios
                    </button>
                    <button
                        onClick={() => {
                            setEditingProperty(undefined);
                            setIsPropertyModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 hover:scale-[1.02] active:scale-95 group"
                    >
                        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                        Novo {selectedBuildingId ? 'Imóvel' : 'Edifício'}
                    </button>
                </div>
            </div>

            {/* Tabs - Only show when a building is selected */}
            {selectedBuildingId && (
                <div className="flex p-1.5 bg-gray-200/50 backdrop-blur-md rounded-[1.5rem] w-fit border border-gray-200 shadow-inner">
                    <button
                        onClick={() => setActiveTab('inventory')}
                        className={`flex items-center gap-2 px-8 py-3 rounded-[1.25rem] font-black tracking-tight transition-all duration-300 ${activeTab === 'inventory' ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                    >
                        <HomeIcon className={`w-4 h-4 ${activeTab === 'inventory' ? 'fill-blue-600/10' : ''}`} />
                        Unidades
                    </button>
                    <button
                        onClick={() => setActiveTab('deals')}
                        className={`flex items-center gap-2 px-8 py-3 rounded-[1.25rem] font-black tracking-tight transition-all duration-300 ${activeTab === 'deals' ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                    >
                        <Tag className={`w-4 h-4 ${activeTab === 'deals' ? 'fill-blue-600/10' : ''}`} />
                        Contratos
                    </button>
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`flex items-center gap-2 px-8 py-3 rounded-[1.25rem] font-black tracking-tight transition-all duration-300 ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                    >
                        <TrendingUp className={`w-4 h-4 ${activeTab === 'dashboard' ? 'fill-blue-600/10' : ''}`} />
                        Resultados
                    </button>
                </div>
            )}

            {/* Content */}
            {(!selectedBuildingId || activeTab === 'inventory') && (
                <div className="space-y-6">
                    {/* Stats Summary Row */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {[
                            { label: 'Ativos Sob Gestão', value: stats.activeAssets, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'Receita Mensal', value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.monthlyRevenue), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                            { label: 'Yield Mensal', value: `${stats.monthlyYield}%`, icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                            { label: 'Taxa de Ocupação', value: `${stats.occupancyRate}%`, icon: Key, color: 'text-purple-600', bg: 'bg-purple-50' },
                            { label: 'Valor Patrimonial', value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.totalValue), icon: Home, color: 'text-amber-600', bg: 'bg-amber-50' }
                        ].map((s, i) => (
                            <div key={i} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-300">
                                <div className={`p-3 ${s.bg} ${s.color} rounded-2xl`}>
                                    <s.icon className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{s.label}</span>
                                    <span className="text-xl font-black text-gray-900 leading-none">{s.value}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative group">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder={selectedBuildingId ? "Buscar por unidade ou bloco..." : "Escolha um empreendimento para gerenciar..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-14 pr-6 py-4 bg-white border border-gray-200 rounded-[1.5rem] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 placeholder:text-gray-400"
                            />
                        </div>
                        <button className="flex items-center gap-2 px-8 py-4 bg-white border border-gray-200 rounded-[1.5rem] font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm">
                            <Filter className="w-5 h-5 text-gray-400" />
                            Mais Filtros
                        </button>

                        <div className="flex p-1.5 bg-gray-100 rounded-2xl border border-gray-200 shadow-inner">
                            <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Grid"><LayoutGrid className="w-5 h-5" /></button>
                            <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Lista"><List className="w-5 h-5" /></button>
                            {selectedBuildingId && (
                                <button onClick={() => setViewMode('tower')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'tower' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Torre"><Building2 className="w-5 h-5" /></button>
                            )}
                        </div>
                    </div>

                    {/* Property Display */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32">
                            <div className="relative"><Building2 className="w-16 h-16 text-blue-600 animate-pulse" /><div className="absolute inset-0 bg-blue-600/20 blur-xl animate-ping rounded-full" /></div>
                            <p className="text-gray-500 font-black mt-6 tracking-widest uppercase">Consultando Inventário...</p>
                        </div>
                    ) : filteredProperties.length > 0 ? (
                        <>
                            {viewMode === 'grid' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                                <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px] tracking-widest">
                                            <tr>
                                                <th className="px-6 py-4 border-r border-gray-100 last:border-r-0">Imóvel</th>
                                                {!selectedBuildingId ? (
                                                    <>
                                                        <th className="px-6 py-4 border-r border-gray-100 last:border-r-0">Endereço / Referência</th>
                                                        <th className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-right">Patrimônio</th>
                                                        <th className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-center">Ocupação</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-center">Bloco</th>
                                                        <th className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-center">Pav.</th>
                                                        <th className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-center whitespace-nowrap">Á. Priv.</th>
                                                        <th className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-right whitespace-nowrap">Aluguel Base</th>
                                                    </>
                                                )}
                                                <th className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-center">Status</th>
                                                <th className="px-6 py-4 text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-sm font-medium text-gray-700">
                                            {filteredProperties.map((property) => (
                                                <tr
                                                    key={property.id}
                                                    className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                                                    onClick={() => {
                                                        if (property.type === 'BUILDING' && !selectedBuildingId) {
                                                            setSelectedBuildingId(property.id);
                                                        } else {
                                                            setEditingProperty(property);
                                                            setIsPropertyModalOpen(true);
                                                        }
                                                    }}
                                                >
                                                    <td className="px-6 py-4 border-r border-gray-100 last:border-r-0">
                                                        <div className="flex items-center gap-3">
                                                            {property.type === 'BUILDING' ? (
                                                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                                                    <Building2 className="w-4 h-4" />
                                                                </div>
                                                            ) : (
                                                                <div className="p-2 bg-gray-50 text-gray-400 rounded-lg">
                                                                    <Home className="w-4 h-4" />
                                                                </div>
                                                            )}
                                                            <span className="font-black text-gray-900 group-hover:text-blue-600 transition-colors">{property.name}</span>
                                                        </div>
                                                    </td>
                                                    
                                                    {!selectedBuildingId ? (
                                                        <>
                                                            <td className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-gray-500 font-bold">
                                                                {property.address}
                                                            </td>
                                                            <td className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-right font-mono font-black text-gray-900">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(property.price || 0)}
                                                            </td>
                                                            <td className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-center">
                                                                {(() => {
                                                                    const bUnits = properties.filter(u => u.parent_id === property.id);
                                                                    const rentedCount = bUnits.filter(u => u.status === PropertyStatus.RENTED).length;
                                                                    const pct = bUnits.length > 0 ? (rentedCount / bUnits.length) * 100 : 0;
                                                                    return (
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            <span className="text-[10px] font-black text-blue-600">{pct.toFixed(0)}%</span>
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
                                                            <td className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-center text-gray-600 font-bold">
                                                                {property.block || '-'}
                                                            </td>
                                                            <td className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-center text-gray-600 font-bold">
                                                                {property.floor ? `${property.floor}º` : 'T'}
                                                            </td>
                                                            <td className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-center text-gray-500 font-bold">
                                                                {property.private_area ? `${property.private_area}m²` : '-'}
                                                            </td>
                                                            <td className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-right font-mono font-black text-indigo-600">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(property.price || 0)}
                                                            </td>
                                                        </>
                                                    )}

                                                    <td className="px-6 py-4 border-r border-gray-100 last:border-r-0 text-center">
                                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusColor(property.status)}`}>
                                                            {getStatusLabel(property.status)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={(e) => { e.stopPropagation(); setEditingProperty(property); setIsPropertyModalOpen(true); }} className="p-2 bg-gray-50 text-gray-400 hover:text-blue-600 rounded-xl transition-all shadow-sm"><Edit className="w-4 h-4" /></button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteProperty(property.id); }} className="p-2 bg-gray-50 text-gray-400 hover:text-red-500 rounded-xl transition-all shadow-sm"><Trash2 className="w-4 h-4" /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}


                            {viewMode === 'tower' && (
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
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-32 bg-gray-50 rounded-[3.5rem] border-4 border-dashed border-gray-200">
                            <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center shadow-2xl mb-8">
                                <Home className="w-12 h-12 text-blue-600 opacity-20" />
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">
                                {searchTerm ? 'Nenhum resultado encontrado' : 'Expandindo Horizontes...'}
                            </h3>
                            <p className="text-gray-500 font-bold text-center max-w-sm leading-relaxed">
                                {searchTerm 
                                    ? `Não encontramos imóveis para "${searchTerm}" nesta organização. Verifique os filtros ou tente outro termo.` 
                                    : 'Seu portfólio está pronto para crescer. Adicione o primeiro imóvel para iniciar a gestão comercial.'}
                            </p>
                            <button
                                onClick={() => setIsPropertyModalOpen(true)}
                                className="mt-10 px-10 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black shadow-2xl shadow-blue-600/30 hover:scale-105 active:scale-95 transition-all"
                            >
                                Cadastrar Primeiro Imóvel
                            </button>
                        </div>
                    )}

                    {/* Bulk Actions Bar */}
                    {selectedProperties.length > 0 && (
                        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-6 px-10 py-6 bg-[#0B1727] border border-white/10 rounded-full shadow-2xl shadow-blue-900/40 animate-in slide-in-from-bottom-10 duration-500">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none mb-1">Items Selecionados</span>
                                <span className="text-xl font-black text-white leading-none">{selectedProperties.length} Imóveis</span>
                            </div>

                            <div className="w-px h-10 bg-white/10 mx-2" />

                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Alterar para:</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleBulkUpdate({ status: PropertyStatus.AVAILABLE })}
                                        className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Disponível
                                    </button>
                                    <button
                                        onClick={() => handleBulkUpdate({ status: PropertyStatus.RESERVED })}
                                        className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Reservar
                                    </button>
                                    <button
                                        onClick={() => handleBulkUpdate({ status: PropertyStatus.EXCHANGED })}
                                        className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Permutar
                                    </button>
                                    <button
                                        onClick={() => {
                                            const newPrice = prompt('Informe o novo preço sugerido:');
                                            if (newPrice && !isNaN(parseFloat(newPrice))) {
                                                handleBulkUpdate({ price: parseFloat(newPrice) });
                                            }
                                        }}
                                        className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Mudar Preço
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={() => setSelectedProperties([])}
                                className="p-3 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-2xl transition-all"
                                title="Limpar Seleção"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {
                (selectedBuildingId && activeTab === 'deals') && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
                        <div className="flex justify-between items-center bg-gray-50/50 p-6 rounded-[2rem] border border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
                                    <Tag className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 tracking-tight">Registro de Contratos</h3>
                            </div>
                            <div className="flex p-1 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`} title="Grid"><LayoutGrid className="w-4 h-4" /></button>
                                <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`} title="Lista"><List className="w-4 h-4" /></button>
                            </div>
                        </div>

                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {deals.map(deal => {
                                    const property = properties.find(p => p.id === deal.property_id);
                                    return (
                                        <div key={deal.id} className="bg-white p-10 rounded-[2.5rem] border border-gray-200 shadow-xl shadow-gray-200/20 relative group hover:border-blue-200 transition-colors">
                                            <div className="absolute top-10 right-10 flex gap-2">
                                                <button
                                                    onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }}
                                                    className="p-3 bg-gray-50 text-gray-400 hover:text-blue-600 rounded-2xl transition-colors"
                                                >
                                                    <Edit className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteDeal(deal.id)}
                                                    className="p-3 bg-gray-50 text-gray-400 hover:text-red-500 rounded-2xl transition-colors"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2 mb-6">
                                                <span className={`px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${deal.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                                    {deal.status === 'COMPLETED' ? 'Concluído' :
                                                        deal.status === 'PENDING' ? 'Pendente' :
                                                            deal.status === 'CANCELLED' ? 'Cancelado' : 'Pendente'}
                                                </span>
                                                <div className="flex flex-col items-end ml-auto">
                                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">#{deal.id.substring(0, 8).toUpperCase()}</span>
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                                        {new Date(deal.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mb-8">
                                                <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-widest mb-2 inline-block bg-purple-600 text-white shadow-lg shadow-purple-600/20`}>
                                                    Locação Ativa
                                                </span>
                                                <h4 className="text-2xl font-black text-gray-900 group-hover:text-blue-600 transition-colors">{property?.name || 'Imóvel em referência'}</h4>
                                                <div className="flex items-center gap-2 mt-2 text-gray-500">
                                                    <User className="w-4 h-4" />
                                                    <span className="text-sm font-bold uppercase tracking-tight">
                                                        {deal.client_id ? (clients.find(c => c.id === deal.client_id)?.name || `ID: ${deal.client_id.substring(0, 8)}`) : 'Cliente não informado'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="p-8 bg-blue-50/50 rounded-[2rem] border border-blue-100 flex items-center justify-between mb-6">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Valor do Contrato</span>
                                                    <span className="text-3xl font-black text-gray-900">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value)}
                                                    </span>
                                                </div>
                                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-md">
                                                    <DollarSign className="w-6 h-6 text-emerald-500" />
                                                </div>
                                            </div>

                                            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl italic text-gray-500 text-sm font-medium border-l-4 border-gray-200">
                                                "{deal.notes}"
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Add New Deal Placeholder */}
                                <button
                                    onClick={() => {
                                        setEditingDeal({ id: '', property_id: '', client_id: '', type: 'RENTAL', value: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING' } as any);
                                        setIsDealModalOpen(true);
                                    }}
                                    className="bg-gray-50 border-4 border-dashed border-gray-200 rounded-[2.5rem] p-10 flex flex-col items-center justify-center group hover:bg-white hover:border-blue-200 transition-all"
                                >
                                    <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                        <Plus className="w-10 h-10 text-gray-300 group-hover:text-blue-600" />
                                    </div>
                                    <span className="text-xl font-black text-gray-400 group-hover:text-gray-900">Novo Contrato</span>
                                    <p className="text-sm font-bold text-gray-400 text-center mt-2 px-8">Inicie o registro de um novo contrato de aluguel.</p>
                                </button>
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-xl shadow-gray-200/20">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 border-b border-gray-100 italic">
                                        <tr>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">ID</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Imóvel</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Cliente</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Tipo</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Valor</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Data</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                                            <th className="px-8 py-6 text-right text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {deals.map(deal => {
                                            const property = properties.find(p => p.id === deal.property_id);
                                            const client = clients.find(c => c.id === deal.client_id);
                                            return (
                                                <tr key={deal.id} className="hover:bg-blue-50/30 transition-colors group cursor-pointer" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }}>
                                                    <td className="px-8 py-6">
                                                        <span className="font-mono text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 shadow-sm">#{deal.id.substring(0, 8).toUpperCase()}</span>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <span className="font-black text-gray-900 group-hover:text-blue-600 transition-colors">{property?.name || '---'}</span>
                                                    </td>
                                                    <td className="px-8 py-6 font-bold text-gray-600">
                                                        {client?.name || 'Não vinculado'}
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${deal.type === 'SALE' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'}`}>
                                                            {deal.type === 'SALE' ? 'Venda' : 'Locação'}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-6 font-mono font-black text-gray-900">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value)}
                                                    </td>
                                                    <td className="px-8 py-6 text-xs font-bold text-gray-400 uppercase tracking-tighter">
                                                        {new Date(deal.date).toLocaleDateString('pt-BR')}
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${deal.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                                            {deal.status === 'COMPLETED' ? 'Concluído' : 'Pendente'}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-6 text-right">
                                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={(e) => { e.stopPropagation(); setEditingDeal(deal); setIsDealModalOpen(true); }} className="p-2 bg-gray-50 text-gray-400 hover:text-blue-600 rounded-xl transition-all"><Edit className="w-4 h-4" /></button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteDeal(deal.id); }} className="p-2 bg-gray-50 text-gray-400 hover:text-red-500 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <button
                                    onClick={() => {
                                        setEditingDeal({ type: 'RENTAL' } as any);
                                        setIsDealModalOpen(true);
                                    }}
                                    className="w-full py-8 bg-gray-50/50 hover:bg-gray-50 text-gray-400 font-black uppercase tracking-[0.3em] text-xs transition-all border-t border-gray-100 flex items-center justify-center gap-3 group"
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
            />

            <DealModal
                isOpen={isDealModalOpen}
                onClose={() => { setIsDealModalOpen(false); setEditingDeal(undefined); }}
                onSave={() => loadData()}
                initialData={editingDeal}
                organizationId={organizationId}
            />
        </div >
    );
};

export default RentalsModule;
