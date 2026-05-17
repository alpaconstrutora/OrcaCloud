
import React from 'react';
import {
    FileText,
    Download,
    Info,
    TrendingUp,
    Coins,
    Calculator,
    ArrowRight
} from 'lucide-react';
import { formatCurrency } from '../utils/financialMath';

const TaxReport: React.FC = () => {
    // Mock data for tax report
    const taxData = {
        year: 2025,
        totalInvested: 150000,
        totalEarnings: 18500.45,
        assets: [
            { name: 'Residencial Aurora', costBasis: 100000, dividends: 12400.50, capitalGain: 0 },
            { name: 'Edifício Horizon', costBasis: 50000, dividends: 6099.95, capitalGain: 0 },
        ]
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Demo data notice */}
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3">
                <Info className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 font-medium">
                    Dados demonstrativos — a integração com rendimentos reais está em desenvolvimento.
                </p>
            </div>

            {/* IR Advisory Banner */}
            <div className="bg-gradient-to-r from-gray-900 to-indigo-950 rounded-3xl p-8 text-white relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                    <Calculator size={120} />
                </div>
                <div className="relative z-10 max-w-2xl">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10">
                            Consultor IR {taxData.year}
                        </span>
                    </div>
                    <h2 className="text-3xl font-black mb-4 tracking-tight">Seu Informativo de Rendimentos está pronto.</h2>
                    <p className="text-gray-400 text-sm leading-relaxed mb-6">
                        Utilize os dados abaixo para preencher sua declaração de Imposto de Renda. Os rendimentos de fundos de investimento imobiliário são, em sua maioria, isentos para pessoas físicas.
                    </p>
                    <button
                        disabled
                        title="Disponível em breve"
                        className="flex items-center gap-2 bg-white text-gray-400 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest cursor-not-allowed opacity-60"
                    >
                        <Download className="w-4 h-4" /> Baixar PDF Completo
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Summary Side */}
                <div className="space-y-6">
                    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                        <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                            <Info className="w-4 h-4" /> Resumo Consolidado
                        </h4>

                        <div className="space-y-6">
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Custo de Aquisição Total</p>
                                <p className="text-xl font-black text-gray-900">{formatCurrency(taxData.totalInvested)}</p>
                            </div>
                            <div className="pt-6 border-t border-gray-50">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Rendimentos Isentos</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-xl font-black text-emerald-600">{formatCurrency(taxData.totalEarnings)}</p>
                                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                                </div>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                <p className="text-[10px] font-black text-blue-400 uppercase mb-2">Dica Fiscal</p>
                                <p className="text-xs text-blue-700 leading-relaxed">
                                    Informe os rendimentos na ficha "Rendimentos Isentos e Não Tributáveis", código 26.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Detailed List */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-gray-50">
                            <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Detalhamento por Ativo</h3>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {taxData.assets.map((asset, i) => (
                                <div key={i} className="p-8 hover:bg-gray-50/50 transition-colors group">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                                <FileText className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-gray-900">{asset.name}</h4>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase">Fundo de Investimento Imobiliário</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-8 md:gap-12">
                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Situação em 31/12</p>
                                                <p className="text-sm font-black text-gray-900">{formatCurrency(asset.costBasis)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Rend. Distribuídos</p>
                                                <p className="text-sm font-black text-emerald-600">{formatCurrency(asset.dividends)}</p>
                                            </div>
                                        </div>

                                        <button
                                            disabled
                                            title="Disponível em breve"
                                            className="flex items-center justify-center p-3 rounded-xl border border-gray-100 cursor-not-allowed opacity-40"
                                        >
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 bg-gray-50/50 border-t border-gray-50 text-center">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                Dados referentes ao ano-calendário de {taxData.year}.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaxReport;
