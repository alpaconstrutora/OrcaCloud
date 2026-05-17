import React, { useState } from 'react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { Calendar, Percent, Save, TrendingUp } from 'lucide-react';

interface ImovibDynamicFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const ImovibDynamicForm: React.FC<ImovibDynamicFormProps> = ({ study, onDataChanged }) => {
    const [saving, setSaving] = useState(false);

    const [constructionDurationMonths, setConstructionDurationMonths] = useState(study.construction_duration_months?.toString() || '24');
    const [salesDurationMonths, setSalesDurationMonths] = useState(study.sales_duration_months?.toString() || '36');
    const [constructionStartMonth, setConstructionStartMonth] = useState(study.construction_start_month?.toString() || '6');
    const [salesStartMonth, setSalesStartMonth] = useState(study.sales_start_month?.toString() || '1');

    const [inflationRate, setInflationRate] = useState(study.inflation_rate?.toString() || '0.4');
    const [discountRate, setDiscountRate] = useState(study.discount_rate?.toString() || '12');

    // Advanced Finance
    const [taxRate, setTaxRate] = useState(study.tax_rate?.toString() || '4.0');
    const [brokerageFee, setBrokerageFee] = useState(study.brokerage_fee?.toString() || '6.0');
    const [financingPercent, setFinancingPercent] = useState(study.financing_percent?.toString() || '0');
    const [financingRateAnnual, setFinancingRateAnnual] = useState(study.financing_rate_annual?.toString() || '10.0');

    const handleSave = async () => {
        try {
            setSaving(true);
            await imovibService.updateStudy(study.id, {
                // Ensure legacy field is cleared or synced if needed, we'll just not send it or send max
                construction_duration_months: parseInt(constructionDurationMonths) || 24,
                sales_duration_months: parseInt(salesDurationMonths) || 36,
                construction_start_month: parseInt(constructionStartMonth) || 6,
                sales_start_month: parseInt(salesStartMonth) || 1,
                inflation_rate: parseFloat(inflationRate) || 0,
                discount_rate: parseFloat(discountRate) || 0,
                tax_rate: parseFloat(taxRate) || 0,
                brokerage_fee: parseFloat(brokerageFee) || 0,
                financing_percent: parseFloat(financingPercent) || 0,
                financing_rate_annual: parseFloat(financingRateAnnual) || 0,
            });
            onDataChanged();
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    Premissas Dinâmicas (Macroeconomia e Tempo)
                </h3>
                {saving && (
                    <span className="flex items-center gap-2 text-xs font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full">
                        <Save className="w-3 h-3 animate-pulse" />
                        Salvando...
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Time Parameters */}
                <div className="space-y-4">
                    <h4 className="flex items-center gap-2 text-sm font-black text-gray-500 uppercase tracking-widest">
                        <Calendar className="w-4 h-4" /> Cronograma (Meses)
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Duração Obras (Meses)</label>
                            <input
                                type="number"
                                value={constructionDurationMonths}
                                onChange={(e) => setConstructionDurationMonths(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm font-medium transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Mês Início Obras</label>
                            <input
                                type="number"
                                value={constructionStartMonth}
                                onChange={(e) => setConstructionStartMonth(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm font-medium transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Duração Vendas (Meses)</label>
                            <input
                                type="number"
                                value={salesDurationMonths}
                                onChange={(e) => setSalesDurationMonths(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm font-medium transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Mês Início Vendas</label>
                            <input
                                type="number"
                                value={salesStartMonth}
                                onChange={(e) => setSalesStartMonth(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm font-medium transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* Macro Parameters */}
                <div className="space-y-4">
                    <h4 className="flex items-center gap-2 text-sm font-black text-gray-500 uppercase tracking-widest">
                        <Percent className="w-4 h-4" /> Variáveis Macro (%)
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Inflação (Mês)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={inflationRate}
                                onChange={(e) => setInflationRate(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm font-medium transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">TMA / Desconto (Ano)</label>
                            <input
                                type="number"
                                step="0.1"
                                value={discountRate}
                                onChange={(e) => setDiscountRate(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm font-medium transition-colors"
                            />
                        </div>
                        <div className="col-span-2 text-xs text-gray-500 font-medium px-1 mt-1">
                            A velocidade de vendas agota é calculada automaticamente diluindo o VGV linearmente pela Duração das Vendas.
                        </div>
                    </div>
                </div>
            </div>

            {/* Advanced Finance */}
            <div className="mt-8 pt-8 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <h4 className="flex items-center gap-2 text-sm font-black text-gray-500 uppercase tracking-widest">
                        Deduções Diretas (%)
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Impostos (Ex: RET)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={taxRate}
                                onChange={(e) => setTaxRate(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-sm font-medium transition-colors text-red-700"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Comissão / Marketing</label>
                            <input
                                type="number"
                                step="0.01"
                                value={brokerageFee}
                                onChange={(e) => setBrokerageFee(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-sm font-medium transition-colors text-red-700"
                            />
                        </div>
                        <div className="col-span-2 text-xs text-gray-500 font-medium px-1 mt-1">
                            Calculadas como % direto sobre o VGV da receita bruta mensal de vendas.
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="flex items-center gap-2 text-sm font-black text-gray-500 uppercase tracking-widest">
                        Financiamento Obra (Plano Empresarial)
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">% Financiado</label>
                            <input
                                type="number"
                                step="0.1"
                                value={financingPercent}
                                onChange={(e) => setFinancingPercent(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none text-sm font-medium transition-colors text-blue-800"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Juros (a.a %)</label>
                            <input
                                type="number"
                                step="0.1"
                                value={financingRateAnnual}
                                onChange={(e) => setFinancingRateAnnual(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-sm font-medium transition-colors"
                            />
                        </div>
                        <div className="col-span-2 text-xs text-gray-500 font-medium px-1 mt-1">
                            O banco assume essa % do custo de obra mensal. Receitas futuras pagam a dívida e juros.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImovibDynamicForm;
