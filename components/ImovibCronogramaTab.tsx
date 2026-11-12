import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import { ImovibStudy } from '../types';
import { useImovibMath } from '../hooks/useImovibMath';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { empreendimentoService } from '../services/empreendimentoService';
import { marcosDoEstudo, nomeDoMes, mesDaData } from '../utils/imovibCronograma';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

interface ImovibCronogramaTabProps {
    study: ImovibStudy;
    /** Formulário de Premissas: os campos gravam com "Salvar Premissas". */
    formData: Partial<ImovibStudy>;
    setCampo: (campo: keyof ImovibStudy, valor: unknown) => void;
}

const CAMPO = 'h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';

/**
 * Sub-aba Cronograma de Premissas (item 5.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): linha do tempo dos
 * marcos e os três marcos que só existem aqui (aquisição, aprovação, registro). Os
 * prazos da obra e das vendas continuam na Dinâmica. Sem data-base, "Mês N".
 */
const ImovibCronogramaTab: React.FC<ImovibCronogramaTabProps> = ({ study, formData, setCampo }) => {
    const { pode, motivo } = useImovibEdicao();
    // O que está no formulário, ainda não gravado, já aparece na linha do tempo.
    const estudo = useMemo(() => ({ ...study, ...formData }) as ImovibStudy, [study, formData]);
    const r = useImovibMath(estudo);
    const marcos = marcosDoEstudo(estudo, r);
    const avisos = r.avisos.filter(a => a.codigo === 'lancamento_antes_do_registro' || a.codigo === 'obra_antes_da_aprovacao');

    // Datas do empreendimento vinculado — só leitura; o botão preenche o formulário.
    const empId = study.estrutura?.origem === 'empreendimento' ? study.estrutura.empreendimento_id : undefined;
    const [datasDoEmp, setDatasDoEmp] = useState<{ lancamento?: string | null; entrega?: string | null } | null>(null);
    useEffect(() => {
        if (!empId) { setDatasDoEmp(null); return; }
        let vivo = true;
        empreendimentoService.getById(empId)
            .then(e => { if (vivo) setDatasDoEmp({ lancamento: e?.launch_date ?? null, entrega: e?.expected_delivery_date ?? null }); })
            .catch(() => { if (vivo) setDatasDoEmp(null); });
        return () => { vivo = false; };
    }, [empId]);

    const D = IMOVIB_DEFAULTS;
    const inicioObra = Number(estudo.construction_start_month ?? D.construction_start_month);
    const mesLancamento = mesDaData(estudo.base_date, datasDoEmp?.lancamento);
    const mesEntrega = mesDaData(estudo.base_date, datasDoEmp?.entrega);
    const motivoDatas = !pode ? motivo
        : !empId ? 'Vincule um empreendimento em Identificação para usar as datas dele.'
            : !estudo.base_date ? 'Preencha a data-base em Identificação: sem ela não dá para converter datas em meses.'
                : !datasDoEmp?.lancamento && !datasDoEmp?.entrega ? 'O empreendimento não tem data de lançamento nem de entrega.'
                    : (mesLancamento != null && mesLancamento < 1) || (mesEntrega != null && mesEntrega < 1) ? 'As datas do empreendimento são anteriores à data-base do estudo.'
                        : mesEntrega != null && mesEntrega < inicioObra ? `A entrega (mês ${mesEntrega}) vem antes do início da obra (mês ${inicioObra}).`
                            : undefined;
    const usarDatas = () => {
        if (motivoDatas) return;
        if (mesLancamento != null) setCampo('sales_start_month', mesLancamento);
        if (mesEntrega != null) setCampo('construction_duration_months', mesEntrega - inicioObra + 1);
    };

    const campoMes = (rotulo: string, campo: 'acquisition_month' | 'approval_month' | 'incorporation_registry_month', padrao?: number) => (
        <div>
            <label htmlFor={`imovib-${campo}`} className="block text-xs font-semibold text-slate-500 mb-1.5">{rotulo}</label>
            <input
                id={`imovib-${campo}`}
                type="number" min="1" step="1"
                value={(formData[campo] as number | null | undefined) ?? ''}
                placeholder={padrao != null ? `Vazio = mês ${padrao}` : 'Sem marco'}
                onChange={e => setCampo(campo, e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value))))}
                className={CAMPO}
            />
        </div>
    );

    return (
        <div className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <CalendarClock className="w-5 h-5 text-indigo-500" />
                        Módulo 2 — Cronograma e marcos
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Início e prazo da obra e das vendas ficam na aba Dinâmica. {estudo.base_date ? 'Cada mês ganha o nome pela data-base.' : 'Sem data-base, os marcos ficam em "Mês N".'}
                    </p>
                </div>
                {empId && (
                    <button
                        type="button"
                        onClick={usarDatas}
                        disabled={!!motivoDatas}
                        title={motivoDatas ?? 'Preenche o início das vendas pelo lançamento e o prazo da obra pela entrega. Grava com "Salvar Premissas".'}
                        className="h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Usar as datas do empreendimento
                    </button>
                )}
            </div>

            {avisos.map(a => (
                <div key={a.codigo} className="flex items-start gap-2 rounded-[10px] bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {a.mensagem}
                </div>
            ))}

            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 md:grid-cols-3 gap-6">
                {campoMes('Aquisição do terreno (mês)', 'acquisition_month', D.acquisition_month)}
                {campoMes('Aprovação do projeto (mês)', 'approval_month')}
                {campoMes('Registro da incorporação (mês)', 'incorporation_registry_month')}
            </fieldset>

            <ol className="relative border-l border-slate-200 ml-2 space-y-3" aria-label="Linha do tempo dos marcos">
                {[...marcos].sort((a, b) => (a.mes ?? Infinity) - (b.mes ?? Infinity)).map(m => (
                    <li key={m.id} className="ml-4">
                        <span className={`absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full ${m.mes == null ? 'bg-slate-200' : 'bg-indigo-500'}`} />
                        <span className="text-sm font-medium text-slate-800">{m.rotulo}</span>
                        <span className="text-sm text-slate-600"> · {m.mes == null ? 'sem data' : estudo.base_date ? `${nomeDoMes(estudo.base_date, m.mes)} (mês ${m.mes})` : `Mês ${m.mes}`}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
};

export default ImovibCronogramaTab;
