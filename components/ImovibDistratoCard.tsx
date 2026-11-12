import React from 'react';
import { RotateCcw } from 'lucide-react';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import ImovibInputRow from './ImovibInputRow';
import { devolucaoPadraoDoDistrato } from '../utils/imovibMotor';

interface ImovibDistratoCardProps {
    study: ImovibStudy;
    salvar: (campos: ImovibStudyUpdate) => Promise<void>;
}

const TITULO_DEVOLUCAO = 'A Lei 13.786/2018 permite reter até 25% do que o comprador pagou, ou até 50% com patrimônio de afetação. O padrão é devolver 75%, ou 50% com patrimônio de afetação marcado em Premissas › Identificação; é hipótese: ajuste ao contrato.';

/**
 * Distrato e inadimplência (item 1.6 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Desde a Fase 1
 * nenhum dos dois desconta o VGV: o distrato cancela parte de cada safra no
 * tempo e a inadimplência reduz o que o comprador paga direto à incorporadora.
 */
const ImovibDistratoCard: React.FC<ImovibDistratoCardProps> = ({ study, salvar }) => {
    const D = IMOVIB_DEFAULTS;
    const { pode, motivo } = useImovibEdicao();
    const revende = study.cancellation_resale ?? D.cancellation_resale;

    return (
        <div className="bg-white rounded-[10px] p-6 border border-gray-200 flex flex-col">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-rose-50 text-rose-600 rounded-[6px]">
                        <RotateCcw className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Distrato e inadimplência</h2>
                </div>
                <p className="text-slate-500 text-sm">Perdas de receita, calculadas mês a mês em cada safra de vendas.</p>
            </div>

            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-3">
                <ImovibInputRow
                    label="Distrato"
                    desc="Parte de cada safra que é cancelada"
                    value={study.cancellation_rate_percent ?? D.cancellation_rate_percent} padrao={D.cancellation_rate_percent}
                    onCommit={(v) => salvar({ cancellation_rate_percent: v })}
                />
                <ImovibInputRow
                    label="Meses até o distrato"
                    desc="Contados do mês da venda"
                    value={study.cancellation_lag_months ?? D.cancellation_lag_months} padrao={D.cancellation_lag_months}
                    unidade="meses"
                    step="1"
                    onCommit={(v) => salvar({ cancellation_lag_months: v == null ? null : Math.round(v) })}
                />
                <ImovibInputRow
                    label="Devolução ao comprador"
                    desc="Do que ele já pagou"
                    title={TITULO_DEVOLUCAO}
                    value={study.cancellation_refund_percent ?? devolucaoPadraoDoDistrato(study)} padrao={devolucaoPadraoDoDistrato(study)}
                    onCommit={(v) => salvar({ cancellation_refund_percent: v })}
                />
                <label className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-[10px] border border-slate-100 cursor-pointer">
                    <span>
                        <span className="text-sm font-semibold text-slate-800 block mb-0.5">Revender a unidade distratada</span>
                        <span className="text-xs text-slate-500 block">Volta ao estoque e é vendida no mês seguinte ao distrato</span>
                    </span>
                    <input
                        type="checkbox"
                        checked={revende}
                        onChange={(e) => salvar({ cancellation_resale: e.target.checked })}
                        className="w-4 h-4 accent-indigo-600"
                    />
                </label>
                {revende && (
                    <ImovibInputRow
                        label="Deságio da revenda"
                        desc="Desconto sobre o preço original da unidade"
                        title="Sem deságio, a retenção do que o comprador pagou faz o distrato dar lucro. O padrão de 10% é hipótese: ajuste ao mercado."
                        value={study.cancellation_resale_discount_percent ?? D.cancellation_resale_discount_percent} padrao={D.cancellation_resale_discount_percent}
                        onCommit={(v) => salvar({ cancellation_resale_discount_percent: v })}
                    />
                )}
                <p className="text-xs text-slate-500">O distrato acontece no máximo nas chaves; venda feita nas chaves ou depois não distrata.</p>

                <div className="h-px bg-slate-100 my-3" />
                <ImovibInputRow
                    label="Inadimplência"
                    desc="Sobre parcelas de obra, intermediárias e pós-chaves"
                    value={study.default_rate_percent ?? D.default_rate_percent} padrao={D.default_rate_percent}
                    onCommit={(v) => salvar({ default_rate_percent: v })}
                />
            </fieldset>
        </div>
    );
};

export default ImovibDistratoCard;
