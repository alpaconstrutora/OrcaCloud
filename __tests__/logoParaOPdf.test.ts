// @vitest-environment jsdom
/**
 * Logo da capa do relatório do Imovib (pedido do usuário, 15/11/2026, depois da revisão): falha de
 * rede passageira não deixa a capa sem logo até recarregar; logo SVG ou WebP é redesenhada em PNG.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { logoComoDataUrl } from '../utils/logoComoDataUrl';
import { precisaRedesenhar } from '../utils/logoParaOPdf';

afterEach(() => { vi.unstubAllGlobals(); });
// Resposta com o Blob do jsdom (o do Response do Node não é lido pelo FileReader do jsdom).
const respostaPng = () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) });

describe('logo como data URL', () => {
    it('falhou uma vez (rede): a próxima tentativa busca de novo', async () => {
        const fetch = vi.fn()
            .mockRejectedValueOnce(new Error('rede caiu'))
            .mockResolvedValueOnce(respostaPng());
        vi.stubGlobal('fetch', fetch);
        const url = 'https://exemplo/logo-rede.png';
        expect(await logoComoDataUrl(url)).toBeNull();
        expect(await logoComoDataUrl(url)).toMatch(/^data:image\/png/);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('deu certo: não busca de novo (cache)', async () => {
        const fetch = vi.fn().mockImplementation(async () => respostaPng());
        vi.stubGlobal('fetch', fetch);
        const url = 'https://exemplo/logo-ok.png';
        await logoComoDataUrl(url);
        await logoComoDataUrl(url);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

describe('quando a logo é redesenhada em PNG', () => {
    it('SVG e WebP sempre (o jsPDF só põe PNG e JPEG); PNG/JPEG só se passar da largura', () => {
        expect(precisaRedesenhar('data:image/svg+xml;base64,AAAA', 120)).toBe(true);
        expect(precisaRedesenhar('data:image/webp;base64,AAAA', 120)).toBe(true);
        expect(precisaRedesenhar('data:image/png;base64,AAAA', 120)).toBe(false);
        expect(precisaRedesenhar('data:image/jpeg;base64,AAAA', 300)).toBe(false);
        expect(precisaRedesenhar('data:image/png;base64,AAAA', 3600)).toBe(true);
    });
});
