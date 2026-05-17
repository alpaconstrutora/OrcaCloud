import React, { useState } from 'react';
import { X, TrendingUp, Calculator, ShieldCheck, ArrowRight, Info, BrainCircuit } from 'lucide-react';
import { HedonicPricingConfig } from '../types';

interface PricingIntelligenceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (config: HedonicPricingConfig) => void;
    buildingName: string;
}

const PricingIntelligenceModal: React.FC<PricingIntelligenceModalProps> = ({ isOpen, onClose, onApply, buildingName }) => {
    const [config, setConfig] = useState<HedonicPricingConfig>({
        target_vgv: 0,
        floor_coefficient: 0.005, // 0.5% default
        position_weights: {
            FRONT: 1.03,
            LATERAL: 1.00,
            BACK: 0.97
        },
        view_weights: {
            NONE: 1.00,
            PARTIAL: 1.03,
            FULL: 1.07
        },
        orientation_weights: {
            NORTH: 1.02,
            EAST: 1.01,
            WEST: 0.99,
            SOUTH: 0.98
        }
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 md:p-12 overflow-y-auto">
            <div className="fixed inset-0 bg-[#0B1727]/90 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />
            
            <div className="relative bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-8 bg-blue-600 text-white flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                            <BrainCircuit className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tight">Inteligência de Precificação</h2>
                            <p className="text-blue-100 font-bold text-xs uppercase tracking-widest opacity-80">Empreendimento: {buildingName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X className="w-6 h-6" /></button>
                </div>

                <div className="p-8 overflow-y-auto space-y-8">
                    {/* Alerta de Conceito */}
                    <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex items-start gap-4">
                        <Info className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                        <div className="text-sm">
                            <h4 className="font-black text-blue-900 uppercase tracking-widest mb-1 text-[10px]">Modelo Hedônico de Precificação</h4>
                            <p className="text-blue-700/80 font-medium leading-relaxed">
                                Este modelo distribui o VGV alvo proporcionalmente entre todas as unidades, considerando pesos estatísticos para cada atributo. 
                                <span className="font-bold text-blue-900 ml-1 italic">Evita unidades encalhadas por superprecificação manual.</span>
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Target VGV Section */}
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">VGV Alvo do Projeto (R$)</label>
                                <div className="relative flex items-center">
                                    <span className="absolute left-5 font-black text-gray-400">R$</span>
                                    <input
                                        type="number"
                                        value={config.target_vgv || ''}
                                        onChange={(e) => setConfig({ ...config, target_vgv: parseFloat(e.target.value) || 0 })}
                                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-gray-100 focus:bg-white focus:border-blue-500 rounded-2xl outline-none font-black text-2xl text-gray-900 transition-all shadow-inner"
                                        placeholder="0,00"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-blue-600" /> Coeficiente de Andar
                                </h3>
                                <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">Valorização por Pavimento (%)</label>
                                    <div className="flex items-center gap-6">
                                        <input
                                            type="range"
                                            min="0"
                                            max="0.05"
                                            step="0.001"
                                            value={config.floor_coefficient}
                                            onChange={(e) => setConfig({ ...config, floor_coefficient: parseFloat(e.target.value) })}
                                            className="flex-1 accent-blue-600"
                                        />
                                        <span className="text-xl font-black text-blue-600 w-16 text-right">{(config.floor_coefficient * 100).toFixed(1)}%</span>
                                    </div>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-4">Típico: 0.5% a 1% de valorização por andar alto.</p>
                                </div>
                            </div>
                        </div>

                        {/* Weights Section */}
                        <div className="space-y-6">
                            <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 space-y-4">
                                <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Pesos por Atendimento</h4>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Frente</label>
                                        <input type="number" step="0.01" value={config.position_weights.FRONT} onChange={(e) => setConfig({...config, position_weights: {...config.position_weights, FRONT: parseFloat(e.target.value)}})} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Lateral</label>
                                        <input type="number" step="0.01" value={config.position_weights.LATERAL} onChange={(e) => setConfig({...config, position_weights: {...config.position_weights, LATERAL: parseFloat(e.target.value)}})} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Fundos</label>
                                        <input type="number" step="0.01" value={config.position_weights.BACK} onChange={(e) => setConfig({...config, position_weights: {...config.position_weights, BACK: parseFloat(e.target.value)}})} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm" />
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 space-y-4">
                                <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Sol da Manhã/Tarde</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    {Object.entries(config.orientation_weights).map(([key, val]) => (
                                        <div key={key} className="space-y-1">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{key}</label>
                                            <input type="number" step="0.01" value={val} onChange={(e) => setConfig({...config, orientation_weights: {...config.orientation_weights, [key]: parseFloat(e.target.value)}})} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <p className="text-[10px] font-bold text-gray-500 max-w-[240px]">A aplicação deste modelo substituirá os preços atuais de todas as unidades deste edifício.</p>
                    </div>
                    
                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-8 py-4 bg-white border border-gray-200 rounded-2xl font-black text-xs uppercase tracking-widest text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                        <button 
                            onClick={() => onApply(config)}
                            className="flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/30 group"
                        >
                            Aplicar Inteligência
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PricingIntelligenceModal;
