import React from 'react';
import { Landmark, PieChart, Wallet } from 'lucide-react';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import { imovibService } from '../services/imovibService';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useToast } from '../hooks/useToast';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useImovibMath } from '../hooks/useImovibMath';
import { calcularIndicadores } from '../utils/imovibIndicadores';
import {
    composicaoDoCapital, ROTULO_DO_CAPITAL, ROTULO_DOS_JUROS_NA_OBRA, ROTULO_DA_AMORTIZACAO, COR_DO_CAPITAL,
    ChaveDoCapital, PremissasDoFinanciamento,
} from '../utils/imovibFinanciamento';
import { KpiCard } from './ui/KpiCard';
import { Legend } from './analysis/chartKit';
import ImovibInputRow from './ImovibInputRow';
import ImovibFontesCard from './ImovibFontesCard';
import ImovibAportesCard from './ImovibAportesCard';
import ImovibSociosCard from './ImovibSociosCard';

interface ImovibCapitalFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const COR_DO_KPI: Record<ChaveDoCapital, 'indigo' | 'cyan' | 'violet' | 'amber' | 'emerald'> = {
    proprio: 'indigo', divida: 'cyan', vendasNaObra: 'violet', permuta: 'amber', terceiros: 'emerald',
};

/** Linha "rótulo + lista de escolha" no mesmo desenho de ImovibInputRow. */
function ImovibSelectRow<T extends string>({ id, label, desc, value, opcoes, onCommit }: {
    id: string; label: string; desc?: string; value: T; opcoes: Record<T, string>; onCommit: (v: T) => void;
}) {
    return (
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[10px] border border-slate-100 hover:border-slate-300 transition-colors">
            <div className="flex-1 pr-4">
                {/* Mesmo desenho do ImovibInputRow: título da linha em <span>, não rótulo de campo (§21). */}
                <span id={`${id}-titulo`} className="text-sm font-semibold text-slate-800 block mb-0.5">{label}</span>
                {desc && <span className="text-xs text-slate-500 block">{desc}</span>}
            </div>
            <select
                id={id}
                aria-labelledby={`${id}-titulo`}
                value={value}
                onChange={e => { if (e.target.value !== value) onCommit(e.target.value as T); }}
                className="w-48 shrink-0 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
            >
                {(Object.keys(opcoes) as T[]).map(k => <option key={k} value={k}>{opcoes[k]}</option>)}
            </select>
        </div>
    );
}

/**
 * Aba Capital do estudo (decisão D7 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Fase 4: de onde
 * vem o dinheiro (calculado, D2), regras do financiamento à produção (4.1),
 * permutas, outras fontes (4.4) e aportes e distribuições (4.3). Os campos gravam
 * ao sair; os números vêm do motor.
 */
