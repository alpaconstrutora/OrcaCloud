import React, { useEffect, useState } from 'react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { DollarSign, Landmark, PieChart, AlertTriangle, CheckCircle2 } from 'lucide-react';
import ImovibSalesMapTab from './ImovibSalesMapTab';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useToast } from '../hooks/useToast';
import { useImovibEdicao } from '../hooks/useImovibEdicao';

// Nome do campo como aparece na tela, para a mensagem de erro ao salvar.
const ROTULO_CAMPO: Partial<Record<keyof ImovibStudy, string>> = {
    revenue_downpayment_percent: 'Sinal / Ato',
    revenue_construction_percent: 'Mensais / Obra',
    revenue_handover_percent: 'Repasse Bancário / Chaves',
    default_rate_percent: 'Inadimplência (Default)',
    cancellation_rate_percent: 'Distratos Projetados',
    funding_equity_percent: 'Capital Próprio (Equity)',
    funding_debt_percent: 'Financ. à Produção / Dívida',
    swap_financial_percent: 'Permuta Financeira',
    swap_physical_percent: 'Permuta Física',
};

interface ImovibFundingFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

interface InputRowProps {
    label: string;
    desc?: string;
    value: number;
    /** A cada tecla com número válido — atualiza o estado do pai (soma 100%, etc.). */
    onChange: (valor: number) => void;
    /** Ao sair do campo — grava. */
    onCommit: (valor: number) => void;
}

/**
 * Linha "rótulo + campo %" de Receitas & Capital. Fica no nível do MÓDULO de
 * propósito (item 5.3 do plano 2026-10-12): declarada dentro do render, cada
 * tecla criava um componente novo, o React desmontava o <input> e o foco caía.
 *
 * O texto digitado fica num rascunho local: no meio de "12,5" o navegador
 * entrega "" para um <input type="number"> (entrada incompleta), e converter
 * isso em 0 na hora fazia o React trocar o "12," por "0".
 */
const InputRow: React.FC<InputRowProps> = ({ label, desc, value, onChange, onCommit }) => {
    const [texto, setTexto] = useState<string>(String(value));
    const [editando, setEditando] = useState(false);

    // Valor mudou por fora (recarga do estudo) e o usuário não está digitando.
    useEffect(() => {
        if (!editando) setTexto(String(value));
    }, [value, editando]);

    return (
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[10px] border border-slate-100 hover:border-slate-300 transition-colors group">
            <div className="flex-1 pr-4">
                <span className="text-sm font-semibold text-slate-800 block mb-0.5">{label}</span>
                {desc && <span className="text-xs text-slate-500 block">{desc}</span>}
            </div>
            <div className="relative w-32 shrink-0">
                <input
                    type="number"
                    value={texto}
                    onFocus={() => setEditando(true)}
                    onChange={(e) => {
                        setTexto(e.target.value);
                        const n = parseFloat(e.target.value);
                        if (!Number.isNaN(n)) onChange(n);
                    }}
                    onBlur={() => {
                        setEditando(false);
                        const n = parseFloat(texto) || 0;
                        setTexto(String(n));
                        onChange(n);
                        onCommit(n);
                    }}
                    step="0.01"
                    aria-label={label}
                    className="w-full h-9 pr-8 pl-4 bg-white border border-slate-200 rounded-[6px] text-sm font-medium text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">%</span>
            </div>
        </div>
    );
};

