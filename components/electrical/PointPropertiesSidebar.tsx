import React from 'react';
import { Settings2, Zap, Save, Trash2, X } from 'lucide-react';
import { OpuraElectricalPoint } from '../../types';
import { POINT_TYPES } from './PointToolbox';

interface PointPropertiesSidebarProps {
    point: OpuraElectricalPoint;
    onUpdate: (updates: Partial<OpuraElectricalPoint>) => void;
    onDelete: () => void;
    onClose: () => void;
}

export default function PointPropertiesSidebar({
    point,
    onUpdate,
    onDelete,
    onClose
}: PointPropertiesSidebarProps) {
    
    const [localState, setLocalState] = React.useState({
        powerW: point.powerW || 0,
        voltage: point.voltage || 0,
        heightM: point.heightM || 0,
    });

    React.useEffect(() => {
        setLocalState({
            powerW: point.powerW || 0,
            voltage: point.voltage || 0,
            heightM: point.heightM || 0,
        });
    }, [point]);

    const pointDef = POINT_TYPES.find(p => p.id === point.pointType);
    const Icon = pointDef?.icon || Zap;

    const handleSave = () => {
        onUpdate({
            powerW: localState.powerW,
            voltage: localState.voltage,
            heightM: localState.heightM
        });
    };

    return (
        <div className="w-72 bg-white border-l border-slate-200 flex flex-col h-full z-10 shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-slate-500" />
                    Propriedades
                </h2>
                <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-md text-slate-400">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div 
                        className="w-10 h-10 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${pointDef?.color || '#94a3b8'}15`, color: pointDef?.color || '#94a3b8' }}
                    >
                        <Icon className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-slate-800">{pointDef?.label || 'Ponto Especial'}</div>
                        <div className="text-xs text-slate-500">ID: {point.id.split('-')[0]}...</div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Potência (Watts)</label>
                        <input 
                            type="number" 
                            value={localState.powerW}
                            onChange={e => setLocalState(s => ({ ...s, powerW: parseFloat(e.target.value) || 0 }))}
                            className="w-full border border-slate-200 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Tensão (Volts)</label>
                        <select 
                            value={localState.voltage}
                            onChange={e => setLocalState(s => ({ ...s, voltage: parseInt(e.target.value) || 0 }))}
                            className="w-full border border-slate-200 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value={0}>Padrão da Obra</option>
                            <option value={127}>127V</option>
                            <option value={220}>220V</option>
                            <option value={380}>380V (Trifásico)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Altura Instalada (m)</label>
                        <input 
                            type="number" 
                            step="0.1"
                            value={localState.heightM}
                            onChange={e => setLocalState(s => ({ ...s, heightM: parseFloat(e.target.value) || 0 }))}
                            className="w-full border border-slate-200 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                        />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
                    <button 
                        onClick={handleSave}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                        <Save className="w-4 h-4" /> Salvar Alterações
                    </button>
                    
                    <button 
                        onClick={onDelete}
                        className="w-full py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" /> Remover Ponto
                    </button>
                </div>
            </div>
        </div>
    );
}
