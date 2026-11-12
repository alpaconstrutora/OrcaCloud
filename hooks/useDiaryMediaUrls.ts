import { useEffect, useMemo, useRef, useState } from 'react';
import { isDiaryStoragePath, signDiaryMediaUrls } from '../services/diaryMediaService';
import { ehLimiteDeUsoDoLink } from '../services/celular/diarioFonte';

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
 *
 * `assinar` = quem assina os paths, no lugar de `signDiaryMediaUrls` — o link do
 * celular passa o `assinarFotos` da fonte (Edge `celular-diario-midia`). Tem de
 * ser ESTÁVEL (`useCallback`/método de fonte memoizada): entra nas dependências,
 * e uma função nova a cada render reassinaria a cada render.
 *
 * `aoLimiteDeUso` = avisa a tela do limite de uso do link (429 / 54000 ao assinar):
 * recebe a mensagem do servidor, e `null` quando a assinatura volta a funcionar.
 * Nesse caso as URLs já assinadas FICAM no mapa (a foto que já estava na tela não
 * vira placeholder por causa de um teto por hora); qualquer outra falha limpa o
 * mapa, como sempre. Não precisa ser estável (vai por ref).
 */
export function useDiaryMediaUrls(
    refs: readonly string[] | undefined,
    portalToken?: string,
    assinar?: (paths: readonly string[]) => Promise<Record<string, string>>,
    aoLimiteDeUso?: (mensagem: string | null) => void,
): Record<string, string> {
    const aoLimiteRef = useRef(aoLimiteDeUso);
    aoLimiteRef.current = aoLimiteDeUso;

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
        if (paths.length === 0) { setAssinadas({}); aoLimiteRef.current?.(null); return; }
        let cancelado = false;
        (assinar ? assinar(paths) : signDiaryMediaUrls(paths, { portalToken }))
            .then(map => {
                if (cancelado) return;
                setAssinadas(map);
                aoLimiteRef.current?.(null);
            })
            .catch(err => {
                console.error('[useDiaryMediaUrls] falha ao assinar mídia do diário:', err);
                if (cancelado) return;
                if (ehLimiteDeUsoDoLink(err)) {
                    // Mantém o que já está assinado; só avisa.
                    aoLimiteRef.current?.((err as { message?: string }).message || 'Limite de uso do link atingido.');
                } else {
                    setAssinadas({});
                }
            });
        return () => { cancelado = true; };
    }, [chave, portalToken, assinar]);

    return useMemo(() => ({ ...imediato, ...assinadas }), [imediato, assinadas]);
}
