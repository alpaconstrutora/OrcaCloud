import React from 'react';
import { AlertOctagon, ExternalLink, FileText, Plus, X } from 'lucide-react';
import type { ProjectRisk, RiskDimensao, RiskEvent, RiskEventInput, RiskOcorrenciaStatus, RiskTipoOcorrencia } from '../../types/risk';
import { RISK_DIMENSOES, RISK_ROTULO, RISK_TIPOS_OCORRENCIA, ROTULO_OCORRENCIA } from '../../types/risk';
import { riskService } from '../../services/riskService';
import { errorMessage } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { riscoAtivo } from '../../utils/riskScoring';
import { hojeLocalISO } from '../../utils/riskPainel';
import { useConfirm } from '../ui/confirm';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { formatDateBR, formatMoney } from '../ui/Format';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { AREA, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, COM_ERRO, ErroDoCampo, ROTULO } from './riscosUi';

/**
 * Ocorrências do risco (F2.1 de docs/planos/2026-11-13-modulo-riscos.md): lista + formulário
 * na própria ficha (sem drawer aninhado, UI_PATTERNS §4.4), no molde de `RiscoAcoes`.
 *
 * "Este evento materializou o risco" só existe ao REGISTRAR e só para risco ativo: o banco
 * guarda a avaliação vigente em `avaliacao_referencia_id` (CA08 — as avaliações anteriores
 * não mudam, são append-only) e põe o risco em "Materializado". A tela pergunta antes
 * (`useConfirm`) e devolve o risco relido para o cabeçalho da ficha refletir o status novo.
 *
 * Impacto financeiro é UM valor por ocorrência, mesmo afetando várias dimensões (nunca
 * multiplica) — é a soma destes valores que o Painel chama de "perdas".
 */
export const COR_STATUS_OCORRENCIA: Record<RiskOcorrenciaStatus, string> = {
    aberta: 'text-amber-700', em_tratamento: 'text-blue-700', encerrada: 'text-emerald-700',
};
export const ROTULO_STATUS_OCORRENCIA: Record<RiskOcorrenciaStatus, string> = {
    aberta: 'Aberta', em_tratamento: 'Em tratamento', encerrada: 'Encerrada',
};

interface Props {
    risco: ProjectRisk;
    ocorrencias: RiskEvent[];
    carregando: boolean;
    erro: string | null;
    onTentarDeNovo: () => void;
    podeEditar: boolean;
    motivoSemEdicao: string;
    onOcorrencias: (lista: RiskEvent[]) => void;
    /** O risco relido depois de materializar (status novo). */
    onRisco: (r: ProjectRisk) => void;
}

interface FormOcorrencia {
    tipo: RiskTipoOcorrencia;
    data_ocorrencia: string;
    titulo: string;
    descricao: string;
    causa_raiz: string;
    impacto: string;
    atraso: string;
    dimensoes: RiskDimensao[];
    acoes_corretivas: string;
    licoes_aprendidas: string;
    evidencia_url: string;
    status: RiskOcorrenciaStatus;
    materializa: boolean;
}

const formDa = (o: RiskEvent | null): FormOcorrencia => ({
    tipo: o?.tipo ?? 'outro',
    data_ocorrencia: o?.data_ocorrencia ?? hojeLocalISO(),
    titulo: o?.titulo ?? '',
    descricao: o?.descricao ?? '',
    causa_raiz: o?.causa_raiz ?? '',
    impacto: o?.impacto_financeiro != null ? String(o.impacto_financeiro) : '',
    atraso: o?.atraso_dias != null ? String(o.atraso_dias) : '',
    dimensoes: o ? [...o.dimensoes] : [],
    acoes_corretivas: o?.acoes_corretivas ?? '',
    licoes_aprendidas: o?.licoes_aprendidas ?? '',
    evidencia_url: o?.evidencia_url ?? '',
    status: o?.status ?? 'aberta',
    materializa: false,
});

const vazioParaNull = (s: string) => (s.trim() ? s.trim() : null);

