import React from 'react';
import { Landmark, PieChart } from 'lucide-react';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import { imovibService } from '../services/imovibService';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useToast } from '../hooks/useToast';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import ImovibInputRow from './ImovibInputRow';

interface ImovibCapitalFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

/**
 * Aba Capital do estudo: estrutura de capital e permutas. Nasceu da divisão de
 * "Receitas e Capital" (decisão D7 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Tudo grava ao
 * sair do campo.
 */
const ImovibCapitalForm: React.FC<ImovibCapitalFormProps> = ({ study, onDataChanged }) => {
    const D = IMOVIB_DEFAULTS;
    const { showToast } = useToast();
    const { pode, motivo } = useImovibEdicao();

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
        <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-[10px] p-6 border border-gray-200 flex flex-col">
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-[6px]">
                            <Landmark className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900">Estrutura de capital</h2>
                    </div>
                    <p className="text-slate-500 text-sm">De onde vem o dinheiro para pagar a obra do empreendimento.</p>
                </div>
                <div className="space-y-3">
                    <ImovibInputRow
                        label="Capital próprio (equity)"
                        desc="Exposição de caixa do incorporador"
                        value={study.funding_equity_percent ?? D.funding_equity_percent}
                        onCommit={(v) => salvar({ funding_equity_percent: v })}
                    />
                    <ImovibInputRow
                        label="Financiamento à produção"
                        desc="Plano empresário ou banco — percentual do custo de obra"
                        value={study.funding_debt_percent ?? D.funding_debt_percent}
                        onCommit={(v) => salvar({ funding_debt_percent: v })}
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
                        value={study.swap_financial_percent ?? D.swap_financial_percent}
                        onCommit={(v) => salvar({ swap_financial_percent: v })}
                    />
                    <ImovibInputRow
                        label="Permuta física"
                        desc="Percentual das unidades entregues ao terrenista"
                        value={study.swap_physical_percent ?? D.swap_physical_percent}
                        onCommit={(v) => salvar({ swap_physical_percent: v })}
                    />
                </div>
            </div>
        </fieldset>
    );
};

export default ImovibCapitalForm;