const ImovibFundingForm: React.FC<ImovibFundingFormProps> = ({ study, onDataChanged }) => {
    // We keep local state for instant feedback on validation, but still auto-save on blur
    // Padrões vêm de IMOVIB_DEFAULTS — os MESMOS que o motor usa quando o campo está vazio.
    const D = IMOVIB_DEFAULTS;
    const { showToast } = useToast();
    const { pode, motivo } = useImovibEdicao();
    const [downpayment, setDownpayment] = useState<number>(study.revenue_downpayment_percent ?? D.revenue_downpayment_percent);
    const [construction, setConstruction] = useState<number>(study.revenue_construction_percent ?? D.revenue_construction_percent);
    const [handover, setHandover] = useState<number>(study.revenue_handover_percent ?? D.revenue_handover_percent);

    const [defaultRate, setDefaultRate] = useState<number>(study.default_rate_percent ?? D.default_rate_percent);
    const [cancellation, setCancellation] = useState<number>(study.cancellation_rate_percent ?? D.cancellation_rate_percent);

    const [equity, setEquity] = useState<number>(study.funding_equity_percent ?? D.funding_equity_percent);
    const [debt, setDebt] = useState<number>(study.funding_debt_percent ?? D.funding_debt_percent);
    const [swapFin, setSwapFin] = useState<number>(study.swap_financial_percent ?? D.swap_financial_percent);
    const [swapPhys, setSwapPhys] = useState<number>(study.swap_physical_percent ?? D.swap_physical_percent);

    const revenueTotal = Number((downpayment + construction + handover).toFixed(2));
    const isRevenueValid = revenueTotal === 100;

    const handleUpdateField = async (field: keyof ImovibStudy, value: number) => {
        try {
            console.log(`[FundingForm] Saving ${field} = ${value}`);
            await imovibService.updateStudy(study.id, { [field]: value } as any);
            onDataChanged();
        } catch (e) {
            console.error('Failed to update field', field, e);
            showToast(`Erro ao salvar o campo "${ROTULO_CAMPO[field] ?? String(field)}": ${(e as Error).message}`, 'error');
        }
    };

    return (
        <div className="space-y-6 pb-10 max-w-5xl mx-auto">

            {/* ── ESPELHO DE VENDAS ── */}
            <ImovibSalesMapTab study={study} onDataChanged={onDataChanged} />

            {/* Tudo aqui grava no blur (perfil de recebimento, inadimplência, funding, permutas). */}
            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* REVENUE PROFILE */}
                <div className="bg-white rounded-[10px] p-6 border border-gray-200 flex flex-col h-full">
                    <div className="mb-8">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-[6px]">
                                <DollarSign className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-semibold text-gray-900">Perfil de Recebimento</h2>
                        </div>
                        <p className="text-slate-500 text-sm">As parcelas padrão de venda. A soma do Sinal, Obra e Repasse deve ser exatamente 100%.</p>
                    </div>

                    <div className="space-y-3 flex-1">
                        <InputRow label="Sinal / Ato" desc="Entrada paga direto à loteadora/incorporadora" value={downpayment} onChange={setDownpayment} onCommit={(v) => handleUpdateField('revenue_downpayment_percent', v)} />
                        <InputRow label="Mensais / Obra" desc="Fluxo da carteira durante o ciclo" value={construction} onChange={setConstruction} onCommit={(v) => handleUpdateField('revenue_construction_percent', v)} />
                        <InputRow label="Repasse Bancário / Chaves" desc="Financiamento do cliente final" value={handover} onChange={setHandover} onCommit={(v) => handleUpdateField('revenue_handover_percent', v)} />
                    </div>

                    <div className={`mt-6 p-4 rounded-[10px] flex items-center justify-between border ${isRevenueValid ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                        }`}>
                        <div className="flex items-center gap-2">
                            {isRevenueValid ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                            <span className="text-sm font-semibold">Total do Valor de Venda (VGV)</span>
                        </div>
                        <span className="font-semibold text-lg">{revenueTotal}%</span>
                    </div>

                    <div className="h-px bg-slate-100 my-6"></div>

                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-900 mb-1">Inadimplência e Distrato</h3>
                        <p className="text-slate-500 text-xs">Provisionamento de perdas e contingência de receita.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-rose-50/50 p-4 rounded-[10px] border border-rose-100">
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Inadimplência (Default)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={defaultRate}
                                    onChange={(e) => setDefaultRate(parseFloat(e.target.value) || 0)}
                                    onBlur={() => handleUpdateField('default_rate_percent', defaultRate)}
                                    step="0.01"
                                    className="w-full h-9 pr-8 pl-4 bg-white border border-rose-200 rounded-[6px] text-sm font-medium text-rose-700 focus:border-rose-400 outline-none text-right"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-rose-400">%</span>
                            </div>
                        </div>
                        <div className="bg-amber-50/50 p-4 rounded-[10px] border border-amber-100">
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Distratos Projetados</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={cancellation}
                                    onChange={(e) => setCancellation(parseFloat(e.target.value) || 0)}
                                    onBlur={() => handleUpdateField('cancellation_rate_percent', cancellation)}
                                    step="0.01"
                                    className="w-full h-9 pr-8 pl-4 bg-white border border-amber-200 rounded-[6px] text-sm font-medium text-amber-700 focus:border-amber-400 outline-none text-right"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-amber-500">%</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* FUNDING STRUCTURE */}
                <div className="bg-white rounded-[10px] p-6 border border-gray-200 flex flex-col h-full">
                    <div className="mb-8">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-[6px]">
                                <Landmark className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-semibold text-gray-900">Estrutura de Capital (Funding)</h2>
                        </div>
                        <p className="text-slate-500 text-sm">De onde o dinheiro virá para bancar os custos de obra do empreendimento.</p>
                    </div>

                    <div className="space-y-3 flex-1">
                        <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-[10px] border border-indigo-100 group">
                            <div className="flex-1 pr-4">
                                <span className="text-sm font-semibold text-indigo-900 block mb-0.5">Capital Próprio (Equity)</span>
                                <span className="text-xs text-indigo-600/70 block">Exposição de caixa do desenvolvedor</span>
                            </div>
                            <div className="relative w-32 shrink-0">
                                <input
                                    type="number"
                                    value={equity}
                                    onChange={(e) => setEquity(parseFloat(e.target.value) || 0)}
                                    onBlur={() => handleUpdateField('funding_equity_percent', equity)}
                                    step="0.01"
                                    className="w-full h-9 pr-8 pl-4 bg-white border border-indigo-200 rounded-[6px] text-sm font-medium text-indigo-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right transition-all"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-indigo-400">%</span>
                            </div>
                        </div>

                        <InputRow label="Financ. à Produção / Dívida" desc="Plano Empresário ou Bancos" value={debt} onChange={setDebt} onCommit={(v) => handleUpdateField('funding_debt_percent', v)} />
                    </div>

                    <div className="h-px bg-slate-100 my-6"></div>

                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                            <PieChart className="w-4 h-4 text-slate-400" />
                            Permutas (Land Banking)
                        </h3>
                        <p className="text-slate-500 text-xs">Compromissos contratuais assumidos em troca do Terreno.</p>
                    </div>

                    <div className="space-y-3">
                        <InputRow label="Permuta Financeira" desc="% do VGV retido para o Terrenista" value={swapFin} onChange={setSwapFin} onCommit={(v) => handleUpdateField('swap_financial_percent', v)} />
                        <InputRow label="Permuta Física" desc="% de Unidades (VGV Cedido na base)" value={swapPhys} onChange={setSwapPhys} onCommit={(v) => handleUpdateField('swap_physical_percent', v)} />
                    </div>

                </div>

            </fieldset>

        </div>
    );
};

export default ImovibFundingForm;
