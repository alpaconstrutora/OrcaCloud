const CHUNK_RELOAD_KEY = 'chunk_reload_attempted';

export function isChunkLoadError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (
        error.message?.includes('Failed to fetch dynamically imported module') ||
        error.message?.includes('Importing a module script failed') ||
        error.name === 'ChunkLoadError'
    );
}

/** Recarrega a página uma única vez por sessão para pegar o deploy novo. Retorna
 * `true` se o reload foi disparado (chamador deve parar de tratar o erro). */
export function reloadOnceForChunkError(): boolean {
    const alreadyRetried = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    if (alreadyRetried) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
    return true;
}
