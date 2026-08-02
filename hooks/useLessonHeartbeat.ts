import { useCallback, useEffect, useRef, useState } from 'react';
import type { AcademyHeartbeatResult } from '../types/academy';

/**
 * Heartbeat de aula da Academia ÒPURA.
 *
 * Reporta ao servidor quanto tempo REAL de aula passou. Quem decide o que
 * creditar é o servidor (clamp de 60s, rate limit de 20s, bloqueio de seek) —
 * este hook só mede honestamente e envia.
 *
 * Cuidados que a implementação embute:
 *  - só conta com a mídia tocando E a aba visível (`visibilitychange`);
 *  - mede pelo relógio, não pelo `currentTime`, para que `playbackRate = 16`
 *    não vire progresso;
 *  - faz flush no `beforeunload` e ao desmontar, para não perder o trecho final;
 *  - NÃO invalida query nenhuma a cada tick — o progresso vive em estado local,
 *    senão o re-render pisca o vídeo a cada 30 segundos.
 */

const INTERVALO_MS = 30_000;

interface UseLessonHeartbeatArgs {
    enrollmentId: string;
    lessonId: string;
    /** Injetado pelo canal (app logado ou portal) — o hook não sabe qual é. */
    onBeat: (args: { posicao: number; delta: number }) => Promise<AcademyHeartbeatResult>;
    /** Posição atual da mídia, em segundos. */
    getPosicao: () => number;
    /** Só bate quando true (mídia tocando / documento aberto em foco). */
    ativo: boolean;
}

export function useLessonHeartbeat({
    enrollmentId, lessonId, onBeat, getPosicao, ativo,
}: UseLessonHeartbeatArgs) {
    const [percentual, setPercentual] = useState(0);
    const [segundosAssistidos, setSegundosAssistidos] = useState(0);

    // Refs para o timer não recriar a cada render (o vídeo não pode piscar).
    const acumuladoRef = useRef(0);
    const ultimoTickRef = useRef<number | null>(null);
    const enviandoRef = useRef(false);
    const onBeatRef = useRef(onBeat);
    const getPosicaoRef = useRef(getPosicao);
    const visivelRef = useRef(true);

    onBeatRef.current = onBeat;
    getPosicaoRef.current = getPosicao;

    const flush = useCallback(async () => {
        const delta = Math.round(acumuladoRef.current);
        if (delta <= 0 || enviandoRef.current) return;

        enviandoRef.current = true;
        acumuladoRef.current = 0;
        try {
            const r = await onBeatRef.current({ posicao: getPosicaoRef.current(), delta });
            setPercentual(r.percentual);
            setSegundosAssistidos(r.segundos_assistidos);
        } catch {
            // Sem retry: perder um heartbeat é aceitável, duplicar não é.
        } finally {
            enviandoRef.current = false;
        }
    }, []);

    // Aba escondida não conta como aula assistida.
    useEffect(() => {
        const onVisibility = () => {
            visivelRef.current = document.visibilityState === 'visible';
            if (!visivelRef.current) {
                ultimoTickRef.current = null;
                void flush();
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [flush]);

    // Acumulador: mede pelo relógio de parede.
    useEffect(() => {
        if (!ativo) {
            ultimoTickRef.current = null;
            return;
        }
        ultimoTickRef.current = Date.now();

        const id = window.setInterval(() => {
            if (!visivelRef.current) return;
            const agora = Date.now();
            const anterior = ultimoTickRef.current ?? agora;
            ultimoTickRef.current = agora;
            acumuladoRef.current += (agora - anterior) / 1000;
        }, 1000);

        return () => {
            window.clearInterval(id);
            ultimoTickRef.current = null;
        };
    }, [ativo]);

    // Envio periódico.
    useEffect(() => {
        const id = window.setInterval(() => { void flush(); }, INTERVALO_MS);
        return () => window.clearInterval(id);
    }, [flush]);

    // Não perder o trecho final ao fechar a aba ou trocar de aula.
    useEffect(() => {
        const onUnload = () => { void flush(); };
        window.addEventListener('beforeunload', onUnload);
        return () => {
            window.removeEventListener('beforeunload', onUnload);
            void flush();
        };
    }, [flush, enrollmentId, lessonId]);

    return { percentual, segundosAssistidos, flush, setPercentual };
}
