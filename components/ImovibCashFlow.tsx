import React, { useMemo } from 'react';
import { ImovibStudy } from '../types';
import { Activity, TrendingUp, AlertCircle, BarChart3, LineChart } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, Legend } from 'recharts';

interface ImovibCashFlowProps {
    study: ImovibStudy;
    /** Abre a aba que corrige a premissa de um aviso do motor. */
    onIrPara?: (aba: ImovibAba) => void;
}

import { useImovibMath, ImovibAba } from '../hooks/useImovibMath';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import ImovibAvisosBanner from './ImovibAvisosBanner';
import { KpiCard } from './ui/KpiCard';
import { CABECALHO_TABELA } from './ui/cabecalhoDeTabela';

// §6.6/§6.11 — cabeçalho e células da tabela mensal.
const TH = `px-6 py-2 border-r ${CABECALHO_TABELA.divisoria} last:border-r-0 text-table-header font-semibold`;
const TD = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm';

const fmtTaxa = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
};

const ImovibCashFlow: React.FC<ImovibCashFlowProps> = ({ study, onIrPara }) => {
    const cashFlowData = useImovibMath(study);
    // Mesmo padrão do motor quando o campo está vazio — antes o texto saía "a % a.a."
    const discountRate = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    const inflationRate = study.inflation_rate ?? IMOVIB_DEFAULTS.inflation_rate;

    return (
        <div className="space-y-6">
            <ImovibAvisosBanner avisos={cashFlowData.avisos} onIrPara={onIrPara} />

            {/* KPIs principais — §4: componente canônico KpiCard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <KpiCard
                    label="VPL (Valor Presente)"
                    value={formatCurrency(cashFlowData.vpl)}
                    sub={`Descontado a ${fmtTaxa(discountRate)}% a.a.`}
                    icon={<TrendingUp className="w-4 h-4" />}
                    color="emerald"
                />
                <KpiCard
                    label="TIR (Taxa Int. Retorno)"
                    value={`${isNaN(cashFlowData.annualIrr) || !isFinite(cashFlowData.annualIrr)
                        ? 'N/A'
                        : cashFlowData.annualIrr > 999
                            ? '> 999'
                            : cashFlowData.annualIrr.toFixed(2)}% a.a.`}
                    sub="Rentabilidade do projeto"
                    icon={<Activity className="w-4 h-4" />}
                    color="blue"
                />
                <KpiCard
                    label="Exposição Máxima"
                    value={formatCurrency(cashFlowData.maxExposure)}
                    sub="Fundo de caixa (Mínimo Acumulado)"
                    icon={<AlertCircle className="w-4 h-4" />}
                    color="red"
                />
            </div>

            {/* Recharts Visualization */}
            <div className="bg-white rounded-[10px] p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
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
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-600" />
                        Fluxo de Caixa Mensal
                    </h3>
                    <span className="text-sm text-gray-500">Base: Inflacionada {fmtTaxa(inflationRate)}% a.m.</span>
                </div>

                <div className="w-full overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            {/* §6.2/§6.11: sentence case, fundo branco, texto na cor das células (CABECALHO_TABELA) */}
                            <tr className={`${CABECALHO_TABELA.fundo} ${CABECALHO_TABELA.texto} font-semibold text-xs border-b ${CABECALHO_TABELA.linhaDeBaixo}`}>
                                <th className={TH}>Mês</th>
                                <th className={`${TH} text-right`}>Receitas (R$)</th>
                                <th className={`${TH} text-right`}>Custos (R$)</th>
                                <th className={`${TH} text-right`}>Saldo Líquido</th>
                                <th className={`${TH} text-right`}>Acumulado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {cashFlowData.monthlyFlows.map((row) => (
                                <tr key={row.month} className="hover:bg-blue-50/50 transition-colors">
                                    <td className={`${TD} font-normal text-gray-600`}>Mês {row.month}</td>
                                    <td className={`${TD} text-right font-medium text-emerald-600`}>{formatCurrency(row.rev)}</td>
                                    <td className={`${TD} text-right font-medium text-red-600`}>{formatCurrency(row.cost)}</td>
                                    <td className={`${TD} text-right font-medium ${row.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {formatCurrency(row.net)}
                                    </td>
                                    <td className={`${TD} text-right font-medium ${row.acc >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
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
