const CHUNK_RELOAD_KEY = 'chunk_reload_attempted';

/** Janela da trava anti-loop. Se o chunk falhar de novo LOGO depois de uma recarga,
 *  o problema não é "deploy novo" (a recarga já trouxe o index.html novo) — aí
 *  paramos e mostramos o erro. Fora da janela, um chunk ausente é outro deploy, e
 *  merece a sua própria recarga. */
export const CHUNK_RELOAD_WINDOW_MS = 2 * 60 * 1000;

export function isChunkLoadError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (
        error.message?.includes('Failed to fetch dynamically imported module') ||
        error.message?.includes('Importing a module script failed') ||
        error.name === 'ChunkLoadError'
    );
}

/** Recarrega a página para pegar o deploy novo — no máximo uma vez por janela
 *  (`CHUNK_RELOAD_WINDOW_MS`). Retorna `true` se o reload foi disparado (o chamador
 *  deve parar de tratar o erro).
 *
 *  Era "uma vez por SESSÃO" (o valor gravado era só '1'): a aba que já tinha
 *  recarregado num deploy, no deploy seguinte mostrava "Failed to fetch dynamically
 *  imported module" em vez de recarregar — 19/10/2026, três publicações no mesmo dia. */
export function reloadOnceForChunkError(agora: number = Date.now()): boolean {
    const ultima = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    // Valor legado '1' (ou lixo) vira 1 ms desde 1970 — fora da janela, recarrega.
    if (Number.isFinite(ultima) && agora - ultima < CHUNK_RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(agora));
    window.location.reload();
    return true;
}
