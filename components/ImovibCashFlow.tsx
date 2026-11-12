import React, { useMemo, useState } from 'react';
import { Activity, TrendingUp, AlertCircle, BarChart3, LineChart, ChevronDown, ChevronRight } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, Legend } from 'recharts';
import { ImovibStudy } from '../types';
import { useImovibMath, ImovibAba, ImovibSubAbaDePremissas } from '../hooks/useImovibMath';
import { montarVisaoDoFluxo, VisaoDoFluxo, BaseDoFluxo, PeriodoDoFluxo, GRUPOS_DO_FLUXO, GrupoDoFluxo } from '../utils/imovibVisaoDoFluxo';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import ImovibAvisosBanner from './ImovibAvisosBanner';
import { KpiCard } from './ui/KpiCard';
import { CABECALHO_TABELA } from './ui/cabecalhoDeTabela';

interface ImovibCashFlowProps {
    study: ImovibStudy;
    /** Abre a aba que corrige a premissa de um aviso do motor. */
    onIrPara?: (aba: ImovibAba, subAba?: ImovibSubAbaDePremissas) => void;
}

// §6.6/§6.11 — cabeçalho e células da tabela.
const TH = `px-4 py-2 border-r ${CABECALHO_TABELA.divisoria} last:border-r-0 text-table-header font-semibold whitespace-nowrap`;
const TD = 'px-4 py-2 border-r border-gray-100 last:border-r-0 text-sm text-right whitespace-nowrap';

const fmtTaxa = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
const fmtTir = (v: number) => (!Number.isFinite(v) ? 'N/A' : v > 999 ? '> 999% a.a.' : `${v.toFixed(2)}% a.a.`);

type Grupo = GrupoDoFluxo;

