import React, { useState } from 'react';
import { Wrench, Plus, Loader2 } from 'lucide-react';
import { ImovibStudy, ImovibStudyUpdate, ImovibCapexItem } from '../types';
import { imovibService } from '../services/imovibService';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import ImovibInputRow from './ImovibInputRow';

interface ImovibPosObraCardProps {
    study: ImovibStudy;
    items: ImovibCapexItem[];
    onItems: (items: ImovibCapexItem[]) => void;
    onSalvar: (campos: ImovibStudyUpdate) => Promise<void>;
}

const POS_OBRA = ['Assistência técnica', 'Manutenção e garantia'];

/**
 * Pós-obra e estoque (item 5.6 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): rubricas de
 * pós-obra por botão (nunca ao abrir) e o custo mensal das unidades em estoque
 * depois da obra.
 */
const ImovibPosObraCard: React.FC<ImovibPosObraCardProps> = ({ study, items, onItems, onSalvar }) => {
    const D = IMOVIB_DEFAULTS;
    const { pode, motivo } = useImovibEdicao();
    const { showToast } = useToast();
    const [criando, setCriando] = useState(false);
    const faltam = POS_OBRA.filter(n => !items.some(i => i.category === '10. Pós-obra' && i.name === n));
    const motivoBotao = !pode ? motivo : faltam.length === 0 ? 'As rubricas de pós-obra já existem em "10. Pós-obra".' : undefined;

    const criar = async () => {
        setCriando(true);
        try {
            onItems(await imovibService.adicionarRubricasPosObra(study.id));
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setCriando(false);
        }
    };

    return (
        <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-posobra-titulo">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="imovib-posobra-titulo" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-indigo-500" />
                        Pós-obra e estoque
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Assistência técnica e garantia saem depois do habite-se; unidades sem vender pagam condomínio e IPTU.</p>
                </div>
                <button
                    type="button"
                    onClick={() => void criar()}
                    disabled={!!motivoBotao || criando}
                    title={motivoBotao ?? 'Cria "Assistência técnica" (% da obra) e "Manutenção e garantia" (R$) em "10. Pós-obra", com valor 0 e saída nos 12 meses depois da obra.'}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {criando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Plus className="w-[15px] h-[15px]" />}
                    Adicionar rubricas de pós-obra
                </button>
            </div>
            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 max-w-xl">
                <ImovibInputRow
                    label="Custo do estoque"
                    desc="Condomínio e IPTU por unidade em estoque, por mês, depois do fim da obra"
                    unidade="R$" step="1"
                    value={study.stock_carrying_cost_unit_month ?? D.stock_carrying_cost_unit_month} padrao={D.stock_carrying_cost_unit_month}
                    onCommit={(v) => onSalvar({ stock_carrying_cost_unit_month: v == null ? null : Math.max(0, v) })}
                />
            </fieldset>
        </section>
    );
};

export default ImovibPosObraCard;
