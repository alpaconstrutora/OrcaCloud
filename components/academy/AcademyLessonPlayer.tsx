import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';
import type { AcademyPlayerLesson } from '../../types/academy';
import type { AcademyChannel } from './academyChannel';

/**
 * Renderiza uma aula conforme o tipo. Responsável por:
 *  - buscar a URL assinada (15 min) e RENOVÁ-LA aos 13, preservando o
 *    `currentTime` — senão a aula "morre" no meio de um vídeo longo;
 *  - retomar do ponto onde o colaborador parou;
 *  - avisar o pai quando está de fato tocando (base do heartbeat).
 *
 * Limitação assumida e documentada no PRD: não há DRM. `controlsList` e a
 * expiração curta reduzem o vazamento casual, não impedem cópia.
 */

const RENOVAR_APOS_MS = 13 * 60 * 1000;

interface Props {
    lesson: AcademyPlayerLesson;
    channel: AcademyChannel;
    /** Ponto de retomada, em segundos. */
    posicaoInicial: number;
    onPlayingChange: (tocando: boolean) => void;
    onPositionRef: (getter: () => number) => void;
    /** Só para tipos sem duração intrínseca (PDF/TEXTO/IMAGEM). */
    onTempoDeTela?: (ativo: boolean) => void;
}

const AcademyLessonPlayer: React.FC<Props> = ({
    lesson, channel, posicaoInicial, onPlayingChange, onPositionRef, onTempoDeTela,
}) => {
    const [url, setUrl] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(false);

    const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
    const posicaoRef = useRef(posicaoInicial);
    const retomouRef = useRef(false);
    const relogioRef = useRef(0);

    const precisaMidia = lesson.tem_midia &&
        (lesson.tipo === 'VIDEO_UPLOAD' || lesson.tipo === 'PDF'
         || lesson.tipo === 'AUDIO' || lesson.tipo === 'IMAGEM');

    // ── URL assinada + renovação ────────────────────────────────────────
    useEffect(() => {
        if (!precisaMidia) return;
        let cancelado = false;

        const carregar = async () => {
            setCarregando(true);
            setErro(null);
            try {
                const nova = await channel.getLessonMediaUrl(lesson.id);
                if (!cancelado) setUrl(nova);
            } catch (e: any) {
                if (!cancelado) setErro(e?.message || 'Não foi possível carregar a mídia.');
            } finally {
                if (!cancelado) setCarregando(false);
            }
        };

        void carregar();
        const id = window.setInterval(() => { void carregar(); }, RENOVAR_APOS_MS);
        return () => { cancelado = true; window.clearInterval(id); };
    }, [lesson.id, precisaMidia, channel]);

    // Ao trocar a URL (renovação), volta para onde estava.
    useEffect(() => {
        const el = mediaRef.current;
        if (!el || !url) return;
        const alvo = retomouRef.current ? posicaoRef.current : posicaoInicial;
        const aplicar = () => {
            if (alvo > 0 && Math.abs(el.currentTime - alvo) > 1) el.currentTime = alvo;
            retomouRef.current = true;
        };
        if (el.readyState >= 1) aplicar();
        else el.addEventListener('loadedmetadata', aplicar, { once: true });
    }, [url, posicaoInicial]);

    // Expõe ao pai como ler a posição atual.
    useEffect(() => {
        onPositionRef(() => posicaoRef.current);
    }, [onPositionRef]);

    // Conteúdo sem duração: o "progresso" é tempo de tela.
    useEffect(() => {
        const semDuracao = lesson.tipo === 'PDF' || lesson.tipo === 'TEXTO' || lesson.tipo === 'IMAGEM';
        if (!semDuracao) return;

        onTempoDeTela?.(true);
        onPlayingChange(true);
        const id = window.setInterval(() => {
            relogioRef.current += 1;
            posicaoRef.current = relogioRef.current;
        }, 1000);

        return () => {
            window.clearInterval(id);
            onTempoDeTela?.(false);
            onPlayingChange(false);
        };
    }, [lesson.id, lesson.tipo, onPlayingChange, onTempoDeTela]);

    const mediaProps = {
        ref: mediaRef as any,
        onPlay: () => onPlayingChange(true),
        onPause: () => onPlayingChange(false),
        onEnded: () => onPlayingChange(false),
        onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => {
            posicaoRef.current = e.currentTarget.currentTime;
        },
        controls: true,
        controlsList: 'nodownload',
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        className: 'w-full rounded-[10px] bg-black',
    };

    if (erro) {
        return (
            <div className="text-center py-12">
                <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Não foi possível abrir a aula</h3>
                <p className="text-sm text-gray-500">{erro}</p>
            </div>
        );
    }

    if (precisaMidia && (carregando || !url)) {
        return (
            <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                <p className="mt-2 text-gray-500">Carregando aula...</p>
            </div>
        );
    }

    switch (lesson.tipo) {
        case 'VIDEO_UPLOAD':
            return <video {...mediaProps} src={url!} playsInline />;

        case 'VIDEO_LINK':
            return (
                <div className="relative w-full rounded-[10px] overflow-hidden bg-black" style={{ paddingTop: '56.25%' }}>
                    <iframe
                        src={lesson.video_url}
                        title={lesson.titulo}
                        className="absolute inset-0 w-full h-full"
                        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        onLoad={() => onPlayingChange(true)}
                    />
                </div>
            );

        case 'AUDIO':
            return <audio {...mediaProps} src={url!} className="w-full" />;

        case 'IMAGEM':
            return <img src={url!} alt={lesson.titulo} className="w-full rounded-[10px] border border-gray-100" />;

        case 'PDF':
            return (
                <div className="space-y-2">
                    <iframe
                        src={url!}
                        title={lesson.titulo}
                        className="w-full h-[70vh] rounded-[10px] border border-gray-100 bg-gray-50"
                    />
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        O tempo de leitura é contado enquanto esta aba estiver aberta.
                    </p>
                </div>
            );

        case 'TEXTO':
            return (
                <div
                    className="prose prose-sm max-w-none bg-white rounded-[10px] border border-gray-100 p-6 text-sm text-gray-700"
                    dangerouslySetInnerHTML={{ __html: lesson.conteudo_html || '' }}
                />
            );

        default:
            return null;
    }
};

export default AcademyLessonPlayer;
