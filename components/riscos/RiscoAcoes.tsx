import React from 'react';
import { CheckSquare, ClipboardList, ExternalLink, Plus, ShieldCheck, X } from 'lucide-react';
import type { ProjectRisk, RiskAcaoStatus, RiskAction, RiskEficacia } from '../../types/risk';
import { RISK_ROTULO } from '../../types/risk';
import { riskService } from '../../services/riskService';
import { errorMessage } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { formatDateBR, formatMoney } from '../ui/Format';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { acaoEmAtraso, hojeLocalISO } from '../../utils/riskPainel';
import {
    AREA, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, COM_ERRO, ErroDoCampo, ROTULO, useMembrosComConta,
} from './riscosUi';

/**
 * Ações de tratamento do risco (F1.8): lista + formulário na própria ficha (sem
 * drawer aninhado — UI_PATTERNS §4.4). Regras que vêm do banco e a tela antecipa:
 *  - descrição, responsável, prazo e status obrigatórios; custo previsto também
 *    (o plano pede "ação sem custo não salva" — zero é um valor, vazio não);
 *  - concluída exige a data de conclusão (`risk_actions_concluida_ck`);
 *  - eficaz/ineficaz exige evidência (`risk_actions_eficacia_ck`, CA06) — os dois
 *    ficam desligados com o motivo escrito ao lado enquanto não há evidência.
 */
export const COR_STATUS_ACAO: Record<RiskAcaoStatus, string> = {
    planejada: 'text-gray-700', em_andamento: 'text-blue-700', concluida: 'text-emerald-700', cancelada: 'text-gray-500',
};
export const COR_EFICACIA: Record<RiskEficacia, string> = {
    nao_verificada: 'text-gray-600', eficaz: 'text-emerald-700', ineficaz: 'text-red-700',
};

interface Props {
    risco: ProjectRisk;
    acoes: RiskAction[];
    carregando: boolean;
    podeEditar: boolean;
    motivoSemEdicao: string;
    onAcoes: (acoes: RiskAction[]) => void;
}

interface FormAcao {
    tipo: 'preventiva' | 'resposta';
    descricao: string;
    responsavel_user_id: string;
    prazo: string;
    custo_previsto: string;
    custo_realizado: string;
    status: RiskAcaoStatus;
    concluida_em: string;
    evidencia_url: string;
    evidencia_descricao: string;
    eficacia: RiskEficacia;
    eficacia_observacao: string;
    espelhar: boolean;
}

const MOTIVO_EFICACIA = 'Para marcar eficaz ou ineficaz, registre a evidência (link) da ação.';

const formDaAcao = (a: RiskAction | null): FormAcao => ({
    tipo: a?.tipo ?? 'preventiva',
    descricao: a?.descricao ?? '',
    responsavel_user_id: a?.responsavel_user_id ?? '',
    prazo: a?.prazo ?? '',
    custo_previsto: a ? String(a.custo_previsto ?? '') : '',
    custo_realizado: a?.custo_realizado != null ? String(a.custo_realizado) : '',
    status: a?.status ?? 'planejada',
    concluida_em: a?.concluida_em ?? '',
    evidencia_url: a?.evidencia_url ?? '',
    evidencia_descricao: a?.evidencia_descricao ?? '',
    eficacia: a?.eficacia ?? 'nao_verificada',
    eficacia_observacao: a?.eficacia_observacao ?? '',
    espelhar: false,
});

