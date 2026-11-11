import React, { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { ImovibStudy } from '../types';
import { computeImovibMath } from '../utils/imovibMotor';
import { aplicarChoques, Choques, VARIAVEIS_DO_ESTUDO, ROTULO_DA_VARIAVEL, UNIDADE_DA_VARIAVEL, VariavelDoEstudo } from '../utils/imovibVariacoes';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { formatarMetrica } from './ImovibTornadoCard';

interface ImovibEstresseCardProps {
    study: ImovibStudy;
}

/** Faixa e passo do controle de cada variável. */
const FAIXA: Record<VariavelDoEstudo, { min: number; max: number; passo: number }> = {
    preco: { min: -30, max: 30, passo: 1 },
    custo_obra: { min: -30, max: 30, passo: 1 },
    terreno: { min: -30, max: 30, passo: 1 },
    velocidade_vendas: { min: -24, max: 36, passo: 1 },
    prazo_obra: { min: -12, max: 24, passo: 1 },
    juros_financiamento: { min: -6, max: 6, passo: 0.5 },
    indice_obra: { min: -0.6, max: 0.6, passo: 0.05 },
    distrato: { min: -20, max: 20, passo: 1 },
};

/**
 * Teste de estresse (item 3.6 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): uma barra por
 * premissa e atalhos para os choques mais comuns. Nada é gravado.
 */
const ImovibEstresseCard: React.FC<ImovibEstresseCardProps> = ({ study }) => {
    const D = IMOVIB_DEFAULTS;
    const [choques, setChoques] = useState<Choques>({});
    const base = useMemo(() => computeImovibMath(study), [study]);
    const cenario = useMemo(() => {
        const x = aplicarChoques(study, choques);
        return computeImovibMath(x.study, x.options);
    }, [study, choques]);

    const prazoVendas = study.sales_duration_months ?? D.sales_duration_months;
    const distrato = study.cancellation_rate_percent ?? D.cancellation_rate_percent;
    const indiceObra = study.cost_index_rate_monthly ?? study.inflation_rate ?? D.inflation_rate;
    const ATALHOS: { rotulo: string; choques: Choques }[] = [
        { rotulo: 'Obra atrasa 6 meses', choques: { prazo_obra: 6 } },
        { rotulo: 'Vendas levam o dobro do tempo', choques: { velocidade_vendas: prazoVendas } },
        { rotulo: 'Distrato dobra', choques: { distrato } },
        { rotulo: 'Índice da obra sobe 50%', choques: { indice_obra: Math.round(indiceObra * 0.5 * 10000) / 10000 } },
    ];
    const lucro = (r: typeof base) => r.monthlyFlows.reduce((a, f) => a + f.net, 0);
    const LINHAS: { rotulo: string; base: string; cenario: string; pior: boolean }[] = [
        { rotulo: 'VPL', base: formatarMetrica('vpl', base.vpl), cenario: formatarMetrica('vpl', cenario.vpl), pior: cenario.vpl < base.vpl },
        { rotulo: 'TIR', base: formatarMetrica('tir', base.annualIrr), cenario: formatarMetrica('tir', cenario.annualIrr), pior: !(cenario.annualIrr >= base.annualIrr) },
        { rotulo: 'Lucro líquido', base: formatarMetrica('vpl', lucro(base)), cenario: formatarMetrica('vpl', lucro(cenario)), pior: lucro(cenario) < lucro(base) },
        { rotulo: 'Exposição máxima', base: formatarMetrica('exposicao', base.maxExposure), cenario: formatarMetrica('exposicao', cenario.maxExposure), pior: cenario.maxExposure < base.maxExposure },
        { rotulo: 'Prazo', base: `${base.duration} meses`, cenario: `${cenario.duration} meses`, pior: cenario.duration > base.duration },
    ];
    const mexeu = Object.values(choques).some(v => v);

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-rose-500" />
                <h3 className="text-sm font-semibold text-gray-700">Teste de estresse</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">Mova as premissas e veja o resultado ao lado do estudo. Simulação: nada é gravado.</p>

            <div className="flex flex-wrap gap-2 mb-4">
                {ATALHOS.map(a => (
                    <button
                        key={a.rotulo}
                        type="button"
                        onClick={() => setChoques(prev => {
                            const novo: Choques = { ...prev };
                            for (const [v, d] of Object.entries(a.choques) as [VariavelDoEstudo, number][]) novo[v] = (prev[v] ?? 0) + d;
                            return novo;
                        })}
                        className="h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50"
                    >
                        {a.rotulo}
                    </button>
                ))}
                <button
                    type="button"
                    disabled={!mexeu}
                    title={mexeu ? undefined : 'Nenhuma premissa foi mexida.'}
                    onClick={() => setChoques({})}
                    className="h-9 px-3.5 text-[13px] font-medium rounded-[6px] text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Restaurar base
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                    {VARIAVEIS_DO_ESTUDO.map(v => {
                        const f = FAIXA[v];
                        const valor = choques[v] ?? 0;
                        return (
                            <div key={v}>
                                <div className="flex justify-between mb-1">
                                    <label htmlFor={`imovib-estresse-${v}`} className="text-xs font-semibold text-slate-500">{ROTULO_DA_VARIAVEL[v]}</label>
                                    <span className="text-xs font-medium text-slate-700">{valor > 0 ? '+' : ''}{valor.toLocaleString('pt-BR')} {UNIDADE_DA_VARIAVEL[v]}</span>
                                </div>
                                <input
                                    id={`imovib-estresse-${v}`}
                                    type="range"
                                    min={f.min}
                                    max={f.max}
                                    step={f.passo}
                                    value={Math.min(f.max, Math.max(f.min, valor))}
                                    onChange={(e) => setChoques(prev => ({ ...prev, [v]: Number(e.target.value) }))}
                                    className="w-full accent-indigo-600"
                                />
                            </div>
                        );
                    })}
                </div>
                <table className="w-full text-sm border-collapse self-start">
                    <thead>
                        <tr className="border-b border-gray-200 text-xs font-semibold text-gray-700">
                            <th className="px-3 py-2 text-left">Indicador</th>
                            <th className="px-3 py-2 text-right">Estudo</th>
                            <th className="px-3 py-2 text-right">Com os choques</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {LINHAS.map(l => (
                            <tr key={l.rotulo}>
                                <td className="px-3 py-2 text-gray-700">{l.rotulo}</td>
                                <td className="px-3 py-2 text-right text-gray-800">{l.base}</td>
                                <td className={`px-3 py-2 text-right font-medium ${!mexeu ? 'text-gray-800' : l.pior ? 'text-red-700' : 'text-emerald-700'}`}>{l.cenario}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ImovibEstresseCard;
