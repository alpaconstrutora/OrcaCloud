import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import type { ImovibMathResult } from '../hooks/useImovibMath';
import type { TipoCurvaDeVendas } from '../utils/imovibCurvas';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import ImovibInputRow from './ImovibInputRow';
import {
    ChartCard, ChartEmpty, Legend, GRID, TICK, TOOLTIP_STYLE, TOOLTIP_CURSOR, INITIAL_DIMENSION,
    SERIE_PRINCIPAL, SERIE_CONTEXTO, compactAxis, moneyBRL,
} from './analysis/chartKit';

interface ImovibCurvaDeVendasCardProps {
    study: ImovibStudy;
    math: ImovibMathResult;
    salvar: (campos: ImovibStudyUpdate) => Promise<void>;
}

const TIPOS: { id: TipoCurvaDeVendas; rotulo: string; desc: string }[] = [
    { id: 'linear', rotulo: 'Linear', desc: 'A mesma fração do VGV todo mês, do início ao fim das vendas.' },
    { id: 'lancamento', rotulo: 'Lançamento forte', desc: 'Uma parte do VGV nos primeiros meses; o resto em partes iguais depois.' },
    { id: 'vso', rotulo: 'VSO (sobre o estoque)', desc: 'A cada mês vende um percentual do estoque que resta. Pode não vender tudo no prazo.' },
    { id: 'custom', rotulo: 'Personalizada', desc: 'Um peso por mês de venda; o sistema normaliza para 100%.' },
];

