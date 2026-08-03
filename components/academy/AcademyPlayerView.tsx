import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft, Award, CheckCircle2, ClipboardList, Download, FileText,
    Loader2, Lock, PlayCircle, ShieldCheck,
} from 'lucide-react';
import { useConfirm } from '../ui/confirm';
import { useLessonHeartbeat } from '../../hooks/useLessonHeartbeat';
import { academyCertificadoService } from '../../services/academyCertificadoService';
import AcademyLessonPlayer from './AcademyLessonPlayer';
import AcademyQuizRunner from './AcademyQuizRunner';
import type { AcademyPlayerContent, AcademyPlayerLesson } from '../../types/academy';
import type { AcademyChannel } from './academyChannel';

/**
 * Sala de aula — TELA (troca in-flow, seta de voltar + <h1>, sem overlay).
 * Vídeo em painel lateral de 420px seria inutilizável.
 *
 * O mesmo componente serve o app logado e o portal: o que muda é o
 * `AcademyChannel` recebido por prop.
 *
 * Regra que a tela materializa: "Concluir aula" NUNCA decide no cliente —
 * chama o servidor e reage à resposta (inclusive quando ele nega).
 */

/** Timestamp completo — é ISO com hora, então new Date() é seguro aqui. */
const fmtDataHora = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

interface Props {
    enrollmentId: string;
    titulo: string;
    subtitulo?: string;
    channel: AcademyChannel;
    onVoltar: () => void;
    /** Compacta o layout no portal mobile (max-w-md). */
    compacto?: boolean;
}

