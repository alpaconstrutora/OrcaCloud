import React, { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { ImovibStudy } from '../types';
import { tornado, MetricaDoEstudo } from '../utils/imovibSensibilidade';
import { VARIAVEIS_DO_ESTUDO, ROTULO_DA_VARIAVEL, UNIDADE_DA_VARIAVEL, VariavelDoEstudo } from '../utils/imovibVariacoes';
import { ChartCard, ChartEmpty, Legend, GRID, TICK, CATEGORY_TICK, TOOLTIP_STYLE, TOOLTIP_CURSOR, INITIAL_DIMENSION } from './analysis/chartKit';

export const ROTULO_DA_METRICA: Record<MetricaDoEstudo, string> = {
    tir: 'TIR', vpl: 'VPL', margem: 'Margem líquida', exposicao: 'Exposição máxima',
};

/** Valor da métrica no formato da tela. */
export const formatarMetrica = (m: MetricaDoEstudo, v: number): string => {
    if (!Number.isFinite(v)) return '—';
    if (m === 'tir') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.a.`;
    if (m === 'margem') return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
};

const COR_PIOR = '#ef4444';
const COR_MELHOR = '#10b981';

interface ImovibTornadoCardProps {
    study: ImovibStudy;
    choques: Record<VariavelDoEstudo, number>;
    onChoques: (c: Record<VariavelDoEstudo, number>) => void;
}

/**
 * Tornado com as oito variáveis (item 3.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Os choques são
 * hipóteses desta tela: editáveis, não gravados.
 */
const ImovibTornadoCard: React.FC<ImovibTornadoCardProps> = ({ study, choques, onChoques }) => {
    const [metrica, setMetrica] = useState<MetricaDoEstudo>('tir');
    const [editandoChoques, setEditandoChoques] = useState(false);
    const barras = useMemo(() => tornado(study, metrica, choques), [study, metrica, choques]);
    const base = barras[0]?.base ?? NaN;
    // Uma barra por choque (+d e −d), cada uma colorida pelo próprio efeito. Empilhar
    // "pior" e "melhor" somava os dois quando caíam do mesmo lado da base.
    const rel = (v: number) => (Number.isFinite(v - base) ? v - base : 0);
    const dados = barras.map(b => {
        const d = choques[b.variavel].toLocaleString('pt-BR');
        const u = UNIDADE_DA_VARIAVEL[b.variavel];
        const sem = !Number.isFinite(b.acima) ? ` · sem ${ROTULO_DA_METRICA[metrica]} com +${d}` : !Number.isFinite(b.abaixo) ? ` · sem ${ROTULO_DA_METRICA[metrica]} com −${d}` : '';
        return {
            nome: `${b.rotulo} ±${d} ${u}${sem}`,
            cima: rel(b.acima),
            baixo: rel(b.abaixo),
            cimaAbs: b.acima,
            baixoAbs: b.abaixo,
            rotuloCima: `+${d} ${u}`,
            rotuloBaixo: `−${d} ${u}`,
        };
    });
    const cor = (delta: number) => (delta >= 0 ? COR_MELHOR : COR_PIOR);

    return (
        <ChartCard title="Gráfico tornado" subtitle={`Quanto cada premissa move a métrica (${ROTULO_DA_METRICA[metrica]}), para cima e para baixo. Estudo como está: ${formatarMetrica(metrica, base)}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <Legend items={[{ label: 'Piora', color: COR_PIOR }, { label: 'Melhora', color: COR_MELHOR }]} />
                <div className="flex items-center gap-2">
                    <label htmlFor="imovib-tornado-metrica" className="text-xs font-semibold text-slate-500">Métrica</label>
                    <select
                        id="imovib-tornado-metrica"
                        value={metrica}
                        onChange={(e) => setMetrica(e.target.value as MetricaDoEstudo)}
                        className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                    >
                        {(Object.keys(ROTULO_DA_METRICA) as MetricaDoEstudo[]).map(m => <option key={m} value={m}>{ROTULO_DA_METRICA[m]}</option>)}
                    </select>
                    <button
                        type="button"
                        aria-expanded={editandoChoques}
                        onClick={() => setEditandoChoques(v => !v)}
                        className="h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50"
                    >
                        {editandoChoques ? 'Fechar choques' : 'Ajustar choques'}
                    </button>
                </div>
            </div>

            {editandoChoques && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-slate-50 rounded-[10px] border border-slate-100">
                    {VARIAVEIS_DO_ESTUDO.map(v => (
                        <label key={v} className="block">
                            <span className="block text-xs font-semibold text-slate-500 mb-1">{ROTULO_DA_VARIAVEL[v]} ({UNIDADE_DA_VARIAVEL[v]})</span>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                defaultValue={choques[v]}
                                aria-label={`Choque de ${ROTULO_DA_VARIAVEL[v]}`}
                                onBlur={(e) => {
                                    const n = Math.abs(parseFloat(e.target.value));
                                    if (Number.isFinite(n) && n !== choques[v]) onChoques({ ...choques, [v]: n });
                                    else e.target.value = String(choques[v]);
                                }}
                                className="h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-700 text-right outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </label>
                    ))}
                    <p className="col-span-2 md:col-span-4 text-xs text-slate-500">Hipóteses desta tela: valem para o tornado, a grade e a simulação, e não são gravadas no estudo.</p>
                </div>
            )}

            {!Number.isFinite(base) ? (
                <ChartEmpty>{metrica === 'tir' ? 'O estudo não tem TIR: escolha VPL, margem ou exposição.' : 'Sem dados para calcular.'}</ChartEmpty>
            ) : (
                <div className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                        <BarChart layout="vertical" data={dados} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barSize={9} barGap={2}>
                            <CartesianGrid horizontal={false} stroke={GRID} />
                            <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatarMetrica(metrica, v + base)} />
                            <YAxis type="category" dataKey="nome" width={230} tick={CATEGORY_TICK} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={TOOLTIP_STYLE}
                                cursor={TOOLTIP_CURSOR}
                                formatter={(_v: unknown, nome: unknown, item: { payload?: { cimaAbs: number; baixoAbs: number; rotuloCima: string; rotuloBaixo: string } }) => [
                                    formatarMetrica(metrica, nome === 'cima' ? item.payload!.cimaAbs : item.payload!.baixoAbs),
                                    `Choque ${nome === 'cima' ? item.payload!.rotuloCima : item.payload!.rotuloBaixo}`,
                                ]}
                            />
                            <ReferenceLine x={0} stroke="#94a3b8" />
                            <Bar dataKey="cima">
                                {dados.map((d, i) => <Cell key={i} fill={cor(d.cima)} />)}
                            </Bar>
                            <Bar dataKey="baixo">
                                {dados.map((d, i) => <Cell key={i} fill={cor(d.baixo)} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </ChartCard>
    );
};

export default ImovibTornadoCard;
