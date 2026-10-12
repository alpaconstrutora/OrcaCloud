import React, { useState } from 'react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { Calendar, Percent, Save, TrendingUp } from 'lucide-react';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useImovibMath } from '../hooks/useImovibMath';
import { useToast } from '../hooks/useToast';
import { useImovibEdicao } from '../hooks/useImovibEdicao';

interface ImovibDynamicFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const ImovibDynamicForm: React.FC<ImovibDynamicFormProps> = ({ study, onDataChanged }) => {
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();
    const { pode, motivo } = useImovibEdicao();

    // Padrões vêm de IMOVIB_DEFAULTS — os MESMOS que o motor usa quando o campo está vazio.
    const D = IMOVIB_DEFAULTS;
    // No modo Completo com rubricas, imposto e corretagem vêm do CAPEX
    // (categorias 5 e 7) — estes campos não entram no cálculo.
    const { capexRubricasAtivas } = useImovibMath(study);
    const motivoDeducoesForaDoCalculo = 'No modo Completo do Orçamento (CAPEX), imposto e corretagem vêm das rubricas das categorias 5 e 7. Este campo não entra no cálculo.';
    const initial = (v: number | null | undefined, padrao: number) => String(v ?? padrao);

    const [constructionDurationMonths, setConstructionDurationMonths] = useState(initial(study.construction_duration_months, D.construction_duration_months));
    const [salesDurationMonths, setSalesDurationMonths] = useState(initial(study.sales_duration_months, D.sales_duration_months));
    const [constructionStartMonth, setConstructionStartMonth] = useState(initial(study.construction_start_month, D.construction_start_month));
    const [salesStartMonth, setSalesStartMonth] = useState(initial(study.sales_start_month, D.sales_start_month));

    const [inflationRate, setInflationRate] = useState(initial(study.inflation_rate, D.inflation_rate));
    const [discountRate, setDiscountRate] = useState(initial(study.discount_rate, D.discount_rate));

    // Advanced Finance
    const [taxRate, setTaxRate] = useState(initial(study.tax_rate, D.tax_rate));
    const [brokerageFee, setBrokerageFee] = useState(initial(study.brokerage_fee, D.brokerage_fee));
    // "% Financiado" saiu daqui (item 5.2): duplicava "Financ. à Produção" de
    // Receitas & Capital. Mesma regra do motor (useImovibMath, `actualFinPct`):
    // funding_debt_percent preenchido (inclusive 0) vale; vazio → financing_percent
    // legado. A tela mostra esse mesmo valor efetivo, só leitura.
    const usaLegado = study.funding_debt_percent == null;
    const financiadoEfetivo = usaLegado ? (study.financing_percent ?? D.financing_percent) : study.funding_debt_percent!;
    const financiadoOrigem = usaLegado && (study.financing_percent ?? 0) > 0
        ? 'valor legado deste estudo — passe a defini-lo em Receitas & Capital'
        : 'definido em Receitas & Capital';
    const [financingRateAnnual, setFinancingRateAnnual] = useState(initial(study.financing_rate_annual, D.financing_rate_annual));

    const handleSave = async () => {
        try {
            setSaving(true);
            await imovibService.updateStudy(study.id, {
                // Mês/duração vazio cai no padrão; valor impossível é gravado como
                // veio e o motor avisa (cronograma_invalido) em vez de esconder.
                construction_duration_months: parseInt(constructionDurationMonths) || D.construction_duration_months,
                sales_duration_months: parseInt(salesDurationMonths) || D.sales_duration_months,
                construction_start_month: parseInt(constructionStartMonth) || D.construction_start_month,
                sales_start_month: parseInt(salesStartMonth) || D.sales_start_month,
                inflation_rate: parseFloat(inflationRate) || 0,
                discount_rate: parseFloat(discountRate) || 0,
                tax_rate: parseFloat(taxRate) || 0,
                brokerage_fee: parseFloat(brokerageFee) || 0,
                financing_rate_annual: parseFloat(financingRateAnnual) || 0,
            });
            onDataChanged();
        } catch (e) {
            console.error(e);
            showToast(`Erro ao salvar as premissas dinâmicas: ${(e as Error).message}`, 'error');
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
                    <span className="flex items-center gap-2 text-xs font-medium text-blue-600">
                        <Save className="w-3 h-3 animate-pulse" />
                        Salvando...
                    </span>
                )}
            </div>

