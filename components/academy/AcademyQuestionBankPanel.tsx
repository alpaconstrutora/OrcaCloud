import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, HelpCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { academyService } from '../../services/academyService';
import type {
    AcademyAssessment, AcademyModule, AcademyQuestion, AcademyQuestionTipo,
} from '../../types/academy';

/**
 * Banco de questões + montagem da avaliação.
 *
 * O gabarito vive só aqui, no lado do RH. Quando o aluno faz a prova, o RPC
 * projeta apenas (id, texto) das alternativas — não existe caminho pelo qual
 * `correta` chegue ao navegador dele.
 */

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

const TIPOS: Array<{ id: AcademyQuestionTipo; label: string }> = [
    { id: 'MULTIPLA_ESCOLHA',  label: 'Múltipla escolha (uma correta)' },
    { id: 'MULTIPLA_RESPOSTA', label: 'Múltipla resposta (várias corretas)' },
    { id: 'VERDADEIRO_FALSO',  label: 'Verdadeiro ou falso' },
];

interface Props {
    orgId: string;
    versionId: string;
    modules: AcademyModule[];
    somenteLeitura: boolean;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

interface RascunhoOpcao { texto: string; correta: boolean }

const AcademyQuestionBankPanel: React.FC<Props> = ({
    orgId, versionId, modules, somenteLeitura, notify,
}) => {
    const confirm = useConfirm();
    const [questoes, setQuestoes] = useState<AcademyQuestion[]>([]);
    const [provas, setProvas] = useState<AcademyAssessment[]>([]);
    const [vinculadas, setVinculadas] = useState<string[]>([]);
    const [provaAtiva, setProvaAtiva] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [aberto, setAberto] = useState(false);

    const [nova, setNova] = useState<{
        enunciado: string; tipo: AcademyQuestionTipo; explicacao: string; opcoes: RascunhoOpcao[];
    }>({
        enunciado: '', tipo: 'MULTIPLA_ESCOLHA', explicacao: '',
        opcoes: [{ texto: '', correta: true }, { texto: '', correta: false }],
    });

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const [qs, as] = await Promise.all([
                academyService.listQuestions(versionId),
                academyService.listAssessments(versionId),
            ]);
            setQuestoes(qs);
            setProvas(as);
            const ativa = provaAtiva && as.some(a => a.id === provaAtiva) ? provaAtiva : as[0]?.id ?? null;
            setProvaAtiva(ativa);
            setVinculadas(ativa ? await academyService.listAssessmentQuestionIds(ativa) : []);
        } catch (e: any) {
            notify('Erro ao carregar avaliações: ' + (e?.message || ''), 'error');
        } finally {
            setCarregando(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versionId]);

    useEffect(() => { void carregar(); }, [carregar]);

    useEffect(() => {
        if (!provaAtiva) { setVinculadas([]); return; }
        void academyService.listAssessmentQuestionIds(provaAtiva).then(setVinculadas);
    }, [provaAtiva]);

    // ── Prova ───────────────────────────────────────────────────────────

    const criarProva = async () => {
        try {
            const p = await academyService.createAssessment({
                org_id: orgId, version_id: versionId,
                titulo: 'Avaliação final', tipo: 'FINAL', nota_minima: 7,
                embaralhar_questoes: true, embaralhar_opcoes: true,
                tentativas_max: 3, mostrar_gabarito: false, ativa: true,
            });
            setProvas(prev => [...prev, p]);
            setProvaAtiva(p.id);
            notify('Avaliação criada.');
        } catch (e: any) {
            notify('Erro ao criar avaliação: ' + (e?.message || ''), 'error');
        }
    };

    const salvarProva = async <K extends keyof AcademyAssessment>(campo: K, valor: AcademyAssessment[K]) => {
        if (!provaAtiva) return;
        setProvas(prev => prev.map(p => p.id === provaAtiva ? { ...p, [campo]: valor } : p));
        try {
            await academyService.updateAssessment(provaAtiva, { [campo]: valor } as Partial<AcademyAssessment>);
        } catch {
            notify('Não foi possível salvar a avaliação.', 'error');
        }
    };

    const alternarVinculo = async (questionId: string) => {
        if (!provaAtiva) return;
        const novo = vinculadas.includes(questionId)
            ? vinculadas.filter(id => id !== questionId)
            : [...vinculadas, questionId];
        setVinculadas(novo);
        try {
            await academyService.setAssessmentQuestions({
                orgId, assessmentId: provaAtiva, questionIds: novo,
            });
        } catch {
            notify('Não foi possível atualizar a prova.', 'error');
            setVinculadas(vinculadas);
        }
    };

    // ── Questões ────────────────────────────────────────────────────────

