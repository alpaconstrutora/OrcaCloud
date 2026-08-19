import React, { useState } from 'react';
import { TrendingUp, Ruler, LayoutGrid, ShieldCheck, ArrowRight, Info, BrainCircuit } from 'lucide-react';
import { RentalPricingConfig } from '../types';
import Button from './ui/Button';

interface RentalPricingIntelligencePanelProps {
    onApply: (config: RentalPricingConfig) => void;
    buildingName: string;
    loading?: boolean;
}

/** Conteúdo da Inteligência de Aluguéis — era `RentalPricingIntelligenceModal`
 *  (diálogo com overlay); virou aba de "Gestão de Unidades" a pedido do
 *  usuário, então perdeu backdrop/X/Cancelar (não há mais o que fechar, é
 *  só trocar de aba) e passou a se comportar como o conteúdo das outras
 *  abas (ex: `PriceTableManager` na aba "Tabela de aluguéis"). */
const RentalPricingIntelligencePanel: React.FC<RentalPricingIntelligencePanelProps> = ({ onApply, buildingName, loading }) => {
    const [config, setConfig] = useState<RentalPricingConfig>({
        mode: 'PER_SQM',
        base_per_sqm: 0,
        target_total_rent: 0,
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
        },
        include_exchanged: false
    });

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
            {/* Header */}
            <div className="p-6 md:p-8 bg-blue-600 text-white flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                    <BrainCircuit className="w-8 h-8" />
                </div>
                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">Inteligência Hedônica</h2>
                    <p className="text-blue-100 font-bold text-xs uppercase tracking-widest opacity-80">Empreendimento: {buildingName}</p>
                </div>
            </div>

            <div className="p-6 md:p-8 space-y-8">
                {/* Alerta de Conceito */}
                <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex items-start gap-4">
                    <Info className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                    <div className="text-sm">
                        <h4 className="font-black text-blue-900 uppercase tracking-widest mb-1 text-xs">Modelo Hedônico de Aluguel</h4>
                        <p className="text-blue-700/80 font-medium leading-relaxed">
                            Aplica pesos estatísticos por atributo (andar, posição, vista, sol) para precificar o aluguel de cada unidade de forma coerente.
                            <span className="font-bold text-blue-900 ml-1 italic">Evita unidades encalhadas por aluguel desalinhado ao atributo.</span>
                        </p>
                    </div>
                </div>

                {/* Seletor de Modo */}
                <div className="grid grid-cols-2 gap-4">
                    <button
                        type="button"
                        onClick={() => setConfig({ ...config, mode: 'PER_SQM' })}
                        className={`p-5 rounded-3xl border text-left transition-all flex items-start gap-3 ${config.mode === 'PER_SQM' ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-600/30' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-blue-200'}`}
                    >
                        <Ruler className="w-6 h-6 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest">R$/m² + atributos</p>
                            <p className={`text-[10px] font-bold mt-1 ${config.mode === 'PER_SQM' ? 'text-blue-100' : 'text-gray-400'}`}>Aluguel base por m² valorizado pelos atributos.</p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setConfig({ ...config, mode: 'TARGET_TOTAL' })}
                        className={`p-5 rounded-3xl border text-left transition-all flex items-start gap-3 ${config.mode === 'TARGET_TOTAL' ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-600/30' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-blue-200'}`}
                    >
                        <LayoutGrid className="w-6 h-6 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest">Aluguel-alvo total</p>
                            <p className={`text-[10px] font-bold mt-1 ${config.mode === 'TARGET_TOTAL' ? 'text-blue-100' : 'text-gray-400'}`}>Distribui o aluguel total do prédio por atributo.</p>
                        </div>
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Coluna de valor-alvo */}
                    <div className="space-y-6">
                        {config.mode === 'PER_SQM' ? (
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Aluguel base por m² (R$/mês)</label>
                                <div className="relative flex items-center">
                                    <span className="absolute left-5 font-black text-gray-400">R$</span>
                                    <input
                                        type="number"
                                        value={config.base_per_sqm || ''}
                                        onChange={(e) => setConfig({ ...config, base_per_sqm: parseFloat(e.target.value) || 0 })}
                                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-gray-100 focus:bg-white focus:border-blue-500 rounded-2xl outline-none font-black text-2xl text-gray-900 transition-all shadow-inner"
                                        placeholder="0,00"
                                    />
                                </div>
                                <p className="text-[9px] text-gray-400 font-bold uppercase px-1">Multiplicado pela área e pelos fatores de cada unidade.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Aluguel-alvo total mensal do prédio (R$)</label>
                                <div className="relative flex items-center">
                                    <span className="absolute left-5 font-black text-gray-400">R$</span>
                                    <input
                                        type="number"
                                        value={config.target_total_rent || ''}
                                        onChange={(e) => setConfig({ ...config, target_total_rent: parseFloat(e.target.value) || 0 })}
                                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-gray-100 focus:bg-white focus:border-blue-500 rounded-2xl outline-none font-black text-2xl text-gray-900 transition-all shadow-inner"
                                        placeholder="0,00"
                                    />
                                </div>
                                <p className="text-[9px] text-gray-400 font-bold uppercase px-1">Distribuído entre as unidades proporcionalmente ao score.</p>
                            </div>
                        )}

                        <label className="flex items-center justify-between gap-4 p-5 bg-gray-50 rounded-3xl border border-gray-100 cursor-pointer">
                            <span className="text-xs font-black text-gray-900 uppercase tracking-widest">
                                Incluir unidades permutadas
                            </span>
                            <input
                                type="checkbox"
                                checked={!!config.include_exchanged}
                                onChange={(e) => setConfig({ ...config, include_exchanged: e.target.checked })}
                                className="w-5 h-5 accent-blue-600 rounded"
                            />
                        </label>

                        <div className="space-y-4">
                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-blue-600" /> Coeficiente de Andar
                            </h3>
                            <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-4">Valorização por Pavimento (%)</label>
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

                    {/* Coluna de pesos */}
                    <div className="space-y-6">
                        <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 space-y-4">
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Pesos por Posição</h4>

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
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Sol da Manhã/Tarde</h4>
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

            {/* Footer Actions — sem "Cancelar": não há mais diálogo pra fechar,
                só trocar de aba. */}
            <div className="p-6 md:p-8 bg-gray-50 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-gray-500 max-w-[240px]">A aplicação substituirá os aluguéis atuais de todas as unidades deste edifício.</p>
                </div>

                <Button
                    variant="primary"
                    size="lg"
                    onClick={() => onApply(config)}
                    disabled={loading}
                    className="gap-3 px-8 rounded-2xl text-button tracking-[0.2em] shadow-xl shadow-blue-600/30 group shrink-0"
                >
                    Aplicar Inteligência
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
            </div>
        </div>
    );
};

export default RentalPricingIntelligencePanel;
