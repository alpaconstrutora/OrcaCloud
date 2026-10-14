import { describe, it, expect, vi, afterEach } from 'vitest';
import { dimensoesAlvo, precisaComprimir, nomeJpg, comprimirFoto, LIMIAR_BYTES } from '../utils/comprimirFoto';

describe('comprimirFoto · dimensões', () => {
    it('reduz o lado maior a 2048 mantendo a proporção (em pé e deitada)', () => {
        expect(dimensoesAlvo(4032, 3024)).toEqual({ largura: 2048, altura: 1536 });
        expect(dimensoesAlvo(3024, 4032)).toEqual({ largura: 1536, altura: 2048 });
    });
    it('nunca amplia', () => {
        expect(dimensoesAlvo(1200, 800)).toEqual({ largura: 1200, altura: 800 });
        expect(dimensoesAlvo(2048, 10)).toEqual({ largura: 2048, altura: 10 });
    });
});

describe('comprimirFoto · quando tentar', () => {
    it('foto grande sim; pequena não', () => {
        expect(precisaComprimir({ type: 'image/jpeg', size: 4_000_000 })).toBe(true);
        expect(precisaComprimir({ type: 'image/jpeg', size: LIMIAR_BYTES })).toBe(false);
        expect(precisaComprimir({ type: 'image/png', size: LIMIAR_BYTES + 1 })).toBe(true);
    });
    it('HEIC sempre (converter para JPEG é o ganho), mesmo pequeno', () => {
        expect(precisaComprimir({ type: 'image/heic', size: 10 })).toBe(true);
        expect(precisaComprimir({ type: 'image/HEIF', size: 10 })).toBe(true);
    });
    it('GIF, SVG, vídeo e documento nunca', () => {
        expect(precisaComprimir({ type: 'image/gif', size: 9_000_000 })).toBe(false);
        expect(precisaComprimir({ type: 'image/svg+xml', size: 9_000_000 })).toBe(false);
        expect(precisaComprimir({ type: 'video/mp4', size: 9_000_000 })).toBe(false);
        expect(precisaComprimir({ type: 'application/pdf', size: 9_000_000 })).toBe(false);
        expect(precisaComprimir({ type: '', size: 9_000_000 })).toBe(false);
    });
    it('nome passa a .jpg', () => {
        expect(nomeJpg('IMG_0001.HEIC')).toBe('IMG_0001.jpg');
        expect(nomeJpg('laje.2.png')).toBe('laje.2.jpg');
        expect(nomeJpg('')).toBe('foto.jpg');
        expect(nomeJpg('.png')).toBe('foto.jpg');
    });
});

describe('comprimirFoto · nunca impede o envio', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('sem createImageBitmap (ambiente sem decodificador) → arquivo original', async () => {
        vi.stubGlobal('createImageBitmap', undefined);
        const f = new File([new Uint8Array(LIMIAR_BYTES + 10)], 'a.jpg', { type: 'image/jpeg' });
        expect(await comprimirFoto(f)).toBe(f);
    });
    it('navegador não decodifica (HEIC no Chrome do computador) → arquivo original', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('formato')));
        vi.stubGlobal('document', { createElement: vi.fn() });
        const f = new File([new Uint8Array(100)], 'IMG.HEIC', { type: 'image/heic' });
        expect(await comprimirFoto(f)).toBe(f);
    });
    it('não é foto → nem tenta decodificar', async () => {
        const cib = vi.fn();
        vi.stubGlobal('createImageBitmap', cib);
        const f = new File([new Uint8Array(9_000_000)], 'v.mp4', { type: 'video/mp4' });
        expect(await comprimirFoto(f)).toBe(f);
        expect(cib).not.toHaveBeenCalled();
    });
});