    const limparNova = () => {
        setNova({
            enunciado: '', tipo: 'MULTIPLA_ESCOLHA', explicacao: '',
            opcoes: [{ texto: '', correta: true }, { texto: '', correta: false }],
        });
        setAberto(false);
    };

    const trocarTipo = (tipo: AcademyQuestionTipo) => {
        setNova(p => ({
            ...p,
            tipo,
            opcoes: tipo === 'VERDADEIRO_FALSO'
                ? [{ texto: 'Verdadeiro', correta: true }, { texto: 'Falso', correta: false }]
                : p.opcoes,
        }));
    };

    const marcarCorreta = (i: number) => {
        setNova(p => ({
            ...p,
            opcoes: p.opcoes.map((o, idx) =>
                p.tipo === 'MULTIPLA_RESPOSTA'
                    ? (idx === i ? { ...o, correta: !o.correta } : o)
                    : { ...o, correta: idx === i }),
        }));
    };

    const adicionarQuestao = async () => {
        if (!nova.enunciado.trim()) { notify('Escreva o enunciado.', 'error'); return; }
        const validas = nova.opcoes.filter(o => o.texto.trim());
        if (validas.length < 2) { notify('Informe pelo menos duas alternativas.', 'error'); return; }
        if (!validas.some(o => o.correta)) { notify('Marque a alternativa correta.', 'error'); return; }

        setSalvando(true);
        try {
            const criada = await academyService.createQuestion(
                {
                    org_id: orgId, version_id: versionId,
                    enunciado: nova.enunciado.trim(), tipo: nova.tipo,
                    explicacao: nova.explicacao.trim() || undefined,
                    peso: 1, ordem: questoes.length, ativa: true,
                },
                validas.map((o, i) => ({ texto: o.texto.trim(), correta: o.correta, ordem: i }))
            );
            setQuestoes(prev => [...prev, { ...criada, opcoes: [] }]);
            limparNova();
            notify('Questão adicionada.');
        } catch (e: any) {
            notify('Erro ao adicionar questão: ' + (e?.message || ''), 'error');
        } finally {
            setSalvando(false);
        }
    };