export const RiscoAcoes: React.FC<Props> = ({ risco, acoes, carregando, podeEditar, motivoSemEdicao, onAcoes }) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const membros = useMembrosComConta(risco.organization_id);
    const hoje = hojeLocalISO();
    const [editando, setEditando] = React.useState<RiskAction | 'nova' | null>(null);
    const [form, setForm] = React.useState<FormAcao>(() => formDaAcao(null));
    const [erros, setErros] = React.useState<Record<string, string>>({});
    const [salvando, setSalvando] = React.useState(false);

    const abrir = (a: RiskAction | 'nova') => { setForm(formDaAcao(a === 'nova' ? null : a)); setErros({}); setEditando(a); };
    const set = <K extends keyof FormAcao>(k: K, v: FormAcao[K]) => setForm(prev => ({ ...prev, [k]: v }));
    const acaoAtual = editando && editando !== 'nova' ? editando : null;
    const temEvidencia = !!form.evidencia_url.trim() || !!acaoAtual?.evidencia_document_id;
    const responsavelFora = !!form.responsavel_user_id && !membros.some(m => m.userId === form.responsavel_user_id);

    const validar = (): Record<string, string> => {
        const e: Record<string, string> = {};
        if (!form.descricao.trim()) e.descricao = 'Descreva a ação.';
        if (!form.responsavel_user_id) e.responsavel = 'Escolha o responsável.';
        if (!form.prazo) e.prazo = 'Informe o prazo.';
        if (form.custo_previsto === '') e.custo = 'Informe o custo previsto (pode ser zero).';
        if (form.status === 'concluida' && !form.concluida_em) e.concluida = 'Informe a data de conclusão.';
        if (form.eficacia !== 'nao_verificada' && !temEvidencia) e.eficacia = MOTIVO_EFICACIA;
        return e;
    };

    const salvar = async () => {
        const e = validar();
        setErros(e);
        const primeiro = ['descricao', 'responsavel', 'prazo', 'custo', 'concluida', 'eficacia'].find(k => e[k]);
        if (primeiro) { document.getElementById(`ac-${primeiro}`)?.focus(); return; }
        const membro = membros.find(m => m.userId === form.responsavel_user_id);
        const input = {
            tipo: form.tipo,
            descricao: form.descricao.trim(),
            responsavel_user_id: form.responsavel_user_id,
            responsavel_nome: membro?.name ?? acaoAtual?.responsavel_nome ?? null,
            prazo: form.prazo,
            custo_previsto: Number(form.custo_previsto),
            custo_realizado: form.custo_realizado === '' ? null : Number(form.custo_realizado),
            status: form.status,
            concluida_em: form.status === 'concluida' ? form.concluida_em : null,
            evidencia_url: form.evidencia_url.trim() || null,
            evidencia_document_id: acaoAtual?.evidencia_document_id ?? null,
            evidencia_descricao: form.evidencia_descricao.trim() || null,
            eficacia: form.eficacia,
            eficacia_observacao: form.eficacia_observacao.trim() || null,
        };
        setSalvando(true);
        try {
            if (acaoAtual) {
                const salva = await riskService.atualizarAcao(risco, acaoAtual, input);
                onAcoes(acoes.map(a => (a.id === salva.id ? salva : a)));
                showToast('Ação atualizada.');
            } else {
                const criada = await riskService.criarAcao(risco, input, { espelharEmTarefas: form.espelhar });
                onAcoes([...acoes, criada].sort((a, b) => a.prazo.localeCompare(b.prazo)));
                showToast(form.espelhar ? 'Ação criada, e a tarefa do responsável está em Tarefas.' : 'Ação criada.');
            }
            setEditando(null);
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível salvar a ação.'), 'error');
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async (a: RiskAction) => {
        const ok = await confirm({
            title: 'Excluir a ação?',
            message: `"${a.descricao}" sai do plano de tratamento. A exclusão fica no histórico do risco.${a.task_id ? ' A tarefa já criada em Tarefas continua lá.' : ''}`,
            variant: 'danger',
            confirmLabel: 'Excluir ação',
        });
        if (!ok) return;
        try {
            await riskService.excluirAcao(risco, a);
            onAcoes(acoes.filter(x => x.id !== a.id));
            showToast('Ação excluída.');
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível excluir a ação.'), 'error');
        }
    };

    const criarTarefa = async (a: RiskAction) => {
        try {
            const atualizada = await riskService.espelharEmTarefas(risco, a);
            onAcoes(acoes.map(x => (x.id === atualizada.id ? atualizada : x)));
            showToast('Tarefa criada em Tarefas para o responsável.');
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível criar a tarefa.'), 'error');
        }
    };

    if (editando) {
        const somenteLeitura = !podeEditar;
        return (
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                <fieldset disabled={somenteLeitura} className="min-w-0 space-y-8">
                    <div className="space-y-4">
                        <SecaoTitulo icon={ClipboardList} titulo={acaoAtual ? 'Ação de tratamento' : 'Nova ação de tratamento'} />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ac-tipo">Tipo</label>
                                <select id="ac-tipo" className={CAMPO} value={form.tipo} onChange={e => set('tipo', e.target.value as FormAcao['tipo'])}>
                                    <option value="preventiva">Preventiva (antes do evento)</option>
                                    <option value="resposta">Resposta (se o evento acontecer)</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ac-status">Status</label>
                                <select id="ac-status" className={CAMPO} value={form.status}
                                    onChange={e => {
                                        const st = e.target.value as RiskAcaoStatus;
                                        setForm(prev => ({ ...prev, status: st, concluida_em: st === 'concluida' && !prev.concluida_em ? hoje : prev.concluida_em }));
                                    }}>
                                    {(Object.keys(RISK_ROTULO.acaoStatus) as RiskAcaoStatus[]).map(s => <option key={s} value={s}>{RISK_ROTULO.acaoStatus[s]}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <label className={ROTULO} htmlFor="ac-descricao">Descrição</label>
                                <textarea id="ac-descricao" className={`${AREA} ${erros.descricao ? COM_ERRO : ''}`} value={form.descricao}
                                    aria-invalid={!!erros.descricao} onChange={e => set('descricao', e.target.value)}
                                    placeholder="Ex.: contratar monitoramento de recalques semanal até a laje 5." />
                                <ErroDoCampo id="ac-descricao-erro" erro={erros.descricao} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ac-responsavel">Responsável</label>
                                <select id="ac-responsavel" className={`${CAMPO} ${erros.responsavel ? COM_ERRO : ''}`} value={form.responsavel_user_id}
                                    aria-invalid={!!erros.responsavel} onChange={e => set('responsavel_user_id', e.target.value)}>
                                    <option value="">Escolha…</option>
                                    {responsavelFora && <option value={form.responsavel_user_id}>{acaoAtual?.responsavel_nome ?? 'Responsável atual'} (fora da lista)</option>}
                                    {membros.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                                </select>
                                <ErroDoCampo id="ac-responsavel-erro" erro={erros.responsavel} />
                                {membros.length === 0 && <p className="text-xs text-gray-600">Nenhum membro desta organização tem conta de acesso — convite sem conta não pode ser responsável.</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ac-prazo">Prazo</label>
                                <input id="ac-prazo" type="date" className={`${CAMPO} ${erros.prazo ? COM_ERRO : ''}`} value={form.prazo}
                                    aria-invalid={!!erros.prazo} onChange={e => set('prazo', e.target.value)} />
                                <ErroDoCampo id="ac-prazo-erro" erro={erros.prazo} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ac-custo">Custo previsto (R$)</label>
                                <MoneyCentsInput id="ac-custo" className={`${CAMPO} ${erros.custo ? COM_ERRO : ''}`} value={form.custo_previsto}
                                    aria-invalid={!!erros.custo} onChange={v => set('custo_previsto', v)} />
                                <ErroDoCampo id="ac-custo-erro" erro={erros.custo} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ac-custo-realizado">Custo realizado (R$)</label>
                                <MoneyCentsInput id="ac-custo-realizado" className={CAMPO} value={form.custo_realizado} onChange={v => set('custo_realizado', v)} />
                            </div>
                            {form.status === 'concluida' && (
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="ac-concluida">Concluída em</label>
                                    <input id="ac-concluida" type="date" className={`${CAMPO} ${erros.concluida ? COM_ERRO : ''}`} value={form.concluida_em}
                                        aria-invalid={!!erros.concluida} onChange={e => set('concluida_em', e.target.value)} />
                                    <ErroDoCampo id="ac-concluida-erro" erro={erros.concluida} />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <SecaoTitulo icon={ShieldCheck} titulo="Evidência e eficácia" />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ac-evidencia">Evidência (link)</label>
                                <input id="ac-evidencia" type="url" className={CAMPO} placeholder="https://…" value={form.evidencia_url}
                                    onChange={e => setForm(prev => ({
                                        ...prev, evidencia_url: e.target.value,
                                        // Sem evidência, eficácia volta a "não verificada" — o banco recusaria o resto.
                                        eficacia: !e.target.value.trim() && !acaoAtual?.evidencia_document_id ? 'nao_verificada' : prev.eficacia,
                                    }))} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ac-evidencia-desc">Descrição da evidência</label>
                                <input id="ac-evidencia-desc" type="text" className={CAMPO} placeholder="Ex.: relatório de leitura de recalques nº 12"
                                    value={form.evidencia_descricao} onChange={e => set('evidencia_descricao', e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-1.5" role="radiogroup" aria-labelledby="ac-eficacia-rotulo">
                            <span id="ac-eficacia-rotulo" className={ROTULO}>Eficácia do controle</span>
                            <div className="flex flex-wrap items-center gap-4" id="ac-eficacia" tabIndex={-1}>
                                {(Object.keys(RISK_ROTULO.eficacia) as RiskEficacia[]).map(ef => {
                                    const bloqueada = ef !== 'nao_verificada' && !temEvidencia;
                                    return (
                                        <label key={ef} className={`inline-flex items-center gap-2 text-sm ${bloqueada ? 'text-gray-500 cursor-not-allowed' : 'text-gray-800 cursor-pointer'}`}
                                            title={bloqueada ? MOTIVO_EFICACIA : undefined}>
                                            <input type="radio" name="ac-eficacia" value={ef} checked={form.eficacia === ef} disabled={bloqueada}
                                                onChange={() => set('eficacia', ef)} className="w-4 h-4 text-blue-600 border-gray-300" />
                                            {RISK_ROTULO.eficacia[ef]}
                                        </label>
                                    );
                                })}
                            </div>
                            {!temEvidencia && <p className="text-xs text-gray-600">{MOTIVO_EFICACIA}</p>}
                            <ErroDoCampo id="ac-eficacia-erro" erro={erros.eficacia} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="ac-obs">Observação</label>
                            <textarea id="ac-obs" className={AREA} value={form.eficacia_observacao} onChange={e => set('eficacia_observacao', e.target.value)} />
                        </div>
                        {!acaoAtual && (
                            <label className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                                <input type="checkbox" checked={form.espelhar} onChange={e => set('espelhar', e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                                Criar tarefa para o responsável em Tarefas
                            </label>
                        )}
                    </div>
                </fieldset>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {somenteLeitura && <p className="text-xs text-gray-600 mr-auto">{motivoSemEdicao}</p>}
                    <button type="button" onClick={() => setEditando(null)} className={BOTAO_SECUNDARIO}>
                        <X className="w-[15px] h-[15px]" /> {acaoAtual ? 'Voltar à lista' : 'Cancelar'}
                    </button>
                    {!somenteLeitura && (
                        <button type="button" onClick={salvar} disabled={salvando} className={BOTAO_PRIMARIO}>
                            {salvando ? 'Salvando…' : acaoAtual ? 'Salvar ação' : 'Criar ação'}
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
                        <Plus className="w-[15px] h-[15px]" /> Nova ação
                    </button>
                </span>
                {!podeEditar && <p className="text-xs text-gray-600">{motivoSemEdicao}</p>}
            </div>

            {carregando ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : acoes.length === 0 ? (
                <div className="text-center py-12">
                    <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Sem plano de ação</h3>
                    <p className="text-sm text-gray-500">Registre o que será feito para prevenir o evento e como responder se ele acontecer.</p>
                </div>
            ) : (
                <ul className="space-y-3">
                    {acoes.map(a => {
                        const atrasada = acaoEmAtraso(a, hoje);
                        return (
                            <li key={a.id} className="bg-white rounded-[10px] border border-gray-100 px-4 py-3 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <button type="button" onClick={() => abrir(a)} className="text-left text-sm text-gray-900 hover:text-blue-700 min-w-0">
                                        {a.descricao}
                                    </button>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button type="button" onClick={() => abrir(a)} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                            {podeEditar ? 'Editar' : 'Ver'}
                                        </button>
                                        {podeEditar && <ActionIconButton kind="delete" size="sm" title="Excluir a ação" onClick={() => void excluir(a)} />}
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600">
                                    {a.tipo === 'preventiva' ? 'Preventiva' : 'Resposta'} · {a.responsavel_nome || 'responsável sem nome'} · prazo{' '}
                                    <span className={atrasada ? 'text-red-700' : 'text-gray-700'}>{formatDateBR(a.prazo)}{atrasada ? ' (em atraso)' : ''}</span>
                                    {' · '}<span className={COR_STATUS_ACAO[a.status]}>{RISK_ROTULO.acaoStatus[a.status]}</span>
                                    {' · '}<span className={COR_EFICACIA[a.eficacia]}>{RISK_ROTULO.eficacia[a.eficacia]}</span>
                                    {' · '}<span className="font-medium text-gray-800">{formatMoney(Number(a.custo_previsto))}</span>
                                </p>
                                <div className="flex flex-wrap items-center gap-3 text-sm">
                                    {a.evidencia_url && (
                                        <a href={a.evidencia_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
                                            <ExternalLink className="w-3.5 h-3.5" /> {a.evidencia_descricao || 'Evidência'}
                                        </a>
                                    )}
                                    {a.task_id ? (
                                        <span className="inline-flex items-center gap-1 text-gray-600"><CheckSquare className="w-3.5 h-3.5" /> Tarefa criada em Tarefas</span>
                                    ) : podeEditar && a.status !== 'concluida' && a.status !== 'cancelada' ? (
                                        <button type="button" onClick={() => void criarTarefa(a)} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
                                            <CheckSquare className="w-3.5 h-3.5" /> Criar tarefa em Tarefas
                                        </button>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default RiscoAcoes;