function Alternador<T extends string>({ rotulo, opcoes, valor, onChange }: { rotulo: string; opcoes: { id: T; rotulo: string }[]; valor: T; onChange: (v: T) => void }) {
    return (
        // §19.1 do guia: trilho bg-gray-50 p-1; ativo bg-white text-blue-600 shadow-sm (não o azul sólido).
        <div role="group" aria-label={rotulo} className="inline-flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
            {opcoes.map(o => (
                <button
                    key={o.id}
                    type="button"
                    aria-pressed={valor === o.id}
                    onClick={() => onChange(o.id)}
                    className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${valor === o.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                >
                    {o.rotulo}
                </button>
            ))}
        </div>
    );
}

/**
 * Fluxo de caixa da aba Dinâmica. Desde o item 2.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md a tabela abre o
 * caixa por linha e troca de visão: acionista ou projeto, nominal ou real, por
 * mês, trimestre ou ano (utils/imovibVisaoDoFluxo.ts).
 */
const ImovibCashFlow: React.FC<ImovibCashFlowProps> = ({ study, onIrPara }) => {
    const r = useImovibMath(study);
    const discountRate = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    const inflationRate = study.inflation_rate ?? IMOVIB_DEFAULTS.inflation_rate;

    const [visao, setVisao] = useState<VisaoDoFluxo>('acionista');
    const [base, setBase] = useState<BaseDoFluxo>('nominal');
    const [periodo, setPeriodo] = useState<PeriodoDoFluxo>('mensal');
    const [fechados, setFechados] = useState<Record<Grupo, boolean>>({ receitas: false, custos: false, financiamento: false });

    const v = useMemo(
        () => montarVisaoDoFluxo(r, { visao, base, periodo, inflacaoMensalPct: inflationRate }),
        [r, visao, base, periodo, inflationRate],
    );
    const grupos = GRUPOS_DO_FLUXO
        .map(g => ({ ...g, linhas: g.linhas.filter(l => v.linhasComValor.includes(l.chave)) }))
        .filter(g => g.linhas.length > 0);
    const vpl = visao === 'projeto' ? r.vplProjeto : r.vpl;

    const corDoValor = (n: number) => (n < 0 ? 'text-red-600' : 'text-gray-800');

    return (
        <div className="space-y-6">
            <ImovibAvisosBanner avisos={r.avisos} onIrPara={onIrPara} />

            <div className="flex flex-wrap items-center gap-2">
                <Alternador rotulo="Visão do fluxo" valor={visao} onChange={setVisao} opcoes={[{ id: 'acionista', rotulo: 'Acionista' }, { id: 'projeto', rotulo: 'Projeto' }]} />
                <Alternador rotulo="Base dos valores" valor={base} onChange={setBase} opcoes={[{ id: 'nominal', rotulo: 'Nominal' }, { id: 'real', rotulo: 'Real' }]} />
                <Alternador rotulo="Período" valor={periodo} onChange={setPeriodo} opcoes={[{ id: 'mensal', rotulo: 'Mensal' }, { id: 'trimestral', rotulo: 'Trimestral' }, { id: 'anual', rotulo: 'Anual' }]} />
                <span className="text-xs text-slate-500">
                    {visao === 'acionista' ? 'Caixa do incorporador, depois do financiamento.' : 'Caixa do empreendimento, sem financiamento.'}
                    {base === 'real' ? ` Valores de hoje, deflacionados pela inflação geral (${fmtTaxa(inflationRate)}% a.m.).` : ''}
                </span>
            </div>

            {/* KPIs — §4: componente canônico KpiCard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <KpiCard
                    label={visao === 'projeto' ? 'VPL do projeto' : 'VPL do acionista'}
                    value={formatCurrency(vpl)}
                    sub={`Descontado a ${fmtTaxa(discountRate)}% a.a. (fluxo nominal)`}
                    icon={<TrendingUp className="w-4 h-4" />}
                    color="emerald"
                />
                <KpiCard
                    label={base === 'real' ? 'TIR real' : 'TIR'}
                    value={fmtTir(v.tirAnual)}
                    sub={visao === 'projeto' ? 'Do projeto, sem financiamento' : 'Do acionista, com financiamento'}
                    icon={<Activity className="w-4 h-4" />}
                    color="blue"
                />
                <KpiCard
                    label="Exposição máxima"
                    value={formatCurrency(v.exposicaoMaxima)}
                    sub="Menor caixa acumulado"
                    icon={<AlertCircle className="w-4 h-4" />}
                    color="red"
                />
            </div>

            <div className="bg-white rounded-[10px] p-6 border border-gray-100 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-6">
                    <LineChart className="w-5 h-5 text-blue-600" />
                    Curva S e caixa por período
                </h3>
                <div className="h-96 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={v.periodos} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={false} minTickGap={30} />
                            <YAxis yAxisId="left" tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={false} />
                            <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={false} />
                            <Tooltip formatter={(value: unknown) => formatCurrency(Number(value))} cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                            <Bar yAxisId="left" dataKey="net" name="Caixa do período" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                            <Line yAxisId="right" type="monotone" dataKey="acc" name="Acumulado (curva S)" stroke="#EF4444" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-600" />
                        Fluxo de caixa {periodo === 'mensal' ? 'mensal' : periodo === 'trimestral' ? 'trimestral' : 'anual'}
                    </h3>
                    <span className="text-sm text-gray-500">{base === 'real' ? 'Valores de hoje' : `Nominal, corrigido pelos índices`}</span>
                </div>
                <div className="w-full overflow-x-auto">
                    <table className="text-left border-collapse min-w-full">
                        <thead>
                            <tr className={`${CABECALHO_TABELA.fundo} ${CABECALHO_TABELA.texto} font-semibold text-xs border-b ${CABECALHO_TABELA.linhaDeBaixo}`}>
                                <th className={`${TH} sticky left-0 bg-white z-10 min-w-[220px]`}>Linha</th>
                                {v.periodos.map(p => <th key={p.rotulo} className={`${TH} text-right`}>{p.rotulo}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {grupos.map(g => {
                                const fechado = fechados[g.id];
                                return (
                                    <React.Fragment key={g.id}>
                                        <tr className="bg-gray-50">
                                            <td className="px-4 py-2 sticky left-0 bg-gray-50 z-10 border-r border-gray-100">
                                                <button
                                                    type="button"
                                                    aria-expanded={!fechado}
                                                    onClick={() => setFechados(prev => ({ ...prev, [g.id]: !prev[g.id] }))}
                                                    className="flex items-center gap-1.5 text-sm font-semibold text-gray-800"
                                                >
                                                    {fechado ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    {g.rotulo}
                                                </button>
                                            </td>
                                            {v.periodos.map(p => {
                                                const total = g.linhas.reduce((a, l) => a + p.linhas[l.chave], 0);
                                                return <td key={p.rotulo} className={`${TD} font-medium ${corDoValor(total)}`}>{formatCurrency(total)}</td>;
                                            })}
                                        </tr>
                                        {!fechado && g.linhas.map(l => (
                                            <tr key={l.chave}>
                                                <td className="px-4 py-2 pl-10 sticky left-0 bg-white z-10 border-r border-gray-100 text-sm text-gray-600 whitespace-nowrap">{l.rotulo}</td>
                                                {v.periodos.map(p => (
                                                    <td key={p.rotulo} className={`${TD} font-normal ${corDoValor(p.linhas[l.chave])}`}>{formatCurrency(p.linhas[l.chave])}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                            <tr className="bg-blue-50/40">
                                <td className="px-4 py-2 sticky left-0 bg-blue-50 z-10 border-r border-gray-100 text-sm font-semibold text-gray-900">Caixa do período</td>
                                {v.periodos.map(p => <td key={p.rotulo} className={`${TD} font-semibold ${p.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(p.net)}</td>)}
                            </tr>
                            <tr>
                                <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r border-gray-100 text-sm font-semibold text-gray-900">Acumulado</td>
                                {v.periodos.map(p => <td key={p.rotulo} className={`${TD} font-medium ${corDoValor(p.acc)}`}>{formatCurrency(p.acc)}</td>)}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ImovibCashFlow;
