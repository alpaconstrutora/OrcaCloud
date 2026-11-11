import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { CartaoCentral, type EstadoDoCartao } from './CartaoCentral';
import { NumeroQueSobe } from './NumeroQueSobe';
import type { CashflowProjectionPoint } from '../../services/financialIntelligenceService';

/**
 * Caixa projetado — saldo acumulado dia a dia (`fn_cashflow_projection`) em 30,
 * 60 ou 90 dias, e o saldo do último dia em número grande. Cromo do §28.2:
 * grade sólida `#f1f5f9`, eixos sem linha, eixo de valor compacto, linha 2px e
 * sem animação de entrada (o gráfico redesenha ao trocar o período).
 */
export type PeriodoCaixa = 30 | 60 | 90;

interface Props {
    estado: EstadoDoCartao;
    onTentarDeNovo: () => void;
    pontos: CashflowProjectionPoint[];
    periodo: PeriodoCaixa;
    onPeriodo: (p: PeriodoCaixa) => void;
    animar: boolean;
    onNavigate: (view: string) => void;
}

function fBRL(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function compacto(v: number): string {
    const a = Math.abs(v);
    const s = v < 0 ? '−' : '';
    if (a >= 1_000_000) return `${s}R$ ${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (a >= 1_000) return `${s}R$ ${Math.round(a / 1_000).toLocaleString('pt-BR')} mil`;
    return `${s}R$ ${Math.round(a).toLocaleString('pt-BR')}`;
}

function diaMes(iso: string): string {
    const [, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}`;
}

export function CartaoCaixa({ estado, onTentarDeNovo, pontos, periodo, onPeriodo, animar, onNavigate }: Props) {
    const final = pontos.length ? pontos[pontos.length - 1].saldo_acum : null;
    const negativo = final != null && final < 0;
    const dados = pontos.map(p => ({ dia: diaMes(p.data_ref), saldo: p.saldo_acum }));

    return (
        <CartaoCentral
            titulo="Caixa projetado"
            subtitulo={`Saldo bancário + a receber − a pagar, dia a dia, nos próximos ${periodo} dias.`}
            estado={estado}
            onTentarDeNovo={onTentarDeNovo}
            acao={{ rotulo: 'Inteligência Financeira', onClick: () => onNavigate('financial-intelligence') }}
        >
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    {final == null ? (
                        <p className="text-sm text-gray-500">Sem projeção para o período.</p>
                    ) : (
                        <>
                            <NumeroQueSobe
                                valor={final}
                                animar={animar}
                                formatar={fBRL}
                                className={`text-[28px] leading-none font-semibold whitespace-nowrap ${negativo ? 'text-red-600' : 'text-gray-900'}`}
                            />
                            <p className="text-xs text-gray-500 mt-1">no fim de {periodo} dias</p>
                        </>
                    )}
                </div>
                <div className="flex shrink-0 rounded-[6px] border border-gray-200 p-0.5" role="group" aria-label="Período da projeção">
                    {([30, 60, 90] as PeriodoCaixa[]).map(d => (
                        <button
                            key={d}
                            type="button"
                            aria-pressed={periodo === d}
                            onClick={() => onPeriodo(d)}
                            className={`h-7 px-2.5 rounded-[4px] text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${periodo === d ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            {d} dias
                        </button>
                    ))}
                </div>
            </div>
            {dados.length > 1 && (
                <div className="mt-3 h-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={24} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={compacto} width={84} />
                            <RechartsTooltip
                                formatter={(v) => [fBRL(Number(v)), 'Saldo']}
                                labelFormatter={(l) => `Dia ${String(l)}`}
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: 12 }}
                            />
                            <Line type="monotone" dataKey="saldo" stroke={negativo ? '#ef4444' : '#2563eb'} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </CartaoCentral>
    );
}

export default CartaoCaixa;
