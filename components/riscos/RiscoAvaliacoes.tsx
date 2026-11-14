import React from 'react';
import { ExternalLink, FileText, Gauge, History, Lock, Plus, Target, X } from 'lucide-react';
import type { ProjectRisk, RiskAvaliacaoTipo, RiskDimensao, RiskEvaluation, RiskMatrixConfig } from '../../types/risk';
import { RISK_DIMENSOES, RISK_ROTULO } from '../../types/risk';
import { impactoConsolidado, nivelDaPontuacao, valorEsperado } from '../../utils/riskScoring';
import { riskService } from '../../services/riskService';
import { errorMessage } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { formatDateTimeBR, formatMoney } from '../ui/Format';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import {
    AREA, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, COM_ERRO, ErroDoCampo, NivelTexto, ROTULO, ROTULO_PROBABILIDADE,
} from './riscosUi';

/**
 * Avaliações do risco (F1.7): histórico (mais recente primeiro) e o formulário da
 * nova avaliação. Avaliação é APPEND-ONLY (CA05) — o banco recusa UPDATE e DELETE;
 * a tela não oferece editar nem excluir e diz isso.
 *
 * O impacto consolidado é o MÁXIMO das dimensões (nunca a média — seção 3.3 da
 * especificação); a prévia usa as mesmas funções de `utils/riskScoring.ts` que o
 * banco espelha no gatilho `risk_evaluations_preparar`.
 */
interface Props {
    risco: ProjectRisk;
    avaliacoes: RiskEvaluation[];
    carregando: boolean;
    faixas: RiskMatrixConfig;
    podeEditar: boolean;
    motivoSemEdicao: string;
    autorNome: string | null;
    onAvaliado: (avaliacao: RiskEvaluation, risco: ProjectRisk) => void;
}

interface FormAvaliacao {
    tipo: RiskAvaliacaoTipo;
    probabilidade: number | '';
    dims: RiskDimensao[];
    impactos: Partial<Record<RiskDimensao, number>>;
    pct: string;
    perda: string;
    atraso: string;
    premissas: string;
    justificativa: string;
    evidencia: string;
}

const formVazio = (r: ProjectRisk): FormAvaliacao => ({
    tipo: r.inerente_pontuacao == null ? 'inerente' : 'residual',
    probabilidade: '',
    dims: [...r.dimensoes],
    impactos: {},
    pct: '', perda: '', atraso: '', premissas: '', justificativa: '', evidencia: '',
});

