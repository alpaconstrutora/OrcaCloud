/**
 * Service do book (services/creditRoomBookService.ts) — a parte que depende do navegador.
 *
 * Regra protegida: foto que não carrega (404, CORS, tempo esgotado, URL estranha)
 * é ignorada; o book sai sem ela, nunca falha inteiro.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreditRoomDocument } from '../types/creditRoom';
import { baixarImagens, creditRoomBookService, nomeDoArquivoDoBook } from '../services/creditRoomBookService';
import { versaoSchema1, versaoSchema2 } from './fixtures/creditRoomBookFixture';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('baixarImagens', () => {
    it('fetch que rejeita (CORS/rede) é ignorado: mapa vazio, sem erro', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        await expect(baixarImagens(['https://x.test/a.jpg', 'https://x.test/b.jpg'])).resolves.toEqual({});
    });

    it('resposta 404 é ignorada', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, blob: async () => new Blob() }));
        await expect(baixarImagens(['https://x.test/a.jpg'])).resolves.toEqual({});
    });

    it('URL que não é http(s) nem chega a ser buscada', async () => {
        const fetchFalso = vi.fn();
        vi.stubGlobal('fetch', fetchFalso);
        await expect(baixarImagens(['javascript:alert(1)', 'data:image/png;base64,AAAA', '/relativa.jpg'])).resolves.toEqual({});
        expect(fetchFalso).not.toHaveBeenCalled();
    });

    it('foto que trava é abandonada em ~10 s, e as outras seguem', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, rejeita) => {
            init.signal?.addEventListener('abort', () => rejeita(new DOMException('abortado', 'AbortError')));
        })));
        const pendente = baixarImagens(['https://x.test/trava.jpg']);
        await vi.advanceTimersByTimeAsync(10_001);
        await expect(pendente).resolves.toEqual({});
    });

    it('sem URLs devolve vazio', async () => {
        await expect(baixarImagens([])).resolves.toEqual({});
    });
});

describe('creditRoomBookService', () => {
    const doc = (o: Partial<CreditRoomDocument>): CreditRoomDocument => ({
        shareId: 's', documentId: 'd', nome: 'Doc.pdf', categoria: 'Fiscal', tipoDocumento: 'X', status: 'OK',
        sharedAt: '2026-11-20T00:00:00Z', ...o,
    });

    it('índice: no Grupo traz a empresa pelo nome da versão; fora do Grupo, não', () => {
        const grupo = versaoSchema2(); // escopo GRUPO com org-1 e org-2
        const linhas = creditRoomBookService.documentosDoIndice(
            [doc({ nome: 'A.pdf', organizationId: 'org-2' }), doc({ nome: 'B.pdf' }), doc({ nome: 'C.pdf', organizationId: 'org-x' })],
            grupo,
        );
        expect(linhas.map(l => l.empresa)).toEqual(['Beta Locações', null, null]);

        const empresa = versaoSchema1(); // sem escopo
        expect(creditRoomBookService.documentosDoIndice([doc({ organizationId: 'org-2' })], empresa)[0].empresa).toBeNull();
    });

    it('nome do arquivo: book-{code}-V{n}.pdf, sem caractere perigoso', () => {
        expect(nomeDoArquivoDoBook('CR-0007', 3)).toBe('book-CR-0007-V3.pdf');
        expect(nomeDoArquivoDoBook('CR/07 x', 1)).toBe('book-CR_07_x-V1.pdf');
    });
});
