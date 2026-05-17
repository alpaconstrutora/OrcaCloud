import React, { useMemo } from 'react';
import { ImovibStudy } from '../types';
import { Activity, TrendingUp, AlertCircle, BarChart3, LineChart } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, Legend } from 'recharts';

interface ImovibCashFlowProps {
    study: ImovibStudy;
}

import { useImovibMath } from '../hooks/useImovibMath';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
};

const ImovibCashFlow: React.FC<ImovibCashFlowProps> = ({ study }) => {
    const cashFlowData = useImovibMath(study);

    return (
        <div className="space-y-6">
            {/* Top Main KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-emerald-600 text-sm font-black tracking-widest uppercase">
                            <TrendingUp className="w-4 h-4" /> VPL (Valor Presente)
                        </div>
                    </div>
                    <div className="text-3xl font-black text-gray-900 tracking-tight">
                        {formatCurrency(cashFlowData.vpl)}
                    </div>
                    <div className="text-sm mt-2 text-gray-500 font-medium">Descontado a {study.discount_rate}% a.a.</div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-blue-600 text-sm font-black tracking-widest uppercase">
                            <Activity className="w-4 h-4" /> TIR (Taxa Int. Retorno)
                        </div>
                    </div>
                    <div className="text-3xl font-black text-gray-900 tracking-tight flex items-baseline gap-1">
                        {isNaN(cashFlowData.annualIrr) || !isFinite(cashFlowData.annualIrr) ? (
                            'N/A'
                        ) : cashFlowData.annualIrr > 999 ? (
                            '> 999'
                        ) : (
                            cashFlowData.annualIrr.toFixed(2)
                        )}
                        <span className="text-lg text-gray-400">% a.a.</span>
                    </div>
                    <div className="text-sm mt-2 text-gray-500 font-medium">Rentabilidade do projeto</div>
                </div>

                <div className="bg-gradient-to-br from-rose-500 to-red-600 rounded-2xl p-6 text-white shadow-lg shadow-red-900/20">
                    <div className="flex items-center gap-2 text-red-100 mb-2 font-black tracking-widest uppercase text-sm">
                        <AlertCircle className="w-4 h-4" /> Exposição Máxima
                    </div>
                    <div className="text-3xl font-black tracking-tight">{formatCurrency(cashFlowData.maxExposure)}</div>
                    <div className="text-sm mt-2 text-red-100 font-medium">Fundo de caixa (Mínimo Acumulado)</div>
                </div>
            </div>

            {/* Recharts Visualization */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        <LineChart className="w-5 h-5 text-blue-600" />
                        Curva S e Fluxo Mensal
                    </h3>
                </div>
                <div className="h-96 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={cashFlowData.monthlyFlows}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 12, fill: '#6B7280', fontWeight: 600 }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                yAxisId="left"
                                tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                                tick={{ fontSize: 12, fill: '#6B7280', fontWeight: 600 }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                                tick={{ fontSize: 12, fill: '#6B7280', fontWeight: 600 }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip
                                formatter={(value: any) => [value !== undefined ? formatCurrency(value) : '', '']}
                                cursor={{ fill: '#F3F4F6' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', fontWeight: 600 }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 600, fontSize: '12px' }} />
                            <Bar yAxisId="left" dataKey="net" name="Saldo Líquido Mensal" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                            <Line yAxisId="right" type="monotone" dataKey="acc" name="Acumulado (Curva S)" stroke="#EF4444" strokeWidth={4} dot={false} activeDot={{ r: 6 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Monthly Table */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">Fluxo de Caixa Mensal</h3>
                    </div>
                    <span className="text-sm text-gray-400 font-medium">Base: Inflacionada {study.inflation_rate}% a.m.</span>
                </div>

                <div className="w-full overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 uppercase tracking-widest text-xs font-black text-gray-400">
                                <th className="px-6 py-4">Mês</th>
                                <th className="px-6 py-4 text-right">Receitas (R$)</th>
                                <th className="px-6 py-4 text-right">Custos (R$)</th>
                                <th className="px-6 py-4 text-right">Saldo Líquido</th>
                                <th className="px-6 py-4 text-right">Acumulado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {cashFlowData.monthlyFlows.map((row) => (
                                <tr key={row.month} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-3 font-black text-gray-600">Mês {row.month}</td>
                                    <td className="px-6 py-3 text-right text-emerald-600 font-medium">{formatCurrency(row.rev)}</td>
                                    <td className="px-6 py-3 text-right text-red-600 font-medium">{formatCurrency(row.cost)}</td>
                                    <td className={`px-6 py-3 text-right font-bold ${row.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {formatCurrency(row.net)}
                                    </td>
                                    <td className={`px-6 py-3 text-right font-black ${row.acc >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                        {formatCurrency(row.acc)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ImovibCashFlow;