            {/* Todos os campos gravam no blur (handleSave). */}
            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Time Parameters */}
                <div className="space-y-4">
                    <h4 className="flex items-center gap-2 text-sm font-black text-gray-500 uppercase tracking-widest">
                        <Calendar className="w-4 h-4" /> Cronograma (Meses)
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-form-label font-semibold text-gray-600 mb-1">Duração Obras (Meses)</label>
                            <input
                                type="number"
                                value={constructionDurationMonths}
                                onChange={(e) => setConstructionDurationMonths(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm font-medium transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-form-label font-semibold text-gray-600 mb-1">Mês Início Obras</label>
                            <input
                                type="number"
                                value={constructionStartMonth}
                                onChange={(e) => setConstructionStartMonth(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm font-medium transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-form-label font-semibold text-gray-600 mb-1">Duração Vendas (Meses)</label>
                            <input
                                type="number"
                                value={salesDurationMonths}
                                onChange={(e) => setSalesDurationMonths(e.target.value)}
                                onBlur={handleSave}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm font-medium transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-form-label font-semibold text-gray-600 mb-1">Mês Início Vendas</label>
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
                            <label className="block text-form-label font-semibold text-gray-600 mb-1">Inflação (Mês)</label>
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
                            <label className="block text-form-label font-semibold text-gray-600 mb-1">TMA / Desconto (Ano)</label>
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
                            <label className="block text-form-label font-semibold text-gray-600 mb-1">Impostos (Ex: RET)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={taxRate}
                                onChange={(e) => setTaxRate(e.target.value)}
                                onBlur={handleSave}
                                disabled={capexRubricasAtivas}
                                title={capexRubricasAtivas ? motivoDeducoesForaDoCalculo : undefined}
                                className="disabled:opacity-50 disabled:cursor-not-allowed w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-sm font-medium transition-colors text-red-700"
                            />
                        </div>
                        <div>
                            <label className="block text-form-label font-semibold text-gray-600 mb-1">Comissão / Marketing</label>
                            <input
                                type="number"
                                step="0.01"
                                value={brokerageFee}
                                onChange={(e) => setBrokerageFee(e.target.value)}
                                onBlur={handleSave}
                                disabled={capexRubricasAtivas}
                                title={capexRubricasAtivas ? motivoDeducoesForaDoCalculo : undefined}
                                className="disabled:opacity-50 disabled:cursor-not-allowed w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-sm font-medium transition-colors text-red-700"
                            />
                        </div>
                        <div className={`col-span-2 text-xs font-medium px-1 mt-1 ${capexRubricasAtivas ? 'text-amber-700' : 'text-gray-500'}`}>
                            {capexRubricasAtivas
                                ? motivoDeducoesForaDoCalculo
                                : 'Calculadas como % direto sobre o VGV da receita bruta mensal de vendas.'}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="flex items-center gap-2 text-sm font-black text-gray-500 uppercase tracking-widest">
                        Financiamento Obra (Plano Empresarial)
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <span className="block text-form-label font-semibold text-gray-600 mb-1">% Financiado</span>
                            <div
                                title={`Valor usado no cálculo — ${financiadoOrigem}.`}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium text-gray-700"
                            >
                                {financiadoEfetivo.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                            </div>
                            <span className="block text-xs text-gray-500 mt-1">{financiadoOrigem}</span>
                        </div>
                        <div>
                            <label className="block text-form-label font-semibold text-gray-600 mb-1">Juros (a.a %)</label>
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
            </fieldset>
        </div>
    );
};

export default ImovibDynamicForm;
