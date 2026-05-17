
import React, { useState, useEffect, useMemo } from 'react';
import {
    Calculator,
    TrendingUp,
    Calendar,
    DollarSign,
    Percent,
    Building2,
    RefreshCw,
    Info,
    Briefcase,
    Home
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line,
    ComposedChart,
    Area
} from 'recharts';
import { calculatePMT, calculateROI, calculateIRR, formatCurrency, formatPercent } from '../utils/financialMath';

const InvestmentSimulator: React.FC = () => {
    // --- Mode: Rent (Renda) or Construction (Obra/Cotas) ---
    const [mode, setMode] = useState<'rent' | 'construction'>('construction');

    // --- State: Common ---
    const [simulationYears, setSimulationYears] = useState(5); // Default shorter for construction

    // --- State: Rent Mode Inputs ---
    const [propertyValue, setPropertyValue] = useState(500000);
    const [downPayment, setDownPayment] = useState(100000);
    const [interestRate, setInterestRate] = useState(9.5);
    const [loanTerm, setLoanTerm] = useState(30);
    const [monthlyRent, setMonthlyRent] = useState(2500);
    const [vacancyRate, setVacancyRate] = useState(5);
    const [appreciationRate, setAppreciationRate] = useState(6);
    const [condoFees, setCondoFees] = useState(500);

    // --- State: Construction Mode Inputs ---
    const [quotaValue, setQuotaValue] = useState(100000);
    const [numQuotas, setNumQuotas] = useState(5);
    const [constructionTerm, setConstructionTerm] = useState(36); // Months
    const [projectedProfit, setProjectedProfit] = useState(40); // % Total over the period

    // --- Calculations ---
    const results = useMemo(() => {
        if (mode === 'rent') {
            const months = simulationYears * 12;
            const monthlyRate = interestRate / 100 / 12;
            const loanAmount = propertyValue - downPayment;
            const monthlyMortgage = calculatePMT(monthlyRate, loanTerm * 12, loanAmount);

            const dataPoints: any[] = [];
            const cashFlows = [-downPayment];

            let currentEquity = downPayment;
            let currentPropertyValue = propertyValue;
            let currentLoanBalance = loanAmount;
            let totalRentReceived = 0;
            let totalExpenses = 0;

            for (let m = 1; m <= months; m++) {
                const year = Math.ceil(m / 12);
                const monthlyAppreciation = Math.pow(1 + appreciationRate / 100, 1 / 12) - 1;
                currentPropertyValue *= (1 + monthlyAppreciation);

                const currentRent = monthlyRent * Math.pow(1 + appreciationRate / 100, (m - 1) / 12);
                const effectiveRent = currentRent * (1 - vacancyRate / 100);
                const currentCondo = condoFees * Math.pow(1 + appreciationRate / 100, (m - 1) / 12);

                let payment = 0;
                let interestPayment = 0;
                let principalPayment = 0;

                if (m <= loanTerm * 12) {
                    payment = monthlyMortgage;
                    interestPayment = currentLoanBalance * monthlyRate;
                    principalPayment = payment - interestPayment;
                    currentLoanBalance -= principalPayment;
                    if (currentLoanBalance < 0) currentLoanBalance = 0;
                }

                const netMonthly = effectiveRent - payment - currentCondo;
                cashFlows.push(netMonthly);

                totalRentReceived += effectiveRent;
                totalExpenses += (payment + currentCondo);
                currentEquity = currentPropertyValue - currentLoanBalance;

                if (m % 12 === 0) {
                    dataPoints.push({
                        year,
                        axis: `Ano ${year}`,
                        propertyValue: Math.round(currentPropertyValue),
                        loanBalance: Math.round(currentLoanBalance),
                        equity: Math.round(currentEquity),
                        cashFlow: Math.round(netMonthly)
                    });
                }
            }

            const exitCashFlows = [...cashFlows];
            exitCashFlows[exitCashFlows.length - 1] += (currentPropertyValue - currentLoanBalance);
            const irrMonthly = calculateIRR(exitCashFlows);
            const irrAnnual = Math.pow(1 + (irrMonthly || 0), 12) - 1;
            const capRate = (monthlyRent * 12) / propertyValue;

            return {
                monthlyMortgage,
                dataPoints,
                metrics: {
                    totalAppreciation: currentPropertyValue - propertyValue,
                    finalValue: currentEquity,
                    irr: irrAnnual * 100,
                    roi: calculateROI(currentEquity + totalRentReceived - totalExpenses, downPayment), // Simple ROI
                    capRate: capRate * 100,
                    totalProfit: currentEquity + totalRentReceived - totalExpenses - downPayment
                }
            };
        } else {
            // CONSTRUCTION MODE
            const totalInvestment = quotaValue * numQuotas;
            const months = constructionTerm;
            const finalValue = totalInvestment * (1 + projectedProfit / 100);
            const netProfit = finalValue - totalInvestment;

            const dataPoints: any[] = [];
            const cashFlows = [-totalInvestment];

            // Generate monthly datapoints for the chart
            // Assumes linear value accretion or step at end? 
            // Better to show linear "Book Value" growth during construction

            for (let m = 1; m <= months; m++) {
                // Cash flow is 0 during construction (unless there are intermediate payments, but simple model assumes 0)
                cashFlows.push(0);

                // Book Value / Equity Projection
                // Start at Investment, End at FinalValue
                const progress = m / months;
                const valueAccretion = totalInvestment + (netProfit * progress); // Linear growth approximation

                if (m % 3 === 0 || m === months) { // Every quarter or end
                    dataPoints.push({
                        month: m,
                        axis: `Mês ${m}`,
                        equity: Math.round(valueAccretion),
                        investment: totalInvestment
                    });
                }
            }

            // Final Cashflow includes the Principle + Profit
            cashFlows[cashFlows.length - 1] += finalValue;

            const irrMonthly = calculateIRR(cashFlows);
            const irrAnnual = Math.pow(1 + (irrMonthly || 0), 12) - 1;

            return {
                monthlyMortgage: 0,
                dataPoints,
                metrics: {
                    totalAppreciation: netProfit,
                    finalValue: finalValue,
                    irr: irrAnnual * 100,
                    roi: projectedProfit,
                    capRate: 0,
                    totalProfit: netProfit
                }
            };
        }

    }, [mode, propertyValue, downPayment, interestRate, loanTerm, monthlyRent, vacancyRate, appreciationRate, condoFees, simulationYears, quotaValue, numQuotas, constructionTerm, projectedProfit]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header & Mode Switcher */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                        <Calculator className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900">Simulador de Investimento</h2>
                        <p className="text-gray-500">Compare diferentes estratégias de alocação de capital.</p>
                    </div>
                </div>

                <div className="bg-gray-100 p-1 rounded-xl flex items-center">
                    <button
                        onClick={() => { setMode('rent'); setSimulationYears(20); }}
                        className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-all ${mode === 'rent' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Home className="w-4 h-4" />
                        Renda (Aluguel)
                    </button>
                    <button
                        onClick={() => { setMode('construction'); setSimulationYears(3); }}
                        className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-all ${mode === 'construction' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Briefcase className="w-4 h-4" />
                        Obra (Cotas)
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Inputs Panel */}
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6 max-h-fit">
                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">
                        {mode === 'rent' ? 'Parâmetros do Imóvel' : 'Parâmetros da Cota'}
                    </h3>

                    {mode === 'rent' ? (
                        <>
                            {/* RENT MODE INPUTS */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Valor do Imóvel</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="number" value={propertyValue} onChange={(e) => setPropertyValue(Number(e.target.value))} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-900" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Entrada</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="number" value={downPayment} onChange={(e) => setDownPayment(Number(e.target.value))} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-900" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Juros (a.a.)</label>
                                    <input type="number" value={interestRate} onChange={(e) => setInterestRate(Number(e.target.value))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-900" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Aluguel</label>
                                    <input type="number" value={monthlyRent} onChange={(e) => setMonthlyRent(Number(e.target.value))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-900" />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* CONSTRUCTION MODE INPUTS */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Valor por Cota</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="number" value={quotaValue} onChange={(e) => setQuotaValue(Number(e.target.value))} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-900" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Quantidade de Cotas</label>
                                <div className="relative">
                                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="number" value={numQuotas} onChange={(e) => setNumQuotas(Number(e.target.value))} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-900" />
                                </div>
                                <p className="text-xs text-right text-indigo-500 font-bold mt-1">Total: {formatCurrency(quotaValue * numQuotas)}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Prazo Estimado (Meses)</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="number" value={constructionTerm} onChange={(e) => setConstructionTerm(Number(e.target.value))} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-900" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Rentabilidade Alvo (% Total)</label>
                                <div className="relative">
                                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="number" value={projectedProfit} onChange={(e) => setProjectedProfit(Number(e.target.value))} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-900" />
                                </div>
                                <p className="text-xs text-right text-gray-400 mt-1">Lucro esperado ao final do prazo</p>
                            </div>
                        </>
                    )}
                </div>

                {/* Visuals & Outputs */}
                <div className="lg:col-span-2 space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-400 mb-1">TIR (IRR)</p>
                            <p className={`text-2xl font-black ${results.metrics.irr > 0 ? 'text-emerald-500' : 'text-gray-400'}`}>
                                {isFinite(results.metrics.irr) ? results.metrics.irr.toFixed(2) + '%' : 'N/A'}
                            </p>
                            <p className="text-[10px] text-gray-400">ao ano projetado</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-400 mb-1">{mode === 'rent' ? 'Cap Rate' : 'Lucro Líquido'}</p>
                            <p className="text-2xl font-black text-blue-600">
                                {mode === 'rent' ? results.metrics.capRate.toFixed(2) + '%' : formatCurrency(results.metrics.totalProfit)}
                            </p>
                            <p className="text-[10px] text-gray-400">{mode === 'rent' ? 'Rentabilidade aluguel' : 'Ganho de Capital'}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-400 mb-1">ROI Total</p>
                            <p className="text-2xl font-black text-indigo-600">
                                {results.metrics.roi.toFixed(1)}%
                            </p>
                            <p className="text-[10px] text-gray-400">Retorno sobre Investimento</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-400 mb-1">Valor Final Proj.</p>
                            <p className="text-xl font-black text-gray-900">
                                {formatCurrency(results.metrics.finalValue)}
                            </p>
                            <p className="text-[10px] text-gray-400">{mode === 'rent' ? 'Patrimônio Líquido' : 'Valor de Resgate'}</p>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-emerald-500" />
                            {mode === 'rent' ? 'Evolução Patrimonial' : 'Curva de Valorização (J Curve)'}
                        </h3>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={results.dataPoints} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey={mode === 'rent' ? 'year' : 'month'} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} label={{ value: mode === 'rent' ? 'Anos' : 'Meses', position: 'insideBottom', offset: -10, fill: '#cbd5e1', fontSize: 10 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={(value) => `R$ ${value / 1000}k`} />
                                    <Tooltip
                                        formatter={(value: any) => formatCurrency(value)}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend />
                                    {mode === 'rent' ? (
                                        <>
                                            <Area type="monotone" dataKey="equity" name="Patrimônio Líquido" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
                                            <Line type="monotone" dataKey="propertyValue" name="Valor do Imóvel" stroke="#10b981" strokeWidth={2} dot={false} />
                                            <Line type="monotone" dataKey="loanBalance" name="Saldo Devedor" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                                        </>
                                    ) : (
                                        <>
                                            <Area type="monotone" dataKey="equity" name="Valor Acumulado" fill="#10b981" stroke="#10b981" fillOpacity={0.2} strokeWidth={2} />
                                            <Line type="monotone" dataKey="investment" name="Investimento Inicial" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                                        </>
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Analysis Text */}
                    <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
                        <h4 className="flex items-center gap-2 font-bold text-indigo-900 mb-2">
                            <Info className="w-5 h-5" />
                            Insights da Simulação
                        </h4>
                        <p className="text-sm text-indigo-700 leading-relaxed">
                            {mode === 'rent'
                                ? `Em ${simulationYears} anos, seu patrimônio líquido projetado é de ${formatCurrency(results.metrics.finalValue)}. O imóvel se paga sozinho e gera um retorno anual composto (TIR) de ${results.metrics.irr.toFixed(2)}%.`
                                : `Ao investir ${formatCurrency(quotaValue * numQuotas)} em ${numQuotas} cotas, com prazo de ${constructionTerm} meses e rentabilidade alvo de ${projectedProfit}%, o valor de resgate final estimado é de ${formatCurrency(results.metrics.finalValue)}. Isso representa um lucro líquido de ${formatCurrency(results.metrics.totalProfit)}.`
                            }
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvestmentSimulator;