const ImovibCapitalForm: React.FC<ImovibCapitalFormProps> = ({ study, onDataChanged }) => {
    const D = IMOVIB_DEFAULTS;
    const { showToast } = useToast();
    const { pode, motivo } = useImovibEdicao();
    const r = useImovibMath(study);
    const composicao = composicaoDoCapital(r.capital);
    const mesDaExposicao = calcularIndicadores(r, study.discount_rate ?? D.discount_rate).mesDaExposicaoMaxima;
    const taxa = study.financing_rate_annual ?? D.financing_rate_annual;

    const salvar = async (campos: ImovibStudyUpdate) => {
        try {
            await imovibService.updateStudy(study.id, campos);
            onDataChanged();
        } catch (e) {
            console.error('Falha ao salvar a estrutura de capital', campos, e);
            showToast(`Erro ao salvar a estrutura de capital: ${(e as Error).message}`, 'error');
        }
    };

    return (
        <div className="space-y-6">
            <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-capital-composicao">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-[6px]">
                        <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 id="imovib-capital-composicao" className="text-lg font-semibold text-gray-900">De onde vem o dinheiro</h2>
                        <p className="text-slate-500 text-sm">
                            Calculado pelo fluxo de caixa. O capital próprio necessário é a maior exposição de caixa do incorporador
                            {mesDaExposicao != null ? ` (mês ${mesDaExposicao})` : ''}; o resto é o que o banco libera, o que os compradores pagam até as chaves (sem o repasse), a permuta e as outras fontes.
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                    {composicao.map(c => (
                        <KpiCard
                            key={c.chave}
                            label={ROTULO_DO_CAPITAL[c.chave]}
                            value={fmtBRL(c.valor)}
                            sub={`${fmtPct(c.pct)} do total`}
                            color={COR_DO_KPI[c.chave]}
                        />
                    ))}
                </div>
                {composicao.some(c => c.pct > 0) && (
                    <div className="space-y-2">
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100" role="img"
                            aria-label={composicao.map(c => `${ROTULO_DO_CAPITAL[c.chave]}: ${fmtPct(c.pct)}`).join('; ')}>
                            {composicao.filter(c => c.pct > 0).map(c => (
                                <div key={c.chave} style={{ width: `${c.pct}%`, backgroundColor: COR_DO_CAPITAL[c.chave] }} title={`${ROTULO_DO_CAPITAL[c.chave]}: ${fmtPct(c.pct)}`} />
                            ))}
                        </div>
                        <Legend items={composicao.map(c => ({ label: ROTULO_DO_CAPITAL[c.chave], color: COR_DO_CAPITAL[c.chave] }))} />
                    </div>
                )}
            </section>

            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-[10px] p-6 border border-gray-200 flex flex-col">
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-[6px]">
                                <Landmark className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-semibold text-gray-900">Financiamento à produção</h2>
                        </div>
                        <p className="text-slate-500 text-sm">
                            Plano empresário ou banco. Juros de {taxa.toLocaleString('pt-BR')}% a.a., definidos na aba Dinâmica.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <ImovibInputRow
                            label="Financiamento à produção"
                            desc="Percentual do custo de obra"
                            value={study.funding_debt_percent ?? D.funding_debt_percent}
                            onCommit={(v) => salvar({ funding_debt_percent: v ?? 0 })}
                        />
                        <ImovibInputRow
                            label="Defasagem da liberação"
                            desc="Meses entre a medição da obra e o dinheiro do banco"
                            unidade="meses" step="1"
                            value={study.financing_release_lag_months ?? D.financing_release_lag_months} padrao={D.financing_release_lag_months}
                            onCommit={(v) => salvar({ financing_release_lag_months: v == null ? null : Math.max(0, Math.round(v)) })}
                        />
                        <ImovibInputRow
                            label="Vendas mínimas para liberar"
                            desc="% do VGV vendável vendido antes da 1ª liberação; o que ficou retido é liberado de uma vez"
                            value={study.financing_min_sales_percent ?? D.financing_min_sales_percent} padrao={D.financing_min_sales_percent}
                            onCommit={(v) => salvar({ financing_min_sales_percent: v })}
                        />
                        <ImovibSelectRow<PremissasDoFinanciamento['jurosNaObra']>
                            id="imovib-capital-juros"
                            label="Juros na obra"
                            desc="Somam ao saldo devedor ou saem do caixa todo mês"
                            value={study.financing_interest_mode ?? D.financing_interest_mode}
                            opcoes={ROTULO_DOS_JUROS_NA_OBRA}
                            onCommit={(v) => salvar({ financing_interest_mode: v })}
                        />
                        <ImovibSelectRow<PremissasDoFinanciamento['amortizaCom']>
                            id="imovib-capital-amortizacao"
                            label="O que amortiza o saldo"
                            desc="Saldo que sobra no fim do estudo é quitado com capital próprio"
                            value={study.financing_amortization ?? D.financing_amortization}
                            opcoes={ROTULO_DA_AMORTIZACAO}
                            onCommit={(v) => salvar({ financing_amortization: v })}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-[10px] p-6 border border-gray-200 flex flex-col">
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-slate-50 text-slate-500 rounded-[6px]">
                                <PieChart className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-semibold text-gray-900">Permutas</h2>
                        </div>
                        <p className="text-slate-500 text-sm">Compromissos assumidos em troca do terreno.</p>
                    </div>
                    <div className="space-y-3">
                        <ImovibInputRow
                            label="Permuta financeira"
                            desc="Percentual do VGV que fica com o terrenista"
                            value={study.swap_financial_percent ?? D.swap_financial_percent} padrao={D.swap_financial_percent}
                            onCommit={(v) => salvar({ swap_financial_percent: v })}
                        />
                        <ImovibInputRow
                            label="Permuta física"
                            desc="Percentual das unidades entregues ao terrenista"
                            value={study.swap_physical_percent ?? D.swap_physical_percent} padrao={D.swap_physical_percent}
                            onCommit={(v) => salvar({ swap_physical_percent: v })}
                        />
                    </div>
                </div>
            </fieldset>

            <ImovibFontesCard study={study} onDataChanged={onDataChanged} />
            <ImovibAportesCard study={study} resultado={r} onSalvar={salvar} />
            <ImovibSociosCard study={study} resultado={r} />
        </div>
    );
};

export default ImovibCapitalForm;
