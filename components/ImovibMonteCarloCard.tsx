import React, { useEffect, useMemo, useState } from 'react';
import { Dices, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ImovibStudy, ImovibScenario } from '../types';
import { simularMonteCarlo, ResultadoMonteCarlo } from '../utils/imovibMonteCarlo';
import { faixasDoMonteCarlo } from '../utils/imovibCenarios';
import { ROTULO_DA_VARIAVEL, UNIDADE_DA_VARIAVEL, VariavelDoEstudo } from '../utils/imovibVariacoes';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { KpiCard } from './ui/KpiCard';
import { ChartCard, GRID, TICK, TOOLTIP_STYLE, TOOLTIP_CURSOR, INITIAL_DIMENSION, SERIE_PRINCIPAL, compactAxis } from './analysis/chartKit';
import { formatarMetrica } from './ImovibTornadoCard';

interface ImovibMonteCarloCardProps {
    study: ImovibStudy;
    cenarios: ImovibScenario[];
    choques: Record<VariavelDoEstudo, number>;
}

const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * Simulação de Monte Carlo (item 3.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Roda só ao clicar:
 * 2.000 sorteios levam cerca de um segundo. Nada é gravado.
 */
const ImovibMonteCarloCard: React.FC<ImovibMonteCarloCardProps> = ({ study, cenarios, choques }) => {
    const [iteracoes, setIteracoes] = useState(String(IMOVIB_DEFAULTS.monte_carlo_iteracoes));
    const [semente, setSemente] = useState('1');
    const [simulando, setSimulando] = useState(false);
    const [resultado, setResultado] = useState<ResultadoMonteCarlo | null>(null);
    const faixas = useMemo(() => faixasDoMonteCarlo(cenarios, choques), [cenarios, choques]);
    // Resultado de premissas antigas não fica na tela ao lado das faixas novas.
    useEffect(() => { setResultado(null); }, [faixas, study]);
    const usaCenarios = cenarios.some(c => c.kind === 'pessimista') && cenarios.some(c => c.kind === 'otimista');
    const tma = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    const n = parseInt(iteracoes, 10);
    const s = parseInt(semente, 10);
    const motivo = !(n >= 100 && n <= 20000) ? 'Escolha de 100 a 20.000 sorteios.'
        : !Number.isFinite(s) ? 'A semente precisa ser um número inteiro.'
            : Object.keys(faixas).length === 0 ? 'Nenhuma premissa varia: ajuste os choques ou os cenários.' : undefined;

    const simular = () => {
        if (motivo) return;
        setSimulando(true);
        // Deixa a tela mostrar "Simulando…" antes do cálculo, que é síncrono.
        setTimeout(() => {
            try {
                setResultado(simularMonteCarlo(study, faixas, n, s));
            } finally {
                setSimulando(false);
            }
        }, 30);
    };

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Dices className="w-4 h-4 text-indigo-500" />
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700">Simulação de Monte Carlo</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Sorteia as premissas juntas e mostra a chance de o estudo não pagar a TMA. Faixas: {usaCenarios ? 'entre os cenários Pessimista e Otimista' : '± os choques do tornado'}; o mais provável é o estudo como está.
                        </p>
                    </div>
                </div>
                <div className="flex items-end gap-2">
                    <label className="block">
                        <span className="block text-xs font-semibold text-slate-500 mb-1">Sorteios</span>
                        <input type="number" min="100" max="20000" step="100" value={iteracoes} onChange={e => setIteracoes(e.target.value)}
                            className="h-9 w-24 px-2 bg-white border border-gray-200 rounded-[6px] text-sm text-right outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
                    </label>
                    <label className="block">
                        <span className="block text-xs font-semibold text-slate-500 mb-1" title="A mesma semente repete o mesmo resultado.">Semente</span>
                        <input type="number" step="1" value={semente} onChange={e => setSemente(e.target.value)}
                            className="h-9 w-20 px-2 bg-white border border-gray-200 rounded-[6px] text-sm text-right outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
                    </label>
                    <button
                        type="button"
                        disabled={!!motivo || simulando}
                        title={motivo}
                        onClick={simular}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {simulando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                        {simulando ? 'Simulando…' : 'Simular'}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {(Object.entries(faixas) as [VariavelDoEstudo, { min: number; max: number }][]).map(([v, f]) => (
                    <span key={v} className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-[6px] px-2 py-1">
                        {ROTULO_DA_VARIAVEL[v]}: {fmtNum(f.min)} a {f.max > 0 ? '+' : ''}{fmtNum(f.max)} {UNIDADE_DA_VARIAVEL[v]}
                    </span>
                ))}
            </div>

            {resultado && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <KpiCard label="Chance de VPL negativo" value={pct(resultado.probVplNegativo)} sub={`Em ${resultado.iteracoes.toLocaleString('pt-BR')} sorteios`} color={resultado.probVplNegativo > 0.2 ? 'rose' : 'emerald'} />
                        <KpiCard label="Chance de TIR abaixo da TMA" value={pct(resultado.probTirAbaixoDaTma)} sub={resultado.semTir ? `TMA de ${fmtNum(tma)}% a.a.; ${resultado.semTir} sorteios sem TIR` : `TMA de ${fmtNum(tma)}% a.a.`} color="amber" />
                        <KpiCard label="VPL (P10 · P50 · P90)" value={formatarMetrica('vpl', resultado.vpl.p50)} sub={`${formatarMetrica('vpl', resultado.vpl.p10)} · ${formatarMetrica('vpl', resultado.vpl.p90)}`} color="indigo" />
                        <KpiCard label="TIR (P10 · P50 · P90)" value={resultado.tir ? formatarMetrica('tir', resultado.tir.p50) : '—'} sub={resultado.tir ? `${formatarMetrica('tir', resultado.tir.p10)} · ${formatarMetrica('tir', resultado.tir.p90)}` : 'Nenhum sorteio com TIR'} color="blue" />
                    </div>
                    <ChartCard title="Distribuição do VPL" subtitle="Quantos sorteios caíram em cada faixa de VPL.">
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                                <BarChart data={resultado.histogramaVpl.map(h => ({ faixa: (h.de + h.ate) / 2, n: h.n, de: h.de, ate: h.ate }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid vertical={false} stroke={GRID} />
                                    <XAxis dataKey="faixa" tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} />
                                    <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        cursor={TOOLTIP_CURSOR}
                                        labelFormatter={(_l, itens) => {
                                            const p = (itens?.[0] as { payload?: { de: number; ate: number } } | undefined)?.payload;
                                            return p ? `${formatarMetrica('vpl', p.de)} a ${formatarMetrica('vpl', p.ate)}` : '';
                                        }}
                                        formatter={(v: unknown) => [String(v), 'Sorteios']}
                                    />
                                    <Bar dataKey="n" fill={SERIE_PRINCIPAL} radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartCard>
                </>
            )}
        </div>
    );
};

export default ImovibMonteCarloCard;
