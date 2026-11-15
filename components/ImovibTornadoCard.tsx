import React, { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { ImovibStudy } from '../types';
import { tornado, MetricaDoEstudo } from '../utils/imovibSensibilidade';
import { VARIAVEIS_DO_ESTUDO, ROTULO_DA_VARIAVEL, UNIDADE_DA_VARIAVEL, VariavelDoEstudo } from '../utils/imovibVariacoes';
import { ROTULO_DA_METRICA, formatarMetrica } from '../utils/imovibGraficos';
import { GraficoTornado } from './ImovibGraficos';
import { ChartCard, ChartEmpty, Legend, COR_PIORA, COR_MELHORA } from './analysis/chartKit';

// Rótulo e formato da métrica moram em utils/imovibGraficos (plano 2026-11-15, Fase 3); ficam
// reexportados aqui porque a grade, o estresse, os cenários e o Monte Carlo importam daqui.
export { ROTULO_DA_METRICA, formatarMetrica } from '../utils/imovibGraficos';


const COR_PIOR = COR_PIORA;
const COR_MELHOR = COR_MELHORA;

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
                <GraficoTornado barras={barras} metrica={metrica} choques={choques} />
            )}
        </ChartCard>
    );
};

export default ImovibTornadoCard;
