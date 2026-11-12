import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, Info } from 'lucide-react';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import { HIPOTESES_TRIBUTARIAS, IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { empreendimentoService } from '../services/empreendimentoService';
import { companyService } from '../services/companyService';
import { RegimeTributarioDoEstudo, ROTULO_DO_REGIME, hipotesesDoEstudo } from '../utils/imovibTributos';
import { compararRegimes, LinhaDaComparacao } from '../utils/imovibComparacaoDeRegimes';
import { computeImovibMath } from '../utils/imovibMotor';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ImovibInputRow from './ImovibInputRow';

interface ImovibRegimeTributarioCardProps {
    study: ImovibStudy;
    onSalvar: (campos: ImovibStudyUpdate) => Promise<void>;
}

type ChaveDaHipotese = keyof typeof HIPOTESES_TRIBUTARIAS;
const ROTULO_DA_HIPOTESE: Record<ChaveDaHipotese, [string, string]> = {
    retPct: ['RET', '% da receita'],
    retHisPct: ['RET de interesse social', '% da receita'],
    presumidoPct: ['Lucro presumido', 'IRPJ + CSLL + PIS + Cofins, % da receita'],
    realPisCofinsPct: ['Lucro real: PIS e Cofins', '% da receita'],
    realCreditoSobreCustoPct: ['Lucro real: crédito de PIS e Cofins', '% do custo'],
    realIrCsPct: ['Lucro real: IRPJ e CSLL', '% do lucro de cada ano'],
};

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtPct = (v: number | null, casas = 2) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`);
const fmtTir = (v: number) => (Number.isFinite(v) ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.a.` : '—');

const COLUNAS: StandardTableColumn[] = [
    { key: 'regime', label: 'Regime', width: 280 },
    { key: 'imposto', label: 'Imposto', width: 150, align: 'right' },
    { key: 'aliquota', label: 'Alíquota efetiva', width: 140, align: 'right' },
    { key: 'vpl', label: 'VPL', width: 150, align: 'right' },
    { key: 'tir', label: 'TIR', width: 130, align: 'right' },
    { key: 'margem', label: 'Margem', width: 110, align: 'right' },
];

/** Regime sugerido: patrimônio de afetação → RET; senão, o regime da empresa dona do empreendimento. */
function regimeSugerido(afetacao: boolean, regimeDaEmpresa?: string | null): RegimeTributarioDoEstudo | null {
    if (afetacao) return 'ret';
    if (regimeDaEmpresa === 'lucro_presumido') return 'presumido';
    if (regimeDaEmpresa === 'lucro_real') return 'real';
    return null;
}

/**
 * Regime tributário do estudo e a comparação entre os regimes (item 6.3 do
 * plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, decisão D4:
 * alíquotas são hipóteses editáveis, a confirmar com a contabilidade).
 */
