
import React from 'react';
import { marketDataService } from '../services/marketDataService';
import { Building2, TrendingUp, TrendingDown, ArrowRight, Map } from 'lucide-react';

const CUBMarketPanel: React.FC = () => {
    const cubData = marketDataService.getStateCUBData();

    return (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
                        <Map className="w-5 h-5 text-blue-600" />
                        Painel CUB Interstadual
                    </h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Custo Unitário Básico por Região</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-gray-100 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-gray-600 uppercase">Valores Reais</span>
                </div>
            </div>

            <div className="p-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {cubData.map((item) => (
                    <div key={item.uf} className="p-4 rounded-2xl border border-gray-50 hover:border-blue-100 hover:bg-blue-50/30 transition-all group">
                        <div className="flex justify-between items-start mb-3">
                            <span className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center text-xs font-black">
                                {item.uf}
                            </span>
                            {item.trend === 'up' ? (
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                            ) : (
                                <TrendingDown className="w-4 h-4 text-red-500" />
                            )}
                        </div>

                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">CUB/m²</p>
                        <p className="text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors">
                            R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>

                        <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                            <span className={`text-[10px] font-black ${item.change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {item.change > 0 ? '+' : ''}{item.change}%
                            </span>
                            <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-blue-400 transition-colors" />
                        </div>
                    </div>
                ))}
            </div>

            <div className="px-8 py-4 bg-gray-50/50 border-t border-gray-50">
                <p className="text-[10px] text-gray-400 font-medium italic">
                    * Dados atualizados mensalmente com base nos informativos do Sinduscon de cada estado.
                </p>
            </div>
        </div>
    );
};

export default CUBMarketPanel;
