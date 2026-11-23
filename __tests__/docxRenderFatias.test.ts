/**
 * Word → PDF: corte de cada página renderizada em folhas A4.
 * Bug de 23/11/2026: a minuta CTL-014-057-0001 (16 páginas) saiu com 32 — depois de
 * cada página, uma "folha" de ~1 pt de altura com a sobra de 1 px da medição.
 */
import { describe, it, expect } from 'vitest';
import { planejarFatias } from '../services/docxRenderService';

const A4 = 1123;          // 794 px de largura × 297/210, arredondado
const BLOCO = 14000;
const folhas = (totalH: number) => planejarFatias(totalH, A4, BLOCO).flatMap(b => b.fatias.map(f => f.h));

describe('planejarFatias', () => {
    it('página do tamanho da folha = 1 folha (antes: folha + sobra de 1 px)', () => {
        expect(folhas(1123)).toEqual([1123]);
        expect(folhas(1124)).toEqual([1124]);
    });

    it('sobra pequena (12 px) é absorvida — nunca vira folha minúscula', () => {
        expect(folhas(1135)).toEqual([1135]);
    });

    it('conteúdo que passa de verdade da folha continua em outra', () => {
        expect(folhas(1700)).toEqual([1123, 577]);
    });

    it('seção longa: folhas inteiras e o bloco de captura termina em fronteira de folha', () => {
        const total = 30 * A4 + 5;            // 30 folhas + 5 px de sobra
        const blocos = planejarFatias(total, A4, BLOCO);
        const hs = blocos.flatMap(b => b.fatias.map(f => f.h));
        expect(hs).toHaveLength(30);
        expect(hs.slice(0, 29).every(h => h === A4)).toBe(true);
        expect(hs[29]).toBe(A4 + 5);
        for (const b of blocos) {
            expect(b.height).toBeLessThanOrEqual(BLOCO);
            expect(b.fatias.reduce((s, f) => s + f.h, 0)).toBe(b.height);
            b.fatias.forEach((f, i) => expect(f.off).toBe(b.fatias.slice(0, i).reduce((s, x) => s + x.h, 0)));
        }
        // blocos contíguos, cobrindo a página inteira
        blocos.forEach((b, i) => expect(b.top).toBe(i === 0 ? 0 : blocos[i - 1].top + blocos[i - 1].height));
        expect(blocos.at(-1)!.top + blocos.at(-1)!.height).toBe(total);
    });

    it('página menor que a folha sai do tamanho dela', () => {
        expect(folhas(400)).toEqual([400]);
    });
});