const ImovibRegimeTributarioCard: React.FC<ImovibRegimeTributarioCardProps> = ({ study, onSalvar }) => {
    const { pode, motivo } = useImovibEdicao();
    const regime = (study.tax_regime ?? IMOVIB_DEFAULTS.tax_regime) as RegimeTributarioDoEstudo;
    const h = hipotesesDoEstudo(study);
    const comparacao = useMemo(() => compararRegimes(study), [study]);
    const foraDoCalculo = useMemo(() => computeImovibMath(study).impostosForaDoCalculo, [study]);

    // Sugestão pela empresa do empreendimento vinculado — só lê, não grava.
    const empId = study.estrutura?.origem === 'empreendimento' ? study.estrutura.empreendimento_id : undefined;
    const afetacaoInformada = study.patrimonio_afetacao ?? null;
    const [sugestao, setSugestao] = useState<{ regime: RegimeTributarioDoEstudo; empresa: string; porque: string } | null>(null);
    useEffect(() => {
        if (!empId) { setSugestao(null); return; }
        let vivo = true;
        (async () => {
            const emp = await empreendimentoService.getById(empId);
            if (!emp?.company_id) return null;
            const [empresa, incorporacao] = await Promise.all([companyService.get(emp.company_id), companyService.getIncorporacao(emp.company_id)]);
            // A afetação marcada no estudo vale mais que o tipo cadastrado na empresa.
            const afetacaoDoEstudo = afetacaoInformada;
            const afetacao = afetacaoDoEstudo ?? incorporacao?.tipo_spe === 'patrimonio_afetacao';
            const r = regimeSugerido(afetacao, empresa?.regime_tributario);
            if (!r) return null;
            return {
                regime: r,
                empresa: empresa?.nome_fantasia || empresa?.razao_social || 'a empresa do empreendimento',
                porque: r === 'ret' ? (afetacaoDoEstudo ? 'o estudo tem patrimônio de afetação' : 'tem patrimônio de afetação') : `está no ${r === 'presumido' ? 'lucro presumido' : 'lucro real'}`,
            };
        })()
            .then(s => { if (vivo) setSugestao(s); })
            .catch(() => { if (vivo) setSugestao(null); });
        return () => { vivo = false; };
    }, [empId, afetacaoInformada]);

    const salvarHipotese = (k: ChaveDaHipotese, v: number | null) => {
        const atual = { ...(study.tax_hypotheses ?? {}) };
        if (v == null) delete atual[k];
        else atual[k] = Math.max(0, v);
        void onSalvar({ tax_hypotheses: Object.keys(atual).length ? atual : null });
    };
    // Só as alíquotas do regime escolhido (no manual, nenhuma).
    const visiveis: ChaveDaHipotese[] = regime === 'ret' ? ['retPct'] : regime === 'ret_his' ? ['retHisPct'] : regime === 'presumido' ? ['presumidoPct']
        : regime === 'real' ? ['realPisCofinsPct', 'realCreditoSobreCustoPct', 'realIrCsPct'] : [];

    return (
        <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-regime-titulo">
            <div>
                <h2 id="imovib-regime-titulo" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Landmark className="w-5 h-5 text-indigo-500" />
                    Regime tributário
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                    Fora do manual, o imposto é calculado pelo regime e as rubricas de "7. Impostos" e o imposto da Dinâmica ficam fora do cálculo.
                </p>
            </div>

            <div className="flex items-start gap-2 rounded-[10px] bg-sky-50 border border-sky-200 px-3 py-2 text-sm text-sky-900">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                As alíquotas são hipóteses: confirme com a contabilidade. O lucro real é uma estimativa (crédito de PIS e Cofins sobre o custo; IRPJ e CSLL sobre o lucro de cada ano, compensando o prejuízo acumulado).
            </div>

            {foraDoCalculo.length > 0 && (
                <p className="text-sm text-slate-700">Fora do cálculo neste regime: {foraDoCalculo.join(', ')}.</p>
            )}

            {sugestao && sugestao.regime !== regime && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    <span>Sugestão: {ROTULO_DO_REGIME[sugestao.regime]} — {sugestao.porque.startsWith('o estudo') ? sugestao.porque : `${sugestao.empresa} ${sugestao.porque}`}.</span>
                    <button
                        type="button"
                        disabled={!pode}
                        title={!pode ? motivo : undefined}
                        onClick={() => void onSalvar({ tax_regime: sugestao.regime })}
                        className="h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Usar a sugestão
                    </button>
                </div>
            )}

            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-3">
                <div className="max-w-md">
                    <label htmlFor="imovib-regime" className="block text-xs font-semibold text-slate-500 mb-1.5">Regime</label>
                    <select
                        id="imovib-regime"
                        value={regime}
                        onChange={e => { if (e.target.value !== regime) void onSalvar({ tax_regime: e.target.value as RegimeTributarioDoEstudo }); }}
                        className="h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                    >
                        {(Object.keys(ROTULO_DO_REGIME) as RegimeTributarioDoEstudo[]).map(r => <option key={r} value={r}>{ROTULO_DO_REGIME[r]}</option>)}
                    </select>
                </div>
                {visiveis.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        {visiveis.map(k => (
                            <ImovibInputRow
                                key={k}
                                label={ROTULO_DA_HIPOTESE[k][0]}
                                desc={ROTULO_DA_HIPOTESE[k][1]}
                                value={h[k]}
                                padrao={HIPOTESES_TRIBUTARIAS[k]}
                                onCommit={(v) => salvarHipotese(k, v)}
                            />
                        ))}
                    </div>
                )}
            </fieldset>

            <StandardTable<LinhaDaComparacao>
                storageKey="imovib:regimes"
                columns={COLUNAS}
                rows={comparacao}
                rowKey={l => l.regime}
                dense
                bare
                rowClassName={l => (l.regime === regime ? 'bg-indigo-50/60' : '')}
                renderCell={(k, l) => {
                    switch (k) {
                        case 'regime': return (
                            <span className="text-sm text-gray-800">
                                {ROTULO_DO_REGIME[l.regime]}{l.regime === regime && <span className="text-indigo-700 font-medium"> · escolhido</span>}
                            </span>
                        );
                        case 'imposto': return <span className="text-sm text-gray-700">{fmtBRL(l.impostoTotal)}</span>;
                        case 'aliquota': return <span className="text-sm text-gray-700">{fmtPct(l.aliquotaEfetiva)}</span>;
                        case 'vpl': return <span className="text-sm text-gray-700">{fmtBRL(l.vpl)}</span>;
                        case 'tir': return <span className="text-sm text-gray-700">{fmtTir(l.tir)}</span>;
                        case 'margem': return <span className="text-sm text-gray-700">{fmtPct(l.margem, 1)}</span>;
                        default: return null;
                    }
                }}
                empty={{ title: 'Sem dados para comparar' }}
            />
        </section>
    );
};

export default ImovibRegimeTributarioCard;
