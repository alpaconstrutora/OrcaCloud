import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, AlertTriangle, HardHat, Flag } from 'lucide-react';
import { SecaoTitulo } from './ui/SecaoTitulo';
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
 * marcos e os três marcos que só existem aqui (aquisição, aprovação, registro). Sem
 * data-base, "Mês N".
 * Pedido de 14/11/2026 ("o cronograma não é editável?"): início e prazo da obra e das
 * vendas também se editam aqui. São as MESMAS colunas da aba Dinâmica — aqui gravam com
 * "Salvar Premissas", lá ao sair do campo.
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
    const [datasDoEmp, setDatasDoEmp] = useState<{ lancamento?: string | null; entrega?: string | null; erro?: string } | null>(null);
    useEffect(() => {
        if (!empId) { setDatasDoEmp(null); return; }
        let vivo = true;
        empreendimentoService.getById(empId)
            .then(e => { if (vivo) setDatasDoEmp({ lancamento: e?.launch_date ?? null, entrega: e?.expected_delivery_date ?? null }); })
            .catch(e => { if (vivo) setDatasDoEmp({ erro: (e as Error).message }); });
        return () => { vivo = false; };
    }, [empId]);

    const D = IMOVIB_DEFAULTS;
    const inicioObra = Number(estudo.construction_start_month ?? D.construction_start_month);
    const mesLancamento = mesDaData(estudo.base_date, datasDoEmp?.lancamento);
    const mesEntrega = mesDaData(estudo.base_date, datasDoEmp?.entrega);
    const motivoDatas = !pode ? motivo
        : !empId ? 'Vincule um empreendimento em Identificação para usar as datas dele.'
            : datasDoEmp?.erro ? `Não foi possível ler o empreendimento: ${datasDoEmp.erro}`
            : !datasDoEmp ? 'Lendo as datas do empreendimento…'
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

    type CampoDeMes = 'acquisition_month' | 'approval_month' | 'incorporation_registry_month'
        | 'construction_start_month' | 'construction_duration_months' | 'sales_start_month' | 'sales_duration_months';
    // Vazio grava vazio (null) e o motor usa o padrão, que aparece no placeholder.
    const campoMes = (rotulo: string, campo: CampoDeMes, vazio: string) => (
        <div className="space-y-1.5">
            <label htmlFor={`imovib-${campo}`} className="block text-xs font-semibold text-slate-500">{rotulo}</label>
            <input
                id={`imovib-${campo}`}
                type="number" min="1" step="1"
                value={(formData[campo] as number | null | undefined) ?? ''}
                placeholder={vazio}
                onChange={e => setCampo(campo, e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value))))}
                className={CAMPO}
            />
        </div>
    );

    return (
        <div className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-8">
            <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <CalendarClock className="w-5 h-5 text-indigo-500" />
                    Módulo 2 — Cronograma e marcos
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                    Os campos de obra e vendas são os mesmos da aba Dinâmica. {estudo.base_date ? 'Cada mês ganha o nome pela data-base.' : 'Sem data-base, os marcos ficam em "Mês N".'}
                </p>
            </div>

            {avisos.map(a => (
                <div key={a.codigo} className="flex items-start gap-2 rounded-[10px] bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {a.mensagem}
                </div>
            ))}

            <div className="space-y-4">
                <SecaoTitulo
                    icon={HardHat}
                    titulo="Obra e vendas"
                    acoes={empId && (
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
                />
                <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                    {campoMes('Início da obra (mês)', 'construction_start_month', `Vazio = mês ${D.construction_start_month}`)}
                    {campoMes('Duração da obra (meses)', 'construction_duration_months', `Vazio = ${D.construction_duration_months} meses`)}
                    {campoMes('Início das vendas (mês)', 'sales_start_month', `Vazio = mês ${D.sales_start_month}`)}
                    {campoMes('Duração das vendas (meses)', 'sales_duration_months', `Vazio = ${D.sales_duration_months} meses`)}
                </fieldset>
            </div>

            <div className="space-y-4">
                <SecaoTitulo icon={Flag} titulo="Terreno e incorporação" />
                <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                    {campoMes('Aquisição do terreno (mês)', 'acquisition_month', `Vazio = mês ${D.acquisition_month}`)}
                    {campoMes('Aprovação do projeto (mês)', 'approval_month', 'Sem marco')}
                    {campoMes('Registro da incorporação (mês)', 'incorporation_registry_month', 'Sem marco')}
                </fieldset>
            </div>

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