const fmtPct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * Curva de vendas (item 1.5 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 * O gráfico lê `math.vendasPorMes`, o mesmo número que o motor usa — a tela não
 * recalcula a curva.
 */
const ImovibCurvaDeVendasCard: React.FC<ImovibCurvaDeVendasCardProps> = ({ study, math, salvar }) => {
    const D = IMOVIB_DEFAULTS;
    const { pode, motivo } = useImovibEdicao();
    const tipo = (study.sales_curve_type ?? D.sales_curve_type) as TipoCurvaDeVendas;
    const duracao = study.sales_duration_months ?? D.sales_duration_months;
    const inicio = study.sales_start_month ?? D.sales_start_month;
    const vsoRegiao = study.vso_regional_percent ?? null;

    // Pesos da curva personalizada: rascunho local, grava ao sair de cada campo.
    const pesosGravados = useMemo(
        () => Array.from({ length: Math.max(0, duracao) }, (_, i) => Number(study.sales_curve_custom?.[i]) || 0),
        [study.sales_curve_custom, duracao],
    );
    const [pesos, setPesos] = useState<string[]>(pesosGravados.map(String));
    // Recarga que chega enquanto um mês é digitado atualiza os outros e preserva
    // esse (antes, o rascunho voltava ao gravado e o valor sumia sem gravar).
    const mesEmEdicao = useRef<number | null>(null);
    useEffect(() => {
        setPesos(prev => pesosGravados.map((g, i) => (i === mesEmEdicao.current && prev[i] !== undefined ? prev[i] : String(g))));
    }, [pesosGravados]);

    const dados = useMemo(() => {
        const vendido = math.vendasPorMes.reduce((a, b) => a + b, 0);
        const vendavel = math.estoqueNaoVendidoPct < 1 ? vendido / (1 - math.estoqueNaoVendidoPct) : 0;
        let acumulado = 0;
        return math.vendasPorMes.slice(inicio - 1).map((v, i) => {
            acumulado += v;
            return { mes: `Mês ${inicio + i}`, vendas: v, estoque: Math.max(0, vendavel - acumulado) };
        });
    }, [math.vendasPorMes, math.estoqueNaoVendidoPct, inicio]);

    const descricao = TIPOS.find(t => t.id === tipo)?.desc;

    return (
        <div className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-6">
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-[6px]">
                        <TrendingUp className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Curva de vendas</h2>
                </div>
                <p className="text-slate-500 text-sm">
                    Quanto do VGV é vendido em cada mês, do mês {inicio} ao mês {inicio + duracao - 1} (prazo das vendas na aba Dinâmica).
                </p>
            </div>

            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                    <div>
                        <label htmlFor="imovib-curva-tipo" className="block text-xs font-semibold text-slate-500 mb-1.5">Tipo da curva</label>
                        <select
                            id="imovib-curva-tipo"
                            value={tipo}
                            onChange={(e) => salvar({ sales_curve_type: e.target.value as TipoCurvaDeVendas })}
                            className="h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                        >
                            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                        </select>
                        {descricao && <p className="text-xs text-slate-500 mt-1.5">{descricao}</p>}
                    </div>

                    {tipo === 'lancamento' && (
                        <>
                            <ImovibInputRow label="Vendido no lançamento" desc="Percentual do VGV" value={study.sales_launch_percent ?? D.sales_launch_percent} onCommit={(v) => salvar({ sales_launch_percent: v })} />
                            <ImovibInputRow label="Meses do lançamento" value={study.sales_launch_months ?? D.sales_launch_months} unidade="meses" step="1" onCommit={(v) => salvar({ sales_launch_months: Math.round(v) })} />
                        </>
                    )}

                    {tipo === 'vso' && (
                        <>
                            <ImovibInputRow label="VSO mensal" desc="Percentual do estoque que resta vendido a cada mês" value={study.sales_vso_percent ?? D.sales_vso_percent} onCommit={(v) => salvar({ sales_vso_percent: v })} />
                            <button
                                type="button"
                                disabled={!(vsoRegiao != null && vsoRegiao > 0)}
                                title={vsoRegiao != null && vsoRegiao > 0 ? undefined : 'Preencha a VSO histórica da região em Premissas › Mercado.'}
                                onClick={() => vsoRegiao != null && salvar({ sales_vso_percent: vsoRegiao })}
                                className="h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {vsoRegiao != null && vsoRegiao > 0 ? `Usar a VSO da região (${fmtPct(vsoRegiao)}%)` : 'Usar a VSO da região'}
                            </button>
                        </>
                    )}

                    {tipo === 'custom' && (
                        <div>
                            <p className="text-xs font-semibold text-slate-500 mb-1.5">Peso de cada mês de venda</p>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {pesos.map((p, i) => (
                                    <label key={i} className="block">
                                        <span className="block text-xs text-slate-500 mb-1">Mês {inicio + i}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={p}
                                            aria-label={`Peso do mês ${inicio + i}`}
                                            onFocus={() => { mesEmEdicao.current = i; }}
                                            onChange={(e) => setPesos(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
                                            onBlur={() => {
                                                mesEmEdicao.current = null;
                                                const novos = pesos.map(x => Math.max(0, parseFloat(x) || 0));
                                                if (novos.some((n, j) => n !== pesosGravados[j])) salvar({ sales_curve_custom: novos });
                                            }}
                                            className="h-9 w-full px-2 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-700 text-right outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                    </label>
                                ))}
                            </div>
                            <p className="text-xs text-slate-500 mt-1.5">Todos os pesos zerados contam como curva linear.</p>
                        </div>
                    )}

                    {math.estoqueNaoVendidoPct > 0 && (
                        <p role="status" className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-[6px] p-3">
                            {fmtPct(math.estoqueNaoVendidoPct * 100)}% do VGV vendável fica em estoque no fim do prazo e não entra na receita.
                        </p>
                    )}
                </div>

                <ChartCard title="Vendas por mês" subtitle="VGV vendido no mês (eixo da esquerda) e estoque que resta (eixo da direita), sem correção.">
                    {dados.length === 0 || dados.every(d => d.vendas === 0) ? (
                        <ChartEmpty>Sem VGV para distribuir: informe o preço de venda em Orçamento › Por torre.</ChartEmpty>
                    ) : (
                        <>
                            <Legend items={[{ label: 'Vendas do mês', color: SERIE_PRINCIPAL }, { label: 'Estoque', color: SERIE_CONTEXTO }]} />
                            <div className="h-56">
                                <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                                    {/* Eixos separados: a venda do mês é ~1/36 do estoque inicial e sumiria no mesmo eixo. */}
                                    <ComposedChart data={dados} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                        <CartesianGrid vertical={false} stroke={GRID} />
                                        <XAxis dataKey="mes" tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
                                        <YAxis yAxisId="vendas" tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} width={56} />
                                        <YAxis yAxisId="estoque" orientation="right" tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} width={56} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} formatter={(v: unknown) => moneyBRL(Number(v))} />
                                        <Bar yAxisId="vendas" dataKey="vendas" name="Vendas do mês" fill={SERIE_PRINCIPAL} radius={[3, 3, 0, 0]} />
                                        <Line yAxisId="estoque" dataKey="estoque" name="Estoque" stroke={SERIE_CONTEXTO} strokeWidth={2} dot={false} type="monotone" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}
                </ChartCard>
            </fieldset>
        </div>
    );
};

export default ImovibCurvaDeVendasCard;
