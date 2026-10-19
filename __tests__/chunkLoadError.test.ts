// @vitest-environment jsdom
/**
 * Chunk de deploy anterior: recarregar UMA VEZ POR JANELA, não uma vez por sessão.
 *
 * 19/10/2026 — "Failed to fetch dynamically imported module: …/assets/index-xsn8lw-k.js".
 * Três publicações no mesmo dia; a aba já tinha recarregado no primeiro deploy e a trava
 * (sessionStorage = '1', sem prazo) impedia a recarga dos seguintes — o usuário via o erro.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reloadOnceForChunkError, isChunkLoadError, CHUNK_RELOAD_WINDOW_MS } from '../utils/chunkLoadError';

const reload = vi.fn();

describe('reloadOnceForChunkError', () => {
    beforeEach(() => {
        sessionStorage.clear();
        reload.mockReset();
        Object.defineProperty(window, 'location', { value: { reload }, configurable: true });
    });

    it('primeira falha recarrega', () => {
        expect(reloadOnceForChunkError(1_000_000)).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('falha de novo logo depois da recarga NÃO recarrega (anti-loop)', () => {
        reloadOnceForChunkError(1_000_000);
        expect(reloadOnceForChunkError(1_000_000 + 30_000)).toBe(false);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('outro deploy mais tarde na MESMA sessão recarrega de novo', () => {
        reloadOnceForChunkError(1_000_000);
        expect(reloadOnceForChunkError(1_000_000 + CHUNK_RELOAD_WINDOW_MS + 1)).toBe(true);
        expect(reload).toHaveBeenCalledTimes(2);
    });

    it("valor legado '1' (trava antiga, sem prazo) não bloqueia mais", () => {
        sessionStorage.setItem('chunk_reload_attempted', '1');
        expect(reloadOnceForChunkError()).toBe(true);
    });
});

describe('isChunkLoadError', () => {
    it('reconhece a mensagem do Chrome e a do Safari', () => {
        expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/index-a.js'))).toBe(true);
        expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
        expect(isChunkLoadError(new Error('outra coisa'))).toBe(false);
    });
});