export const RiscoAvaliacoes: React.FC<Props> = ({ risco, avaliacoes, carregando, faixas, podeEditar, motivoSemEdicao, autorNome, onAvaliado }) => {
    const { showToast } = useToast();
    const [aberto, setAberto] = React.useState(false);
    const [form, setForm] = React.useState<FormAvaliacao>(() => formVazio(risco));
    const [erros, setErros] = React.useState<Record<string, string>>({});
    const [salvando, setSalvando] = React.useState(false);

    const abrirForm = () => { setForm(formVazio(risco)); setErros({}); setAberto(true); };
    const set = <K extends keyof FormAvaliacao>(k: K, v: FormAvaliacao[K]) => setForm(prev => ({ ...prev, [k]: v }));

    const impactosValidos = Object.fromEntries(form.dims.filter(d => form.impactos[d] != null).map(d => [d, form.impactos[d] as number])) as Partial<Record<RiskDimensao, number>>;
    const impacto = impactoConsolidado(impactosValidos);
    const pont = form.probabilidade !== '' && impacto != null ? form.probabilidade * impacto : null;
    const nivel = pont != null ? nivelDaPontuacao(pont, faixas) : null;
    const pctNum = form.pct === '' ? null : Number(form.pct);
    const perdaNum = form.perda === '' ? null : Number(form.perda);
    const ve = valorEsperado(pctNum, perdaNum);
    const dimsDisponiveis = RISK_DIMENSOES.filter(d => !form.dims.includes(d));

    const validar = (): Record<string, string> => {
        const e: Record<string, string> = {};
        if (form.probabilidade === '') e.probabilidade = 'Escolha a probabilidade (1 a 5).';
        if (impacto == null) e.impactos = 'Dê a nota de impacto (1 a 5) de pelo menos uma dimensão.';
        if (pctNum != null && (Number.isNaN(pctNum) || pctNum < 0 || pctNum > 100)) e.pct = 'A probabilidade em % vai de 0 a 100.';
        if (form.atraso !== '' && (!Number.isInteger(Number(form.atraso)) || Number(form.atraso) < 0)) e.atraso = 'Atraso em dias inteiros, a partir de 0.';
        if (!form.justificativa.trim()) e.justificativa = 'Justifique a avaliação: por que esta probabilidade e este impacto.';
        return e;
    };

    const registrar = async () => {
        const e = validar();
        setErros(e);
        const primeiro = ['probabilidade', 'impactos', 'pct', 'atraso', 'justificativa'].find(k => e[k]);
        if (primeiro) { document.getElementById(`av-${primeiro}`)?.focus(); return; }
        setSalvando(true);
        try {
            const { avaliacao, risco: atualizado } = await riskService.avaliar(risco, {
                tipo: form.tipo,
                metodo: Object.keys(impactosValidos).length > 1 ? 'multidimensional' : 'matriz_5x5',
                probabilidade: form.probabilidade as number,
                impactos: impactosValidos,
                probabilidade_pct: pctNum,
                perda_estimada: perdaNum,
                atraso_dias: form.atraso === '' ? null : Number(form.atraso),
                premissas: form.premissas.trim() || null,
                justificativa: form.justificativa.trim(),
                evidencia_url: form.evidencia.trim() || null,
                evidencia_document_id: null,
                avaliado_por_nome: autorNome,
            });
            onAvaliado(avaliacao, atualizado);
            setAberto(false);
            showToast(`Avaliação ${RISK_ROTULO.nivel[nivelDaPontuacao(avaliacao.pontuacao, faixas)].toLowerCase()} registrada (${avaliacao.probabilidade} × ${avaliacao.impacto} = ${avaliacao.pontuacao}).`);
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível registrar a avaliação.'), 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-[10px] px-4 py-3">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" aria-hidden="true" />
                <p>Avaliação é histórico: depois de registrada não se edita nem se exclui. Para mudar a leitura do risco, registre uma nova avaliação.</p>
            </div>

            {!aberto && (
                <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex" title={podeEditar ? undefined : motivoSemEdicao}>
                        <button type="button" onClick={abrirForm} disabled={!podeEditar} className={BOTAO_PRIMARIO}>
                            <Plus className="w-[15px] h-[15px]" /> Nova avaliação
                        </button>
                    </span>
                    {!podeEditar && <p className="text-xs text-gray-600">{motivoSemEdicao}</p>}
                </div>
            )}

            {aberto && (
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                    <div className="space-y-4">
                        <SecaoTitulo icon={Gauge} titulo="Nova avaliação" acoes={
                            <button type="button" onClick={() => setAberto(false)} className="p-1.5 rounded-[6px] text-gray-500 hover:bg-gray-100" title="Fechar o formulário sem registrar">
                                <X className="w-4 h-4" />
                            </button>
                        } />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="av-tipo">Tipo</label>
                                <select id="av-tipo" className={CAMPO} value={form.tipo} onChange={e => set('tipo', e.target.value as RiskAvaliacaoTipo)}>
                                    <option value="inerente">Inerente (sem os controles)</option>
                                    <option value="residual">Residual (com os controles)</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="av-probabilidade">Probabilidade</label>
                                <select id="av-probabilidade" className={`${CAMPO} ${erros.probabilidade ? COM_ERRO : ''}`}
                                    aria-invalid={!!erros.probabilidade} aria-describedby={erros.probabilidade ? 'av-probabilidade-erro' : undefined}
                                    value={form.probabilidade} onChange={e => set('probabilidade', e.target.value === '' ? '' : Number(e.target.value))}>
                                    <option value="">Escolha…</option>
                                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} · {ROTULO_PROBABILIDADE[n]}</option>)}
                                </select>
                                <ErroDoCampo id="av-probabilidade-erro" erro={erros.probabilidade} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <SecaoTitulo icon={Target} titulo="Impacto por dimensão" resumo="o consolidado é a maior nota, nunca a média" />
                        {form.dims.length === 0 && <p className="text-sm text-gray-600">O risco não tem dimensões marcadas. Acrescente ao menos uma abaixo.</p>}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4" id="av-impactos" tabIndex={-1}>
                            {form.dims.map(d => (
                                <div key={d} className="space-y-1.5">
                                    <label className={ROTULO} htmlFor={`av-imp-${d}`}>{RISK_ROTULO.dimensao[d]}</label>
                                    <select id={`av-imp-${d}`} className={`${CAMPO} ${erros.impactos ? COM_ERRO : ''}`}
                                        value={form.impactos[d] ?? ''}
                                        onChange={e => setForm(prev => {
                                            const impactos = { ...prev.impactos };
                                            if (e.target.value === '') delete impactos[d]; else impactos[d] = Number(e.target.value);
                                            return { ...prev, impactos };
                                        })}>
                                        <option value="">Não avaliar</option>
                                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </div>
                            ))}
                            {dimsDisponiveis.length > 0 && (
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="av-acrescentar">Acrescentar dimensão</label>
                                    <select id="av-acrescentar" className={CAMPO} value=""
                                        onChange={e => { const d = e.target.value as RiskDimensao; if (d) setForm(prev => ({ ...prev, dims: [...prev.dims, d] })); }}>
                                        <option value="">Escolha…</option>
                                        {dimsDisponiveis.map(d => <option key={d} value={d}>{RISK_ROTULO.dimensao[d]}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                        <ErroDoCampo id="av-impactos-erro" erro={erros.impactos} />

                        {/* Prévia ao vivo — a mesma conta que o banco faz ao gravar. */}
                        <div className="grid grid-cols-3 gap-3 bg-gray-50 border border-gray-100 rounded-[10px] px-4 py-3" aria-live="polite">
                            <div>
                                <p className="text-xs text-gray-500">Impacto consolidado</p>
                                <p className="text-sm font-medium text-gray-900">{impacto ?? '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Pontuação (P × I)</p>
                                <p className="text-sm font-medium text-gray-900">{pont != null ? `${form.probabilidade} × ${impacto} = ${pont}` : '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Nível</p>
                                {nivel ? <NivelTexto nivel={nivel} /> : <p className="text-sm text-gray-500">—</p>}
                            </div>
                            {risco.gatilho_critico && (
                                <p className="col-span-3 text-xs text-red-700">Este risco tem gatilho crítico: no painel e na lista ele segue crítico qualquer que seja a pontuação.</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <SecaoTitulo icon={FileText} titulo="Exposição e premissas" />
                        <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="av-pct">Probabilidade (%)</label>
                                <input id="av-pct" type="number" min={0} max={100} step="0.01" inputMode="decimal" placeholder="30"
                                    className={`${CAMPO} ${erros.pct ? COM_ERRO : ''}`} value={form.pct} onChange={e => set('pct', e.target.value)} />
                                <ErroDoCampo id="av-pct-erro" erro={erros.pct} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="av-perda">Perda estimada (R$)</label>
                                <MoneyCentsInput id="av-perda" className={CAMPO} value={form.perda} onChange={v => set('perda', v)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="av-atraso">Atraso (dias)</label>
                                <input id="av-atraso" type="number" min={0} step={1} inputMode="numeric" placeholder="0"
                                    className={`${CAMPO} ${erros.atraso ? COM_ERRO : ''}`} value={form.atraso} onChange={e => set('atraso', e.target.value)} />
                                <ErroDoCampo id="av-atraso-erro" erro={erros.atraso} />
                            </div>
                        </div>
                        <p className="text-sm text-gray-700" aria-live="polite">
                            Valor esperado: <span className="font-medium text-gray-900">{ve != null ? formatMoney(ve) : '—'}</span>
                            {ve != null && <span className="text-gray-500"> ({form.pct}% × {formatMoney(perdaNum)})</span>}
                        </p>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="av-premissas">Premissas</label>
                            <textarea id="av-premissas" className={AREA} value={form.premissas} onChange={e => set('premissas', e.target.value)}
                                placeholder="O que se supôs para chegar nesta nota (ex.: sondagem SPT de out/26, chuva acima da média)." />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="av-justificativa">Justificativa</label>
                            <textarea id="av-justificativa" className={`${AREA} ${erros.justificativa ? COM_ERRO : ''}`}
                                aria-invalid={!!erros.justificativa} aria-describedby={erros.justificativa ? 'av-justificativa-erro' : undefined}
                                value={form.justificativa} onChange={e => set('justificativa', e.target.value)} />
                            <ErroDoCampo id="av-justificativa-erro" erro={erros.justificativa} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="av-evidencia">Evidência (link)</label>
                            <input id="av-evidencia" type="url" className={CAMPO} placeholder="https://…" value={form.evidencia} onChange={e => set('evidencia', e.target.value)} />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => setAberto(false)} className={BOTAO_SECUNDARIO}>Cancelar</button>
                        <button type="button" onClick={registrar} disabled={salvando} className={BOTAO_PRIMARIO}>
                            {salvando ? 'Registrando…' : 'Registrar avaliação'}
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Histórico de avaliações</h3>
                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : avaliacoes.length === 0 ? (
                    <div className="text-center py-12">
                        <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma avaliação ainda</h3>
                        <p className="text-sm text-gray-500">Comece pela inerente: a leitura do risco sem considerar os controles.</p>
                    </div>
                ) : (
                    <ol className="space-y-3">
                        {avaliacoes.map(a => <ItemAvaliacao key={a.id} a={a} faixas={faixas} />)}
                    </ol>
                )}
            </div>
        </div>
    );
};

const ItemAvaliacao: React.FC<{ a: RiskEvaluation; faixas: RiskMatrixConfig }> = ({ a, faixas }) => {
    const notas = (Object.entries(a.impactos) as [RiskDimensao, number][]).filter(([, n]) => typeof n === 'number');
    return (
        <li className="bg-white rounded-[10px] border border-gray-100 px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                    {a.tipo === 'inerente' ? 'Inerente' : 'Residual'}
                    <span className="font-normal text-gray-600"> · {formatDateTimeBR(a.avaliado_em)} · {a.avaliado_por_nome || 'autor não registrado'}</span>
                </p>
                <NivelTexto nivel={nivelDaPontuacao(a.pontuacao, faixas)} />
            </div>
            <p className="text-sm text-gray-700">
                Probabilidade {a.probabilidade} ({ROTULO_PROBABILIDADE[a.probabilidade]}) × impacto {a.impacto} = <span className="font-medium text-gray-900">{a.pontuacao}</span>
            </p>
            {notas.length > 0 && (
                <p className="text-sm text-gray-600">Impactos: {notas.map(([d, n]) => `${RISK_ROTULO.dimensao[d]} ${n}`).join(' · ')}</p>
            )}
            {(a.valor_esperado != null || a.atraso_dias != null) && (
                <p className="text-sm text-gray-600">
                    {a.valor_esperado != null && <>Valor esperado <span className="font-medium text-gray-800">{formatMoney(Number(a.valor_esperado))}</span> ({Number(a.probabilidade_pct)}% × {formatMoney(Number(a.perda_estimada))})</>}
                    {a.valor_esperado != null && a.atraso_dias != null && ' · '}
                    {a.atraso_dias != null && <>Atraso {a.atraso_dias} dia{a.atraso_dias === 1 ? '' : 's'}</>}
                </p>
            )}
            {a.premissas && <p className="text-sm text-gray-700 whitespace-pre-line"><span className="text-gray-500">Premissas: </span>{a.premissas}</p>}
            <p className="text-sm text-gray-700 whitespace-pre-line"><span className="text-gray-500">Justificativa: </span>{a.justificativa}</p>
            {a.evidencia_url && (
                <a href={a.evidencia_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                    <ExternalLink className="w-3.5 h-3.5" /> Evidência
                </a>
            )}
        </li>
    );
};

export default RiscoAvaliacoes;
