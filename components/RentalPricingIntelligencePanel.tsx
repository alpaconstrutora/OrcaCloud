import React, { useState } from 'react';
import { Ruler, LayoutGrid, ShieldCheck, ArrowRight, Info, BrainCircuit } from 'lucide-react';
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
                        <h4 className="font-black text-blue-900 uppercase tracking-widest mb-1 text-xs">Como o aluguel é calculado</h4>
                        <p className="text-blue-700/80 font-medium leading-relaxed">
                            O aluguel de cada unidade sai da <span className="font-bold text-blue-900">área</span> ajustada pelas
                            <span className="font-bold text-blue-900"> regras da aba Inteligência</span> que casarem com ela — e por mais nada.
                            <span className="font-bold text-blue-900 ml-1 italic">Para valorizar pavimento, posição, vista ou qualquer característica, crie uma regra naquela aba.</span>
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
                            <p className="text-xs font-black uppercase tracking-widest">R$/m² + regras</p>
                            <p className={`text-[10px] font-bold mt-1 ${config.mode === 'PER_SQM' ? 'text-blue-100' : 'text-gray-400'}`}>Aluguel base por m², ajustado pelas regras da aba Inteligência.</p>
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
                            <p className={`text-[10px] font-bold mt-1 ${config.mode === 'TARGET_TOTAL' ? 'text-blue-100' : 'text-gray-400'}`}>Distribui o aluguel total do prédio por área e regras.</p>
                        </div>
                    </button>
                </div>

                {/* Só o valor-alvo. Os pesos embutidos (posição, sol, coeficiente de
                    andar) e o toggle de permutadas saíram em 2026-09-11: o único
                    ajuste sobre a área são as regras da aba Inteligência. Uma coluna
                    só — a grade de duas existia para acomodar a coluna de pesos. */}
                <div className="max-w-xl">
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
                                <p className="text-[9px] text-gray-400 font-bold uppercase px-1">Multiplicado pela área de cada unidade e pelas regras que casarem com ela.</p>
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
                                <p className="text-[9px] text-gray-400 font-bold uppercase px-1">Distribuído entre as unidades por área e pelas regras que casarem com cada uma.</p>
                            </div>
                        )}
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
