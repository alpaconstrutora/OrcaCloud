import React, { useState, useEffect } from 'react';
import { X, Home, MapPin, Maximize2, DollarSign, Camera, Check, Info, Package, Layers, Plus, Trash2 } from 'lucide-react';
import { Property, PropertyStatus, Client, TowerMatrixConfig, GridCellConfig } from '../types';
import { clientService } from '../services/clientService';

interface PropertyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Property>) => void;
    initialData?: Property;
    defaultPurpose?: 'SALE' | 'RENTAL' | 'BOTH';
    buildings?: Property[];
}

const PropertyModal: React.FC<PropertyModalProps> = ({ isOpen, onClose, onSubmit, initialData, defaultPurpose, buildings = [] }) => {
    const [formData, setFormData] = useState<Partial<Property>>({
        name: '',
        type: 'APARTMENT',
        purpose: defaultPurpose || 'BOTH',
        address: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        zip_code: '',
        area: 0,
        price: 0,
        status: PropertyStatus.AVAILABLE,
        specs: {
            bedrooms: 0,
            bathrooms: 0,
            parkingSpaces: 0,
            floor: 0
        },
        block: '',
        floor: 0,
        private_area: 0,
        common_area: 0,
        total_area: 0,
        features: [],
        images: [],
        parent_id: undefined
    });

    const [connectedTowers, setConnectedTowers] = useState(false);
    const [connectionDirection, setConnectionDirection] = useState<'HORIZONTAL' | 'VERTICAL'>('HORIZONTAL');

    const generateGridCells = (
        width: number, 
        depth: number, 
        blockPosition: 'FRONT_BLOCK' | 'BACK_BLOCK' | 'MIDDLE_BLOCK' | 'ISOLATED' = 'ISOLATED',
        direction: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL',
        topOrientation?: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'
    ) => {
        const cells: GridCellConfig[] = [];
        let index = 1;

        // Mapeamento de rotação para os 4 lados
        const compass = ['NORTH', 'EAST', 'SOUTH', 'WEST'] as const;
        const getSideOrientation = (side: 'A' | 'B' | 'C' | 'D') => {
            if (!topOrientation) return undefined;
            const topIdx = compass.indexOf(topOrientation);
            if (side === 'A') return topOrientation; // Topo
            if (side === 'B') return compass[(topIdx + 1) % 4]; // Direita
            if (side === 'C') return compass[(topIdx + 2) % 4]; // Fundo
            if (side === 'D') return compass[(topIdx + 3) % 4]; // Esquerda
            return undefined;
        };

        for (let y = 0; y < depth; y++) {
            for (let x = 0; x < width; x++) {
                let posType: 'FRONT' | 'LATERAL' | 'BACK' | 'NONE' = 'LATERAL';
                let cellOrient: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | undefined = undefined;

                if (blockPosition === 'ISOLATED') {
                    if (y === 0) {
                        posType = 'FRONT';
                        cellOrient = getSideOrientation('A');
                    }
                    else if (y === depth - 1) {
                        posType = 'BACK';
                        cellOrient = getSideOrientation('C');
                    } else if (x === width - 1) {
                        cellOrient = getSideOrientation('B');
                    } else if (x === 0) {
                        cellOrient = getSideOrientation('D');
                    }
                } else if (direction === 'HORIZONTAL') {
                    if (blockPosition === 'FRONT_BLOCK' && x === 0) {
                        posType = 'FRONT';
                    }
                    else if (blockPosition === 'BACK_BLOCK' && x === width - 1) {
                        posType = 'BACK';
                    }
                } else if (direction === 'VERTICAL') {
                    if (blockPosition === 'FRONT_BLOCK' && y === 0) {
                        posType = 'FRONT';
                    }
                    else if (blockPosition === 'BACK_BLOCK' && y === depth - 1) {
                        posType = 'BACK';
                    }
                }
                
                cells.push({
                    x, y,
                    unitIndex: index++,
                    position_type: posType,
                    sun_orientation: cellOrient
                });
            }
        }
        return cells;
    };

    const updateTowersGridCells = (towersList: TowerMatrixConfig[], isConnected: boolean, dir: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL') => {
        return towersList.map((t, i) => {
            let pos: 'FRONT_BLOCK' | 'BACK_BLOCK' | 'MIDDLE_BLOCK' | 'ISOLATED' = 'ISOLATED';
            if (isConnected && towersList.length > 1) {
                pos = i === 0 ? 'FRONT_BLOCK' : i === towersList.length - 1 ? 'BACK_BLOCK' : 'MIDDLE_BLOCK';
            }
            
            const newCells = generateGridCells(t.unitsWidth, t.unitsDepth, pos, dir, t.top_orientation);
            
            // Preservar orientações solares existentes para células nas mesmas coordenadas
            const processedCells = newCells.map(newCell => {
                const existingCell = t.gridCells.find(oldCell => oldCell.x === newCell.x && oldCell.y === newCell.y);
                // Se o usuário já mudou manualmente ou se não estamos usando orientação automática agora
                if (existingCell && (existingCell.is_manual_orientation || (!t.top_orientation && existingCell.sun_orientation))) {
                    return { ...newCell, sun_orientation: existingCell.sun_orientation, is_manual_orientation: existingCell.is_manual_orientation };
                }
                return newCell;
            });

            return { ...t, gridCells: processedCells };
        });
    };

    const [clients, setClients] = useState<Client[]>([]);
    const [enableMatrix, setEnableMatrix] = useState(!initialData);

    const [towerMatrix, setTowerMatrix] = useState<TowerMatrixConfig[]>([
        {
            id: crypto.randomUUID(),
            name: 'A',
            floors: 4,
            unitsWidth: 2,
            unitsDepth: 2,
            gridCells: generateGridCells(2, 2),
            numberingConfig: {
                type: 'FLOOR_BASED',
                startNumber: 101,
                prefix: 'Apto '
            }
        }
    ]);

    useEffect(() => {
        if (isOpen) {
            clientService.listClients().then(setClients).catch(console.error);
        }

        if (initialData) {
            setFormData(initialData);
            if (initialData.type === 'BUILDING' && initialData.specs) {
                if (initialData.specs.matrixConfig) {
                    setTowerMatrix(initialData.specs.matrixConfig);
                    setEnableMatrix(true);
                }
                if (initialData.specs.connectedTowers !== undefined) {
                    setConnectedTowers(initialData.specs.connectedTowers);
                }
                if (initialData.specs.connectionDirection) {
                    setConnectionDirection(initialData.specs.connectionDirection);
                }
            }
        } else {
            setFormData({
                name: '',
                type: 'APARTMENT',
                purpose: defaultPurpose || 'BOTH',
                address: '',
                area: 0,
                price: 0,
                status: PropertyStatus.AVAILABLE,
                specs: { bedrooms: 0, bathrooms: 0, parkingSpaces: 0, floor: 0 },
                street: '',
                number: '',
                neighborhood: '',
                city: '',
                state: '',
                zip_code: '',
                features: [],
                images: [],
                parent_id: undefined
            });
        }
    }, [initialData, isOpen, defaultPurpose]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.type === 'BUILDING' && enableMatrix) {
            // Especial handling for bulk via matrix
            onSubmit({ ...formData, _bulkConfig: { matrix: towerMatrix, connectedTowers, connectionDirection } } as Partial<Property> & { _bulkConfig: { matrix: TowerMatrixConfig[]; connectedTowers: boolean; connectionDirection: 'HORIZONTAL' | 'VERTICAL' } });
        } else {
            onSubmit(formData);
        }
    };

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-12">
            <div className="absolute inset-0 bg-[#0B1727]/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />

            <div className="relative bg-white w-full h-full overflow-hidden rounded-[2.5rem] shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 flex flex-col">
                {/* Header Executivo (Padrão Premium) */}
                <div className="px-8 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-start gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                        {/* Bloco de Identidade: Ícone + Tipo */}
                        <div className="flex flex-col items-center gap-1 shrink-0">
                            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-100 flex items-center justify-center w-10 h-10">
                                <Home className="w-5 h-5" />
                            </div>
                            <div className="text-[9px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shadow-sm text-center">
                                {formData.type === 'BUILDING' ? 'EDIFÍCIO' : 'UNIDADE'}
                            </div>
                        </div>

                        {/* Bloco de Informação: Título e Status */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">
                                    {initialData ? 'Editar Imóvel' : 'Novo Imóvel'}
                                </h2>
                                {/* Status Badge */}
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-md border border-gray-200 shadow-sm">
                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Status:</span>
                                    <span className={`text-[9px] font-bold uppercase ${formData.status === PropertyStatus.AVAILABLE ? 'text-green-600' :
                                        formData.status === PropertyStatus.SOLD ? 'text-blue-600' :
                                            formData.status === PropertyStatus.EXCHANGED ? 'text-purple-600' : 'text-amber-600'
                                        }`}>
                                        {formData.status === PropertyStatus.EXCHANGED ? 'Permutado' : formData.status}
                                    </span>
                                </div>
                            </div>

                            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest truncate max-w-xl">
                                {formData.name || 'GESTÃO DE ATIVOS IMOBILIÁRIOS'}
                            </p>
                        </div>
                    </div>

                    {/* Métricas Executivas (Direita) */}
                    <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Área Total</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-black text-blue-600">{formData.total_area || 0}</span>
                                <span className="text-[10px] font-bold text-blue-400">m²</span>
                            </div>
                        </div>
                        <div className="h-8 w-px bg-gray-200" />
                        <div className="text-right">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Valor de Venda</p>
                            <div className="flex items-baseline gap-1 text-green-600">
                                <span className="text-[10px] font-bold font-mono">R$</span>
                                <span className="text-xl font-black">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(formData.initial_price || formData.price || 0)}</span>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="ml-2 p-2 hover:bg-white hover:text-red-500 rounded-xl transition-all text-gray-400 border border-transparent hover:border-gray-100"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Section: Identificação, Localização e Tipo */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-8 space-y-4">
                            <div className="flex items-center gap-2 text-blue-600">
                                <Info className="w-4 h-4" />
                                <h3 className="font-black uppercase tracking-widest text-[10px]">Identificação e Endereço</h3>
                            </div>
                            <div className="grid grid-cols-12 gap-x-4 gap-y-3">
                                <div className="space-y-1 col-span-12">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">Nome do Empreendimento / Unidade</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-sm shadow-inner"
                                        placeholder="Ex: Edifício Ocean View - Apto 501"
                                    />
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-10">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">Logradouro</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            required
                                            type="text"
                                            value={formData.street || ''}
                                            onChange={(e) => setFormData({ ...formData, street: e.target.value, address: `${e.target.value}, ${formData.number || ''}` })}
                                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                            placeholder="Rua, Avenida, etc."
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-2">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">Nº</label>
                                    <input
                                        type="text"
                                        value={formData.number || ''}
                                        onChange={(e) => setFormData({ ...formData, number: e.target.value, address: `${formData.street || ''}, ${e.target.value}` })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm text-center"
                                    />
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-5">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">Bairro</label>
                                    <input
                                        type="text"
                                        value={formData.neighborhood || ''}
                                        onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                    />
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-5">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">Cidade</label>
                                    <input
                                        type="text"
                                        value={formData.city || ''}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                    />
                                </div>
                                <div className="space-y-1 col-span-12 md:col-span-2">
                                    <label className="text-[9px] font-black text-gray-400 upper-case tracking-widest px-1">UF</label>
                                    <input
                                        type="text"
                                        maxLength={2}
                                        value={formData.state || ''}
                                        onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                                        className="w-full px-2 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm text-center uppercase"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="md:col-span-4 space-y-4">
                            <div className="flex items-center gap-2 text-blue-600">
                                <Package className="w-4 h-4" />
                                <h3 className="font-black uppercase tracking-widest text-[10px]">Tipo e Finalidade</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Tipo</label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value as Property['type'] })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                    >
                                        <option value="APARTMENT">Apartamento</option>
                                        <option value="HOUSE">Casa</option>
                                        <option value="LAND">Terreno / Lote</option>
                                        <option value="COMMERCIAL">Comercial</option>
                                        <option value="BUILDING">Edifício (Master)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Finalidade</label>
                                    <select
                                        value={formData.purpose || 'BOTH'}
                                        onChange={(e) => setFormData({ ...formData, purpose: e.target.value as Property['purpose'] })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                    >
                                        <option value="SALE">Apenas Venda</option>
                                        <option value="RENTAL">Apenas Aluguel</option>
                                        <option value="BOTH">Venda e Aluguel</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Bloco</label>
                                    <input
                                        type="text"
                                        value={formData.block || ''}
                                        onChange={(e) => setFormData({ ...formData, block: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-center uppercase text-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Pavimento</label>
                                    <input
                                        type="number"
                                        value={formData.floor || 0}
                                        onChange={(e) => setFormData({ ...formData, floor: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-center text-sm"
                                    />
                                </div>
                                {formData.type !== 'BUILDING' && buildings.length > 0 && (
                                    <div className="space-y-1.5 col-span-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Vincular a Empreendimento (Opcional)</label>
                                        <select
                                            value={formData.parent_id || ''}
                                            onChange={(e) => setFormData({ ...formData, parent_id: e.target.value || undefined })}
                                            className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                        >
                                            <option value="">Nenhum (Unidade Independente)</option>
                                            {buildings.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Configuração em Lote (Livre para novos e opcional para edição) */}
                    {formData.type === 'BUILDING' && (
                        <div className="grid grid-cols-1 gap-6 pb-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {initialData && !enableMatrix ? (
                                <div className="col-span-1 border border-dashed border-blue-200 bg-white rounded-[2rem] p-6 shadow-sm relative overflow-hidden flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-blue-800">
                                        <div className="bg-blue-50 p-2 rounded-xl">
                                            <Layers className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-black uppercase tracking-widest text-[11px]">Gerador de Matriz Desativado</h3>
                                            <p className="text-[10px] text-gray-500 font-bold max-w-sm mt-0.5">Ative para gerar (ou injetar) novas unidades em massa neste edifício usando a matriz técnica.</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEnableMatrix(true)}
                                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all text-xs shadow-md active:scale-95"
                                    >
                                        Ativar Gerador
                                    </button>
                                </div>
                            ) : (
                                <div className="col-span-1 border border-blue-100 bg-blue-50/30 rounded-[2rem] p-6 shadow-inner relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 blur-[40px] -mr-16 -mt-16 rounded-full" />
                                    
                                    <div className="flex justify-between mb-2">
                                        {initialData && (
                                            <button
                                                type="button"
                                                onClick={() => setEnableMatrix(false)}
                                                className="text-[10px] font-bold text-red-500 hover:text-red-700 underline underline-offset-2 flex items-center gap-1 leading-none"
                                            >
                                                Desativar Gerador (Manter Edifício Intacto)
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between mb-6 relative z-10">
                                        <div className="flex items-center gap-2 text-blue-600">
                                            <Layers className="w-5 h-5" />
                                            <h3 className="font-black uppercase tracking-widest text-[11px]">Matriz Geradora de Unidades</h3>
                                        </div>
                                    <div className="flex items-center gap-4">
                                        {towerMatrix.length >= 2 && (
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-600 tracking-widest cursor-pointer px-4 py-2 hover:bg-blue-100/50 rounded-xl transition-all border border-blue-200/50">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={connectedTowers}
                                                        onChange={(e) => {
                                                            const isChecked = e.target.checked;
                                                            setConnectedTowers(isChecked);
                                                            setTowerMatrix(prev => updateTowersGridCells(prev, isChecked, connectionDirection));
                                                        }}
                                                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                    Conectar Múltiplas Torres
                                                </label>
                                                {connectedTowers && (
                                                    <select
                                                        value={connectionDirection}
                                                        onChange={(e) => {
                                                            const newDir = e.target.value as 'HORIZONTAL' | 'VERTICAL';
                                                            setConnectionDirection(newDir);
                                                            setTowerMatrix(prev => updateTowersGridCells(prev, true, newDir));
                                                        }}
                                                        className="text-[10px] bg-blue-50/50 border border-blue-200/50 rounded-xl px-3 py-2 outline-none text-blue-800 font-black uppercase tracking-widest focus:border-blue-400 cursor-pointer"
                                                    >
                                                        <option value="HORIZONTAL">Lado a Lado (Eixo Horiz.)</option>
                                                        <option value="VERTICAL">Frente a Fundos (Eixo Vert.)</option>
                                                    </select>
                                                )}
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newName = String.fromCharCode(65 + towerMatrix.length); // A, B, C...
                                                const newTower = {
                                                    id: crypto.randomUUID(),
                                                    name: newName,
                                                    floors: 4,
                                                    unitsWidth: 2,
                                                    unitsDepth: 2,
                                                    gridCells: [],
                                                    numberingConfig: {
                                                        type: 'FLOOR_BASED',
                                                        startNumber: 101,
                                                        prefix: 'Apto '
                                                    }
                                                };
                                                setTowerMatrix(prev => updateTowersGridCells([...prev, newTower as TowerMatrixConfig], connectedTowers));
                                            }}
                                            className="px-4 py-2 bg-white text-blue-600 rounded-xl font-bold flex items-center gap-2 border border-blue-200 hover:bg-blue-50 transition-all text-xs shadow-sm active:scale-95"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Nova Torre
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-6 relative z-10">
                                    {towerMatrix.map((tower, tIndex) => (
                                        <div key={tower.id} className="bg-white rounded-2xl p-5 border border-blue-100 shadow-sm relative overflow-hidden">
                                            {/* Faixa decorativa lateral */}
                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-400" />
                                            
                                            <div className="flex flex-col md:flex-row gap-4 mb-4">
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-[9px] font-black text-blue-800 uppercase tracking-widest px-1">Nome da Torre</label>
                                                    <input
                                                        type="text"
                                                        value={tower.name}
                                                        onChange={(e) => {
                                                            const newTM = [...towerMatrix];
                                                            newTM[tIndex].name = e.target.value.toUpperCase();
                                                            setTowerMatrix(newTM);
                                                        }}
                                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-sm uppercase"
                                                        placeholder="Ex: A"
                                                    />
                                                </div>
                                                <div className="flex-[2] space-y-1.5">
                                                    <label className="text-[9px] font-black text-blue-800 uppercase tracking-widest px-1">Numeração</label>
                                                    <div className="grid grid-cols-4 gap-1.5">
                                                        <select
                                                            value={tower.numberingConfig?.type || 'FLOOR_BASED'}
                                                            onChange={(e) => {
                                                                const newTM = [...towerMatrix];
                                                                newTM[tIndex].numberingConfig = {
                                                                    ...(newTM[tIndex].numberingConfig || { startNumber: 101, prefix: 'Apto ' }),
                                                                    type: e.target.value as 'FLOOR_BASED' | 'SEQUENTIAL'
                                                                };
                                                                setTowerMatrix(newTM);
                                                            }}
                                                            className="px-2 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-[10px]"
                                                        >
                                                            <option value="FLOOR_BASED">Por Pavimento</option>
                                                            <option value="SEQUENTIAL">Seq.</option>
                                                        </select>
                                                        <input
                                                            type="number"
                                                            placeholder="Início"
                                                            value={tower.numberingConfig?.startNumber || ''}
                                                            onChange={(e) => {
                                                                const newTM = [...towerMatrix];
                                                                newTM[tIndex].numberingConfig = {
                                                                    ...(newTM[tIndex].numberingConfig || { type: 'FLOOR_BASED', prefix: 'Apto ' }),
                                                                    startNumber: parseInt(e.target.value) || 0
                                                                };
                                                                setTowerMatrix(newTM);
                                                            }}
                                                            className="px-2 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-[10px]"
                                                            title="Início"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Pref."
                                                            value={tower.numberingConfig?.prefix || ''}
                                                            onChange={(e) => {
                                                                const newTM = [...towerMatrix];
                                                                newTM[tIndex].numberingConfig = {
                                                                    ...(newTM[tIndex].numberingConfig || { type: 'FLOOR_BASED', startNumber: 101 }),
                                                                    prefix: e.target.value
                                                                };
                                                                setTowerMatrix(newTM);
                                                            }}
                                                            className="px-2 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-[10px]"
                                                            title="Prefixo"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Suf."
                                                            value={tower.numberingConfig?.suffix || ''}
                                                            onChange={(e) => {
                                                                const newTM = [...towerMatrix];
                                                                newTM[tIndex].numberingConfig = {
                                                                    ...(newTM[tIndex].numberingConfig || { type: 'FLOOR_BASED', startNumber: 101 }),
                                                                    suffix: e.target.value
                                                                };
                                                                setTowerMatrix(newTM);
                                                            }}
                                                            className="px-2 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-[10px]"
                                                            title="Sufixo"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-[9px] font-black text-blue-800 uppercase tracking-widest px-1">Pavimentos</label>
                                                    <input
                                                        type="number"
                                                        value={tower.floors || ''}
                                                        onChange={(e) => {
                                                            const newTM = [...towerMatrix];
                                                            newTM[tIndex].floors = parseInt(e.target.value) || 0;
                                                            setTowerMatrix(newTM);
                                                        }}
                                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-sm"
                                                        min="1"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-[9px] font-black text-blue-800 uppercase tracking-widest px-1">Lado Frente/Fundos</label>
                                                    <input
                                                        type="number"
                                                        value={tower.unitsWidth || ''}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            setTowerMatrix(prev => {
                                                                const newTM = [...prev];
                                                                newTM[tIndex].unitsWidth = Math.max(1, Math.min(6, val));
                                                                return updateTowersGridCells(newTM, connectedTowers);
                                                            });
                                                        }}
                                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-sm"
                                                        min="1" max="6"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-[9px] font-black text-blue-800 uppercase tracking-widest px-1">Lados Laterais</label>
                                                    <input
                                                        type="number"
                                                        value={tower.unitsDepth || ''}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            setTowerMatrix(prev => {
                                                                const newTM = [...prev];
                                                                newTM[tIndex].unitsDepth = Math.max(1, Math.min(6, val));
                                                                return updateTowersGridCells(newTM, connectedTowers);
                                                            });
                                                        }}
                                                        className="w-full px-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-sm"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-[9px] font-black text-blue-800 uppercase tracking-widest px-1">Orientação Topo (Lado A)</label>
                                                    <div className="relative">
                                                        <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                                                        <select
                                                            value={tower.top_orientation || ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value as TowerMatrixConfig['top_orientation'];
                                                                setTowerMatrix(prev => {
                                                                    const newTM = [...prev];
                                                                    newTM[tIndex].top_orientation = val || undefined;
                                                                    if (val) {
                                                                        newTM[tIndex].gridCells = newTM[tIndex].gridCells.map(c => ({ ...c, is_manual_orientation: false }));
                                                                    }
                                                                    return updateTowersGridCells(newTM, connectedTowers, connectionDirection);
                                                                });
                                                            }}
                                                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all text-sm appearance-none cursor-pointer"
                                                        >
                                                            <option value="">(Manual)</option>
                                                            <option value="NORTH">Face Norte</option>
                                                            <option value="SOUTH">Face Sul</option>
                                                            <option value="EAST">Face Leste</option>
                                                            <option value="WEST">Face Oeste</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="flex items-end pb-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setTowerMatrix(prev => {
                                                                const removed = prev.filter((_, i) => i !== tIndex);
                                                                // if fewer than 2 towers, disconnect
                                                                if (removed.length < 2 && connectedTowers) {
                                                                    setConnectedTowers(false);
                                                                    return updateTowersGridCells(removed, false);
                                                                }
                                                                return updateTowersGridCells(removed, connectedTowers);
                                                            });
                                                        }}
                                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                                        title="Remover Torre"
                                                        disabled={towerMatrix.length === 1}
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Planta Baixa Visual */}
                                            {tower.unitsWidth > 0 && tower.unitsDepth > 0 && !connectedTowers && (
                                                <div className="mt-4 pt-4 border-t border-gray-100">
                                                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 px-1 flex items-center justify-between">
                                                        <div className="flex items-center gap-2 flex-1">
                                                            <span>Planta Baixa (Grade Visual)</span>
                                                            <div className="flex gap-2 ml-4">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const firstOrient = tower.gridCells.find(c => c.sun_orientation)?.sun_orientation;
                                                                        if (!firstOrient) return;
                                                                        const newTM = [...towerMatrix];
                                                                        newTM[tIndex].gridCells = newTM[tIndex].gridCells.map(c => ({ ...c, sun_orientation: firstOrient }));
                                                                        setTowerMatrix(newTM);
                                                                    }}
                                                                    className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-[8px] font-black uppercase hover:bg-blue-100 transition-colors"
                                                                >
                                                                    Replicar 1ª Orientação (Torre)
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const currentCells = tower.gridCells;
                                                                        const newTM = towerMatrix.map(t => ({
                                                                            ...t,
                                                                            gridCells: t.gridCells.map((c, idx) => ({
                                                                                ...c,
                                                                                sun_orientation: currentCells[idx]?.sun_orientation || c.sun_orientation
                                                                            }))
                                                                        }));
                                                                        setTowerMatrix(newTM);
                                                                    }}
                                                                    className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md text-[8px] font-black uppercase hover:bg-indigo-100 transition-colors"
                                                                >
                                                                    Copiar Layout para Todas Torres
                                                                </button>
                                                            </div>
                                                            <span className="flex-1 h-px bg-gray-100 mx-4" />
                                                        </div>
                                                        <span className="text-orange-400 font-black">Lado C (Fundos) é Invertido ao A (Frente)</span>
                                                    </h4>
                                                    
                                                    <div className="flex flex-col items-center p-6 bg-slate-50/50 rounded-2xl border border-slate-100/50 overflow-x-auto">
                                                        {/* Lado A */}
                                                        <div className="text-[9px] font-black text-blue-400 mb-2 uppercase tracking-[0.2em] border border-blue-200/50 bg-white px-4 py-1 rounded-full shadow-sm">Lado A (Topo/Frente)</div>
                                                        
                                                        <div className="flex items-center gap-4">
                                                            {/* Lado D */}
                                                            <div className="-rotate-90 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap border border-slate-200 bg-white px-3 py-0.5 rounded-full shadow-sm">Lado D (Esq.)</div>
                                                            
                                                            <div 
                                                                className="grid gap-2 sm:gap-4"
                                                                style={{ 
                                                                    gridTemplateColumns: `repeat(${tower.unitsWidth}, minmax(100px, 1fr))` 
                                                                }}
                                                            >
                                                                {tower.gridCells.map((cell, cIndex) => (
                                                                    <div 
                                                                        key={cIndex} 
                                                                        className={`relative flex flex-col items-center justify-center p-3 sm:p-5 border-2 rounded-2xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
                                                                            cell.position_type === 'FRONT' ? 'bg-blue-50/80 border-blue-300' :
                                                                            cell.position_type === 'BACK' ? 'bg-orange-50/80 border-orange-300' :
                                                                            'bg-white border-slate-200'
                                                                        }`}
                                                                    >
                                                                        <div className="absolute top-2 left-2.5 text-[8px] font-black text-slate-400/80 tracking-tighter uppercase whitespace-nowrap">
                                                                            {(() => {
                                                                                const cfg = tower.numberingConfig || { type: 'FLOOR_BASED', startNumber: 101, prefix: 'Apto ' };
                                                                                let displayNum = 0;
                                                                                if (cfg.type === 'FLOOR_BASED') {
                                                                                    const unitOffset = cfg.startNumber % 100;
                                                                                    displayNum = 100 + (cell.unitIndex - 1 + unitOffset);
                                                                                } else {
                                                                                    displayNum = cfg.startNumber + (cell.unitIndex - 1);
                                                                                }
                                                                                return `${cfg.prefix || ''}${displayNum}${cfg.suffix || ''}`;
                                                                            })()}
                                                                        </div>
                                                                        
                                                                        <div className="text-[10px] font-black mt-2 mb-1 flex items-center gap-1 uppercase tracking-widest whitespace-nowrap">
                                                                            {cell.position_type === 'FRONT' ? <span className="text-blue-600">Frente</span> :
                                                                            cell.position_type === 'BACK' ? <span className="text-orange-600">Fundos</span> :
                                                                            <span className="text-slate-600">Lateral</span>}
                                                                        </div>
                                                                        
                                                                        <select
                                                                            value={cell.sun_orientation || ''}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value ? e.target.value as GridCellConfig['sun_orientation'] : undefined;
                                                                                const newTM = [...towerMatrix];
                                                                                newTM[tIndex].gridCells[cIndex].sun_orientation = val;
                                                                                // Marcar como manual para não ser sobrescrito pelo seletor de topo
                                                                                newTM[tIndex].gridCells[cIndex].is_manual_orientation = !!val;
                                                                                setTowerMatrix(newTM);
                                                                            }}
                                                                            className="mt-1 w-full max-w-[90px] px-1 py-1.5 bg-white/50 border border-slate-200 rounded-lg text-[9px] font-bold text-slate-500 text-center outline-none focus:border-blue-400 transition-colors"
                                                                        >
                                                                            <option value="">(Orientação)</option>
                                                                            <option value="NORTH">Face Norte</option>
                                                                            <option value="SOUTH">Face Sul</option>
                                                                            <option value="EAST">Face Leste</option>
                                                                            <option value="WEST">Face Oeste</option>
                                                                        </select>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Lado B */}
                                                            <div className="rotate-90 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap border border-slate-200 bg-white px-3 py-0.5 rounded-full shadow-sm">Lado B (Dir.)</div>
                                                        </div>

                                                        {/* Lado C */}
                                                        <div className="text-[9px] font-black text-orange-400 mt-4 uppercase tracking-[0.2em] border border-orange-200/50 bg-white px-4 py-1 rounded-full shadow-sm">Lado C (Fundos)</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Planta Baixa (Torres Conectadas) */}
                                {connectedTowers && towerMatrix.length > 1 && (
                                    <div className="mt-8 pt-6 border-t border-blue-200">
                                        <h4 className="text-[12px] font-black text-blue-800 uppercase tracking-widest mb-4 px-1 text-center">
                                            Planta Baixa Unificada (Torres Conectadas)
                                        </h4>
                                        <div className="flex flex-col items-center p-6 bg-slate-50/50 rounded-2xl border border-slate-100/50 overflow-x-auto relative shadow-inner md:px-12">
                                            <div className="text-[9px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em] border border-slate-200 bg-white px-4 py-1 rounded-full shadow-sm">
                                                {connectionDirection === 'HORIZONTAL' ? 'Lado A (Lateral)' : 'Lado A (Frente Rua)'}
                                            </div>
                                            
                                            <div className={`flex ${connectionDirection === 'HORIZONTAL' ? 'flex-row' : 'flex-col'} items-center justify-center min-w-max relative gap-0`}>
                                                {connectionDirection === 'HORIZONTAL' && (
                                                    <div className="-rotate-90 text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] whitespace-nowrap border border-blue-200 bg-white px-3 py-0.5 rounded-full shadow-sm absolute -left-10 z-20">Frente (Rua)</div>
                                                )}
                                                
                                                {towerMatrix.map((t, tIndex) => (
                                                    <React.Fragment key={t.id}>
                                                        {tIndex > 0 && (
                                                            <div 
                                                                className={`bg-gray-300 shadow-inner z-10 rounded-sm ${connectionDirection === 'HORIZONTAL' ? 'w-6 mx-[-8px] border-x border-gray-400/50' : 'h-6 my-[-8px] w-full border-y border-gray-400/50'}`} 
                                                                style={connectionDirection === 'HORIZONTAL' ? { alignSelf: 'stretch', minHeight: '120px' } : {}}
                                                            ></div>
                                                        )}
                                                        <div className="flex flex-col relative z-0 items-center bg-white p-4 rounded-xl border border-dashed border-gray-200 shadow-sm mx-1 my-1">
                                                            <div className="text-[11px] font-black text-center text-blue-900 mb-3 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest border border-blue-100/50">TORRE {t.name}</div>
                                                            <div 
                                                                className="grid gap-2 sm:gap-4"
                                                                style={{ gridTemplateColumns: `repeat(${t.unitsWidth}, minmax(100px, 1fr))` }}
                                                            >
                                                                {t.gridCells.map((cell, cIndex) => (
                                                                    <div 
                                                                        key={cIndex} 
                                                                        className={`relative flex flex-col items-center justify-center p-3 sm:p-5 border-2 rounded-2xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
                                                                            cell.position_type === 'FRONT' ? 'bg-blue-50/80 border-blue-300' :
                                                                            cell.position_type === 'BACK' ? 'bg-orange-50/80 border-orange-300' :
                                                                            'bg-white border-slate-200'
                                                                        }`}
                                                                    >
                                                                        <div className="absolute top-2 left-2.5 text-[8px] font-black text-slate-400/80 tracking-tighter uppercase whitespace-nowrap">
                                                                            {(() => {
                                                                                const cfg = t.numberingConfig || { type: 'FLOOR_BASED', startNumber: 101, prefix: 'Apto ' };
                                                                                let displayNum = 0;
                                                                                if (cfg.type === 'FLOOR_BASED') {
                                                                                    const unitOffset = cfg.startNumber % 100;
                                                                                    displayNum = 100 + (cell.unitIndex - 1 + unitOffset);
                                                                                } else {
                                                                                    displayNum = cfg.startNumber + (cell.unitIndex - 1);
                                                                                }
                                                                                return `${cfg.prefix || ''}${displayNum}${cfg.suffix || ''}`;
                                                                            })()}
                                                                        </div>
                                                                        
                                                                        <div className="text-[10px] font-black mt-2 mb-1 flex items-center gap-1 uppercase tracking-widest whitespace-nowrap">
                                                                            {cell.position_type === 'FRONT' ? <span className="text-blue-600">Frente</span> :
                                                                            cell.position_type === 'BACK' ? <span className="text-orange-600">Fundos</span> :
                                                                            <span className="text-slate-600">Lateral</span>}
                                                                        </div>
                                                                        
                                                                        <select
                                                                            value={cell.sun_orientation || ''}
                                                                            onChange={(e) => {
                                                                                const newTM = [...towerMatrix];
                                                                                newTM[tIndex].gridCells[cIndex].sun_orientation = e.target.value ? e.target.value as GridCellConfig['sun_orientation'] : undefined;
                                                                                setTowerMatrix(newTM);
                                                                            }}
                                                                            className="mt-1 w-full max-w-[90px] px-1 py-1.5 bg-white/50 border border-slate-200 rounded-lg text-[9px] font-bold text-slate-500 text-center outline-none focus:border-blue-400 transition-colors"
                                                                        >
                                                                            <option value="">(Orientação)</option>
                                                                            <option value="NORTH">Face Norte</option>
                                                                            <option value="SOUTH">Face Sul</option>
                                                                            <option value="EAST">Face Leste</option>
                                                                            <option value="WEST">Face Oeste</option>
                                                                        </select>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </React.Fragment>
                                                ))}
                                                
                                                {connectionDirection === 'HORIZONTAL' && (
                                                    <div className="rotate-90 text-[9px] font-black text-orange-400 uppercase tracking-[0.2em] whitespace-nowrap border border-orange-200 bg-white px-3 py-0.5 rounded-full shadow-sm absolute -right-10 z-20">Fundos</div>
                                                )}
                                                {connectionDirection === 'VERTICAL' && (
                                                    <>
                                                        <div className="-rotate-90 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap border border-slate-200 bg-white px-3 py-0.5 rounded-full shadow-sm absolute -left-12 top-1/2 -translate-y-1/2 z-20">Lateral (Lado D)</div>
                                                        <div className="rotate-90 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap border border-slate-200 bg-white px-3 py-0.5 rounded-full shadow-sm absolute -right-12 top-1/2 -translate-y-1/2 z-20">Lateral (Lado B)</div>
                                                    </>
                                                )}
                                            </div>
                                            
                                            <div className="text-[9px] font-black text-slate-400 mt-4 uppercase tracking-[0.2em] border border-slate-200 bg-white px-4 py-1 rounded-full shadow-sm">
                                                {connectionDirection === 'HORIZONTAL' ? 'Lado C (Lateral)' : 'Lado C (Fundos)'}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Resumo */}
                                <div className="mt-6 pt-4 border-t border-blue-200/50 flex justify-between items-center relative z-10 font-mono">
                                    <div className="text-[10px] font-bold text-blue-800 tracking-wider">
                                        TOTAL A SER GERADO
                                    </div>
                                    <div className="text-xl font-black text-blue-600">
                                        {towerMatrix.reduce((acc, t) => acc + ((t.floors || 0) * (t.unitsWidth || 0) * (t.unitsDepth || 0)), 0)} unidades
                                    </div>
                                </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Section: Áreas e Dimensões Integradas */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-8 space-y-4">
                            <div className="flex items-center gap-2 text-blue-600">
                                <Maximize2 className="w-4 h-4" />
                                <h3 className="font-black uppercase tracking-widest text-[10px]">Áreas e Dimensões Técnicas</h3>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-1">
                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Área Privativa</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={formData.private_area || 0}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                setFormData({ ...formData, private_area: val, total_area: val + (formData.common_area || 0) });
                                            }}
                                            className="bg-transparent text-lg font-black text-gray-700 outline-none w-full font-mono"
                                        />
                                        <span className="text-[10px] font-bold text-gray-300">m²</span>
                                    </div>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-1">
                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Área Comum</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={formData.common_area || 0}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                setFormData({ ...formData, common_area: val, total_area: (formData.private_area || 0) + val });
                                            }}
                                            className="bg-transparent text-lg font-black text-gray-700 outline-none w-full font-mono"
                                        />
                                        <span className="text-[10px] font-bold text-gray-300">m²</span>
                                    </div>
                                </div>
                                <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100 flex flex-col gap-1 ring-2 ring-blue-50">
                                    <label className="text-[8px] font-black text-blue-200 uppercase tracking-widest">Área Total</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            readOnly
                                            type="number"
                                            value={formData.total_area || 0}
                                            className="bg-transparent text-xl font-black text-white outline-none w-full font-mono"
                                        />
                                        <span className="text-[10px] font-bold text-blue-300">m²</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="md:col-span-4 space-y-4">
                            <div className="flex items-center gap-2 text-blue-600">
                                <Layers className="w-4 h-4" />
                                <h3 className="font-black uppercase tracking-widest text-[10px]">Atributos Internos</h3>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-gray-50 p-2.5 rounded-xl flex flex-col items-center gap-0.5 border border-transparent hover:border-blue-200 transition-colors">
                                    <label className="text-[8px] font-black text-gray-400 uppercase">Dorm</label>
                                    <input
                                        type="number"
                                        value={formData.specs?.bedrooms}
                                        onChange={(e) => setFormData({ ...formData, specs: { ...formData.specs, bedrooms: parseInt(e.target.value) } })}
                                        className="bg-transparent text-base font-black text-gray-700 text-center outline-none w-full"
                                    />
                                </div>
                                <div className="bg-gray-50 p-2.5 rounded-xl flex flex-col items-center gap-0.5 border border-transparent hover:border-blue-200 transition-colors">
                                    <label className="text-[8px] font-black text-gray-400 uppercase">WC</label>
                                    <input
                                        type="number"
                                        value={formData.specs?.bathrooms}
                                        onChange={(e) => setFormData({ ...formData, specs: { ...formData.specs, bathrooms: parseInt(e.target.value) } })}
                                        className="bg-transparent text-base font-black text-gray-700 text-center outline-none w-full"
                                    />
                                </div>
                                <div className="bg-gray-50 p-2.5 rounded-xl flex flex-col items-center gap-0.5 border border-transparent hover:border-blue-200 transition-colors">
                                    <label className="text-[8px] font-black text-gray-400 uppercase">Vagas</label>
                                    <input
                                        type="number"
                                        value={formData.specs?.parkingSpaces}
                                        onChange={(e) => setFormData({ ...formData, specs: { ...formData.specs, parkingSpaces: parseInt(e.target.value) } })}
                                        className="bg-transparent text-base font-black text-gray-700 text-center outline-none w-full"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section: Propriedade e Status (Horizontal) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-blue-600">
                            <DollarSign className="w-4 h-4" />
                            <h3 className="font-black uppercase tracking-widest text-[10px]">Propriedade e Status</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1.5 font-mono">
                                <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest px-1 flex items-center gap-1">
                                    <DollarSign className="w-3 h-3" /> Valor de Venda (R$)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.initial_price || formData.price || 0}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setFormData({ ...formData, initial_price: val, price: val });
                                    }}
                                    className="w-full px-4 py-2 bg-blue-50/50 border border-blue-100 focus:bg-white focus:border-blue-500 rounded-xl outline-none font-black text-gray-900 transition-all shadow-inner text-base"
                                    placeholder="0,00"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Mudar Status</label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value as PropertyStatus })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                >
                                    <option value={PropertyStatus.AVAILABLE}>Disponível 🟢</option>
                                    <option value={PropertyStatus.RESERVED}>Reservado 🟡</option>
                                    <option value={PropertyStatus.SOLD}>Vendido 🔵</option>
                                    <option value={PropertyStatus.RENTED}>Alugado 🟣</option>
                                    <option value={PropertyStatus.EXCHANGED}>Permutado 🔄</option>
                                    <option value={PropertyStatus.MAINTENANCE}>Manutenção 🟠</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Cliente / Proprietário</label>
                                <select
                                    value={formData.client_id || ''}
                                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value || undefined })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                >
                                    <option value="">Sem vínculo (Inventário)</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Novos atributos de inteligência de preço */}
                        {formData.type !== 'BUILDING' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-gray-50/50 rounded-2xl border border-gray-100 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Posição no Pavimento</label>
                                    <select
                                        value={formData.position_type}
                                        onChange={(e) => setFormData({ ...formData, position_type: e.target.value as Property['position_type'] })}
                                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-xs"
                                    >
                                        <option value="LATERAL">Lateral</option>
                                        <option value="FRONT">Frente (+)</option>
                                        <option value="BACK">Fundos (-)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Qualidade da Vista</label>
                                    <select
                                        value={formData.view_type}
                                        onChange={(e) => setFormData({ ...formData, view_type: e.target.value as Property['view_type'] })}
                                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-xs"
                                    >
                                        <option value="NONE">Sem Vista (Base)</option>
                                        <option value="PARTIAL">Vista Parcial (+)</option>
                                        <option value="FULL">Vista Plena (++)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Orientação Solar</label>
                                    <select
                                        value={formData.sun_orientation}
                                        onChange={(e) => setFormData({ ...formData, sun_orientation: e.target.value as Property['sun_orientation'] })}
                                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-xs"
                                    >
                                        <option value="NORTH">Norte (Melhor)</option>
                                        <option value="EAST">Leste (Manhã)</option>
                                        <option value="WEST">Oeste (Tarde)</option>
                                        <option value="SOUTH">Sul</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Section: Upload de Fotos */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-blue-600">
                            <Camera className="w-5 h-5" />
                            <h3 className="font-black uppercase tracking-widest text-xs">Mídia do Imóvel</h3>
                        </div>

                        {/* Existing Images Preview */}
                        {formData.images && formData.images.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                {formData.images.map((url, idx) => (
                                    <div key={idx} className="relative group aspect-video rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                                        <img src={url} className="w-full h-full object-cover" alt={`Propriedade ${idx + 1}`} />
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, images: formData.images?.filter((_, i) => i !== idx) })}
                                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={async (e) => {
                                    const files = e.target.files;
                                    if (!files || files.length === 0) return;

                                    const newImages = [...(formData.images || [])];

                                    // Interface simplified: we need a propertyId to upload. 
                                    // If new property, we'll need to handle it. 
                                    // For now, let's assume direct to Supabase if we have local previews or a temporary ID.
                                    // Realistically, for OrçaCloud pattern, we might want to upload only on submit or use a temp folder.
                                    // Let's use URL.createObjectURL for instant preview and upload logic.

                                    for (let i = 0; i < files.length; i++) {
                                        const file = files[i];
                                        // For now, adding local preview. Real upload happens in the service if property exists,
                                        // or we can implement a sequential upload here.
                                        const previewUrl = URL.createObjectURL(file);
                                        newImages.push(previewUrl);

                                        // TIP: In a real scenario, we'd upload here if (initialData?.id)
                                        // and update the array.
                                    }
                                    setFormData({ ...formData, images: newImages });
                                }}
                            />
                            <div className="p-6 border-4 border-dashed border-gray-100 rounded-[2.5rem] flex flex-col items-center justify-center bg-gray-50/50 group hover:border-blue-200 hover:bg-white transition-all">
                                <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <Camera className="w-10 h-10 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                </div>
                                <p className="text-gray-400 font-bold group-hover:text-blue-600 transition-colors">Arraste fotos ou clique para fazer upload</p>
                                <span className="text-[10px] font-black text-gray-200 uppercase mt-2 tracking-widest">Suporte a alta resolução e WebP</span>
                            </div>
                        </div>
                    </div>
                </form>

                {/* Footer Executivo Compacto */}
                <div className="px-10 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-400 text-[9px] font-bold uppercase tracking-widest">
                        <Info className="w-3 h-3" />
                        Campos marcados com * são obrigatórios
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-8 py-2.5 bg-white text-gray-500 rounded-xl font-black hover:text-gray-900 transition-all border border-gray-200 shadow-sm active:scale-95 text-xs"
                        >
                            FECHAR
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-10 py-2.5 bg-blue-600 text-white rounded-xl font-black shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95 text-xs"
                        >
                            <Check className="w-5 h-5" />
                            SALVAR ALTERAÇÕES
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PropertyModal;
