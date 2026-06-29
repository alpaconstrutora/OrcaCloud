import React, { useState, useMemo } from 'react';
import { DollarSign, Percent, TrendingUp, Calendar, AlertCircle } from 'lucide-react';

interface InvestmentSimulatorProps {
    baseVgv: number;
    baseTir: number;
    baseRoi: number;
    baseCost: number;
    durationMonths: number;
    scenarioTirCons?: number;
    scenarioTirOpt?: number;
}

const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const fmtPct = (v: number) => `${v.toFixed(2)}%`;

export const InvestmentSimulator: React.FC<InvestmentSimulatorProps> = ({
    baseVgv,
    baseTir,
    baseRoi,
    baseCost,
    durationMonths,
    scenarioTirCons,
    scenarioTirOpt,
}) => {
    const [amount, setAmount] = useState<number>(100000); // Default R$ 100k
    const [modality, setModality] = useState<'spe' | 'mutuo'>('spe');
    const [simulatedDuration, setSimulatedDuration] = useState<number>(durationMonths || 36);

    // Evita divisão por zero
    const cost = baseCost || 58000000;
    const vgv = baseVgv || 92000000;
    const tir = baseTir || 18.4;
    const roi = baseRoi || 62.0;

    const calculations = useMemo(() => {
        // Participação proporcional ao custo total (ou valor de captação estimado)
        const participationPct = (amount / cost) * 100;
        
        // Retorno bruto baseado no ROI da viabilidade
        const totalReturn = amount * (1 + roi / 100);
        const netProfit = totalReturn - amount;
        
        // Simulação do fluxo de retorno simplificado ao longo do prazo
        const monthlyTir = Math.pow(1 + tir / 100, 1 / 12) - 1;
        const paybackMonths = Math.min(
            simulatedDuration,
            Math.ceil(Math.log(totalReturn / amount) / Math.log(1 + monthlyTir)) || 24
        );

        // Comparativos com investimentos do mercado
        const cdiRateAnnual = 10.5; // Ex: 10.5% a.a.
        const cdiMonthly = Math.pow(1 + cdiRateAnnual / 100, 1 / 12) - 1;
        const cdiReturn = amount * Math.pow(1 + cdiMonthly, simulatedDuration);
        const cdiNetProfit = cdiReturn - amount;

        // Cenários de estresse de TIR
        const tirCons = scenarioTirCons ?? (tir * 0.7);
        const tirOpt = scenarioTirOpt ?? (tir * 1.25);

        return {
            participationPct,
            totalReturn,
            netProfit,
            paybackMonths,
            cdiNetProfit,
            tirCons,
            tirOpt,
        };
    }, [amount, cost, roi, tir, simulatedDuration, scenarioTirCons, scenarioTirOpt]);

    return (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-black text-gray-900 tracking-tight">Simulador de Investimento Interativo</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Inputs do Simulador */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                            Valor do Aporte
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(Math.max(1000, Number(e.target.value)))}
                                className="w-full pl-12 pr-4 py-3 bg-gray-50/50 border border-gray-200 rounded-2xl text-lg font-black text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </div>
                        <input
                            type="range"
                            min="10000"
                            max={Math.max(1000000, cost * 0.1)}
                            step="10000"
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            className="w-full mt-3 h-1.5 bg-gray-150 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase mt-1">
                            <span>Min: R$ 10k</span>
                            <span>Aporte Sugerido</span>
                            <span>Max: {fmtBRL(Math.max(1000000, cost * 0.1))}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">
                                Modalidade
                            </label>
                            <select
                                value={modality}
                                onChange={(e) => setModality(e.target.value as 'spe' | 'mutuo')}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none"
                            >
                                <option value="spe">Cota de SPE</option>
                                <option value="mutuo">Mútuo Conversível</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">
                                Prazo Simulado
                            </label>
                            <select
                                value={simulatedDuration}
                                onChange={(e) => setSimulatedDuration(Number(e.target.value))}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none"
                            >
                                <option value={12}>12 meses</option>
                                <option value={24}>24 meses</option>
                                <option value={36}>36 meses</option>
                                <option value={48}>48 meses</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Outputs / Resultados Projetados */}
                <div className="bg-indigo-50/40 rounded-3xl p-5 border border-indigo-100/50 flex flex-col justify-between">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-700">Participação Estimada</span>
                            <span className="text-sm font-black text-indigo-900 font-mono">
                                {fmtPct(calculations.participationPct)}
                            </span>
                        </div>
                        
                        <div>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">
                                Retorno Bruto Estimado
                            </span>
                            <span className="text-3xl font-black text-indigo-900 font-mono tracking-tighter">
                                {fmtBRL(calculations.totalReturn)}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-100/60">
                            <div>
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                                    Lucro Líquido
                                </span>
                                <span className="text-base font-black text-emerald-600 font-mono">
                                    {fmtBRL(calculations.netProfit)}
                                </span>
                            </div>
                            <div>
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                                    Payback Esperado
                                </span>
                                <span className="text-base font-black text-indigo-800 font-mono">
                                    ~{calculations.paybackMonths} meses
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-indigo-100/60 text-xs text-indigo-600/80 font-medium leading-relaxed">
                        💡 Este aporte renderia aproximadamente <strong>{fmtBRL(calculations.netProfit - calculations.cdiNetProfit)}</strong> a mais que o CDI líquido estimado para o período.
                    </div>
                </div>
            </div>

            {/* Comparativo de Cenários */}
            <div className="pt-4 border-t border-gray-50">
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-3">
                    Comparativo de Retorno por Cenário (TIR Anual)
                </span>
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-red-50/50 border border-red-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-black text-red-600 uppercase tracking-wider block mb-1">
                            Conservador
                        </span>
                        <span className="text-base font-black text-red-700 font-mono">
                            {fmtPct(calculations.tirCons)}
                        </span>
                    </div>
                    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-3 text-center ring-2 ring-blue-500/20">
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider block mb-1">
                            Base (Realista)
                        </span>
                        <span className="text-base font-black text-blue-800 font-mono">
                            {fmtPct(tir)}
                        </span>
                    </div>
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider block mb-1">
                            Otimista
                        </span>
                        <span className="text-base font-black text-emerald-700 font-mono">
                            {fmtPct(calculations.tirOpt)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
