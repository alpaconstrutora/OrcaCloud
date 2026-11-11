import React, { useEffect, useState } from 'react';
import { DollarSign, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import ImovibInputRow from './ImovibInputRow';

interface ImovibPerfilDeRecebimentoCardProps {
    study: ImovibStudy;
    salvar: (campos: ImovibStudyUpdate) => Promise<void>;
}

type Parcela = 'revenue_downpayment_percent' | 'revenue_construction_percent' | 'revenue_intermediate_percent' | 'revenue_handover_percent' | 'revenue_post_handover_percent';

const PARCELAS: { campo: Parcela; rotulo: string; desc: string }[] = [
    { campo: 'revenue_downpayment_percent', rotulo: 'Sinal / ato', desc: 'Pago no mês da venda' },
    { campo: 'revenue_construction_percent', rotulo: 'Parcelas de obra', desc: 'Mensais, do mês seguinte à venda até as chaves' },
    { campo: 'revenue_intermediate_percent', rotulo: 'Intermediárias', desc: 'Anuais ou semestrais até as chaves' },
    { campo: 'revenue_handover_percent', rotulo: 'Repasse bancário / chaves', desc: 'Financiamento do comprador, pago nas chaves' },
    { campo: 'revenue_post_handover_percent', rotulo: 'Pós-chaves', desc: 'Financiamento direto com a incorporadora' },
];

/**
 * Perfil de recebimento de cada safra de vendas (item 1.6 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). O motor aplica
 * este perfil a cada mês de venda (utils/imovibRecebimento.ts).
 */
const ImovibPerfilDeRecebimentoCard: React.FC<ImovibPerfilDeRecebimentoCardProps> = ({ study, salvar }) => {
    const D = IMOVIB_DEFAULTS;
    const { pode, motivo } = useImovibEdicao();
    const gravado = (c: Parcela) => study[c] ?? D[c];

    // Valores em edição, para a soma acompanhar a digitação antes de gravar.
    const [valores, setValores] = useState<Record<Parcela, number>>(() =>
        Object.fromEntries(PARCELAS.map(p => [p.campo, gravado(p.campo)])) as Record<Parcela, number>);
    useEffect(() => {
        setValores(Object.fromEntries(PARCELAS.map(p => [p.campo, gravado(p.campo)])) as Record<Parcela, number>);
    }, [study]);

    const total = Number(PARCELAS.reduce((a, p) => a + (valores[p.campo] || 0), 0).toFixed(2));
    const fechaCem = total === 100;
    const comIntermediarias = (valores.revenue_intermediate_percent || 0) > 0;
    const comPosChaves = (valores.revenue_post_handover_percent || 0) > 0;

    return (
        <div className="bg-white rounded-[10px] p-6 border border-gray-200 flex flex-col">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-[6px]">
                        <DollarSign className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Perfil de recebimento</h2>
                </div>
                <p className="text-slate-500 text-sm">Como cada venda é paga. As cinco parcelas somam 100% do valor vendido.</p>
            </div>

            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-3">
                {PARCELAS.map(p => (
                    <ImovibInputRow
                        key={p.campo}
                        label={p.rotulo}
                        desc={p.desc}
                        value={valores[p.campo]}
                        onChange={(v) => setValores(prev => ({ ...prev, [p.campo]: v }))}
                        onCommit={(v) => salvar({ [p.campo]: v } as ImovibStudyUpdate)}
                    />
                ))}

                <div className={`p-4 rounded-[10px] flex items-center justify-between border ${fechaCem ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <div className="flex items-center gap-2">
                        {fechaCem ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                        <span className="text-sm font-semibold">Total do valor vendido</span>
                    </div>
                    <span className="font-semibold text-lg">{total}%</span>
                </div>

                {(comIntermediarias || comPosChaves) && <div className="h-px bg-slate-100 my-3" />}
                {comIntermediarias && (
                    <ImovibInputRow
                        label="Intervalo das intermediárias"
                        desc="Meses entre uma intermediária e a seguinte, contados da venda"
                        value={study.revenue_intermediate_interval_months ?? D.revenue_intermediate_interval_months}
                        unidade="meses"
                        step="1"
                        onCommit={(v) => salvar({ revenue_intermediate_interval_months: Math.round(v) })}
                    />
                )}
                {comPosChaves && (
                    <>
                        <ImovibInputRow
                            label="Prazo do pós-chaves"
                            value={study.post_handover_months ?? D.post_handover_months}
                            unidade="meses"
                            step="1"
                            onCommit={(v) => salvar({ post_handover_months: Math.round(v) })}
                        />
                        <ImovibInputRow
                            label="Juro do pós-chaves"
                            desc="Parcela fixa (Price)"
                            value={study.post_handover_rate_monthly ?? D.post_handover_rate_monthly}
                            unidade="% a.m."
                            onCommit={(v) => salvar({ post_handover_rate_monthly: v })}
                        />
                    </>
                )}
                <ImovibInputRow
                    label="Atraso do repasse"
                    desc="Meses entre as chaves e o dinheiro do banco"
                    value={study.handover_delay_months ?? D.handover_delay_months}
                    unidade="meses"
                    step="1"
                    onCommit={(v) => salvar({ handover_delay_months: Math.round(v) })}
                />
            </fieldset>
        </div>
    );
};

export default ImovibPerfilDeRecebimentoCard;
