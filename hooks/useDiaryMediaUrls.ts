import { useEffect, useMemo, useState } from 'react';
import { isDiaryStoragePath, signDiaryMediaUrls } from '../services/diaryMediaService';

/**
 * Mapa `ref → url` para a mídia do Diário de Obras.
 *
 * `<img src>` precisa de string síncrona, e a URL assinada é assíncrona — daí o
 * estado. O que não é path (data URL antiga, http) entra no mapa de imediato;
 * o que é path chega quando a assinatura volta. Path que não pôde ser assinado
 * fica fora do mapa: renderize um placeholder quando `urls[ref]` for undefined.
 *
 * `portalToken` = link público do Portal do Cliente (sem sessão): a assinatura
 * passa pela edge function `client-portal-diary-download`.
 */
export function useDiaryMediaUrls(refs: readonly string[] | undefined, portalToken?: string): Record<string, string> {
    // A chave é o conteúdo, não a identidade do array: cada render cria um
    // array novo e re-assinar a cada render seria uma chamada por frame.
    const chave = useMemo(() => (refs ?? []).filter(Boolean).join('\n'), [refs]);

    const imediato = useMemo(() => {
        const out: Record<string, string> = {};
        for (const ref of chave ? chave.split('\n') : []) {
            if (!isDiaryStoragePath(ref)) out[ref] = ref;
        }
        return out;
    }, [chave]);

    const [assinadas, setAssinadas] = useState<Record<string, string>>({});

    useEffect(() => {
        const paths = (chave ? chave.split('\n') : []).filter(isDiaryStoragePath);
        if (paths.length === 0) { setAssinadas({}); return; }
        let cancelado = false;
        signDiaryMediaUrls(paths, { portalToken })
            .then(map => { if (!cancelado) setAssinadas(map); })
            .catch(err => {
                console.error('[useDiaryMediaUrls] falha ao assinar mídia do diário:', err);
                if (!cancelado) setAssinadas({});
            });
        return () => { cancelado = true; };
    }, [chave, portalToken]);

    return useMemo(() => ({ ...imediato, ...assinadas }), [imediato, assinadas]);
}