export const RiscoOcorrencias: React.FC<Props> = ({
    risco, ocorrencias, carregando, erro, onTentarDeNovo, podeEditar, motivoSemEdicao, onOcorrencias, onRisco,
}) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [editando, setEditando] = React.useState<RiskEvent | 'nova' | null>(null);
    const [form, setForm] = React.useState<FormOcorrencia>(() => formDa(null));
    const [erros, setErros] = React.useState<Record<string, string>>({});
    const [salvando, setSalvando] = React.useState(false);

    const atual = editando && editando !== 'nova' ? editando : null;
    const podeMaterializar = !atual && riscoAtivo(risco);
    const abrir = (o: RiskEvent | 'nova') => { setForm(formDa(o === 'nova' ? null : o)); setErros({}); setEditando(o); };
    const set = <K extends keyof FormOcorrencia>(k: K, v: FormOcorrencia[K]) => setForm(prev => ({ ...prev, [k]: v }));

    const validar = (): Record<string, string> => {
        const e: Record<string, string> = {};
        if (!form.titulo.trim()) e.titulo = 'Dê um título curto à ocorrência.';
        if (!form.data_ocorrencia) e.data = 'Informe a data da ocorrência.';
        else if (form.data_ocorrencia > hojeLocalISO()) e.data = 'A ocorrência já aconteceu: a data não pode ser futura.';
        if (form.atraso !== '' && (!/^\d+$/.test(form.atraso))) e.atraso = 'Atraso em dias inteiros (0 ou mais).';
        return e;
    };

    const salvar = async () => {
        const e = validar();
        setErros(e);
        const primeiro = ['titulo', 'data', 'atraso'].find(k => e[k]);
        if (primeiro) { document.getElementById(`oc-${primeiro}`)?.focus(); return; }
        const input: RiskEventInput = {
            project_id: atual?.project_id ?? risco.project_id,
            tipo: form.tipo,
            data_ocorrencia: form.data_ocorrencia,
            titulo: form.titulo.trim(),
            descricao: vazioParaNull(form.descricao),
            causa_raiz: vazioParaNull(form.causa_raiz),
            impacto_financeiro: form.impacto === '' ? null : Number(form.impacto),
            atraso_dias: form.atraso === '' ? null : Number(form.atraso),
            dimensoes: form.dimensoes,
            acoes_corretivas: vazioParaNull(form.acoes_corretivas),
            licoes_aprendidas: vazioParaNull(form.licoes_aprendidas),
            evidencia_url: vazioParaNull(form.evidencia_url),
            evidencia_document_id: atual?.evidencia_document_id ?? null,
            materializa: podeMaterializar && form.materializa,
            status: form.status,
        };
        if (input.materializa) {
            const ok = await confirm({
                title: `Materializar ${risco.codigo}?`,
                message: `O risco passa para "Materializado" e sai dos ativos: painel, matriz e alertas deixam de contá-lo. ` +
                    `A avaliação vigente fica registrada como referência desta ocorrência, e as avaliações anteriores continuam como estão.`,
                variant: 'warning',
                confirmLabel: 'Registrar e materializar',
            });
            if (!ok) return;
        }
        setSalvando(true);
        try {
            if (atual) {
                const salva = await riskService.atualizarOcorrencia(risco, atual, input);
                onOcorrencias(ocorrencias.map(o => (o.id === salva.id ? salva : o)));
                showToast('Ocorrência atualizada.');
            } else {
                const { ocorrencia, risco: relido } = await riskService.registrarOcorrencia(risco, input);
                onOcorrencias([ocorrencia, ...ocorrencias].sort((a, b) => b.data_ocorrencia.localeCompare(a.data_ocorrencia)));
                if (relido.status !== risco.status || relido.updated_at !== risco.updated_at) onRisco(relido);
                showToast(ocorrencia.materializa
                    ? `Ocorrência registrada. ${relido.codigo} agora está "${RISK_ROTULO.status[relido.status]}".`
                    : 'Ocorrência registrada.');
            }
            setEditando(null);
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível salvar a ocorrência.'), 'error');
        } finally {
            setSalvando(false);
        }
    };

    if (editando) {
        const somenteLeitura = !podeEditar;
        return (
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                <fieldset disabled={somenteLeitura} className="min-w-0 space-y-8">
                    <div className="space-y-4">
                        <SecaoTitulo icon={AlertOctagon} titulo={atual ? 'Ocorrência' : 'Nova ocorrência'}
                            resumo={atual?.materializa ? 'esta ocorrência materializou o risco' : undefined} />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="oc-tipo">Tipo</label>
                                <select id="oc-tipo" className={CAMPO} value={form.tipo} onChange={e => set('tipo', e.target.value as RiskTipoOcorrencia)}>
                                    {RISK_TIPOS_OCORRENCIA.map(t => <option key={t} value={t}>{ROTULO_OCORRENCIA[t]}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="oc-data">Data da ocorrência</label>
                                <input id="oc-data" type="date" max={hojeLocalISO()} className={`${CAMPO} ${erros.data ? COM_ERRO : ''}`} value={form.data_ocorrencia}
                                    aria-invalid={!!erros.data} onChange={e => set('data_ocorrencia', e.target.value)} />
                                <ErroDoCampo id="oc-data-erro" erro={erros.data} />
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <label className={ROTULO} htmlFor="oc-titulo">Título</label>
                                <input id="oc-titulo" type="text" className={`${CAMPO} ${erros.titulo ? COM_ERRO : ''}`} value={form.titulo}
                                    aria-invalid={!!erros.titulo} onChange={e => set('titulo', e.target.value)}
                                    placeholder="Ex.: fissura na laje do subsolo 2 após escavação vizinha" />
                                <ErroDoCampo id="oc-titulo-erro" erro={erros.titulo} />
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <label className={ROTULO} htmlFor="oc-descricao">Descrição</label>
                                <textarea id="oc-descricao" className={AREA} value={form.descricao} onChange={e => set('descricao', e.target.value)}
                                    placeholder="O que aconteceu, onde e quem foi afetado." />
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <label className={ROTULO} htmlFor="oc-causa">Causa raiz</label>
                                <textarea id="oc-causa" className={AREA} value={form.causa_raiz} onChange={e => set('causa_raiz', e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="oc-impacto">Impacto financeiro (R$)</label>
                                <MoneyCentsInput id="oc-impacto" className={CAMPO} value={form.impacto} onChange={v => set('impacto', v)} />
                                <p className="text-xs text-gray-600">Um valor por ocorrência, mesmo afetando várias dimensões. Vazio = não medido.</p>
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="oc-atraso">Atraso (dias)</label>
                                <input id="oc-atraso" type="number" min={0} step={1} inputMode="numeric" className={`${CAMPO} ${erros.atraso ? COM_ERRO : ''}`}
                                    value={form.atraso} aria-invalid={!!erros.atraso} onChange={e => set('atraso', e.target.value)} />
                                <ErroDoCampo id="oc-atraso-erro" erro={erros.atraso} />
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <span className={ROTULO}>Dimensões afetadas</span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                                    {RISK_DIMENSOES.map(d => (
                                        <label key={d} className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                                            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600" checked={form.dimensoes.includes(d)}
                                                onChange={e => set('dimensoes', e.target.checked ? [...form.dimensoes, d] : form.dimensoes.filter(x => x !== d))} />
                                            {RISK_ROTULO.dimensao[d]}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="oc-status">Status</label>
                                <select id="oc-status" className={CAMPO} value={form.status} onChange={e => set('status', e.target.value as RiskOcorrenciaStatus)}>
                                    {(Object.keys(ROTULO_STATUS_OCORRENCIA) as RiskOcorrenciaStatus[]).map(s => <option key={s} value={s}>{ROTULO_STATUS_OCORRENCIA[s]}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <SecaoTitulo icon={FileText} titulo="Tratamento e aprendizado" />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5 col-span-2">
                                <label className={ROTULO} htmlFor="oc-acoes">Ações corretivas</label>
                                <textarea id="oc-acoes" className={AREA} value={form.acoes_corretivas} onChange={e => set('acoes_corretivas', e.target.value)} />
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <label className={ROTULO} htmlFor="oc-licoes">Lições aprendidas</label>
                                <textarea id="oc-licoes" className={AREA} value={form.licoes_aprendidas} onChange={e => set('licoes_aprendidas', e.target.value)} />
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <label className={ROTULO} htmlFor="oc-evidencia">Evidência (link)</label>
                                <input id="oc-evidencia" type="url" className={CAMPO} placeholder="https://…" value={form.evidencia_url}
                                    onChange={e => set('evidencia_url', e.target.value)} />
                            </div>
                        </div>
                    </div>

                    {podeMaterializar && (
                        <div className="space-y-1.5">
                            <label className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-red-600" checked={form.materializa}
                                    onChange={e => set('materializa', e.target.checked)} />
                                Este evento materializou o risco
                            </label>
                            <p className="text-xs text-gray-600">
                                O risco passa a "Materializado" e sai dos ativos (painel, matriz e alertas). A avaliação vigente fica registrada
                                como referência desta ocorrência; as avaliações anteriores não mudam.
                            </p>
                        </div>
                    )}
                    {!atual && !podeMaterializar && (
                        <p className="text-xs text-gray-600">
                            O risco já está "{RISK_ROTULO.status[risco.status]}": a ocorrência fica registrada, sem materializar de novo.
                        </p>
                    )}
                </fieldset>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {somenteLeitura && <p className="text-xs text-gray-600 mr-auto">{motivoSemEdicao}</p>}
                    <button type="button" onClick={() => setEditando(null)} className={BOTAO_SECUNDARIO}>
                        <X className="w-[15px] h-[15px]" /> {atual ? 'Voltar à lista' : 'Cancelar'}
                    </button>
                    {!somenteLeitura && (
                        <button type="button" onClick={() => void salvar()} disabled={salvando} className={BOTAO_PRIMARIO}>
                            {salvando ? 'Salvando…' : atual ? 'Salvar ocorrência' : form.materializa && podeMaterializar ? 'Registrar e materializar' : 'Registrar ocorrência'}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex" title={podeEditar ? undefined : motivoSemEdicao}>
                    <button type="button" onClick={() => abrir('nova')} disabled={!podeEditar} className={BOTAO_PRIMARIO}>
                        <Plus className="w-[15px] h-[15px]" /> Nova ocorrência
                    </button>
                </span>
                {!podeEditar && <p className="text-xs text-gray-600">{motivoSemEdicao}</p>}
            </div>

            {erro ? (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-[10px] px-4 py-3 text-sm text-red-700">
                    <span>Não foi possível carregar as ocorrências: {erro}</span>
                    <button type="button" onClick={onTentarDeNovo} className="font-medium text-red-700 underline">Tentar de novo</button>
                </div>
            ) : carregando ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : ocorrencias.length === 0 ? (
                <div className="text-center py-12">
                    <AlertOctagon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma ocorrência</h3>
                    <p className="text-sm text-gray-500">Registre aqui quase acidentes, danos, atrasos e perdas ligados a este risco.</p>
                </div>
            ) : (
                <ul className="space-y-3">
                    {ocorrencias.map(o => (
                        <li key={o.id} className="bg-white rounded-[10px] border border-gray-100 px-4 py-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <button type="button" onClick={() => abrir(o)} className="text-left text-sm text-gray-900 hover:text-blue-700 min-w-0">
                                    {o.titulo}
                                </button>
                                <button type="button" onClick={() => abrir(o)} className="shrink-0 text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                    {podeEditar ? 'Editar' : 'Ver'}
                                </button>
                            </div>
                            <p className="text-sm text-gray-600">
                                {ROTULO_OCORRENCIA[o.tipo]} · {formatDateBR(o.data_ocorrencia)}
                                {' · '}<span className={COR_STATUS_OCORRENCIA[o.status]}>{ROTULO_STATUS_OCORRENCIA[o.status]}</span>
                                {o.impacto_financeiro != null && <>{' · '}<span className="font-medium text-gray-800">{formatMoney(Number(o.impacto_financeiro))}</span></>}
                                {o.atraso_dias != null && <>{` · ${o.atraso_dias} dia${o.atraso_dias === 1 ? '' : 's'} de atraso`}</>}
                                {o.materializa && <>{' · '}<span className="text-red-700">materializou o risco</span></>}
                            </p>
                            {o.evidencia_url && (
                                <a href={o.evidencia_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                                    <ExternalLink className="w-3.5 h-3.5" /> Evidência
                                </a>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default RiscoOcorrencias;
