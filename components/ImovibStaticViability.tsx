import React, { useMemo } from 'react';
import { ImovibStudy } from '../types';
import { Calculator, TrendingUp, DollarSign, PieChart, Activity } from 'lucide-react';

interface ImovibStaticViabilityProps {
    study: ImovibStudy;
}

const ImovibStaticViability: React.FC<ImovibStaticViabilityProps> = ({ study }) => {
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
    };

    const formatArea = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value) + ' m²';
    };

    const calculations = useMemo(() => {
        let totalPrivateArea = 0;
        let totalCommonArea = 0;
        let vgv = 0;
        let constructionCost = 0;
        const landCost = study.land_cost || 0;

        study.blocks?.forEach(block => {
            let blockPrivateArea = 0;
            let blockCommonArea = 0;

            block.units?.forEach(unit => {
                const qty = unit.quantity || 0;
                blockPrivateArea += qty * (unit.private_area || 0);
                blockCommonArea += qty * (unit.common_area || 0);
            });

            totalPrivateArea += blockPrivateArea;
            totalCommonArea += blockCommonArea;

            // Pricing & Costing logic per block
            vgv += (blockPrivateArea * (block.sales_price_sqm || 0));
            // Base construction cost generally applies to total built area (private + common)
            const blockTotalArea = blockPrivateArea + blockCommonArea;
            constructionCost += (blockTotalArea * (block.construction_cost_sqm || 0));
        });

        const totalCost = landCost + constructionCost;
        const grossProfit = vgv - totalCost;
        const margin = vgv > 0 ? (grossProfit / vgv) * 100 : 0;
        const totalArea = totalPrivateArea + totalCommonArea;

        return {
            totalPrivateArea,
            totalCommonArea,
            totalArea,
            vgv,
            landCost,
            constructionCost,
            totalCost,
            grossProfit,
            margin
        };
    }, [study]);

    return (
        <div className="space-y-6 pb-10">

            {/* Top Main KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg shadow-blue-900/20">
                    <div className="flex items-center gap-2 text-blue-100 mb-2 font-medium tracking-tight">
                        <TrendingUp className="w-5 h-5" />
                        VGV Potencial (Receita)
                    </div>
                    <div className="text-3xl font-black tracking-tight">{formatCurrency(calculations.vgv)}</div>
                    <div className="text-sm mt-3 text-blue-100 font-medium">100% das vendas projetadas</div>
                </div>

                <div className="bg-gradient-to-br from-rose-500 to-red-600 rounded-2xl p-6 text-white shadow-lg shadow-red-900/20">
                    <div className="flex items-center gap-2 text-red-100 mb-2 font-medium tracking-tight">
                        <DollarSign className="w-5 h-5" />
                        Custo Total Estimado
                    </div>
                    <div className="text-3xl font-black tracking-tight">{formatCurrency(calculations.totalCost)}</div>
                    <div className="text-sm mt-3 text-red-100 font-medium">Terreno + Construção</div>
                </div>

                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-900/20 relative overflow-hidden">
                    <div className="absolute right-[-2rem] top-[50%] translate-y-[-50%] opacity-10">
                        <PieChart className="w-40 h-40" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 text-emerald-100 mb-2 font-medium tracking-tight">
                            <Activity className="w-5 h-5" />
                            Lucro Bruto (Margem)
                        </div>
                        <div className="text-3xl font-black tracking-tight">{formatCurrency(calculations.grossProfit)}</div>
                        <div className="text-sm mt-3 text-emerald-100 font-semibold bg-emerald-800/30 inline-flex px-3 py-1 rounded-full border border-emerald-400/20">
                            {calculations.margin.toFixed(2)}% Margem Bruta
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed DRE Table */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                        <Calculator className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Viabilidade Estática (Simplificada)</h3>
                </div>
                <div className="p-0">
                    <table className="w-full text-left">
                        <tbody className="divide-y divide-gray-100">
                            {/* VGV */}
                            <tr className="hover:bg-gray-50/50 transition-colors group">
                                <td className="px-6 py-4">
                                    <span className="font-black text-gray-900 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        Valor Geral de Vendas (VGV)
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right font-black text-gray-900">
                                    {formatCurrency(calculations.vgv)}
                                </td>
                                <td className="px-6 py-4 text-right text-gray-500 font-medium w-32">100,00%</td>
                            </tr>
                            {/* Cost of Land */}
                            <tr className="hover:bg-gray-50/50 transition-colors group">
                                <td className="px-6 py-4 pl-12 text-gray-600 font-medium flex items-center gap-2">
                                    (-) Aquisição do Terreno
                                </td>
                                <td className="px-6 py-4 text-right text-gray-600 font-medium text-red-600">
                                    {formatCurrency(-calculations.landCost)}
                                </td>
                                <td className="px-6 py-4 text-right text-gray-500 font-medium">
                                    {calculations.vgv > 0 ? ((-calculations.landCost / calculations.vgv) * 100).toFixed(2) : '0.00'}%
                                </td>
                            </tr>
                            {/* Construction Cost */}
                            <tr className="hover:bg-gray-50/50 transition-colors group">
                                <td className="px-6 py-4 pl-12 text-gray-600 font-medium flex items-center gap-2">
                                    (-) Custo de Construção
                                </td>
                                <td className="px-6 py-4 text-right text-gray-600 font-medium text-red-600">
                                    {formatCurrency(-calculations.constructionCost)}
                                </td>
                                <td className="px-6 py-4 text-right text-gray-500 font-medium">
                                    {calculations.vgv > 0 ? ((-calculations.constructionCost / calculations.vgv) * 100).toFixed(2) : '0.00'}%
                                </td>
                            </tr>
                            {/* Total Cost Baseline */}
                            <tr className="bg-gray-50">
                                <td className="px-6 py-4">
                                    <span className="font-bold text-gray-700 uppercase tracking-widest text-xs">Total de Custos Fixos</span>
                                </td>
                                <td className="px-6 py-4 text-right font-black text-gray-900 border-t border-gray-200">
                                    {formatCurrency(-calculations.totalCost)}
                                </td>
                                <td className="px-6 py-4 text-right text-gray-500 font-medium">
                                    {calculations.vgv > 0 ? ((-calculations.totalCost / calculations.vgv) * 100).toFixed(2) : '0.00'}%
                                </td>
                            </tr>
                            {/* Gross Profit */}
                            <tr className="bg-emerald-50/30">
                                <td className="px-6 py-5">
                                    <span className="font-black text-emerald-900 text-lg">Lucro Bruto</span>
                                </td>
                                <td className="px-6 py-5 text-right font-black text-emerald-700 text-lg">
                                    {formatCurrency(calculations.grossProfit)}
                                </td>
                                <td className="px-6 py-5 text-right text-emerald-600 font-black">
                                    {calculations.margin.toFixed(2)}%
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Areas Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <span className="text-gray-400 text-xs font-black uppercase tracking-wider">Área Privativa Venda</span>
                    <div className="text-xl font-black text-gray-900 mt-1">{formatArea(calculations.totalPrivateArea)}</div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <span className="text-gray-400 text-xs font-black uppercase tracking-wider">Área Comum Coberta</span>
                    <div className="text-xl font-black text-gray-900 mt-1">{formatArea(calculations.totalCommonArea)}</div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-green-100 shadow-sm bg-green-50/30">
                    <span className="text-green-700 text-xs font-black uppercase tracking-wider">Área Total Construída</span>
                    <div className="text-2xl font-black text-green-900 mt-1">{formatArea(calculations.totalArea)}</div>
                </div>
            </div>
        </div>
    );
};

export default ImovibStaticViability;
