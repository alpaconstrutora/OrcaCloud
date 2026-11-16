/**
 * A versão congelada nasce com o nome "Versão de dd/mm/aaaa" (ImovibCongelarVersao); a tela e a capa
 * do PDF prefixavam "Versão " e saía "Versão Versão de 16/11/2026" (visto no portal do Tiago, 16/11).
 */
import { describe, it, expect } from 'vitest';
import { linhaDaVersao, rotuloDaVersao } from '../utils/imovibRelatorio';

describe('rótulo da versão', () => {
    it('nome que já começa por "Versão" não ganha outro "Versão"', () => {
        expect(rotuloDaVersao('Versão de 16/11/2026')).toBe('Versão de 16/11/2026');
        expect(rotuloDaVersao('versão 2')).toBe('versão 2');
        expect(rotuloDaVersao('Versao final')).toBe('Versao final');
    });

    it('nome livre ganha o prefixo', () => {
        expect(rotuloDaVersao('Comitê de novembro')).toBe('Versão Comitê de novembro');
        expect(rotuloDaVersao('Versionamento')).toBe('Versão Versionamento');
    });

    it('linha completa com a data de Brasília', () => {
        expect(linhaDaVersao({ label: 'Versão de 16/11/2026', created_at: '2026-11-16T08:43:14Z' }))
            .toBe('Versão de 16/11/2026 · congelada em 16/11/2026');
        expect(linhaDaVersao({ label: 'Comitê de novembro', created_at: '2026-11-15T13:40:00Z' }))
            .toBe('Versão Comitê de novembro · congelada em 15/11/2026');
    });
});