const AcademyPlayerView: React.FC<Props> = ({
    enrollmentId, titulo, subtitulo, channel, onVoltar, compacto = false,
}) => {
    const confirm = useConfirm();
    const [conteudo, setConteudo] = useState<AcademyPlayerContent | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [aulaAtivaId, setAulaAtivaId] = useState<string | null>(null);
    const [tocando, setTocando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    const [concluindo, setConcluindo] = useState(false);
    const [baixandoCert, setBaixandoCert] = useState(false);
    const [dandoCiencia, setDandoCiencia] = useState(false);
    const [provaAberta, setProvaAberta] = useState<{ id: string; titulo: string } | null>(null);

    const getPosicaoRef = useRef<() => number>(() => 0);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const c = await channel.getContent(enrollmentId);
            setConteudo(c);
            setErro(null);
            setAulaAtivaId(prev => {
                if (prev) return prev;
                // Abre na primeira aula não concluída — a retomada natural.
                const todas = c.modulos.flatMap(m => m.aulas);
                return (todas.find(a => !a.progresso.concluida) ?? todas[0])?.id ?? null;
            });
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível carregar o treinamento.');
        } finally {
            setCarregando(false);
        }
    }, [channel, enrollmentId]);

    useEffect(() => { void carregar(); }, [carregar]);

    const aulas = useMemo(
        () => conteudo?.modulos.flatMap(m => m.aulas) ?? [],
        [conteudo]
    );
    const aulaAtiva: AcademyPlayerLesson | undefined =
        aulas.find(a => a.id === aulaAtivaId) ?? aulas[0];

    // Ordem obrigatória: a aula N só abre com a N-1 concluída (o servidor
    // também barra; aqui é só para não oferecer o que vai ser negado).
    const aulaBloqueada = useCallback((aulaId: string) => {
        if (!conteudo?.versao.ordem_obrigatoria) return false;
        const idx = aulas.findIndex(a => a.id === aulaId);
        return aulas.slice(0, idx).some(a => a.obrigatoria && !a.progresso.concluida);
    }, [aulas, conteudo?.versao.ordem_obrigatoria]);

    const onBeat = useCallback(
        (args: { posicao: number; delta: number }) =>
            channel.heartbeat({ enrollmentId, lessonId: aulaAtiva!.id, ...args }),
        [channel, enrollmentId, aulaAtiva]
    );

    const { percentual, flush } = useLessonHeartbeat({
        enrollmentId,
        lessonId: aulaAtiva?.id ?? '',
        onBeat,
        getPosicao: () => getPosicaoRef.current(),
        ativo: tocando && !!aulaAtiva,
    });

    const percentualAtual = Math.max(percentual, aulaAtiva?.progresso.percentual ?? 0);

    const concluirAula = async () => {
        if (!aulaAtiva) return;
        setConcluindo(true);
        setAviso(null);
        try {
            await flush();   // credita o trecho pendente antes de pedir a conclusão
            const r = await channel.completeLesson(enrollmentId, aulaAtiva.id);
            if (!r.concluida) {
                setAviso(r.motivo || `Faltam ${Math.max(0, Math.round(r.minimo - r.percentual))}% para concluir esta aula.`);
                return;
            }
            await carregar();
            const proxima = aulas[aulas.findIndex(a => a.id === aulaAtiva.id) + 1];
            if (proxima) setAulaAtivaId(proxima.id);
        } catch (e: any) {
            setAviso(e?.message || 'Não foi possível concluir a aula.');
        } finally {
            setConcluindo(false);
        }
    };

    const darCiencia = async () => {
        setDandoCiencia(true);
        try {
            await channel.ackVersion(enrollmentId);
            await carregar();
        } catch (e: any) {
            setAviso(e?.message || 'Não foi possível registrar a ciência.');
        } finally {
            setDandoCiencia(false);
        }
    };

    const aceitar = async () => {
        const ok = await confirm({
            title: 'Confirmar aceite',
            message: conteudo?.versao.texto_aceite
                || 'Declaro que participei do treinamento e compreendi o conteúdo apresentado.',
            variant: 'default',
            confirmLabel: 'Aceito',
        });
        if (!ok) return;
        await channel.accept(enrollmentId);
        await carregar();
    };

    const finalizar = async () => {
        try {
            const r = await channel.finalize(enrollmentId);
            if (!r.concluido) {
                setAviso(r.motivo || 'Ainda há requisitos pendentes.');
                return;
            }
            await carregar();
        } catch (e: any) {
            setAviso(e?.message || 'Não foi possível concluir o treinamento.');
        }
    };

    /**
     * O PDF é gerado sob demanda na primeira vez e guardado no bucket; nas
     * próximas, só assina o arquivo existente.
     * No portal não há sessão Supabase para desenhar/subir o PDF — lá o
     * caminho é a Edge Function, que devolve o arquivo já armazenado.
     */
    const baixarCertificado = async () => {
        const certId = conteudo?.enrollment.certificate_id;
        if (!certId) return;
        setBaixandoCert(true);
        try {
            if (channel.canal === 'PORTAL') {
                const url = await channel.getCertificateUrl(certId);
                window.open(url, '_blank', 'noopener');
            } else {
                const url = await academyCertificadoService.emitirEArmazenar(certId);
                window.open(url, '_blank', 'noopener');
            }
        } catch (e: any) {
            setAviso(e?.message || 'Não foi possível abrir o certificado.');
        } finally {
            setBaixandoCert(false);
        }
    };

    const baixarMaterial = async (materialId: string, url?: string) => {
        if (url) { window.open(url, '_blank', 'noopener'); return; }
        try {
            const link = await channel.getMaterialUrl(materialId);
            window.open(link, '_blank', 'noopener');
        } catch (e: any) {
            setAviso(e?.message || 'Não foi possível abrir o material.');
        }
    };

    // ── Avaliação abre como TELA própria ────────────────────────────────
    if (provaAberta) {
        return (
            <AcademyQuizRunner
                enrollmentId={enrollmentId}
                assessmentId={provaAberta.id}
                titulo={provaAberta.titulo}
                channel={channel}
                onVoltar={() => { setProvaAberta(null); void carregar(); }}
                onConcluida={() => { void carregar(); }}
            />
        );
    }

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
                    <span className="text-xs font-medium text-blue-600 truncate">Sala de treinamento</span>
                    {conteudo && (
                        <>
                            <span className="w-1 h-1 bg-gray-300 rounded-full shrink-0" />
                            <span className="text-xs font-medium text-gray-400">
                                v{conteudo.versao.versao} · {Math.round(conteudo.enrollment.percentual)}% concluído
                            </span>
                        </>
                    )}
                </div>
                <h1 className={`${compacto ? 'text-lg' : 'text-2xl'} font-black text-gray-900 tracking-tight leading-tight truncate`}>
                    {titulo}
                </h1>
                {subtitulo && <p className="text-gray-400 text-sm mt-1.5 font-medium truncate">{subtitulo}</p>}
            </div>
        </div>
    );

    if (carregando && !conteudo) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500 pb-4">
                {Cabecalho}
                <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                    <p className="mt-2 text-gray-500">Carregando treinamento...</p>
                </div>
            </div>
        );
    }

    if (erro || !conteudo || !aulaAtiva) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500 pb-4">
                {Cabecalho}
                <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Treinamento sem conteúdo disponível</h3>
                    <p className="text-sm text-gray-500">{erro || 'Nenhuma aula publicada nesta versão.'}</p>
                </div>
            </div>
        );
    }

    const concluido = conteudo.enrollment.status === 'CONCLUIDO';
    const materiaisDaAula = conteudo.materiais.filter(
        m => !m.lesson_id || m.lesson_id === aulaAtiva.id
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-4">
            {Cabecalho}

            {/* Ciência da mudança: só mostrar o aviso não prova que a pessoa
                leu. O clique vira evento no log append-only, junto com data,
                canal e user agent — é isso que sustenta a evidência depois. */}
            {conteudo.versao.notas_versao && (
                <div className={`p-4 rounded-[10px] flex items-start gap-3 border ${
                    conteudo.versao.ciencia_em
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-amber-50 border-amber-200'
                }`}>
                    <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${
                        conteudo.versao.ciencia_em ? 'text-gray-400' : 'text-amber-600'
                    }`} />
                    <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold ${
                            conteudo.versao.ciencia_em ? 'text-gray-700' : 'text-amber-900'
                        }`}>
                            O que mudou nesta versão
                        </p>
                        <p className={`text-xs mt-1 ${
                            conteudo.versao.ciencia_em ? 'text-gray-500' : 'text-amber-800'
                        }`}>
                            {conteudo.versao.notas_versao}
                        </p>

                        {conteudo.versao.ciencia_em ? (
                            <p className="text-xs text-gray-400 mt-2">
                                Ciência registrada em {fmtDataHora(conteudo.versao.ciencia_em)}.
                            </p>
                        ) : (
                            <button
                                onClick={darCiencia}
                                disabled={dandoCiencia}
                                className="mt-3 flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                            >
                                {dandoCiencia ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : null}
                                Li e entendi a mudança
                            </button>
                        )}
                    </div>
                </div>
            )}

            {aviso && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-[10px] text-xs font-medium text-amber-900">
                    {aviso}
                </div>
            )}

            <div className={`flex gap-6 items-start ${compacto ? 'flex-col' : 'flex-col lg:flex-row'}`}>
                {/* ── Sumário (§19.2, árvore de 2 níveis dentro da tela) ── */}
                <aside className={`${compacto ? 'w-full' : 'w-full lg:w-64'} shrink-0 bg-gray-50 border border-gray-100 rounded-[10px] p-2 flex flex-col gap-0.5 max-h-[70vh] overflow-y-auto`}>
                    {conteudo.modulos.map(m => (
                        <div key={m.id} className="mb-1">
                            <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                {m.titulo}
                            </p>
                            <div className="flex flex-col gap-0.5">
                                {m.aulas.map(a => {
                                    const ativa = a.id === aulaAtiva.id;
                                    const bloqueada = aulaBloqueada(a.id);
                                    return (
                                        <button
                                            key={a.id}
                                            onClick={() => !bloqueada && setAulaAtivaId(a.id)}
                                            disabled={bloqueada}
                                            title={bloqueada ? 'Conclua a aula anterior primeiro' : undefined}
                                            className={`flex items-center gap-2.5 w-full px-3 h-9 rounded-[6px] text-sm font-medium text-left transition-all ${
                                                ativa ? 'bg-white text-blue-600 shadow-sm'
                                                      : bloqueada ? 'text-gray-300 cursor-not-allowed'
                                                      : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                                            }`}
                                        >
                                            {a.progresso.concluida
                                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                : bloqueada
                                                    ? <Lock className="w-4 h-4 shrink-0" />
                                                    : <PlayCircle className="w-4 h-4 shrink-0" />}
                                            <span className="truncate">{a.titulo}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {conteudo.avaliacoes.length > 0 && (
                        <div className="mt-2 border-t border-gray-200 pt-2">
                            <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                Avaliações
                            </p>
                            {conteudo.avaliacoes.map(a => {
                                const semTentativas = a.tentativas_usadas >= a.tentativas_max;
                                return (
                                    <button
                                        key={a.id}
                                        onClick={() => setProvaAberta({ id: a.id, titulo: a.titulo })}
                                        disabled={semTentativas}
                                        title={semTentativas ? 'Limite de tentativas atingido' : undefined}
                                        className={`flex items-center gap-2.5 w-full px-3 h-9 rounded-[6px] text-sm font-medium text-left transition-all ${
                                            semTentativas ? 'text-gray-300 cursor-not-allowed'
                                                          : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                                        }`}
                                    >
                                        <ClipboardList className="w-4 h-4 shrink-0" />
                                        <span className="truncate">{a.titulo}</span>
                                        {a.melhor_nota != null && (
                                            <span className="ml-auto text-sm font-normal text-gray-400">{a.melhor_nota}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </aside>

                {/* ── Aula ── */}
                <div className="flex-1 min-w-0 space-y-4">
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
                        <div>
                            <h2 className="text-base font-bold text-gray-900">{aulaAtiva.titulo}</h2>
                            {aulaAtiva.descricao && (
                                <p className="text-sm text-gray-500 mt-1">{aulaAtiva.descricao}</p>
                            )}
                        </div>

                        <AcademyLessonPlayer
                            key={aulaAtiva.id}
                            lesson={aulaAtiva}
                            channel={channel}
                            posicaoInicial={aulaAtiva.progresso.posicao_segundos}
                            onPlayingChange={setTocando}
                            onPositionRef={g => { getPosicaoRef.current = g; }}
                        />

                        {/* Progresso desta aula */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm font-normal">
                                <span className="text-gray-500">Progresso desta aula</span>
                                <span className={aulaAtiva.progresso.concluida ? 'text-emerald-700' : 'text-gray-600'}>
                                    {Math.round(percentualAtual)}%
                                    {!aulaAtiva.progresso.concluida &&
                                        ` · mínimo ${conteudo.versao.percentual_minimo}%`}
                                </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all ${aulaAtiva.progresso.concluida ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                    style={{ width: `${Math.min(100, percentualAtual)}%` }}
                                />
                            </div>
                            {!aulaAtiva.permite_avanco_rapido && !aulaAtiva.progresso.concluida && (
                                <p className="text-xs text-gray-400">
                                    Avançar a barra não conta como aula assistida.
                                </p>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-1.5">
                            {aulaAtiva.progresso.concluida ? (
                                <span className="flex items-center gap-1.5 text-sm font-normal text-emerald-700">
                                    <CheckCircle2 className="w-4 h-4" /> Aula concluída
                                </span>
                            ) : (
                                <button
                                    onClick={concluirAula}
                                    disabled={concluindo}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                                >
                                    {concluindo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : null}
                                    {concluindo ? 'Verificando...' : 'Concluir aula'}
                                </button>
                            )}
                        </div>
                    </div>

                    {materiaisDaAula.length > 0 && (
                        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-2">
                            <h3 className="text-sm font-semibold text-gray-700">Materiais complementares</h3>
                            {materiaisDaAula.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => baixarMaterial(m.id, m.url)}
                                    className="flex items-center gap-2 w-full text-left px-3 h-9 rounded-[6px] text-sm font-normal text-gray-600 hover:bg-gray-50 transition-all"
                                >
                                    <Download className="w-4 h-4 text-gray-400 shrink-0" />
                                    <span className="truncate">{m.titulo}</span>
                                    {m.exige_download && (
                                        <span className="ml-auto text-xs text-amber-600 shrink-0">obrigatório</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Conclusão do treinamento ── */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700">Conclusão do treinamento</h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {Math.round(conteudo.enrollment.percentual)}% do conteúdo
                                    {conteudo.versao.nota_minima != null &&
                                        ` · nota mínima ${conteudo.versao.nota_minima}`}
                                    {conteudo.versao.exige_aceite && ' · exige aceite'}
                                </p>
                            </div>
                            {concluido && (
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1.5 text-sm font-normal text-emerald-700">
                                        <Award className="w-4 h-4" /> Concluído
                                    </span>
                                    {conteudo.enrollment.certificate_id && (
                                        <button
                                            onClick={baixarCertificado}
                                            disabled={baixandoCert}
                                            className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                                        >
                                            {baixandoCert
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <Download className="w-4 h-4" />}
                                            Baixar certificado
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {!concluido && (
                            <div className="flex items-center justify-end gap-1.5">
                                {conteudo.versao.exige_aceite && !conteudo.enrollment.aceite_em && (
                                    <button
                                        onClick={aceitar}
                                        className="h-9 px-3 rounded-[6px] text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
                                    >
                                        Registrar aceite
                                    </button>
                                )}
                                <button
                                    onClick={finalizar}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95"
                                >
                                    <Award className="w-[15px] h-[15px]" />
                                    Concluir treinamento
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AcademyPlayerView;
