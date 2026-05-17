import React, { useState } from 'react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { DollarSign, Landmark, PieChart, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ImovibFundingFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const ImovibFundingForm: React.FC<ImovibFundingFormProps> = ({ study, onDataChanged }) => {
    // We keep local state for instant feedback on validation, but still auto-save on blur
    const [downpayment, setDownpayment] = useState(study.revenue_downpayment_percent ?? 10);
    const [construction, setConstruction] = useState(study.revenue_construction_percent ?? 20);
    const [handover, setHandover] = useState(study.revenue_handover_percent ?? 70);

    const [defaultRate, setDefaultRate] = useState(study.default_rate_percent ?? 3);
    const [cancellation, setCancellation] = useState(study.cancellation_rate_percent ?? 5);

    const [equity, setEquity] = useState(study.funding_equity_percent ?? 100);
    const [debt, setDebt] = useState(study.funding_debt_percent ?? 0);
    const [swapFin, setSwapFin] = useState(study.swap_financial_percent ?? 0);
    const [swapPhys, setSwapPhys] = useState(study.swap_physical_percent ?? 0);

    const revenueTotal = Number((downpayment + construction + handover).toFixed(2));
    const isRevenueValid = revenueTotal === 100;

    const handleUpdateField = async (field: keyof ImovibStudy, value: number) => {
        try {
            console.log(`[FundingForm] Saving ${field} = ${value}`);
            await imovibService.updateStudy(study.id, { [field]: value } as any);
            onDataChanged();
        } catch (e) {
            console.error('Failed to update field', field, e);
            alert(`Erro ao salvar campo: ${field}`);
        }
    };

    const InputRow = ({ label, value, setter, field, desc }: any) => (
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-300 transition-colors group">
            <div className="flex-1 pr-4">
                <span className="font-bold text-slate-800 block mb-0.5">{label}</span>
                {desc && <span className="text-xs font-medium text-slate-500 block">{desc}</span>}
            </div>
            <div className="relative w-32 shrink-0">
                <input
                    type="number"
                    value={value}
                    onChange={(e) => setter(parseFloat(e.target.value) || 0)}
                    onBlur={() => handleUpdateField(field, value)}
                    step="0.01"
                    className="w-full pr-8 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">%</span>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 pb-10 max-w-5xl mx-auto">

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* REVENUE PROFILE */}
                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col h-full">
                    <div className="mb-8">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                <DollarSign className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Perfil de Recebimento</h2>
                        </div>
                        <p className="text-slate-500 text-sm font-medium">As parcelas padrão de venda. A soma do Sinal, Obra e Repasse deve ser exatamente 100%.</p>
                    </div>

                    <div className="space-y-3 flex-1">
                        <InputRow label="Sinal / Ato" desc="Entrada paga direto à loteadora/incorporadora" value={downpayment} setter={setDownpayment} field="revenue_downpayment_percent" />
                        <InputRow label="Mensais / Obra" desc="Fluxo da carteira durante o ciclo" value={construction} setter={setConstruction} field="revenue_construction_percent" />
                        <InputRow label="Repasse Bancário / Chaves" desc="Financiamento do cliente final" value={handover} setter={setHandover} field="revenue_handover_percent" />
                    </div>

                    <div className={`mt-6 p-4 rounded-xl flex items-center justify-between border ${isRevenueValid ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                        }`}>
                        <div className="flex items-center gap-2">
                            {isRevenueValid ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                            <span className="font-bold">Total do Valor de Venda (VGV)</span>
                        </div>
                        <span className="font-black text-lg">{revenueTotal}%</span>
                    </div>

                    <div className="h-px bg-slate-100 my-8"></div>

                    <div className="mb-4">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-1">Inadimplência e Distrato</h3>
                        <p className="text-slate-500 text-xs font-medium">Provisionamento de perdas e contingência de receita.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-100">
                            <label className="block text-[10px] font-black tracking-widest uppercase text-rose-500 mb-2">Inadimplência (Default)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={defaultRate}
                                    onChange={(e) => setDefaultRate(parseFloat(e.target.value) || 0)}
                                    onBlur={() => handleUpdateField('default_rate_percent', defaultRate)}
                                    step="0.01"
                                    className="w-full pr-8 pl-4 py-2 bg-white border border-rose-200 rounded-lg font-black text-rose-700 focus:border-rose-400 outline-none text-right"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-400 font-bold">%</span>
                            </div>
                        </div>
                        <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                            <label className="block text-[10px] font-black tracking-widest uppercase text-amber-600 mb-2">Distratos Projetados</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={cancellation}
                                    onChange={(e) => setCancellation(parseFloat(e.target.value) || 0)}
                                    onBlur={() => handleUpdateField('cancellation_rate_percent', cancellation)}
                                    step="0.01"
                                    className="w-full pr-8 pl-4 py-2 bg-white border border-amber-200 rounded-lg font-black text-amber-700 focus:border-amber-400 outline-none text-right"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 font-bold">%</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* FUNDING STRUCTURE */}
                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col h-full">
                    <div className="mb-8">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                                <Landmark className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Estrutura de Capital (Funding)</h2>
                        </div>
                        <p className="text-slate-500 text-sm font-medium">De onde o dinheiro virá para bancar os custos de obra do empreendimento.</p>
                    </div>

                    <div className="space-y-3 flex-1">
                        <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 group">
                            <div className="flex-1 pr-4">
                                <span className="font-bold text-indigo-900 block mb-0.5">Capital Próprio (Equity)</span>
                                <span className="text-xs font-medium text-indigo-600/70 block">Exposição de caixa do desenvolvedor</span>
                            </div>
                            <div className="relative w-32 shrink-0">
                                <input
                                    type="number"
                                    value={equity}
                                    onChange={(e) => setEquity(parseFloat(e.target.value) || 0)}
                                    onBlur={() => handleUpdateField('funding_equity_percent', equity)}
                                    step="0.01"
                                    className="w-full pr-8 pl-4 py-2.5 bg-white border border-indigo-200 rounded-xl font-black text-indigo-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right transition-all"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-indigo-400">%</span>
                            </div>
                        </div>

                        <InputRow label="Financ. à Produção / Dívida" desc="Plano Empresário ou Bancos" value={debt} setter={setDebt} field="funding_debt_percent" />
                    </div>

                    <div className="h-px bg-slate-100 my-8"></div>

                    <div className="mb-4">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-2">
                            <PieChart className="w-4 h-4 text-slate-400" />
                            Permutas (Land Banking)
                        </h3>
                        <p className="text-slate-500 text-xs font-medium">Compromissos contratuais assumidos em troca do Terreno.</p>
                    </div>

                    <div className="space-y-3">
                        <InputRow label="Permuta Financeira" desc="% do VGV retido para o Terrenista" value={swapFin} setter={setSwapFin} field="swap_financial_percent" />
                        <InputRow label="Permuta Física" desc="% de Unidades (VGV Cedido na base)" value={swapPhys} setter={setSwapPhys} field="swap_physical_percent" />
                    </div>

                </div>

            </div>

        </div>
    );
};

export default ImovibFundingForm;