    const excluirQuestao = async (q: AcademyQuestion) => {
        const ok = await confirm({
            title: 'Excluir questão?',
            message: 'A questão sai do banco e de todas as avaliações desta versão.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await academyService.deleteQuestion(q.id);
        setQuestoes(prev => prev.filter(x => x.id !== q.id));
        setVinculadas(prev => prev.filter(id => id !== q.id));
    };

    if (carregando) {
        return (
            <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                <p className="mt-2 text-gray-500">Carregando avaliações...</p>
            </div>
        );
    }

    const prova = provas.find(p => p.id === provaAtiva) ?? null;

    return (
        <div className="space-y-3">
            {/* ── Configuração da prova ── */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <ClipboardList className="w-4 h-4 text-gray-400 shrink-0" />
                        {provas.length > 0 ? (
                            <select
                                value={provaAtiva ?? ''}
                                onChange={e => setProvaAtiva(e.target.value)}
                                className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none"
                            >
                                {provas.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
                            </select>
                        ) : (
                            <span className="text-sm font-normal text-gray-500">Nenhuma avaliação nesta versão</span>
                        )}
                    </div>
                    <button
                        onClick={criarProva}
                        disabled={somenteLeitura}
                        title={somenteLeitura ? 'Versão não editável' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                    >
                        <Plus className="w-[15px] h-[15px]" /> Nova avaliação
                    </button>
                </div>

                {prova && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-gray-100 pt-4">
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-xs font-semibold text-gray-500">Título</label>
                            <input
                                value={prova.titulo}
                                onChange={e => salvarProva('titulo', e.target.value)}
                                disabled={somenteLeitura}
                                className={inputCls}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Nota mínima</label>
                            <input
                                type="number" min="0" max="10" step="0.1"
                                value={prova.nota_minima}
                                onChange={e => salvarProva('nota_minima', parseFloat(e.target.value) || 0)}
                                disabled={somenteLeitura}
                                className={inputCls}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Tentativas</label>
                            <input
                                type="number" min="1"
                                value={prova.tentativas_max}
                                onChange={e => salvarProva('tentativas_max', parseInt(e.target.value) || 1)}
                                disabled={somenteLeitura}
                                className={inputCls}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Questões sorteadas</label>
                            <input
                                type="number" min="1"
                                value={prova.qtd_questoes ?? ''}
                                placeholder="todas"
                                onChange={e => salvarProva('qtd_questoes', e.target.value ? parseInt(e.target.value) : undefined)}
                                disabled={somenteLeitura}
                                className={inputCls}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Tempo limite (min)</label>
                            <input
                                type="number" min="1"
                                value={prova.tempo_limite_minutos ?? ''}
                                placeholder="sem limite"
                                onChange={e => salvarProva('tempo_limite_minutos', e.target.value ? parseInt(e.target.value) : undefined)}
                                disabled={somenteLeitura}
                                className={inputCls}
                            />
                        </div>
                        <div className="md:col-span-2 flex items-end gap-4 pb-2">
                            {([
                                ['embaralhar_questoes', 'Embaralhar questões'],
                                ['embaralhar_opcoes', 'Embaralhar alternativas'],
                                ['mostrar_gabarito', 'Mostrar correção'],
                            ] as Array<[keyof AcademyAssessment, string]>).map(([campo, label]) => (
                                <label key={campo} className="flex items-center gap-2 text-sm font-normal text-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!prova[campo]}
                                        onChange={e => salvarProva(campo, e.target.checked as never)}
                                        disabled={somenteLeitura}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Banco de questões ── */}
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500">
                    Banco de questões · {questoes.length} no total
                    {prova && ` · ${vinculadas.length} nesta avaliação`}
                </p>
                <button
                    onClick={() => setAberto(v => !v)}
                    disabled={somenteLeitura}
                    title={somenteLeitura ? 'Versão não editável' : undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                >
                    <Plus className="w-[15px] h-[15px]" /> Nova questão
                </button>
            </div>

            {aberto && !somenteLeitura && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500">Enunciado</label>
                        <textarea
                            value={nova.enunciado}
                            onChange={e => setNova(p => ({ ...p, enunciado: e.target.value }))}
                            className={inputCls + ' resize-none h-20'}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500">Tipo</label>
                        <select
                            value={nova.tipo}
                            onChange={e => trocarTipo(e.target.value as AcademyQuestionTipo)}
                            className={inputCls}
                        >
                            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-500">
                            Alternativas — clique no círculo para marcar a correta
                        </label>
                        {nova.opcoes.map((o, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => marcarCorreta(i)}
                                    className={`w-5 h-5 rounded-full border-2 shrink-0 transition-all ${
                                        o.correta ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 bg-white'
                                    }`}
                                    title={o.correta ? 'Correta' : 'Marcar como correta'}
                                />
                                <input
                                    value={o.texto}
                                    onChange={e => setNova(p => ({
                                        ...p,
                                        opcoes: p.opcoes.map((x, idx) => idx === i ? { ...x, texto: e.target.value } : x),
                                    }))}
                                    disabled={nova.tipo === 'VERDADEIRO_FALSO'}
                                    className={inputCls}
                                    placeholder={`Alternativa ${i + 1}`}
                                />
                                {nova.tipo !== 'VERDADEIRO_FALSO' && nova.opcoes.length > 2 && (
                                    <button
                                        type="button"
                                        onClick={() => setNova(p => ({ ...p, opcoes: p.opcoes.filter((_, idx) => idx !== i) }))}
                                        className="p-1.5 text-gray-400 hover:text-rose-500 rounded-[6px] shrink-0"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {nova.tipo !== 'VERDADEIRO_FALSO' && (
                            <button
                                type="button"
                                onClick={() => setNova(p => ({ ...p, opcoes: [...p.opcoes, { texto: '', correta: false }] }))}
                                className="flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] text-sm font-medium text-blue-600 hover:bg-blue-50 transition-all"
                            >
                                <Plus className="w-3.5 h-3.5" /> Alternativa
                            </button>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500">Explicação (opcional)</label>
                        <input
                            value={nova.explicacao}
                            onChange={e => setNova(p => ({ ...p, explicacao: e.target.value }))}
                            className={inputCls}
                            placeholder="Mostrada na correção, quando habilitada."
                        />
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                        <button onClick={limparNova} className="h-9 px-3 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100">
                            Cancelar
                        </button>
                        <button
                            onClick={adicionarQuestao}
                            disabled={salvando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                        >
                            {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : null}
                            {salvando ? 'Salvando...' : 'Adicionar questão'}
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {questoes.length === 0 ? (
                    <div className="text-center py-12">
                        <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Banco de questões vazio</h3>
                        <p className="text-sm text-gray-500">
                            Sem questões, a versão só pode exigir percentual assistido.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {questoes.map((q, i) => (
                            <div key={q.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-blue-50/50 transition-colors">
                                {prova && (
                                    <input
                                        type="checkbox"
                                        checked={vinculadas.includes(q.id)}
                                        onChange={() => alternarVinculo(q.id)}
                                        disabled={somenteLeitura}
                                        title="Incluir nesta avaliação"
                                        className="w-4 h-4 mt-1 rounded border-gray-300 text-blue-600 shrink-0"
                                    />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-normal text-gray-900">{i + 1}. {q.enunciado}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {TIPOS.find(t => t.id === q.tipo)?.label}
                                    </p>
                                </div>
                                <ActionIconButton kind="delete" onClick={() => excluirQuestao(q)} disabled={somenteLeitura} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AcademyQuestionBankPanel;
