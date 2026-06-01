import React, { useState, useEffect } from 'react';
import { Building2, Home, Key, TrendingUp, Plus, Search, Filter, Home as HomeIcon, MapPin, Maximize2, DollarSign, Tag, Calendar, User, MoreVertical, Edit, Trash2, LayoutGrid, List, ChevronRight, ChevronDown, X, RotateCw, Layers } from 'lucide-react';
import { commercialService } from '../services/commercialService';
import { Property, PropertyStatus, PropertyDeal, Client } from '../types';
import { clientService } from '../services/clientService';
import { projectService, ProjectData } from '../services/projectService';
import PropertyModal from './PropertyModal';
import DealModal from './DealModal';
import PropertyUnitMap from './common/PropertyUnitMap';

interface CommercialModuleProps {
    organizationId?: string;
    targetTab?: 'inventory' | 'deals' | 'dashboard';
    dealTypeFilter?: 'SALE' | 'RENTAL';
}

const CommercialModule: React.FC<CommercialModuleProps> = ({ organizationId, targetTab, dealTypeFilter }) => {
    const [activeTab, setActiveTab] = useState<'inventory' | 'deals' | 'dashboard'>(
        (localStorage.getItem('commercial_active_tab') as any) || targetTab || 'inventory'
    );
    const [properties, setProperties] = useState<Property[]>([]);
    const [deals, setDeals] = useState<PropertyDeal[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'tower'>(
        (localStorage.getItem('commercial_view_mode') as any) || 'tower'
    );
    const [selectedProperties, setSelectedProperties] = useState<string[]>([]);

    // Modals Control
    const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
    const [isDealModalOpen, setIsDealModalOpen] = useState(false);
    const [editingProperty, setEditingProperty] = useState<Property | undefined>(undefined);
    const [editingDeal, setEditingDeal] = useState<PropertyDeal | undefined>(undefined);

    const loadData = async () => {
        console.log('[Commercial] Loading data for organization:', organizationId);
        setLoading(true);
        try {
            const [propsData, dealsData, clientsData, projectsData] = await Promise.all([
                commercialService.listProperties(organizationId),
                commercialService.listDeals(),
                clientService.listClients(),
                projectService.listProjects()
            ]);
            setProperties(propsData);
            setDeals(dealsData);
            setClients(clientsData);
            setProjects(projectsData.map(proj => ({ ...proj, budget: [] })));
        } catch (err) {
            console.error('[Commercial] Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [organizationId]);

    // Persistência de estado da aba e modo de visualização
    useEffect(() => {
        if (activeTab) localStorage.setItem('commercial_active_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (viewMode) localStorage.setItem('commercial_view_mode', viewMode);
    }, [viewMode]);

    const handleOpenDealForProperty = (property: Property) => {
        const existingDeals = deals.filter(d => d.property_id === property.id);
        
        if (existingDeals.length > 0) {
            const activeDeal = existingDeals.find(d => d.status !== 'CANCELLED') || existingDeals[0];
            setEditingDeal(activeDeal);
        } else {
            setEditingDeal({ 
                id: '', 
                property_id: property.id, 
                client_id: '', 
                type: dealTypeFilter || 'SALE', 
                value: property.current_price || property.price || 0, 
                date: new Date().toISOString().split('T')[0], 
                status: 'PENDING' 
            });
        }
        setIsDealModalOpen(true);
    };



    const handleSaveProperty = async (data: any) => {
        if (!organizationId && !data.organization_id) {
            alert('Erro: Nenhuma organização ativa selecionada. Por favor, selecione uma empresa no menu lateral.');
            return;
        }

        try {
            const { _bulkConfig, ...propertyData } = data;

            // Garantir que a organização está vinculada ao criar novo imóvel
            const propertyToSave: any = {
                ...propertyData,
                organization_id: propertyData.organization_id || organizationId,
                purpose: propertyData.purpose || dealTypeFilter || 'BOTH'
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
                
                _bulkConfig.matrix.forEach((tower: any) => {
                    const floors = tower.floors || 0;
                    const gridCells = tower.gridCells || [];
                    
                    for (let f = 1; f <= floors; f++) {
                        gridCells.forEach((cell: any) => {
                            const numCfg = tower.numberingConfig || { type: 'FLOOR_BASED', startNumber: 101, prefix: 'Apto ' };
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
                                position_type: cell.position_type || 'LATERAL',
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
                    await commercialService.savePropertiesBatch(units as any);
                    
                    // 2. Limpar unidades que NÃO estão mais na matriz e NÃO têm negócios
                    const unusedIds = existingUnits
                        .filter(u => u.id && !usedIds.includes(u.id))
                        .map(u => u.id as string);
                    
                    if (unusedIds.length > 0) {
                        for(const id of unusedIds) {
                            try {
                                await commercialService.deleteProperty(id);
                            } catch (e) {
                                console.log(`[CommercialModule] Could not delete unused unit ${id}`);
                            }
                        }
                    }

                    alert(`Edifício e ${totalCount} unidades processados com sucesso!`);
                }
            }
            // Fallback legado
            else if (propertyToSave.type === 'BUILDING' && _bulkConfig && _bulkConfig.count > 0) {
                const units: Partial<Property>[] = [];
                for (let i = 0; i < _bulkConfig.count; i++) {
                    const unitNumber = _bulkConfig.startingNumber + (i * (_bulkConfig.increment || 1));
                    units.push({
                        name: `${_bulkConfig.prefix}${unitNumber}`,
                        type: 'APARTMENT',
                        purpose: propertyToSave.purpose || 'BOTH',
                        address: propertyToSave.address,
                        area: propertyToSave.area || 0,
                        private_area: propertyToSave.private_area || 0,
                        common_area: propertyToSave.common_area || 0,
                        total_area: propertyToSave.total_area || 0,
                        block: propertyToSave.block,
                        floor: propertyToSave.floor,
                        price: propertyToSave.price || 0,
                        status: PropertyStatus.AVAILABLE,
                        organization_id: propertyToSave.organization_id,
                        parent_id: savedProperty.id,
                        specs: { ...(propertyToSave.specs || {}) }
                    });
                }
                await commercialService.savePropertiesBatch(units);
                alert(`Edifício e ${_bulkConfig.count} unidades cadastrados com sucesso!`);
            }
            // Se for atualização de um Edifício existente, propagar alteração de endereço para as unidades
            else if (editingProperty && propertyToSave.type === 'BUILDING') {
                const addressChanged =
                    propertyToSave.street !== editingProperty.street ||
                    propertyToSave.number !== editingProperty.number ||
                    propertyToSave.neighborhood !== editingProperty.neighborhood ||
                    propertyToSave.city !== editingProperty.city ||
                    propertyToSave.state !== editingProperty.state ||
                    propertyToSave.zip_code !== editingProperty.zip_code;

                if (addressChanged || propertyToSave.client_id !== editingProperty.client_id) {
                    await commercialService.updateUnitsAddress(savedProperty.id, {
                        client_id: propertyToSave.client_id,
                        address: propertyToSave.address,
                        street: propertyToSave.street,
                        number: propertyToSave.number,
                        neighborhood: propertyToSave.neighborhood,
                        city: propertyToSave.city,
                        state: propertyToSave.state,
                        zip_code: propertyToSave.zip_code
                    });
                    console.log(`[Commercial] Cascading update for building units of building ${savedProperty.id} (Address/Client)`);
                }
                alert('Edifício e unidades atualizados com sucesso!');
            }
            else {
                alert(editingProperty ? 'Imóvel atualizado com sucesso!' : 'Imóvel cadastrado com sucesso!');
            }

            setIsPropertyModalOpen(false);
            setEditingProperty(undefined);
            loadData();
        } catch (err: any) {
            console.error('[Commercial] Save Error:', err);
            alert('Erro ao salvar imóvel: ' + (err.message || 'Erro desconhecido'));
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
        } catch (err: any) {
            alert('Erro ao registrar negócio: ' + (err.message || 'Erro desconhecido'));
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

    const filteredProperties = properties.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.address.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesFilter = !dealTypeFilter || !p.purpose || p.purpose === dealTypeFilter || p.purpose === 'BOTH';

        return matchesSearch && matchesFilter;
    });

    const filteredDeals = deals.filter(d => !dealTypeFilter || d.type === dealTypeFilter);

    const stats = {
        totalValue: filteredProperties.reduce((acc, p) => acc + (Number(p.price || p.initial_price) || 0), 0),
        soldValue: deals.filter(d => d.type === 'SALE' && d.status === 'COMPLETED').reduce((acc, d) => acc + (Number(d.value) || 0), 0),
        rentValue: deals.filter(d => d.type === 'RENTAL' && d.status === 'COMPLETED').reduce((acc, d) => acc + (Number(d.value) || 0), 0),
        activeDeals: deals.filter(d => (d.status === 'PENDING' || d.status === 'IN_NEGOTIATION') && (!dealTypeFilter || d.type === dealTypeFilter)).length,
        occupancyRate: filteredProperties.length > 0 ? ((filteredProperties.filter(p => p.status === PropertyStatus.SOLD || p.status === PropertyStatus.RENTED).length / filteredProperties.length) * 100).toFixed(1) : '0.0'
    };

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
                if (property.type === 'BUILDING') {
                    // Se for edifício, mantém navegação para unidades se implementado, 
                    // ou apenas abre edição se for a única ação lógica.
                    // No CommercialModule atual, não há navegação via card de edifício como no Rentals, 
                    // então abrimos edição por padrão ou deixamos para o usuário decidir.
                    // Para manter consistência com o pedido de "clique no card abre negociação", 
                    // para unidades faremos isso.
                    onEdit();
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
                            {dealTypeFilter === 'RENTAL' ? <Key className="w-6 h-6 text-white" /> : <Building2 className="w-6 h-6 text-white" />}
                        </div>
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">
                            {dealTypeFilter === 'SALE' ? 'Comercial & Vendas' : dealTypeFilter === 'RENTAL' ? 'Gestão de Aluguéis' : 'Comercial & Ativos'}
                        </span>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight">
                        {dealTypeFilter === 'SALE' ? 'Gestão de Vendas' : dealTypeFilter === 'RENTAL' ? 'Gestão de Locação' : 'Gestão de Ativos'}
                    </h1>
                    <p className="text-gray-400 font-medium mt-1">
                        {dealTypeFilter === 'SALE' ? 'Controle de inventário, negociações e performance de vendas.' :
                            dealTypeFilter === 'RENTAL' ? 'Controle de contratos, inquilinos e rendimentos de aluguel.' :
                                'Controle de inventário, negociações e performance imobiliária.'}
                    </p>
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
                        Novo Imóvel
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex p-1.5 bg-gray-200/50 backdrop-blur-md rounded-[1.5rem] w-fit border border-gray-200 shadow-inner">
                <button
                    onClick={() => setActiveTab('inventory')}
                    className={`flex items-center gap-2 px-8 py-3 rounded-[1.25rem] font-black tracking-tight transition-all duration-300 ${activeTab === 'inventory' ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
                >
                    <HomeIcon className={`w-4 h-4 ${activeTab === 'inventory' ? 'fill-blue-600/10' : ''}`} />
                    Inventário
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
            </div>

            {/* Content */}
            {activeTab === 'inventory' && (
                <div className="space-y-6">
                    {/* Stats Summary Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Unidades Totais', value: filteredProperties.length, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'Valor em Estoque', value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.totalValue), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                            { label: 'Taxa de Ocupação', value: `${stats.occupancyRate}%`, icon: Key, color: 'text-purple-600', bg: 'bg-purple-50' },
                            { label: 'Disponíveis', value: filteredProperties.filter(p => p.status === PropertyStatus.AVAILABLE).length, icon: Home, color: 'text-amber-600', bg: 'bg-amber-50' }
                        ].map((s, i) => (
                            <div key={i} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
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
                            <button onClick={() => setViewMode('tower')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'tower' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Torres"><Building2 className="w-5 h-5" /></button>
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
                                            onRegisterDeal={() => handleOpenDealForProperty(property)}
                                            getStatusColor={getStatusColor}
                                            getStatusLabel={getStatusLabel}
                                        />
                                    ))}
                                </div>
                            )}

                            {viewMode === 'list' && (
                                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px] tracking-widest">
                                            <tr>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Imóvel</th>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Cliente</th>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Bloco</th>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Pav.</th>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap">Á. Priv.</th>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap">Á. Comum</th>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap">Á. Total</th>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap">Preço</th>
                                                <th className="px-6 py-2 border-r border-gray-100 last:border-r-0">Status</th>
                                                <th className="px-6 py-2 text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 text-sm font-medium text-gray-700">
                                            {filteredProperties.map((property) => (
                                                <tr
                                                    key={property.id}
                                                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                                    onClick={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }}
                                                >
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-mono text-sm font-bold text-gray-700">
                                                        {property.name}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        {property.client_id ? (
                                                            <div className="flex items-center gap-2 text-blue-600">
                                                                <User className="w-3.5 h-3.5" />
                                                                <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                                                    {clients.find(c => c.id === property.client_id)?.name || 'Carregando...'}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest italic">Sem vínculo</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-medium text-gray-700">
                                                        {property.block || '-'}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-medium text-gray-700">
                                                        {property.floor || '-'}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-medium text-gray-600">
                                                        {property.private_area ? `${property.private_area}m²` : '-'}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-medium text-gray-400">
                                                        {property.common_area ? `${property.common_area}m²` : '-'}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 font-bold text-blue-600">
                                                        {property.total_area ? `${property.total_area}m²` : '-'}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-black text-gray-900">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(property.price || 0)}
                                                    </td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${property.status === PropertyStatus.AVAILABLE ? 'bg-green-100 text-green-800' :
                                                            property.status === PropertyStatus.SOLD ? 'bg-blue-50 text-blue-700' :
                                                                property.status === PropertyStatus.RESERVED ? 'bg-amber-100 text-amber-800' :
                                                                    property.status === PropertyStatus.EXCHANGED ? 'bg-blue-100 text-blue-800' :
                                                                        'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {getStatusLabel(property.status)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-2.5 text-right">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setEditingProperty(property); setIsPropertyModalOpen(true); }}
                                                                className="text-blue-600 hover:text-blue-800 text-xs font-black uppercase tracking-widest p-1.5 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-1.5"
                                                            >
                                                                <Edit className="w-3.5 h-3.5" />
                                                                Editar
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteProperty(property.id); }}
                                                                className="text-red-400 hover:text-red-600 text-xs font-black uppercase tracking-widest p-1.5 hover:bg-red-50 rounded-lg transition-all"
                                                            >
                                                                Excluir
                                                            </button>
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
                                    units={filteredProperties.filter(p => p.type !== 'BUILDING')}
                                    parentProperty={properties.find(p => p.type === 'BUILDING')}
                                    deals={deals}
                                    mode="admin"
                                    onEditUnit={(unit) => { setEditingProperty(unit); setIsPropertyModalOpen(true); }}
                                    onSelectUnit={(unit) => handleOpenDealForProperty(unit)}
                                />
                            )}

                        </>
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

            {
                activeTab === 'deals' && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
                        <div className="flex justify-between items-center bg-gray-50/50 p-6 rounded-[2rem] border border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
                                    <Tag className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 tracking-tight">Registro de Negociações</h3>
                            </div>
                            <div className="flex p-1 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`} title="Grid"><LayoutGrid className="w-4 h-4" /></button>
                                <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`} title="Lista"><List className="w-4 h-4" /></button>
                            </div>
                        </div>

                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {filteredDeals.map(deal => {
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
                                                <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-widest mb-2 inline-block ${deal.type === 'SALE' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : deal.type === 'RENTAL' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'}`}>
                                                    {deal.type === 'SALE' ? 'Venda Direta' : deal.type === 'RENTAL' ? 'Locação Ativa' : 'Prestação de Serviço'}
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
                                <div className="grid grid-cols-2 gap-4 h-full">
                                    <button
                                        onClick={() => {
                                            setEditingDeal({ id: '', property_id: '', client_id: '', type: dealTypeFilter || 'SALE', value: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING' });
                                            setIsDealModalOpen(true);
                                        }}
                                        className="h-full bg-gray-50 border-4 border-dashed border-gray-200 rounded-[2.5rem] p-10 flex flex-col items-center justify-center group hover:bg-white hover:border-blue-200 transition-all"
                                    >
                                        <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                            <Plus className="w-10 h-10 text-gray-300 group-hover:text-blue-600" />
                                        </div>
                                        <span className="text-xl font-black text-gray-400 group-hover:text-gray-900">Nova Negociação</span>
                                        <p className="text-sm font-bold text-gray-400 text-center mt-2 px-8">Inicie o registro de uma nova venda ou aluguel de imóvel.</p>
                                    </button>

                                    <button
                                        onClick={async () => {
                                            if (!confirm('Sincronizar todas as negociações com o Financeiro?')) return;
                                            const { commercialFinanceService } = await import('../services/commercialFinanceService');
                                            try {
                                                if (!organizationId) { alert('Organização não selecionada.'); return; }
                                                const count = await commercialFinanceService.syncAllOrganizationDeals(organizationId);
                                                alert(`${count} negociações foram recriadas no Financeiro!`);
                                            } catch (err: any) {
                                                alert('Erro: ' + err.message);
                                            }
                                        }}
                                        className="h-full bg-emerald-50 border-4 border-dashed border-emerald-200 rounded-[2.5rem] p-10 flex flex-col items-center justify-center group hover:bg-emerald-100 hover:border-emerald-300 transition-all"
                                    >
                                        <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                            <RotateCw className="w-10 h-10 text-emerald-400 group-hover:text-emerald-600" />
                                        </div>
                                        <span className="text-xl font-black text-emerald-600 group-hover:text-emerald-700">Forçar Sincronização de Parcelas (TEMPORÁRIO)</span>
                                        <p className="text-sm font-bold text-emerald-600 text-center mt-2 px-8">Clique aqui para recriar as parcelas que sumiram no módulo Financeiro.</p>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-xl shadow-gray-200/20">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 border-b border-gray-100 italic">
                                        <tr>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Imóvel</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Cliente</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Obra Vinculada</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Tipo</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Valor</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Data</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Nº Contrato</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                                            <th className="px-8 py-6 text-right text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filteredDeals.map(deal => {
                                            const property = properties.find(p => p.id === deal.property_id);
                                            const client = clients.find(c => c.id === deal.client_id);
                                            const linkedProject = projects.find(p => p.id === deal.linked_project_id);
                                            const parentBuilding = property?.parent_id ? properties.find(p => p.id === property.parent_id) : null;

                                            return (
                                                <tr key={deal.id} className="hover:bg-blue-50/30 transition-colors group cursor-pointer" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }}>
                                                    <td className="px-8 py-6">
                                                        <span className="font-black text-gray-900 group-hover:text-blue-600 transition-colors">{property?.name || '---'}</span>
                                                    </td>
                                                    <td className="px-8 py-6 font-bold text-gray-600">
                                                        {client?.name || 'Não vinculado'}
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        {linkedProject ? (
                                                            <div className="flex items-center gap-1.5 text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-lg text-[10px] uppercase tracking-wider w-fit">
                                                                <Layers className="w-3.5 h-3.5" />
                                                                {linkedProject.name}
                                                            </div>
                                                        ) : parentBuilding ? (
                                                            <div title="Vínculo automático via Imóvel (Empreendimento)" className="flex items-center gap-1.5 text-gray-500 font-bold bg-gray-100 px-2 py-1 rounded-lg text-[10px] uppercase tracking-wider w-fit">
                                                                <Building2 className="w-3.5 h-3.5" />
                                                                {parentBuilding.name}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 italic text-[10px] uppercase font-bold tracking-widest">Não vinculada</span>
                                                        )}
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${deal.type === 'SALE' ? 'bg-blue-600 text-white' : deal.type === 'RENTAL' ? 'bg-purple-600 text-white' : 'bg-amber-600 text-white'}`}>
                                                            {deal.type === 'SALE' ? 'Venda' : deal.type === 'RENTAL' ? 'Locação' : 'Serviço'}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-6 font-mono font-black text-gray-900">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value)}
                                                    </td>
                                                    <td className="px-8 py-6 text-xs font-bold text-gray-400 uppercase tracking-tighter">
                                                        {new Date(deal.date).toLocaleDateString('pt-BR')}
                                                    </td>
                                                    <td className="px-8 py-6 font-mono font-bold text-blue-600">
                                                        {deal.contract_number || '---'}
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
                                        setEditingDeal(undefined);
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
                    <div className="space-y-10 animate-in zoom-in-95 duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                            {[
                                ...(dealTypeFilter !== 'RENTAL' ? [{ label: 'Volume em Vendas', value: stats.soldValue, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' }] : []),
                                ...(dealTypeFilter !== 'SALE' ? [{ label: 'Receita em Aluguéis', value: stats.rentValue, icon: Key, color: 'text-purple-600', bg: 'bg-purple-50' }] : []),
                                { label: 'Unidades no Radar', value: filteredProperties.length, icon: Home, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                                { label: 'Negociações Ativas', value: stats.activeDeals, icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' }
                            ].map((stat, i) => (
                                <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-xl shadow-gray-200/20 hover:scale-105 transition-transform duration-500">
                                    <div className={`w-14 h-14 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center mb-6`}>
                                        <stat.icon className="w-7 h-7" />
                                    </div>
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">{stat.label}</h3>
                                    <span className="text-3xl font-black text-gray-900">
                                        {typeof stat.value === 'number' && (stat.label.includes('Volume') || stat.label.includes('Receita') || stat.label.includes('Ticket'))
                                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stat.value)
                                            : stat.value}
                                    </span>
                                    <div className="mt-4 flex items-center gap-2">
                                        <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">+12.5%</span>
                                        <span className="text-[10px] font-bold text-gray-400">vs mês anterior</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white p-10 rounded-[3rem] border border-gray-200 shadow-2xl shadow-gray-200/20">
                                <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-3">
                                    <div className="w-2 h-8 bg-blue-600 rounded-full" />
                                    Distribuição de Inventário
                                </h3>
                                <div className="space-y-6">
                                    {[
                                        { label: 'Apartamentos', count: filteredProperties.filter(p => p.type === 'APARTMENT').length, color: 'bg-blue-600' },
                                        { label: 'Casas', count: filteredProperties.filter(p => p.type === 'HOUSE').length, color: 'bg-purple-600' },
                                        { label: 'Comercial', count: filteredProperties.filter(p => p.type === 'COMMERCIAL').length, color: 'bg-amber-600' },
                                        { label: 'Terrenos', count: filteredProperties.filter(p => p.type === 'LAND').length, color: 'bg-gray-400' }
                                    ].map((item, i) => (
                                        <div key={i} className="space-y-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-xs font-black text-gray-600 uppercase tracking-widest">{item.label}</span>
                                                <span className="text-xs font-black text-gray-900">{item.count} un.</span>
                                            </div>
                                            <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden">
                                                <div className={`h-full ${item.color} shadow-lg`} style={{ width: `${(item.count / (filteredProperties.length || 1)) * 100}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-[#0B1727] p-10 rounded-[3rem] text-white relative overflow-hidden flex flex-col justify-center">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 blur-[100px] -mr-32 -mt-32" />
                                <h3 className="text-3xl font-black mb-6 relative z-10 leading-tight">Pronto para<br /><span className="text-blue-500">{dealTypeFilter === 'RENTAL' ? 'Escalar suas Locações?' : 'Escalar suas Vendas?'}</span></h3>
                                <p className="text-gray-400 font-medium mb-10 relative z-10 leading-relaxed">Utilize nossas ferramentas de análise preditiva para identificar as melhores oportunidades {dealTypeFilter === 'RENTAL' ? 'de locação' : 'de mercado'} e otimizar seu ticket médio.</p>
                                <div className="flex gap-4 relative z-10">
                                    <button className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-all">Ver Insights IA</button>
                                    <button className="px-8 py-4 bg-white/10 text-white rounded-2xl font-black border border-white/10 hover:bg-white/20 transition-all">Configurações</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            <PropertyModal
                isOpen={isPropertyModalOpen}
                onClose={() => { setIsPropertyModalOpen(false); setEditingProperty(undefined); }}
                onSubmit={handleSaveProperty}
                initialData={editingProperty || undefined}
                buildings={properties.filter(p => p.type === 'BUILDING')}
                defaultPurpose={dealTypeFilter}
            />

            <DealModal
                isOpen={isDealModalOpen}
                onClose={() => { setIsDealModalOpen(false); setEditingDeal(undefined); }}
                onSave={() => loadData()}
                initialData={editingDeal}
                defaultType={dealTypeFilter}
            />
        </div >
    );
};

export default CommercialModule;
