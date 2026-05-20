import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Home, Key, TrendingUp, Plus, Search, Filter, Home as HomeIcon, MapPin, Maximize2, DollarSign, Tag, Calendar, User, MoreVertical, Edit, Trash2, LayoutGrid, List, ChevronRight, ChevronDown, X, BrainCircuit, Activity, Calculator, Percent, Target, ArrowUpDown, Mail, Phone, Briefcase } from 'lucide-react';
import { commercialService } from '../services/commercialService';
import { Property, PropertyStatus, PropertyDeal, Client, HedonicPricingConfig } from '../types';
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
import { projectService, ProjectData } from '../services/projectService';
import ProjectFinancialManager from './ProjectFinancialManager';
import PropertyUnitMap from './common/PropertyUnitMap';
import { SalesDashboard } from './SalesDashboard';
import PricingIntelligenceModal from './PricingIntelligenceModal';
import { pricingService } from '../services/pricingService';
import { brokerService } from '../services/brokerService';
import BrokerModal from './BrokerModal';
import { BrokerProfile } from '../types';

interface SalesModuleProps {
    organizationId?: string;
}

const SalesModule: React.FC<SalesModuleProps> = ({ organizationId }) => {
    const [activeTab, setActiveTab] = useState<'inventory' | 'deals' | 'dashboard' | 'simulation' | 'brokers'>(
        (localStorage.getItem('sales_active_tab') as 'inventory' | 'deals' | 'dashboard' | 'simulation' | 'brokers') || 'inventory'
    );
    const [properties, setProperties] = useState<Property[]>([]);
    const [brokers, setBrokers] = useState<BrokerProfile[]>([]);

    const [deals, setDeals] = useState<PropertyDeal[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'tower'>('list');
    const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
    const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(() => {
        const saved = localStorage.getItem('sales_selected_building_id');
        return (saved && saved !== 'undefined') ? saved : null;
    });
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);


    // Modals Control
    const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
    const [isDealModalOpen, setIsDealModalOpen] = useState(false);
    const [editingProperty, setEditingProperty] = useState<Property | undefined>(undefined);
    const [editingDeal, setEditingDeal] = useState<PropertyDeal | undefined>(undefined);
    const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
    const [isBrokerModalOpen, setIsBrokerModalOpen] = useState(false);
    const [editingBroker, setEditingBroker] = useState<BrokerProfile | undefined>(undefined);


    // Simulation States
    const [simMonthlySales, setSimMonthlySales] = useState<number>(2);
    const [simPriceAdjust, setSimPriceAdjust] = useState<number>(0);

    const loadData = async () => {
        console.log('[Commercial] Loading data for organization:', organizationId);
        setLoading(true);
        try {
            const [propsData, dealsData, clientsData, projectsData, brokersData] = await Promise.all([
                commercialService.listProperties(organizationId),
                commercialService.listDeals(),
                clientService.listClients(),
                projectService.listProjects(),
                brokerService.listProfiles(organizationId)
            ]);
            setProperties(propsData.filter(p => !p.purpose || p.purpose === 'SALE' || p.purpose === 'BOTH'));
            setDeals(dealsData.filter(d => d.type === 'SALE'));
            setClients(clientsData);
            setProjects(projectsData.map(proj => ({ ...proj, budget: [] })));
            setBrokers(brokersData);

        } catch (err) {
            console.error('[Commercial] Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!selectedBuildingId) {
            if (activeTab !== 'inventory') setActiveTab('inventory');
            if (sortConfig) setSortConfig(null);
            if (viewMode === 'tower') setViewMode('list');
        }
    }, [selectedBuildingId, activeTab, sortConfig, viewMode]);

    useEffect(() => {
        loadData();
    }, [organizationId]);

    // Persistência de estado da aba e edifício selecionado
    useEffect(() => {
        if (activeTab) localStorage.setItem('sales_active_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (selectedBuildingId) {
            localStorage.setItem('sales_selected_building_id', selectedBuildingId);
        } else {
            localStorage.removeItem('sales_selected_building_id');
        }
    }, [selectedBuildingId]);


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
                    existingUnits = await commercialService.listProperties(undefined, undefined); // Filtrar depois ou adicionar método no service
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
                        // Tentar deletar. Supabase falhará silenciosamente nos que têm DEALS (se houver restrição)
                        // ou nós podemos filtrar os que têm deals se quisermos ser proativos.
                        for(const id of unusedIds) {
                            try {
                                await commercialService.deleteProperty(id);
                            } catch (e) {
                                console.log(`[SalesModule] Could not delete unused unit ${id} (possibly has deals)`);
                            }
                        }
                    }

                    alert(`Edifício e ${totalCount} unidades processados com sucesso!`);
                } else {
                    alert('Imóvel cadastrado com sucesso! (Nenhuma unidade gerada)');
                }
            } else if (propertyToSave.type === 'BUILDING' && _bulkConfig && (_bulkConfig.count ?? 0) > 0) {
                // Fallback legado
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
                        number: String(unitNumber),
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

    const handleSaveDeal = async (data: Partial<PropertyDeal>) => {
        try {
            const savedDeal = await commercialService.saveDeal(data);

            // Vincular cliente ao imóvel e atualizar status se o negócio for concluído
            // (Esta responsabilidade agora é do commercialService.ts)


            alert('Negociação registrada com sucesso!');
            setIsDealModalOpen(false);
            setEditingDeal(undefined);
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            alert('Erro ao registrar negócio: ' + error.message);
        }
    };

    const handleApplyPricing = async (config: HedonicPricingConfig) => {
        if (!selectedBuildingId) return;

        try {
            setLoading(true);
            // 1. Get all units for this building
            const units = properties.filter(p => p.parent_id === selectedBuildingId);
            
            // 2. Calculate new prices using the service
            const updatedUnits = pricingService.calculatePrices(units, config);

            // 3. Save to database in batch
            await commercialService.savePropertiesBatch(updatedUnits);

            alert(`${updatedUnits.length} unidades precificadas com sucesso usando Inteligência Hedônica!`);
            setIsPricingModalOpen(false);
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('[Pricing] Error applying hedonic pricing:', error);
            alert('Erro ao aplicar precificação: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteDeal = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir esta negociação?')) {
            try {
                await commercialService.deleteDeal(id);
                alert('Negociação excluída com sucesso!');
                loadData();
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                alert(`IMPOSSÍVEL EXCLUIR: ${error.message}`);
            }
        }
    };

    const handleDeleteProperty = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir este imóvel?')) {
            try {
                await commercialService.deleteProperty(id);
                alert('Imóvel excluído!');
                loadData();
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                alert('Erro ao excluir: ' + error.message);
            }
        }
    };

    const handleSaveBroker = async (data: Partial<BrokerProfile>) => {
        const targetOrgId = organizationId || currentBuilding?.organization_id;

        if (!targetOrgId) {
            alert('Erro: Selecione uma organização ou um empreendimento para cadastrar o corretor.');
            return;
        }

        try {
            await brokerService.saveProfile({
                ...data,
                organization_id: targetOrgId
            });
            alert(data.id ? 'Corretor atualizado!' : 'Corretor cadastrado!');
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            alert('Erro ao salvar corretor: ' + error.message);
        }
    };

    const handleDeleteBroker = async (id: string) => {
        if (window.confirm('Excluir este corretor?')) {
            try {
                await brokerService.deleteProfile(id);
                alert('Corretor excluído!');
                loadData();
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                alert('Erro ao excluir: ' + error.message);
            }
        }
    };


    const filteredProperties = useMemo(() => {
        let result = properties.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.address.toLowerCase().includes(searchTerm.toLowerCase());
            
            if (!selectedBuildingId) {
                // Master View: Show only Buildings or main units (parent_id null)
                // If search term is present, show everything that matches
                if (searchTerm) return matchesSearch;
                
                // Relaxed rule: if it's a BUILDING, it belongs to master view regardless of parent_id
                return matchesSearch && (p.type === 'BUILDING' || !p.parent_id);
            }
            
            // Detail View: Show only children of the selected building
            return matchesSearch && String(p.parent_id).toLowerCase() === String(selectedBuildingId).toLowerCase();
        });

        if (sortConfig) {
            result.sort((a: Property, b: Property) => {
                let aValue = (a as unknown as Record<string, unknown>)[sortConfig.key];
                let bValue = (b as unknown as Record<string, unknown>)[sortConfig.key];

                // Tratamento especial para números/nulos
                if (aValue === null || aValue === undefined) aValue = sortConfig.direction === 'asc' ? Infinity : -Infinity;
                if (bValue === null || bValue === undefined) bValue = sortConfig.direction === 'asc' ? Infinity : -Infinity;

                if ((aValue as number) < (bValue as number)) return sortConfig.direction === 'asc' ? -1 : 1;
                if ((aValue as number) > (bValue as number)) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [properties, searchTerm, selectedBuildingId, sortConfig]);

    const currentBuilding = selectedBuildingId ? properties.find(p => String(p.id).toLowerCase() === String(selectedBuildingId).toLowerCase()) : null;

    const buildingDeals = selectedBuildingId ? deals.filter(deal => {
        const property = properties.find(p => p.id === deal.property_id);
        if (!property) return false;
        
        const isChild = String(property.parent_id).toLowerCase() === String(selectedBuildingId).toLowerCase();
        const isSelf = String(property.id).toLowerCase() === String(selectedBuildingId).toLowerCase();
        
        return isChild || isSelf;
    }) : deals;

    const stats = useMemo(() => {
        // Filtrar unidades vendáveis (excluir permutas da base estratégica)
        const vendaveis = filteredProperties.filter(p => p.status !== PropertyStatus.EXCHANGED);
        const soldUnitsCount = vendaveis.filter(p => p.status === PropertyStatus.SOLD).length;
        const totalVendavel = vendaveis.length;
        
        const vgvRealizado = buildingDeals
            .filter(d => d.type === 'SALE' && d.status === 'COMPLETED')
            .reduce((acc, d) => acc + (Number(d.value) || 0), 0);
            
        const vgvRemanescente = vendaveis
            .filter(p => p.status === PropertyStatus.AVAILABLE)
            .reduce((acc, p) => acc + (Number(p.price || p.initial_price) || 0), 0);
            
        const sellThrough = totalVendavel > 0 ? (soldUnitsCount / totalVendavel) * 100 : 0;
        const ticketMedio = soldUnitsCount > 0 ? vgvRealizado / soldUnitsCount : 0;

        return {
            totalVendavel,
            soldUnitsCount,
            vgvRealizado,
            vgvRemanescente,
            sellThrough: sellThrough.toFixed(1),
            ticketMedio
        };
    }, [filteredProperties, buildingDeals]);

    const getStatusColor = (status: PropertyStatus) => {
        switch (status) {
            case PropertyStatus.AVAILABLE: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case PropertyStatus.SOLD: return 'bg-red-500/10 text-red-500 border-red-500/20';
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
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            alert('Erro na atualização em massa: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectProperty = (propertyId: string) => {
        setSelectedProperties(prev => 
            prev.includes(propertyId) ? prev.filter(id => id !== propertyId) : [...prev, propertyId]
        );
    };

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                if (current.direction === 'asc') return { key, direction: 'desc' };
                return null; // Terceiro clique remove a ordenação
            }
            return { key, direction: 'asc' };
        });
    };

    const SortIndicator = ({ columnKey }: { columnKey: string }) => {
        if (sortConfig?.key !== columnKey) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-20 group-hover:opacity-100 transition-opacity" />;
        if (sortConfig.direction === 'asc') return <ChevronDown className="w-3 h-3 ml-1 text-blue-600 rotate-180 transition-transform" />;
        return <ChevronDown className="w-3 h-3 ml-1 text-blue-600" />;
    };

    const handleSelectAllInBuilding = (buildingId: string, unitIds: string[]) => {
        const allSelected = unitIds.every(id => selectedProperties.includes(id));
        if (allSelected) {
            setSelectedProperties(prev => prev.filter(id => !unitIds.includes(id)));
        } else {
            setSelectedProperties(prev => [...new Set([...prev, ...unitIds])]);
        }
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
                } else {
                    onRegisterDeal();
                }
            }}
            className={`bg-white border rounded-[2.5rem] overflow-hidden group hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] hover:-translate-y-2 transition-all duration-500 cursor-pointer ${compact ? 'scale-95 origin-top' : ''} ${selected ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-200'}`}
        >
            <div className="aspect-[16/11] bg-gray-100 relative overflow-hidden">
                <div className="absolute top-6 left-6 z-10">
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
                    <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-blue-50 transition-colors">
                        <TrendingUp className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-6">
                    <div className="flex-1 bg-gray-50 p-3 rounded-2xl flex flex-col items-center justify-center border border-gray-100">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Valor m²</span>
                        <span className="text-xs font-black text-gray-700">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format((property.price || 0) / (property.private_area || property.area || 1))}
                        </span>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-2xl flex flex-col items-center justify-center border border-blue-100">
                        <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest mb-1">Posição</span>
                        <span className="text-xs font-black text-blue-700">
                            {property.position_type === 'FRONT' ? '1.03x' : property.position_type === 'BACK' ? '0.97x' : '1.00x'}
                        </span>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-2xl flex flex-col items-center justify-center border border-amber-100">
                        <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1">Sol</span>
                        <span className="text-xs font-black text-amber-700">
                            {property.sun_orientation === 'NORTH' ? '1.02x' : property.sun_orientation === 'EAST' ? '1.01x' : property.sun_orientation === 'WEST' ? '0.99x' : property.sun_orientation === 'SOUTH' ? '0.98x' : '1.00x'}
                        </span>
                    </div>
                </div>

                <button
                    onClick={onRegisterDeal}
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
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
                            <Building2 className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Comercial • Vendas</span>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight">Venda de Ativos</h1>
                    <p className="text-gray-400 font-medium mt-1">Controle de inventário de vendas, negociações e performance imobiliária.</p>
                </div>
                <div className="flex items-center gap-3 relative z-10">
                    {selectedBuildingId && (
                        <button 
                            onClick={() => {
                                setSelectedBuildingId(null);
                                if (viewMode === 'tower') setViewMode('grid');
                            }}
                            className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black transition-all border border-white/10 group"
                        >
                            <ChevronDown className="w-5 h-5 group-hover:-translate-x-1 transition-transform rotate-90" />
                            Ver Todos Empreendimentos
                        </button>
                    )}
                    {selectedBuildingId && (
                        <button
                            onClick={() => setIsPricingModalOpen(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-2xl font-black transition-all border border-blue-600/20 group"
                        >
                            <BrainCircuit className="w-5 h-5 text-blue-500 group-hover:rotate-12 transition-transform" />
                            Inteligência de Preços
                        </button>
                    )}
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
                        Novo Imóvel
                    </button>
                </div>
            </div>

            {/* Pricing Modal */}
            <PricingIntelligenceModal
                isOpen={isPricingModalOpen}
                onClose={() => setIsPricingModalOpen(false)}
                onApply={handleApplyPricing}
                buildingName={currentBuilding?.name || ''}
            />

            {selectedBuildingId && (
                <div className="flex items-center gap-2 px-6 py-3 bg-blue-600/10 border border-blue-600/20 rounded-2xl w-fit animate-in fade-in slide-in-from-left-4 duration-500">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Visualizando: {currentBuilding?.name}</span>
                </div>
            )}


            {/* Tabs - Only show when a building is selected OR if we want to allow global deals later (but user asked to hide) */}
            {selectedBuildingId && (
                <div className={`flex p-1.5 bg-gray-200/50 backdrop-blur-md rounded-[1.5rem] w-fit border border-gray-200 shadow-inner overflow-hidden transition-all duration-500`}>
                    <button
                        onClick={() => setActiveTab('inventory')}
                        className={`flex items-center gap-2 px-8 py-3 rounded-[1.25rem] font-black tracking-tight transition-all duration-300 ${activeTab === 'inventory' ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                    >
                        <HomeIcon className={`w-4 h-4 ${activeTab === 'inventory' ? 'fill-blue-600/10' : ''}`} />
                        Unidades do Edifício
                    </button>
                    <button
                        onClick={() => setActiveTab('deals')}
                        className={`flex items-center gap-2 px-8 py-3 rounded-[1.25rem] font-black tracking-tight transition-all duration-300 ${activeTab === 'deals' ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                    >
                        <Tag className={`w-4 h-4 ${activeTab === 'deals' ? 'fill-blue-600/10' : ''}`} />
                        Negociações
                    </button>
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`flex items-center gap-2 px-8 py-3 rounded-[1.25rem] font-black tracking-tight transition-all duration-300 ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                    >
                        <TrendingUp className={`w-4 h-4 ${activeTab === 'dashboard' ? 'fill-blue-600/10' : ''}`} />
                        Resultados
                    </button>
                    <button
                        onClick={() => setActiveTab('simulation')}
                        className={`flex items-center gap-2 px-8 py-3 rounded-[1.25rem] font-black tracking-tight transition-all duration-300 ${activeTab === 'simulation' ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                    >
                        <Activity className={`w-4 h-4 ${activeTab === 'simulation' ? 'fill-blue-600/10' : ''}`} />
                        Simulação
                    </button>
                    <button
                        onClick={() => setActiveTab('brokers')}
                        className={`flex items-center gap-2 px-8 py-3 rounded-[1.25rem] font-black tracking-tight transition-all duration-300 ${activeTab === 'brokers' ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                    >
                        <User className={`w-4 h-4 ${activeTab === 'brokers' ? 'fill-blue-600/10' : ''}`} />
                        Corretores
                    </button>
                </div>

            )}


            {/* Content */}
            {activeTab === 'inventory' && (
                <div className="space-y-6">
                    {/* Stats Summary Row */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {[
                            { label: 'Estoque (Und)', value: `${stats.soldUnitsCount} / ${stats.totalVendavel}`, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'VGV Vendido', value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.vgvRealizado), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                            { label: 'Sell-Through', value: `${stats.sellThrough}%`, icon: Percent, color: 'text-purple-600', bg: 'bg-purple-50' },
                            { label: 'VGV Remanescente', value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.vgvRemanescente), icon: Target, color: 'text-amber-600', bg: 'bg-amber-50' },
                            { label: 'Ticket Médio', value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.ticketMedio), icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-50/50' }
                        ].map((s, i) => (
                            <div key={i} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 group hover:border-blue-200 transition-all duration-300">
                                <div className={`p-3 ${s.bg} ${s.color} rounded-2xl group-hover:scale-110 transition-transform`}>
                                    <s.icon className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1 group-hover:text-blue-400 transition-colors">{s.label}</span>
                                    <span className="text-lg font-black text-gray-900 leading-none">{s.value}</span>
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
                                placeholder="Buscar por imóvel, endereço ou referência..."
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
                                <button onClick={() => setViewMode('tower')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'tower' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Torres"><Building2 className="w-5 h-5" /></button>
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
                        <div className="flex flex-col gap-6">
                            {viewMode === 'grid' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {selectedBuildingId ? (
                                         // DETAIL VIEW MODE
                                         filteredProperties.length > 0 ? (
                                             filteredProperties.map((property) => (
                                                <div key={property.id}>
                                                    <PropertyCard
                                                        property={property}
                                                        selected={selectedProperties.includes(property.id)}
                                                        onSelect={() => handleSelectProperty(property.id)}
                                                        onEdit={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }}
                                                        onDelete={() => handleDeleteProperty(property.id)}
                                                        onRegisterDeal={() => {
                                                            setEditingDeal({ id: '', property_id: property.id, client_id: '', type: 'SALE', value: property.price, date: new Date().toISOString().split('T')[0], status: 'PENDING' });
                                                            setIsDealModalOpen(true);
                                                        }}
                                                        getStatusColor={getStatusColor}
                                                        getStatusLabel={getStatusLabel}
                                                    />
                                                </div>
                                             ))
                                         ) : (
                                              <div className="col-span-full py-16 text-center">
                                                  <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Nenhuma unidade encontrada para este edifício.</p>
                                              </div>
                                         )
                                    ) : (
                                         // MASTER VIEW MODE
                                        filteredProperties.map((property) => {
                                            return (
                                                <div key={property.id} onClick={() => setSelectedBuildingId(property.id)} className="cursor-pointer transition-transform hover:-translate-y-1">
                                                    <PropertyCard
                                                        property={property}
                                                        selected={selectedProperties.includes(property.id)}
                                                        onSelect={() => handleSelectProperty(property.id)}
                                                        onEdit={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }}
                                                        onDelete={() => handleDeleteProperty(property.id)}
                                                        onRegisterDeal={() => {
                                                            setEditingDeal({ id: '', property_id: property.id, client_id: '', type: 'SALE', value: property.price, date: new Date().toISOString().split('T')[0], status: 'PENDING' });
                                                            setIsDealModalOpen(true);
                                                        }}
                                                        getStatusColor={getStatusColor}
                                                        getStatusLabel={getStatusLabel}
                                                    />
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}

                            {viewMode === 'list' && (
                                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px] tracking-widest text-center">
                                            <tr>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-left">Imóvel</th>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 text-left">Endereço / Referência</th>
                                                {selectedBuildingId && (
                                                    <>
                                                        <th 
                                                            onClick={() => handleSort('block')}
                                                            className="px-6 py-2 border-r border-gray-100 last:border-r-0 cursor-pointer hover:bg-gray-100 transition-colors group"
                                                        >
                                                            <div className="flex items-center justify-center">
                                                                Bloco
                                                                <SortIndicator columnKey="block" />
                                                            </div>
                                                        </th>
                                                        <th 
                                                            onClick={() => handleSort('private_area')}
                                                            className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors group"
                                                        >
                                                            <div className="flex items-center justify-center">
                                                                Á. Priv.
                                                                <SortIndicator columnKey="private_area" />
                                                            </div>
                                                        </th>
                                                    </>
                                                )}
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap">Preço</th>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap">Vlr/m²</th>
                                                {selectedBuildingId && (
                                                    <>
                                                        <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Peso Pos.</th>
                                                        <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Peso Sol</th>
                                                        <th 
                                                            onClick={() => handleSort('floor')}
                                                            className="px-6 py-2 border-r border-gray-100 last:border-r-0 cursor-pointer hover:bg-gray-100 transition-colors group"
                                                        >
                                                            <div className="flex items-center justify-center">
                                                                Andar
                                                                <SortIndicator columnKey="floor" />
                                                            </div>
                                                        </th>
                                                    </>
                                                )}
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Status</th>
                                                <th className="px-6 py-2 text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 text-sm font-medium text-gray-700">
                                            {selectedBuildingId ? (
                                                filteredProperties.length > 0 ? (
                                                    filteredProperties.map(property => (
                                                        <tr key={property.id} className="hover:bg-blue-50/50 transition-colors">
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-mono text-sm font-bold text-gray-700">
                                                                {property.name}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                                {property.address || 'Resumo do Empreendimento'}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-medium text-gray-700">
                                                                {property.block || '-'}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-medium text-gray-600">
                                                                {property.private_area ? `${property.private_area}m²` : '-'}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-black text-gray-900">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(property.price || 0)}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-xs font-bold text-gray-600">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format((property.price || 0) / (property.private_area || property.area || 1))}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-[10px] font-black">
                                                                <div className="flex flex-col">
                                                                    <span className="text-gray-900 leading-none mb-1">
                                                                        {property.position_type === 'FRONT' ? '1.03x' : property.position_type === 'BACK' ? '0.97x' : '1.00x'}
                                                                    </span>
                                                                    <span className="text-gray-400 font-bold uppercase text-[8px] tracking-tighter">
                                                                        {property.position_type === 'FRONT' ? 'Frente' : property.position_type === 'BACK' ? 'Fundos' : 'Lateral / Base'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-[10px] font-black">
                                                                <div className="flex flex-col">
                                                                    <span className="text-gray-900 leading-none mb-1">
                                                                        {property.sun_orientation === 'NORTH' ? '1.02x' : property.sun_orientation === 'EAST' ? '1.01x' : property.sun_orientation === 'WEST' ? '0.99x' : property.sun_orientation === 'SOUTH' ? '0.98x' : '1.00x'}
                                                                    </span>
                                                                    <span className="text-gray-400 font-bold uppercase text-[8px] tracking-tighter">
                                                                        {property.sun_orientation === 'NORTH' ? 'Norte' : property.sun_orientation === 'EAST' ? 'Leste' : property.sun_orientation === 'WEST' ? 'Oeste' : property.sun_orientation === 'SOUTH' ? 'Sul' : 'Base'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-xs font-bold text-center text-gray-500">
                                                                {property.floor ? `${property.floor}º` : 'Térreo'}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                                <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusColor(property.status)}`}>
                                                                    {getStatusLabel(property.status)}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-2.5 text-right">
                                                                <div className="flex items-center justify-end gap-3">
                                                                    <button onClick={(e) => { e.stopPropagation(); setEditingProperty(property); setIsPropertyModalOpen(true); }} className="text-blue-600 hover:text-blue-800 text-xs font-black uppercase tracking-widest p-1.5 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-1.5"><Edit className="w-3.5 h-3.5" />Editar</button>
                                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteProperty(property.id); }} className="text-red-400 hover:text-red-600 text-xs font-black uppercase tracking-widest p-1.5 hover:bg-red-50 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={11} className="px-6 py-10 text-center text-gray-400 font-bold italic border-b border-gray-100">Nenhuma unidade encontrada.</td>
                                                    </tr>
                                                )
                                            ) : (
                                                filteredProperties.filter(p => p.type === 'BUILDING' || !p.parent_id).map(property => (
                                                    <tr key={property.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => setSelectedBuildingId(property.id)}>
                                                        <td className="px-6 py-3 border-r border-gray-100 last:border-r-0 font-bold text-gray-900 group-hover:text-blue-600 transition-colors uppercase whitespace-nowrap">{property.name}</td>
                                                        <td className="px-6 py-3 border-r border-gray-100 last:border-r-0 text-gray-400 text-xs italic">{property.address || 'Resumo do Empreendimento'}</td>
                                                        <td className="px-6 py-3 border-r border-gray-100 last:border-r-0 font-bold text-gray-900 whitespace-nowrap">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(property.price || 0)}</td>
                                                        <td className="px-6 py-3 border-r border-gray-100 last:border-r-0 text-center whitespace-nowrap text-xs font-bold text-gray-400">---</td>
                                                        <td className="px-6 py-3 border-r border-gray-100 last:border-r-0 text-center"><span className={`px-2 py-0.5 rounded uppercase tracking-widest text-[9px] font-black border ${getStatusColor(property.status)}`}>{getStatusLabel(property.status)}</span></td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-right">
                                                            <div className="flex justify-end gap-1">
                                                                <button onClick={(e) => { e.stopPropagation(); setEditingProperty(property); setIsPropertyModalOpen(true); }} className="p-1 text-gray-400 hover:text-blue-600"><Edit className="w-4 h-4" /></button>
                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteProperty(property.id); }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {viewMode === 'tower' && (
                                <PropertyUnitMap 
                                    units={filteredProperties}
                                    parentProperty={properties.find(p => p.id === selectedBuildingId)}
                                    deals={deals}
                                    mode="admin"
                                    onEditUnit={(unit) => { setEditingProperty(unit); setIsPropertyModalOpen(true); }}
                                    onSelectUnit={(unit) => {
                                        if (!selectedBuildingId && (unit.type === 'BUILDING' || !unit.parent_id)) {
                                            setSelectedBuildingId(unit.id);
                                        } else {
                                            setEditingDeal({ id: '', property_id: unit.id, client_id: '', type: 'SALE', value: unit.price, date: new Date().toISOString().split('T')[0], status: 'PENDING' });
                                            setIsDealModalOpen(true);
                                        }
                                    }}
                                />
                            )}


                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-32 bg-gray-50 rounded-[3.5rem] border-4 border-dashed border-gray-200">
                            <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center shadow-2xl mb-8">
                                <Home className="w-12 h-12 text-blue-600 opacity-20" />
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Expandindo Horizontes...</h3>
                            <p className="text-gray-500 font-bold text-center max-w-sm leading-relaxed">Seu portfólio está pronto para crescer. Adicione o primeiro imóvel para iniciar a gestão comercial.</p>
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

            {activeTab === 'simulation' && selectedBuildingId && (
                <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
                    <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-blue-900/5">
                        <div className="flex justify-between items-center mb-10">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Motor de Simulação VGV</h3>
                                <p className="text-gray-500 font-bold text-sm">Ajuste os parâmetros para projetar o futuro financeiro de {currentBuilding?.name}</p>
                            </div>
                            <div className="flex gap-2">
                                <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
                                    <BrainCircuit className="w-6 h-6" />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
                            <div className="lg:col-span-1 space-y-8 p-8 bg-gray-50 rounded-[2rem] border border-gray-100">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Velocidade de Vendas</label>
                                        <span className="text-sm font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{simMonthlySales} und/mês</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="20" 
                                        step="1"
                                        value={simMonthlySales}
                                        onChange={(e) => setSimMonthlySales(Number(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <p className="text-[9px] font-bold text-gray-400 leading-tight">Define quantas unidades do estoque são absorvidas mensalmente.</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ajuste de Preço (VGV)</label>
                                        <span className={`text-sm font-black px-2 py-1 rounded-lg ${simPriceAdjust >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                                            {simPriceAdjust > 0 ? '+' : ''}{simPriceAdjust}%
                                        </span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="-20" 
                                        max="50" 
                                        step="1"
                                        value={simPriceAdjust}
                                        onChange={(e) => setSimPriceAdjust(Number(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <p className="text-[9px] font-bold text-gray-400 leading-tight">Simula valorização ou descontos agressivos no estoque remanescente.</p>
                                </div>

                                <div className="pt-6 border-t border-gray-200 space-y-4">
                                    <div className="p-4 bg-gray-900 rounded-2xl text-white">
                                        <div className="flex items-center gap-2 mb-2">
                                            <TrendingUp className="w-4 h-4 text-blue-400" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Tempo de Esgotamento</span>
                                        </div>
                                        <p className="text-2xl font-black">
                                            {Math.ceil(filteredProperties.length / (simMonthlySales || 1))} 
                                            <span className="text-xs text-gray-400 ml-1">Meses</span>
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => { setSimMonthlySales(2); setSimPriceAdjust(0); }}
                                        className="w-full py-3 bg-white text-gray-400 hover:text-gray-900 text-[10px] font-black uppercase tracking-widest rounded-xl border border-gray-200 transition-all"
                                    >
                                        Resetar Simulação
                                    </button>
                                </div>
                            </div>

                            <div className="lg:col-span-3">
                                <SalesDashboard 
                                    buildings={properties} 
                                    selectedBuildingId={selectedBuildingId} 
                                    mode="simulation"
                                    organizationId={organizationId}
                                    simulationParams={{
                                        monthlySales: simMonthlySales,
                                        priceAdjust: simPriceAdjust
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'deals' && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
                        <div className="flex justify-between items-center bg-gray-50/50 p-6 rounded-[2rem] border border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
                                    <Tag className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                                    Registro de Negociações {selectedBuildingId && currentBuilding ? `(Filtrado: ${currentBuilding.name} - ${buildingDeals.length} de ${deals.length})` : `(Global: ${deals.length})`}
                                </h3>
                            </div>
                            <div className="flex p-1 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`} title="Grid"><LayoutGrid className="w-4 h-4" /></button>
                                <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`} title="Lista"><List className="w-4 h-4" /></button>
                            </div>
                        </div>

                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {buildingDeals.map(deal => {
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
                                                            deal.status === 'CANCELLED' ? 'Cancelado' : 'Em Negociação'}
                                                </span>
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-auto">
                                                    {new Date(deal.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                </span>
                                            </div>

                                            <div className="mb-8">
                                                <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-widest mb-2 inline-block bg-blue-600 text-white shadow-lg shadow-blue-600/20`}>
                                                    Venda Direta
                                                </span>
                                                <h4 className="text-2xl font-black text-gray-900 group-hover:text-blue-600 transition-colors">{property?.name || 'Imóvel em referência'}</h4>
                                                <div className="flex items-center gap-2 mt-2 text-gray-500">
                                                    <User className="w-4 h-4" />
                                                    <span className="text-sm font-bold uppercase tracking-tight">
                                                        {deal.client_id ? (clients.find(c => c.id === deal.client_id)?.name || `ID: ${deal.client_id.substring(0, 8)}`) : 'Cliente não informado'}
                                                    </span>
                                                </div>
                                                <div className="mt-2 text-[9px] font-mono text-gray-400 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                                    Debug ID: {property?.id}<br/>Pai: {property?.parent_id || 'Nenhum'}<br/>B: {selectedBuildingId}
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
                                        setEditingDeal({ id: '', property_id: '', client_id: '', type: 'SALE', value: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING' } as PropertyDeal);
                                        setIsDealModalOpen(true);
                                    }}
                                    className="bg-gray-50 border-4 border-dashed border-gray-200 rounded-[2.5rem] p-10 flex flex-col items-center justify-center group hover:bg-white hover:border-blue-200 transition-all"
                                >
                                    <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                        <Plus className="w-10 h-10 text-gray-300 group-hover:text-blue-600" />
                                    </div>
                                    <span className="text-xl font-black text-gray-400 group-hover:text-gray-900">Nova Negociação</span>
                                    <p className="text-sm font-bold text-gray-400 text-center mt-2 px-8">Inicie o registro de uma nova venda ou aluguel de imóvel.</p>
                                </button>
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-xl shadow-gray-200/20">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 border-b border-gray-100 italic">
                                        <tr>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">Imóvel</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Bloco</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center whitespace-nowrap">Á. Priv.</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right whitespace-nowrap">Preço Base</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right whitespace-nowrap">Vlr/m² Base</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Andar</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right whitespace-nowrap">Vlr Venda</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right whitespace-nowrap">Vlr Venda/m²</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right whitespace-nowrap">Var. (R$)</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center whitespace-nowrap">Var. (%)</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {buildingDeals.map(deal => {
                                            const property = properties.find(p => p.id === deal.property_id);
                                            const client = clients.find(c => c.id === deal.client_id);
                                            return (
                                                <tr key={deal.id} className="hover:bg-blue-50/30 transition-colors group cursor-pointer" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }}>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-black text-gray-900 group-hover:text-blue-600 transition-colors">{property?.name || '---'}</span>
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                                                {client?.name || 'Não vinculado'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-bold text-gray-600 text-xs">
                                                        {property?.block || '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-bold text-gray-600 text-xs">
                                                        {property?.private_area || property?.area || 0}m²
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono font-bold text-gray-500 text-xs">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(property?.price || 0)}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono font-bold text-gray-400 text-xs">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format((property?.price || 0) / (property?.private_area || property?.area || 1))}
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-bold text-gray-600 text-xs text-center">
                                                        {property?.floor ? `${property.floor}º` : 'T'}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono font-black text-gray-900">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(deal.value)}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono font-black text-blue-600">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(deal.value / (property?.private_area || property?.area || 1))}
                                                    </td>
                                                    {(() => {
                                                        const m2Base = (property?.price || 0) / (property?.private_area || property?.area || 1);
                                                        const m2Venda = deal.value / (property?.private_area || property?.area || 1);
                                                        const variancia = m2Venda - m2Base;
                                                        const varianciaPct = m2Base > 0 ? (variancia / m2Base) * 100 : 0;
                                                        
                                                        return (
                                                            <>
                                                                <td className={`px-6 py-4 text-right font-mono font-bold ${variancia >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                    {variancia >= 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(variancia)}
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${variancia >= 0 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                                                        {Math.abs(varianciaPct).toFixed(1)}%
                                                                    </span>
                                                                </td>
                                                            </>
                                                        );
                                                    })()}
                                                    <td className="px-6 py-4">
                                                        <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${deal.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                                            {deal.status === 'COMPLETED' ? 'Concluído' : 'Pendente'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
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
                                        setEditingDeal({ type: 'SALE' } as PropertyDeal);
                                        setIsDealModalOpen(true);
                                    }}
                                    className="w-full py-8 bg-gray-50/50 hover:bg-gray-50 text-gray-400 font-black uppercase tracking-[0.3em] text-xs transition-all border-t border-gray-100 flex items-center justify-center gap-3 group"
                                >
                                    <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                                    Registrar Nova Negociação
                                </button>
                            </div>
                        )}
                    </div>
                )
            }

            {
                activeTab === 'dashboard' && (
                    <SalesDashboard 
                        selectedBuildingId={selectedBuildingId} 
                        buildings={properties} 
                        organizationId={currentBuilding?.organization_id || organizationId}
                    />
                )
            }

            {activeTab === 'brokers' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
                    <div className="flex justify-between items-center bg-gray-50/50 p-8 rounded-[2.5rem] border border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-600 rounded-2xl shadow-xl shadow-blue-600/20">
                                <User className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Gestão de Corretores</h3>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Parceiros e Comissionamento</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setEditingBroker(undefined);
                                setIsBrokerModalOpen(true);
                            }}
                            className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black shadow-xl shadow-blue-600/20 hover:scale-105 active:scale-95 transition-all group"
                        >
                            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                            Novo Corretor
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {brokers.filter(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()) || b.email.toLowerCase().includes(searchTerm.toLowerCase())).map(broker => (
                            <div key={broker.id} className="bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-xl shadow-gray-200/10 hover:border-blue-200 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 flex gap-2">
                                    <button onClick={() => { setEditingBroker(broker); setIsBrokerModalOpen(true); }} className="p-2.5 bg-gray-50 text-gray-400 hover:text-blue-600 rounded-xl transition-all shadow-sm"><Edit className="w-4 h-4" /></button>
                                    <button onClick={() => handleDeleteBroker(broker.id)} className="p-2.5 bg-gray-50 text-gray-400 hover:text-red-500 rounded-xl transition-all shadow-sm"><Trash2 className="w-4 h-4" /></button>
                                </div>

                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all font-black text-xl">
                                        {broker.name.charAt(0)}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border w-fit mb-2 ${broker.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                            {broker.is_active ? 'Ativo' : 'Inativo'}
                                        </span>
                                        <h4 className="text-xl font-black text-gray-900 truncate max-w-[180px]">{broker.name}</h4>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 text-gray-500">
                                        <Mail className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm font-bold truncate">{broker.email}</span>
                                    </div>
                                    {broker.phone && (
                                        <div className="flex items-center gap-3 text-gray-500">
                                            <Phone className="w-4 h-4 text-gray-400" />
                                            <span className="text-sm font-bold">{broker.phone}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3 text-gray-500">
                                        <Briefcase className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm font-bold text-blue-600">{broker.agency_name || 'Autônomo'}</span>
                                    </div>
                                </div>

                                <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Comissão Padrão</span>
                                        <span className="text-2xl font-black text-gray-900">{broker.commission_rate}%</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">CRECI</span>
                                        <span className="text-sm font-black text-gray-600 bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">{broker.creci || '---'}</span>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Card Vazio / Adicionar */}
                        <button
                            onClick={() => {
                                setEditingBroker(undefined);
                                setIsBrokerModalOpen(true);
                            }}
                            className="bg-blue-50/30 border-4 border-dashed border-blue-100 rounded-[2.5rem] p-8 flex flex-col items-center justify-center group hover:bg-blue-50 hover:border-blue-200 transition-all min-h-[300px]"
                        >
                            <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <Plus className="w-8 h-8 text-blue-400" />
                            </div>
                            <span className="text-lg font-black text-blue-600">Conectar Novo Corretor</span>
                            <p className="text-xs font-bold text-blue-400 text-center mt-2 px-10">Expanda sua rede de vendas cadastrando novos parceiros.</p>
                        </button>
                    </div>
                </div>
            )}



            <PropertyModal
                isOpen={isPropertyModalOpen}
                onClose={() => { setIsPropertyModalOpen(false); setEditingProperty(undefined); }}
                onSubmit={handleSaveProperty}
                initialData={editingProperty || (selectedBuildingId ? { parent_id: selectedBuildingId, type: 'APARTMENT' } as Property : undefined)}
                defaultPurpose="SALE"
            />

            <DealModal
                isOpen={isDealModalOpen}
                onClose={() => { setIsDealModalOpen(false); setEditingDeal(undefined); }}
                onSave={() => loadData()}
                initialData={editingDeal}
                organizationId={organizationId}
                buildingId={selectedBuildingId || undefined}
            />

            <BrokerModal
                isOpen={isBrokerModalOpen}
                onClose={() => { setIsBrokerModalOpen(false); setEditingBroker(undefined); }}
                onSave={handleSaveBroker}
                initialData={editingBroker}
            />

        </div >
    );
};

export default SalesModule;
