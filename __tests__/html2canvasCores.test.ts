import { describe, it, expect } from 'vitest';
import { __trocarFuncoesParaTeste as trocar } from '../utils/html2canvasCores';

/**
 * utils/html2canvasCores.ts — a troca de funções de cor modernas dentro de um
 * valor CSS. A conversão em si (canvas) e a captura foram provadas no navegador
 * em 2026-10-12: sem a correção, html2canvas aborta com 'unsupported color
 * function "oklch"'; com ela, gera e preserva as cores (pixel do cartão azul =
 * rgb(37, 77, 239)).
 */
const fake = (cor: string) => `<${cor}>`;

describe('trocar funções de cor modernas', () => {
    it('troca um oklch simples', () => {
        expect(trocar('oklch(0.5 0.1 165)', fake)).toBe('<oklch(0.5 0.1 165)>');
    });

    it('troca cada função dentro de um gradiente, mantendo o resto', () => {
        const v = 'linear-gradient(to right bottom, oklch(0.55 0.2 260) 0%, oklch(0.45 0.2 270) 100%)';
        expect(trocar(v, fake)).toBe('linear-gradient(to right bottom, <oklch(0.55 0.2 260)> 0%, <oklch(0.45 0.2 270)> 100%)');
    });

    it('respeita parênteses aninhados (color-mix com oklab dentro)', () => {
        const v = '0 10px 15px color-mix(in oklab, oklch(0.3 0.1 260) 20%, transparent)';
        expect(trocar(v, fake)).toBe('0 10px 15px <color-mix(in oklab, oklch(0.3 0.1 260) 20%, transparent)>');
    });

    it('valor sem função moderna fica igual', () => {
        expect(trocar('rgb(255, 255, 255)', fake)).toBe('rgb(255, 255, 255)');
    });
});
