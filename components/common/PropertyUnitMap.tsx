import React, { useState, useMemo } from 'react';
import { Building2, Clock, Lock, CheckCircle2, AlertTriangle, Eye, MapPin, Sun, Edit, Tag, FileSignature, Wallet } from 'lucide-react';
import type { Property, PropertyDeal } from '../../types';

interface PropertyUnitMapProps {
    units: Property[];
    parentProperty?: Property;
    deals?: PropertyDeal[];
    onSelectUnit?: (unit: Property) => void;
    onReserveUnit?: (unit: Property) => void;
    onEditUnit?: (unit: Property) => void;
    onDeleteUnit?: (unit: Property) => void;
    renderExtraActions?: (unit: Property) => React.ReactNode;
    showDetailsPanel?: boolean;
    mode?: 'broker' | 'admin';
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; icon: any }> = {
    'AVAILABLE': { color: 'text-emerald-700', bg: 'bg-emerald-50 hover:bg-emerald-100', border: 'border-emerald-200 hover:border-emerald-400', label: 'Disponível', icon: CheckCircle2 },
    'RESERVED': { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Reservado', icon: Clock },
    'SOLD': { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'Vendido', icon: Lock },
    'RENTED': { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Alugado', icon: Eye },
    'EXCHANGED': { color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', label: 'Permutado', icon: Tag },
    'MAINTENANCE': { color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', label: 'Bloqueado', icon: AlertTriangle },
};

const PropertyUnitMap: React.FC<PropertyUnitMapProps> = ({ 
    units,
    parentProperty,
    deals = [],
    onSelectUnit, 
    onReserveUnit, 
    onEditUnit,
    renderExtraActions,
    showDetailsPanel = true,
    mode = 'broker'
}) => {
    const [selectedBlock, setSelectedBlock] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string | 'all'>('all');
    const [selectedUnit, setSelectedUnit] = useState<Property | null>(null);
    const [groupingMode, setGroupingMode] = useState<'position' | 'orientation'>('position');

    // Dicionário de Status do Negócio
    const DEAL_STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: any }> = {
        'IN_NEGOTIATION': { label: 'Em Negociação', bg: 'bg-gray-100', color: 'text-gray-600', icon: Clock },
        'PENDING': { label: 'Aguardando Assinatura', bg: 'bg-amber-100', color: 'text-amber-700', icon: FileSignature },
        'COMPLETED': { label: 'Vendido', bg: 'bg-red-100', color: 'text-red-700', icon: Wallet },
        'CLOSED': { label: 'Vendido', bg: 'bg-red-100', color: 'text-red-700', icon: Wallet },
        'CANCELLED': { label: 'Cancelado', bg: 'bg-red-100', color: 'text-red-700', icon: AlertTriangle },
        'ENVIADA': { label: 'Aguardando Assinatura', bg: 'bg-amber-100', color: 'text-amber-700', icon: FileSignature },
        'APROVADA': { label: 'Vendido', bg: 'bg-red-100', color: 'text-red-700', icon: Wallet },
    };

    const blocks = useMemo(() => [...new Set(units.map(u => u.block || ''))].filter(Boolean).sort(), [units]);

    const filteredUnits = useMemo(() => {
        let filtered = units;
        if (selectedBlock !== 'all') filtered = filtered.filter(u => u.block === selectedBlock);
        if (statusFilter !== 'all') filtered = filtered.filter(u => u.status === statusFilter);
        return filtered;
    }, [units, selectedBlock, statusFilter]);

    const floors = useMemo(() => {
        const floorMap = new Map<number, Property[]>();
        for (const u of filteredUnits) {
            const f = u.floor || 0;
            if (!floorMap.has(f)) floorMap.set(f, []);
            floorMap.get(f)!.push(u);
        }
        return Array.from(floorMap.entries()).sort((a, b) => b[0] - a[0]);
    }, [filteredUnits]);

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const u of units) {
            counts[u.status] = (counts[u.status] || 0) + 1;
        }
        return counts;
    }, [units]);

    const handleUnitClick = (unit: Property) => {
        setSelectedUnit(unit);
        if (onSelectUnit) onSelectUnit(unit);
    };

    const formatPrice = (value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

    const renderUnit = (unit: Property) => {
        const unitDealsMatched = deals.filter(d => 
            d && d.property_id && unit && unit.id && 
            String(d.property_id).toLowerCase() === String(unit.id).toLowerCase()
        );
        const activeDeal = unitDealsMatched.find(d => d.status !== 'CANCELLED') || unitDealsMatched[0];
        
        let cfg = STATUS_CONFIG[unit.status] || STATUS_CONFIG['AVAILABLE'];
        
        if (activeDeal) {
            const status = activeDeal.status as string;
            const type = activeDeal.type as string;
            if (status === 'COMPLETED' || status === 'CLOSED' || status === 'APROVADA') {
                cfg = type === 'RENTAL' ? STATUS_CONFIG['RENTED'] : STATUS_CONFIG['SOLD'];
            } else if (status === 'PENDING' || status === 'ENVIADA') {
                cfg = STATUS_CONFIG['RESERVED'];
            } else if (status === 'IN_NEGOTIATION') {
                cfg = STATUS_CONFIG['MAINTENANCE'];
            }
        }

        const Icon = cfg.icon;
        const isSelected = selectedUnit?.id === unit.id;
        
        // Priorizar o valor da negociação ativa (contrato) sobre o preço base do imóvel
        const unitPrice = activeDeal?.value || unit.current_price || unit.price;

        return (
            <div
                key={unit.id}
                onClick={() => handleUnitClick(unit)}
                className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all min-w-[100px] group ${cfg.bg} ${cfg.border} ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2 scale-105' : ''} cursor-pointer hover:scale-105 hover:shadow-lg focus:outline-none`}
            >
                <Icon className={`w-4 h-4 mb-1 ${cfg.color}`} />
                <span className={`text-sm font-black ${cfg.color}`}>{unit.name || unit.number || 'N/A'}</span>
                
                {/* Informações detalhadas do card (conforme imagem técnica) */}
                <div className="flex flex-col items-center gap-0.5 mt-0.5">
                    <span className="text-[10px] font-bold text-gray-500">
                        {unit.bedrooms || (unit as any).specs?.bedrooms || 0} dormitórios
                    </span>
                    <span className={`text-[11px] font-black ${cfg.color}`}>{formatPrice(unitPrice)}</span>
                    <span className="text-[9px] font-bold text-gray-400">
                        {formatPrice(unitPrice / ((unit as any).private_area || (unit as any).area || 1))}/m²
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold">{(unit as any).private_area || (unit as any).area}m²</span>
                    
                    {(() => {
                        let orientation = (unit as any).sun_orientation || (unit as any).sun_position || (unit as any).specs?.sun_orientation;
                        
                        // Scanner de dados solar
                        if (!orientation) {
                            const sunKey = Object.keys(unit).find(k => k.toLowerCase().includes('sun') && (unit as any)[k]);
                            if (sunKey) orientation = (unit as any)[sunKey];
                        }

                        if (!orientation && !unit.position_type) return null;
                        
                        const label = String(orientation || '').trim().toUpperCase();
                        const map: Record<string, string> = {
                            'NORTH': 'Norte', 'NORTE': 'Norte',
                            'SOUTH': 'Sul', 'SUL': 'Sul',
                            'EAST': 'Leste', 'LESTE': 'Leste',
                            'WEST': 'Oeste', 'OESTE': 'Oeste'
                        };
                        
                        const displayLabel = map[label] || 
                                           (label.includes('NOR') ? 'Norte' : 
                                            label.includes('SUL') || label.includes('SOU') ? 'Sul' : 
                                            label.includes('LES') || label.includes('EAS') ? 'Leste' : 
                                            label.includes('OES') || label.includes('WES') ? 'Oeste' : orientation || '');

                        const positionLabels: Record<string, string> = {
                            'FRONT': 'Frente',
                            'LATERAL': 'Lateral',
                            'BACK': 'Fundos'
                        };
                        const displayPosition = positionLabels[unit.position_type as string] || 'Lado';

                        // Retorna como texto direto sem box, conforme imagem do usuário
                        return (
                            <span className="text-[10px] font-black text-gray-500 uppercase mt-0.5 text-center leading-tight">
                                {displayPosition} {displayLabel}
                            </span>
                        );
                    })()}
                </div>
                
                {(() => {
                    const deaslForThisUnit = deals.filter(d => 
                        d && d.property_id && unit && unit.id && 
                        String(d.property_id).toLowerCase() === String(unit.id).toLowerCase()
                    );
                    if (deaslForThisUnit.length === 0) return null;
                    const d = deaslForThisUnit.find(d => d.status !== 'CANCELLED') || deaslForThisUnit[0];
                    const dealCfg = DEAL_STATUS_CONFIG[d.status];
                    if (!dealCfg) return (
                        <div className="mt-1 flex items-center gap-1 bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md w-full justify-center border border-black/5">
                            <span className="text-[7px] font-black uppercase tracking-wider">{d.status}</span>
                        </div>
                    );
                    const DealIcon = dealCfg.icon;
                    const statusStr = d.status as string;
                    const label = (statusStr === 'COMPLETED' || statusStr === 'CLOSED' || statusStr === 'APROVADA') && d.type === 'RENTAL' 
                        ? 'Alugado' 
                        : dealCfg.label;
                    return (
                        <div className={`mt-1.5 flex items-center gap-1 ${dealCfg.bg} ${dealCfg.color} px-2 py-0.5 rounded-md w-full justify-center shadow-sm border border-black/5`}>
                            {DealIcon && <DealIcon className="w-2.5 h-2.5" />}
                            <span className="text-[8px] font-black uppercase tracking-wider leading-none text-center">{label}</span>
                        </div>
                    );
                })()}
                
                {mode === 'admin' && onEditUnit && (
                    <div className="absolute top-2 right-2 z-20">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onEditUnit(unit); }}
                            className="p-1.5 bg-white border border-gray-100 rounded-lg shadow-sm text-blue-600 hover:bg-blue-50 hover:scale-110 transition-all"
                        >
                            <Edit className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Status Summary Bar */}
            <div className="flex flex-wrap gap-3">
                <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${statusFilter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                >
                    Todas ({units.length})
                </button>
                {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
                    const count = statusCounts[status] || 0;
                    if (count === 0) return null;
                    const Icon = cfg.icon;
                    return (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${statusFilter === status ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ring-offset-1` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {cfg.label} ({count})
                        </button>
                    );
                })}
            </div>

            {/* View Customizer Bar */}
            <div className="flex items-center justify-between gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Agrupar Por:</span>
                        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200">
                            <button
                                onClick={() => setGroupingMode('position')}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${groupingMode === 'position' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Posição
                            </button>
                            <button
                                onClick={() => setGroupingMode('orientation')}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${groupingMode === 'orientation' ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Sol
                            </button>
                        </div>
                    </div>
                </div>

                {/* Block Selector (Moved inside bar for cleanliness) */}
                {blocks.length > 1 && (
                    <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <div className="flex gap-1.5 bg-white p-1 rounded-xl shadow-sm border border-gray-200">
                            <button
                                onClick={() => setSelectedBlock('all')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${selectedBlock === 'all' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-50'}`}
                            >
                                Todas
                            </button>
                            {blocks.map(b => (
                                <button
                                    key={b}
                                    onClick={() => setSelectedBlock(b)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${selectedBlock === b ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-50'}`}
                                >
                                    {b}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Floor Grid */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-100">
                    {floors.map(([floor, floorUnits]) => (
                        <div key={floor} className="flex items-stretch">
                            <div className="w-20 shrink-0 flex items-center justify-center bg-gray-50 border-r border-gray-100">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight text-center px-1">
                                    {floor}º<br/>Pavimento
                                </span>
                            </div>
                            <div className="flex-1 flex flex-wrap gap-4 p-4">
                                {(() => {
                                    if (selectedBlock !== 'all') {
                                        return (
                                            <div className="flex flex-wrap gap-4">
                                                {floorUnits
                                                    .sort((a, b) => (a.number || '').localeCompare(b.number || ''))
                                                    .map(unit => renderUnit(unit))}
                                            </div>
                                        );
                                    }

                                    const matrixConfig = parentProperty?.specs?.matrixConfig;
                                    const connectedTowers = parentProperty?.specs?.connectedTowers;
                                    const connectionDirection = parentProperty?.specs?.connectionDirection || 'HORIZONTAL';

                                    if (matrixConfig && matrixConfig.length > 0) {
                                        return (
                                            <div className="flex-1 flex flex-col items-center p-6 bg-slate-50/50 rounded-2xl border border-slate-100/50 overflow-x-auto relative shadow-inner md:px-12 w-full">
                                                {(() => {
                                                    const sunLabels: Record<string, string> = { 'NORTH': 'Norte', 'SOUTH': 'Sul', 'EAST': 'Leste', 'WEST': 'Oeste' };
                                                    const floorOrientations = [...new Set(floorUnits.map(u => u.sun_orientation).filter(Boolean))];
                                                    
                                                    return connectedTowers && (
                                                        <div className="flex flex-col items-center gap-1 mb-4">
                                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border border-slate-200 bg-white px-4 py-1 rounded-full shadow-sm">
                                                                {connectionDirection === 'HORIZONTAL' ? 'Lado A (Lateral)' : 'Lado A (Frente Rua)'}
                                                            </div>
                                                            {floorOrientations.length > 0 && (
                                                                <div className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter">
                                                                    {floorOrientations.map(o => o ? (sunLabels[o] || o) : '').filter(Boolean).join(' / ')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                                
                                                <div className={`flex ${connectedTowers && connectionDirection === 'HORIZONTAL' ? 'flex-row' : 'flex-col'} items-center justify-center min-w-max relative gap-0`}>
                                                    {(() => {
                                                        const sunLabels: Record<string, string> = { 'NORTH': 'Norte', 'SOUTH': 'Sul', 'EAST': 'Leste', 'WEST': 'Oeste' };
                                                        const frontOrientations = [...new Set(floorUnits.filter(u => u.position_type === 'FRONT').map(u => u.sun_orientation).filter(Boolean))];
                                                        
                                                        return connectedTowers && connectionDirection === 'HORIZONTAL' && (
                                                            <div className="-rotate-90 absolute -left-20 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-20">
                                                                <div className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] whitespace-nowrap border border-blue-200 bg-white px-3 py-0.5 rounded-full shadow-sm">
                                                                    Frente (Rua)
                                                                </div>
                                                                {frontOrientations.length > 0 && (
                                                                    <div className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">
                                                                        {frontOrientations.map(o => o ? (sunLabels[o] || o) : '').filter(Boolean).join('/')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                    
                                                    {matrixConfig.map((t: any, tIndex: number) => {
                                                        const blockUnits = floorUnits.filter(u => (u.block || 'Geral') === t.name);
                                                        if (blockUnits.length === 0) return null;

                                                        return (
                                                            <React.Fragment key={t.id || tIndex}>
                                                                {connectedTowers && tIndex > 0 && (
                                                                    <div 
                                                                        className={`bg-gray-300 shadow-inner z-10 rounded-sm ${connectionDirection === 'HORIZONTAL' ? 'w-6 mx-[-8px] border-x border-gray-400/50' : 'h-6 my-[-8px] w-full border-y border-gray-400/50'}`} 
                                                                        style={connectionDirection === 'HORIZONTAL' ? { alignSelf: 'stretch', minHeight: '120px' } : {}}
                                                                    ></div>
                                                                )}
                                                                <div className={`flex flex-col relative z-0 items-center bg-white p-4 rounded-xl border border-dashed border-gray-200 shadow-sm mx-1 my-1 ${!connectedTowers ? 'mt-4 w-full' : ''}`}>
                                                                    <div className="absolute -top-3 left-6 px-3 bg-white border border-blue-200 rounded-full shadow-sm">
                                                                        <span className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em]">Torre {t.name}</span>
                                                                    </div>
                                                                    
                                                                    <div 
                                                                        className="grid gap-2 sm:gap-4 mt-2"
                                                                        style={{ gridTemplateColumns: `repeat(${t.unitsWidth || 1}, minmax(100px, 1fr))` }}
                                                                    >
                                                                        {t.gridCells.map((cell: any, cIndex: number) => {
                                                                            // Encontrar a unidade real baseada na célula do grid
                                                                            const realUnit = blockUnits.find(u => 
                                                                                u.specs?.grid_x === cell.x && u.specs?.grid_y === cell.y
                                                                            );

                                                                            if (!realUnit) {
                                                                                // Se não encontrou usando grid_x/y (dados antigos), tentar via position_type e ordem
                                                                                // Fallback simples para compatibilidade
                                                                                const looseUnit = blockUnits.filter(u => u.position_type === cell.position_type)[cell.x] || blockUnits[cIndex];
                                                                                if (!looseUnit) return <div key={cIndex} className="p-3 bg-gray-50 border border-gray-200 border-dashed rounded-xl opacity-50 min-h-[100px]"></div>;
                                                                                return <div key={cIndex} className="w-full h-full">{renderUnit(looseUnit)}</div>;
                                                                            }

                                                                            return (
                                                                                <div key={realUnit.id || cIndex} className="w-full h-full relative">
                                                                                    {/* Indicação visual da frente rua se a torre NÃO estiver conectada e for a primeira do grid */}
                                                                                    {!connectedTowers && cell.y === 0 && cell.x === 0 && (
                                                                                        <div className="absolute -top-3 -left-3 rotate-[-15deg] text-[7px] font-black text-blue-400 uppercase tracking-widest bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 z-10 shadow-sm">Rua</div>
                                                                                    )}
                                                                                    {renderUnit(realUnit)}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                    
                                                    {(() => {
                                                        const sunLabels: Record<string, string> = { 'NORTH': 'Norte', 'SOUTH': 'Sul', 'EAST': 'Leste', 'WEST': 'Oeste' };
                                                        const backOrientations = [...new Set(floorUnits.filter(u => u.position_type === 'BACK').map(u => u.sun_orientation).filter(Boolean))];
                                                        
                                                        return connectedTowers && connectionDirection === 'HORIZONTAL' && (
                                                            <div className="rotate-90 absolute -right-20 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-20">
                                                                <div className="text-[9px] font-black text-orange-400 uppercase tracking-[0.2em] whitespace-nowrap border border-orange-200 bg-white px-3 py-0.5 rounded-full shadow-sm">
                                                                    Fundos
                                                                </div>
                                                                {backOrientations.length > 0 && (
                                                                    <div className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">
                                                                        {backOrientations.map(o => o ? (sunLabels[o] || o) : '').filter(Boolean).join('/') }
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                    {connectedTowers && connectionDirection === 'VERTICAL' && (
                                                        <>
                                                            {(() => {
                                                                const sunLabels: Record<string, string> = { 'NORTH': 'Norte', 'SOUTH': 'Sul', 'EAST': 'Leste', 'WEST': 'Oeste' };
                                                                const leftOrientations = [...new Set(floorUnits.filter(u => u.position_type === 'LATERAL' && u.specs?.grid_x === 0).map(u => u.sun_orientation).filter(Boolean))];
                                                                return (
                                                                    <div className="-rotate-90 absolute -left-20 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-20">
                                                                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap border border-slate-200 bg-white px-3 py-0.5 rounded-full shadow-sm">Lateral (Lado D)</div>
                                                                        {leftOrientations.length > 0 && (
                                                                            <div className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">
                                                                                {leftOrientations.map(o => o ? (sunLabels[o] || o) : '').filter(Boolean).join('/')}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                            {(() => {
                                                                const sunLabels: Record<string, string> = { 'NORTH': 'Norte', 'SOUTH': 'Sul', 'EAST': 'Leste', 'WEST': 'Oeste' };
                                                                const rightOrientations = [...new Set(floorUnits.filter(u => u.position_type === 'LATERAL' && u.specs?.grid_x !== 0).map(u => u.sun_orientation).filter(Boolean))];
                                                                return (
                                                                    <div className="rotate-90 absolute -right-20 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-20">
                                                                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap border border-slate-200 bg-white px-3 py-0.5 rounded-full shadow-sm">Lateral (Lado B)</div>
                                                                        {rightOrientations.length > 0 && (
                                                                            <div className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">
                                                                                {rightOrientations.map(o => o ? (sunLabels[o] || o) : '').filter(Boolean).join('/')}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </>
                                                    )}
                                                </div>
                                                
                                                {(() => {
                                                    const sunLabels: Record<string, string> = { 'NORTH': 'Norte', 'SOUTH': 'Sul', 'EAST': 'Leste', 'WEST': 'Oeste' };
                                                    const bottomPos = connectionDirection === 'HORIZONTAL' ? 'LATERAL' : 'BACK';
                                                    const bottomOrientations = [...new Set(floorUnits.filter(u => u.position_type === bottomPos).map(u => u.sun_orientation).filter(Boolean))];
                                                    
                                                    return connectedTowers && (
                                                        <div className="flex flex-col items-center gap-1 mt-4">
                                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border border-slate-200 bg-white px-4 py-1 rounded-full shadow-sm">
                                                                {connectionDirection === 'HORIZONTAL' ? 'Lado C (Lateral)' : 'Lado C (Fundos)'}
                                                            </div>
                                                            {bottomOrientations.length > 0 && (
                                                                <div className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter">
                                                                    {bottomOrientations.map(o => o ? (sunLabels[o] || o) : '').filter(Boolean).join(' / ')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    }

                                    const allBlocks = blocks.length > 0 ? blocks : ['Geral'];

                                    return (
                                        <div className={`flex-1 grid gap-8 ${allBlocks.length > 1 ? `md:grid-cols-${Math.min(allBlocks.length, 3)} lg:grid-cols-${Math.min(allBlocks.length, 4)}` : 'grid-cols-1'}`}>
                                            {allBlocks.map(blockName => {
                                                const blockUnits = floorUnits.filter(u => (u.block || 'Geral') === blockName);
                                                if (blockUnits.length === 0) return <div key={blockName} className="hidden md:block" />;

                                                return (
                                                    <div key={blockName} className="p-4 border-2 border-dashed border-blue-200 rounded-[2rem] relative mt-2 min-h-[140px] flex flex-col gap-6">
                                                        <div className="absolute -top-3 left-6 px-3 bg-white border border-blue-200 rounded-full shadow-sm">
                                                            <span className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em]">Torre {blockName}</span>
                                                        </div>
                                                        
                                                        {(() => {
                                                            const positionOrder = { 'FRONT': 0, 'LATERAL': 1, 'BACK': 2, 'NONE': 3 };
                                                            const orientationOrder = { 'NORTH': 0, 'SOUTH': 1, 'EAST': 2, 'WEST': 3, 'MANUAL': 4 };

                                                            const getUnitOrientation = (u: any) => {
                                                                const o = (u as any).sun_orientation || (u as any).sun_position || (u as any).specs?.sun_orientation;
                                                                if (!o) {
                                                                    const k = Object.keys(u).find(key => key.toLowerCase().includes('sun') && (u as any)[key]);
                                                                    return k ? (u as any)[k] : 'MANUAL';
                                                                }
                                                                return o;
                                                            };

                                                            const groupKeys = groupingMode === 'position' 
                                                                ? [...new Set(blockUnits.map(u => u.position_type || 'LATERAL'))].sort((a, b) => 
                                                                    (positionOrder[a as keyof typeof positionOrder] ?? 99) - (positionOrder[b as keyof typeof positionOrder] ?? 99)
                                                                  )
                                                                : [...new Set(blockUnits.map(u => getUnitOrientation(u)))].sort((a, b) => {
                                                                    const labelA = String(a).toUpperCase();
                                                                    const labelB = String(b).toUpperCase();
                                                                    const keyA = Object.keys(orientationOrder).find(k => labelA.includes(k)) || 'MANUAL';
                                                                    const keyB = Object.keys(orientationOrder).find(k => labelB.includes(k)) || 'MANUAL';
                                                                    return orientationOrder[keyA as keyof typeof orientationOrder] - orientationOrder[keyB as keyof typeof orientationOrder];
                                                                  });

                                                            const positionLabels: Record<string, string> = {
                                                                'FRONT': 'Frente',
                                                                'BACK': 'Fundos',
                                                                'LATERAL': 'Lateral'
                                                            };

                                                            const orientationLabels: Record<string, string> = {
                                                                'NORTH': 'Norte', 'NORTE': 'Norte',
                                                                'SOUTH': 'Sul', 'SUL': 'Sul',
                                                                'EAST': 'Leste', 'LESTE': 'Leste',
                                                                'WEST': 'Oeste', 'OESTE': 'Oeste',
                                                                'MANUAL': 'Manual'
                                                            };

                                                            return groupKeys.map(key => {
                                                                const unitsInGroup = groupingMode === 'position'
                                                                    ? blockUnits.filter(u => (u.position_type || 'LATERAL') === key)
                                                                    : blockUnits.filter(u => getUnitOrientation(u) === key);
                                                                
                                                                const sortedUnits = unitsInGroup.sort((a, b) => (a.number || '').localeCompare(b.number || ''));
                                                                
                                                                // Label da linha (dinâmico)
                                                                let rowLabel = '';
                                                                if (groupingMode === 'position') {
                                                                    rowLabel = positionLabels[key as string] || (key as string);
                                                                } else {
                                                                    const labelStr = String(key).toUpperCase();
                                                                    const foundKey = Object.keys(orientationLabels).find(k => labelStr.includes(k));
                                                                    rowLabel = foundKey ? orientationLabels[foundKey] : String(key);
                                                                }

                                                                // Pegar orientações solares únicas para a etiqueta lateral (se não estiver agrupando por orientação)
                                                                const orientationsForLabel = groupingMode === 'position' ? [...new Set(unitsInGroup.map(u => getUnitOrientation(u)).filter(Boolean))] : [];
                                                                const orientationLabel = orientationsForLabel.length > 0 ? ` ${orientationsForLabel.map(o => orientationLabels[String(o).toUpperCase()] || o).join('/')}` : '';

                                                                return (
                                                                    <div key={String(key)} className="flex items-center gap-4">
                                                                        <div className="w-16 shrink-0 flex flex-col items-end">
                                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter text-right leading-tight">
                                                                                {rowLabel}
                                                                                {groupingMode === 'position' && orientationLabel && (
                                                                                    <span className="block text-[8px] font-bold text-blue-400 mt-0.5">
                                                                                        {orientationLabel.trim()}
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                            {groupingMode === 'position' && (rowLabel === 'Lateral') && orientationLabel && (
                                                                                <span className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter text-right">
                                                                                    {orientationLabel}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex flex-wrap gap-3">
                                                                            {sortedUnits.map(unit => renderUnit(unit))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            });
                                                        })()}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Unit Detail Panel */}
            {showDetailsPanel && selectedUnit && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h3 className="text-xl font-black text-gray-900">Unidade {selectedUnit.number || selectedUnit.name}</h3>
                            <p className="text-sm text-gray-500">{selectedUnit.block || 'Geral'} • {selectedUnit.floor || 0}º Pavimento</p>
                        </div>
                        <div className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${STATUS_CONFIG[selectedUnit.status]?.bg} ${STATUS_CONFIG[selectedUnit.status]?.color} ${STATUS_CONFIG[selectedUnit.status]?.border} border`}>
                            {STATUS_CONFIG[selectedUnit.status]?.label}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipologia</p>
                            <p className="text-lg font-black text-gray-900">
                                {selectedUnit.bedrooms || selectedUnit.specs?.bedrooms 
                                    ? `${selectedUnit.bedrooms || selectedUnit.specs?.bedrooms} Dormitório${(selectedUnit.bedrooms || selectedUnit.specs?.bedrooms) !== 1 ? 's' : ''}` 
                                    : (selectedUnit.typology || 'Padrão')}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Área Privativa</p>
                            <p className="text-lg font-black text-gray-900">{selectedUnit.private_area || selectedUnit.area}m²</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Dormitórios</p>
                            <p className="text-lg font-black text-gray-900">{selectedUnit.bedrooms || selectedUnit.specs?.bedrooms || 0}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Vagas</p>
                            <p className="text-lg font-black text-gray-900">{selectedUnit.parking_spaces || selectedUnit.specs?.parkingSpaces || 0}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-indigo-50 rounded-xl p-4 mb-6">
                        <div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Valor Atual</p>
                            <p className="text-2xl font-black text-indigo-700">{formatPrice(selectedUnit.current_price || selectedUnit.price)}</p>
                        </div>
                        {selectedUnit.sun_position && (
                            <div className="flex items-center gap-2 text-amber-600">
                                < Sun className="w-5 h-5" />
                                <span className="text-sm font-bold">{selectedUnit.sun_position}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        {mode === 'broker' && selectedUnit.status === 'AVAILABLE' && (
                            <>
                                <button
                                    onClick={() => onReserveUnit?.(selectedUnit)}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-500 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20 active:scale-95"
                                >
                                    <Clock className="w-4 h-4" />
                                    Reservar (48h)
                                </button>
                                <button
                                    onClick={() => onSelectUnit?.(selectedUnit)}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                                >
                                    <MapPin className="w-4 h-4" />
                                    Fazer Proposta
                                </button>
                            </>
                        )}
                        {mode === 'admin' && (
                            <>
                                <button
                                    onClick={() => onEditUnit?.(selectedUnit)}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-gray-50 transition-all active:scale-95"
                                >
                                    <Edit className="w-4 h-4" />
                                    Editar Imóvel
                                </button>
                                <button
                                    onClick={() => onSelectUnit?.(selectedUnit as Property)}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg active:scale-95"
                                >
                                    <Tag className="w-4 h-4" />
                                    Registrar Negócio
                                </button>
                            </>
                        )}
                        {renderExtraActions?.(selectedUnit as Property)}
                    </div>
                </div>
            )}

            {filteredUnits.length === 0 && (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                    <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-400 font-bold">Nenhuma unidade encontrada com esse filtro.</p>
                </div>
            )}
        </div>
    );
};

export default PropertyUnitMap;
