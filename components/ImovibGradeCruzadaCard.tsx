import React, { useMemo, useState } from 'react';
import { Grid3x3 } from 'lucide-react';
import { ImovibStudy } from '../types';
import { gradeCruzada, MetricaDoEstudo } from '../utils/imovibSensibilidade';
import { VARIAVEIS_DO_ESTUDO, ROTULO_DA_VARIAVEL, UNIDADE_DA_VARIAVEL, VariavelDoEstudo } from '../utils/imovibVariacoes';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { ROTULO_DA_METRICA, formatarMetrica } from './ImovibTornadoCard';

interface ImovibGradeCruzadaCardProps {
    study: ImovibStudy;
    choques: Record<VariavelDoEstudo, number>;
}

/** Passos da grade: −2, −1, 0, +1, +2 vezes o choque da variável. */
const PASSOS = [-2, -1, 0, 1, 2];

const SELECT = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer';

/**
 * Grade cruzada 5 × 5 de duas premissas (item 3.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Cada eixo vai de
 * −2 a +2 vezes o choque da variável (os mesmos choques do tornado).
 */
const ImovibGradeCruzadaCard: React.FC<ImovibGradeCruzadaCardProps> = ({ study, choques }) => {
    const [eixoX, setEixoX] = useState<VariavelDoEstudo>('preco');
    const [eixoY, setEixoY] = useState<VariavelDoEstudo>('custo_obra');
    const [metrica, setMetrica] = useState<MetricaDoEstudo>('vpl');
    const deltasX = PASSOS.map(p => p * choques[eixoX]);
    const deltasY = PASSOS.map(p => p * choques[eixoY]);
    const grade = useMemo(
        () => gradeCruzada(study, { variavel: eixoX, deltas: deltasX }, { variavel: eixoY, deltas: deltasY }, metrica),
        // deltas derivam de choques e dos eixos
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [study, eixoX, eixoY, metrica, choques],
    );
    const tma = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    /** Célula que não paga a TMA (TIR abaixo dela, VPL ou margem negativos). */
    const ruim = (v: number) => !Number.isFinite(v) || (metrica === 'tir' ? v < tma : metrica === 'exposicao' ? false : v < 0);
    const delta = (v: VariavelDoEstudo, d: number) => (d === 0 ? 'Base' : `${d > 0 ? '+' : ''}${d.toLocaleString('pt-BR')} ${UNIDADE_DA_VARIAVEL[v]}`);

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <Grid3x3 className="w-4 h-4 text-indigo-500" />
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700">Grade cruzada</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Duas premissas variando juntas. Em vermelho, o que não paga a TMA de {tma.toLocaleString('pt-BR')}% a.a.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Variável das colunas" value={eixoX} onChange={(e) => setEixoX(e.target.value as VariavelDoEstudo)} className={SELECT}>
                        {VARIAVEIS_DO_ESTUDO.map(v => <option key={v} value={v}>Colunas: {ROTULO_DA_VARIAVEL[v]}</option>)}
                    </select>
                    <select aria-label="Variável das linhas" value={eixoY} onChange={(e) => setEixoY(e.target.value as VariavelDoEstudo)} className={SELECT}>
                        {VARIAVEIS_DO_ESTUDO.map(v => <option key={v} value={v}>Linhas: {ROTULO_DA_VARIAVEL[v]}</option>)}
                    </select>
                    <select aria-label="Métrica da grade" value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaDoEstudo)} className={SELECT}>
                        {(Object.keys(ROTULO_DA_METRICA) as MetricaDoEstudo[]).map(m => <option key={m} value={m}>{ROTULO_DA_METRICA[m]}</option>)}
                    </select>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-gray-200 text-xs font-semibold text-gray-700">
                            <th className="px-3 py-2 text-left whitespace-nowrap">{ROTULO_DA_VARIAVEL[eixoY]} ↓ · {ROTULO_DA_VARIAVEL[eixoX]} →</th>
                            {deltasX.map((d, j) => <th key={j} className="px-3 py-2 text-right whitespace-nowrap">{delta(eixoX, d)}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {grade.map((linha, i) => (
                            <tr key={i}>
                                <th scope="row" className="px-3 py-2 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">{delta(eixoY, deltasY[i])}</th>
                                {linha.map((v, j) => {
                                    const centro = i === 2 && j === 2;
                                    return (
                                        <td
                                            key={j}
                                            className={`px-3 py-2 text-right whitespace-nowrap ${ruim(v) ? 'text-red-700 bg-red-50' : 'text-gray-800'} ${centro ? 'font-semibold ring-2 ring-inset ring-indigo-300' : ''}`}
                                            title={centro ? 'Cenário base (o estudo como está)' : undefined}
                                        >
                                            {formatarMetrica(metrica, v)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ImovibGradeCruzadaCard;
