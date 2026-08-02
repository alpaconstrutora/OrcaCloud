import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, XCircle } from 'lucide-react';
import { useConfirm } from '../ui/confirm';
import type { AcademyAttemptResult, AcademyAttemptStart } from '../../types/academy';
import type { AcademyChannel } from './academyChannel';

/**
 * Avaliação — TELA (troca in-flow, sem overlay): exige foco e tem timer.
 *
 * O gabarito NUNCA chega aqui: `startAttempt` devolve as opções sem o campo
 * `correta` e a correção acontece no servidor, em `submitAttempt`. Não há
 * caminho de código que decida acerto no cliente.
 */

interface Props {
    enrollmentId: string;
    assessmentId: string;
    titulo: string;
    channel: AcademyChannel;
    onVoltar: () => void;
    onConcluida: () => void;
}

const AcademyQuizRunner: React.FC<Props> = ({
    enrollmentId, assessmentId, titulo, channel, onVoltar, onConcluida,
}) => {
    const confirm = useConfirm();
    const [prova, setProva] = useState<AcademyAttemptStart | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [indice, setIndice] = useState(0);
    const [respostas, setRespostas] = useState<Record<string, string[]>>({});
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState<AcademyAttemptResult | null>(null);
    const [restante, setRestante] = useState<number | null>(null);

    useEffect(() => {
        let cancelado = false;
        (async () => {
            try {
                const p = await channel.startAttempt(enrollmentId, assessmentId);
                if (!cancelado) setProva(p);
            } catch (e: any) {
                if (!cancelado) setErro(e?.message || 'Não foi possível iniciar a avaliação.');
            }
        })();
        return () => { cancelado = true; };
    }, [enrollmentId, assessmentId, channel]);

    // Timer da prova.
    useEffect(() => {
        if (!prova?.expira_em) return;
        const tick = () => {
            const s = Math.max(0, Math.floor((new Date(prova.expira_em!).getTime() - Date.now()) / 1000));
            setRestante(s);
        };
        tick();
        const id = window.setInterval(tick, 1000);
        return () => window.clearInterval(id);
    }, [prova?.expira_em]);

    const questoes = prova?.questoes ?? [];
    const questao = questoes[indice];
    const respondidas = useMemo(
        () => questoes.filter(q => (respostas[q.id]?.length ?? 0) > 0).length,
        [questoes, respostas]
    );

    const marcar = (questaoId: string, opcaoId: string, multipla: boolean) => {
        setRespostas(prev => {
            const atual = prev[questaoId] ?? [];
            if (!multipla) return { ...prev, [questaoId]: [opcaoId] };
            return {
                ...prev,
                [questaoId]: atual.includes(opcaoId)
                    ? atual.filter(id => id !== opcaoId)
                    : [...atual, opcaoId],
            };
        });
    };

    const enviar = async () => {
        if (!prova) return;
        if (respondidas < questoes.length) {
            const ok = await confirm({
                title: 'Enviar com questões em branco?',
                message: `Você respondeu ${respondidas} de ${questoes.length}. As não respondidas contam como erro.`,
                variant: 'warning',
                confirmLabel: 'Enviar mesmo assim',
            });
            if (!ok) return;
        }

        setEnviando(true);
        try {
            const r = await channel.submitAttempt({
                enrollmentId,
                attemptId: prova.attempt_id,
                answers: questoes.map(q => ({ question_id: q.id, option_ids: respostas[q.id] ?? [] })),
            });
            setResultado(r);
            onConcluida();
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível enviar a avaliação.');
        } finally {
            setEnviando(false);
        }
    };

    const Cabecalho = (
        <div className="flex items-center gap-4">
            <button
                onClick={onVoltar}
                className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group shrink-0"
            >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            </button>
            <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-blue-600 truncate">Avaliação</span>
                    {prova && (
                        <>
                            <span className="w-1 h-1 bg-gray-300 rounded-full shrink-0" />
                            <span className="text-xs font-medium text-gray-400">
                                Tentativa {prova.numero_tentativa} · nota mínima {prova.nota_minima}
                            </span>
                        </>
                    )}
                </div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-tight truncate">{titulo}</h1>
            </div>
            {restante !== null && !resultado && (
                <div className={`ml-auto flex items-center gap-1.5 h-9 px-3 rounded-[6px] border text-sm font-medium ${
                    restante < 60 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-gray-200 bg-white text-gray-600'
                }`}>
                    <Clock className="w-4 h-4" />
                    {String(Math.floor(restante / 60)).padStart(2, '0')}:{String(restante % 60).padStart(2, '0')}
                </div>
            )}
        </div>
    );

    if (erro) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500 pb-4">
                {Cabecalho}
                <div className="text-center py-12">
                    <XCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Avaliação indisponível</h3>
                    <p className="text-sm text-gray-500">{erro}</p>
                </div>
            </div>
        );
    }

    if (resultado) {
        const aprovado = resultado.aprovado;
        return (
            <div className="space-y-6 animate-in fade-in duration-500 pb-4">
                {Cabecalho}
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-8 text-center">
                    {aprovado
                        ? <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                        : <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />}
                    <h3 className="text-lg font-bold text-gray-900 mb-2">
                        {aprovado ? 'Aprovado' : 'Não atingiu a nota mínima'}
                    </h3>
                    <p className="text-sm text-gray-500">
                        Nota {resultado.nota} · {resultado.acertos} de {resultado.total} corretas
                        {resultado.nota_minima != null && ` · mínimo ${resultado.nota_minima}`}
                    </p>
                    <button
                        onClick={onVoltar}
                        className="mt-6 inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95"
                    >
                        Voltar ao treinamento
                    </button>
                </div>

                {resultado.gabarito && (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6 space-y-3">
                        <h4 className="text-sm font-semibold text-gray-700">Correção</h4>
                        {resultado.gabarito.map((g, i) => {
                            const q = questoes.find(x => x.id === g.question_id);
                            return (
                                <div key={g.question_id} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                                    <p className="text-sm font-normal text-gray-800">{i + 1}. {q?.enunciado}</p>
                                    <p className={`text-sm font-normal mt-1 ${g.correta ? 'text-emerald-700' : 'text-rose-700'}`}>
                                        {g.correta ? 'Correta' : 'Incorreta'}
                                    </p>
                                    {g.explicacao && <p className="text-xs text-gray-500 mt-1">{g.explicacao}</p>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    if (!prova || !questao) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500 pb-4">
                {Cabecalho}
                <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                    <p className="mt-2 text-gray-500">Preparando a avaliação...</p>
                </div>
            </div>
        );
    }

    const multipla = questao.tipo === 'MULTIPLA_RESPOSTA';
    const selecionadas = respostas[questao.id] ?? [];

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-4">
            {Cabecalho}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">
                        Questão {indice + 1} de {questoes.length}
                    </span>
                    <span className="text-sm font-normal text-gray-400">
                        {respondidas} respondida{respondidas === 1 ? '' : 's'}
                    </span>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-sm font-normal text-gray-900 leading-relaxed">{questao.enunciado}</p>
                    {multipla && (
                        <p className="text-xs text-gray-400">Selecione todas as alternativas corretas.</p>
                    )}

                    <div className="space-y-2">
                        {questao.opcoes.map(o => {
                            const sel = selecionadas.includes(o.id);
                            return (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => marcar(questao.id, o.id, multipla)}
                                    className={`w-full text-left px-4 py-3 rounded-[6px] border text-sm font-normal transition-all ${
                                        sel
                                            ? 'border-blue-300 bg-blue-50 text-blue-900'
                                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    {o.texto}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <button
                        onClick={() => setIndice(i => Math.max(0, i - 1))}
                        disabled={indice === 0}
                        className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    >
                        <ChevronLeft className="w-4 h-4" /> Anterior
                    </button>

                    {indice < questoes.length - 1 ? (
                        <button
                            onClick={() => setIndice(i => Math.min(questoes.length - 1, i + 1))}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95"
                        >
                            Próxima <ChevronRight className="w-[15px] h-[15px]" />
                        </button>
                    ) : (
                        <button
                            onClick={enviar}
                            disabled={enviando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                        >
                            {enviando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : null}
                            {enviando ? 'Enviando...' : 'Enviar avaliação'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AcademyQuizRunner;
