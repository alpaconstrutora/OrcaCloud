import React from 'react';
import { 
    Zap, 
    Lightbulb, 
    Power, 
    Wind, 
    Droplets, 
    Server, 
    Settings,
    MonitorPlay,
    ThermometerSnowflake,
    Wifi
} from 'lucide-react';

export type ElectricalPointType = 
    | 'tomada_baixa'
    | 'tomada_media'
    | 'tomada_alta'
    | 'interruptor_simples'
    | 'interruptor_paralelo'
    | 'iluminacao_teto'
    | 'iluminacao_arandela'
    | 'chuveiro'
    | 'ar_condicionado'
    | 'quadro_qdc'
    | 'dados_tv'
    | 'especial';

export interface PointToolboxItem {
    id: ElectricalPointType;
    label: string;
    icon: React.ElementType;
    color: string;
    defaultPower: number;
    defaultHeight: number;
}

export const POINT_TYPES: PointToolboxItem[] = [
    { id: 'tomada_baixa', label: 'Tomada Baixa (0.3m)', icon: Power, color: '#ef4444', defaultPower: 100, defaultHeight: 0.3 },
    { id: 'tomada_media', label: 'Tomada Média (1.3m)', icon: Power, color: '#f97316', defaultPower: 100, defaultHeight: 1.3 },
    { id: 'tomada_alta', label: 'Tomada Alta (2.0m)', icon: Power, color: '#eab308', defaultPower: 600, defaultHeight: 2.0 },
    { id: 'interruptor_simples', label: 'Interruptor Simples', icon: Zap, color: '#3b82f6', defaultPower: 0, defaultHeight: 1.3 },
    { id: 'interruptor_paralelo', label: 'Interruptor Three-way', icon: Zap, color: '#6366f1', defaultPower: 0, defaultHeight: 1.3 },
    { id: 'iluminacao_teto', label: 'Ponto de Luz (Teto)', icon: Lightbulb, color: '#eab308', defaultPower: 15, defaultHeight: 2.8 },
    { id: 'iluminacao_arandela', label: 'Arandela', icon: Lightbulb, color: '#ca8a04', defaultPower: 15, defaultHeight: 2.0 },
    { id: 'chuveiro', label: 'Chuveiro Elétrico', icon: Droplets, color: '#06b6d4', defaultPower: 5500, defaultHeight: 2.2 },
    { id: 'ar_condicionado', label: 'Ar Condicionado', icon: ThermometerSnowflake, color: '#0ea5e9', defaultPower: 1200, defaultHeight: 2.2 },
    { id: 'dados_tv', label: 'Dados / TV / Lógica', icon: MonitorPlay, color: '#8b5cf6', defaultPower: 0, defaultHeight: 1.3 },
    { id: 'quadro_qdc', label: 'Quadro (QDC)', icon: Server, color: '#1e293b', defaultPower: 0, defaultHeight: 1.5 },
    { id: 'especial', label: 'Ponto Especial', icon: Settings, color: '#64748b', defaultPower: 0, defaultHeight: 1.0 },
];

interface PointToolboxProps {
    selectedToolboxItem: ElectricalPointType | null;
    onSelectToolboxItem: (type: ElectricalPointType | null) => void;
    tool: 'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall' | 'draw_wall_rect';
    setTool: (tool: 'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall' | 'draw_wall_rect') => void;
}

export default function PointToolbox({
    selectedToolboxItem,
    onSelectToolboxItem,
    tool,
    setTool
}: PointToolboxProps) {
    
    return (
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col h-full z-10 shadow-sm">
            <div className="p-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    Biblioteca
                </h2>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                    Ferramentas e Pontos Elétricos.
                </p>

                <div className="space-y-1 mb-4 pb-4 border-b border-slate-100">
                    <button
                        onClick={() => { setTool('select'); onSelectToolboxItem(null); }}
                        className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-colors ${
                            tool === 'select' ? 'bg-slate-100 text-slate-900 ring-1 ring-slate-200 font-medium' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                    >
                        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-slate-100 text-slate-600">
                            <span className="text-sm">👆</span>
                        </div>
                        <span className="text-sm">Selecionar / Mover</span>
                    </button>
                    <button
                        onClick={() => { setTool('draw_room'); onSelectToolboxItem(null); }}
                        className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-colors ${
                            tool === 'draw_room' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 font-medium' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                    >
                        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-emerald-100 text-emerald-600">
                            <span className="text-sm">📐</span>
                        </div>
                        <span className="text-sm">Desenhar Sala</span>
                    </button>
                </div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pontos Elétricos</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                    {POINT_TYPES.map((item) => {
                        const Icon = item.icon;
                        const isSelected = tool === 'add_point' && selectedToolboxItem === item.id;
                        
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setTool('add_point');
                                    onSelectToolboxItem(item.id);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-colors ${
                                    isSelected 
                                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' 
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                            >
                                <div 
                                    className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 shadow-sm"
                                    style={{ backgroundColor: `${item.color}15`, color: item.color }}
                                >
                                    <Icon className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-sm font-medium">{item.label}</div>
                                    <div className="text-xs opacity-70">
                                        {item.defaultPower > 0 ? `${item.defaultPower}W • ` : ''}{item.defaultHeight}m
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
            
            {tool === 'add_point' && selectedToolboxItem && (
                <div className="p-4 bg-blue-50 border-t border-blue-100">
                    <p className="text-xs text-blue-700 font-medium text-center">
                        Modo de Inserção Ativo. Clique na planta para inserir o ponto selecionado.
                    </p>
                    <button 
                        onClick={() => { setTool('select'); onSelectToolboxItem(null); }}
                        className="mt-2 w-full px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-md text-xs font-bold hover:bg-blue-100 transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            )}
        </div>
    );
}
