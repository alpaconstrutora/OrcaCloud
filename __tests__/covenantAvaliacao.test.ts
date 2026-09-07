/**
 * A folga do covenant — a conta que decide se o banco vê verde, amarelo ou
 * vermelho.
 *
 * O que estes testes protegem: que MIN e MAX não se invertam (um DSCR mínimo
 * lido como teto diria "regular" exatamente quando a operação quebrou), que a
 * faixa de atenção acenda ANTES da violação (§76), e que meta zero admita não
 * saber em vez de devolver Infinity.
 *
 * A mesma regra vive em `fn_debt_covenant_evaluate`. Divergiu? É aqui que
 * aparece.
 */

import { describe, expect, it } from 'vitest';
import { avaliarCovenant } from '../utils/covenantAvaliacao';

describe('avaliarCovenant', () => {
    it('MIN (piso): DSCR ≥ 1,30 — acima da meta é folga positiva', () => {
        // 1,50 contra meta 1,30 → 15,38% de folga.
        expect(avaliarCovenant(1.5, 1.3, 'MIN', 10)).toEqual({
            apurado: 1.5, margemPct: 15.38, situacao: 'REGULAR',
        });
    });

    it('MIN: abaixo da meta é violação, mesmo por pouco', () => {
        const r = avaliarCovenant(1.29, 1.3, 'MIN', 10);
        expect(r.situacao).toBe('VIOLADO');
        expect(r.margemPct).toBeLessThan(0);
    });

    it('MAX (teto): LTV ≤ 60% — abaixo da meta é folga positiva', () => {
        expect(avaliarCovenant(45, 60, 'MAX', 10)).toEqual({
            apurado: 45, margemPct: 25, situacao: 'REGULAR',
        });
    });

    it('MAX: acima do teto viola', () => {
        expect(avaliarCovenant(66, 60, 'MAX', 10).situacao).toBe('VIOLADO');
    });

    it('MIN e MAX NÃO podem se confundir — o mesmo par dá vereditos opostos', () => {
        // Apurado 45 contra meta 60: folgado como teto, violado como piso.
        expect(avaliarCovenant(45, 60, 'MAX', 10).situacao).toBe('REGULAR');
        expect(avaliarCovenant(45, 60, 'MIN', 10).situacao).toBe('VIOLADO');
    });

    it('§76 — a faixa de atenção acende ANTES de quebrar', () => {
        // Meta 1,30 com 10% de margem: 1,34 está a 3,08% → amarelo, não verde.
        const quaseLa = avaliarCovenant(1.34, 1.3, 'MIN', 10);
        expect(quaseLa.margemPct).toBe(3.08);
        expect(quaseLa.situacao).toBe('ATENCAO');

        // A borda exata da margem ainda é ATENÇÃO (o SQL usa <=).
        expect(avaliarCovenant(1.43, 1.3, 'MIN', 10).situacao).toBe('ATENCAO');   // 10,00%
        expect(avaliarCovenant(1.44, 1.3, 'MIN', 10).situacao).toBe('REGULAR');   // 10,77%
    });

    it('sem apuração é NAO_APURADO — nunca REGULAR por omissão', () => {
        expect(avaliarCovenant(null, 1.3, 'MIN', 10).situacao).toBe('NAO_APURADO');
        expect(avaliarCovenant(undefined, 1.3, 'MIN', 10).situacao).toBe('NAO_APURADO');
        expect(avaliarCovenant(NaN, 1.3, 'MIN', 10).situacao).toBe('NAO_APURADO');
    });

    it('meta zero admite que não dá para medir, em vez de devolver Infinity', () => {
        const r = avaliarCovenant(5, 0, 'MAX', 10);
        expect(r.margemPct).toBeNull();
        expect(r.situacao).toBe('NAO_APURADO');
        expect(r.apurado).toBe(5);   // o valor medido não se perde
    });

    it('meta negativa usa o módulo, então a folga não troca de sinal', () => {
        // Resultado ≥ −1000 (piso negativo): −500 está acima, logo folgado.
        expect(avaliarCovenant(-500, -1000, 'MIN', 10).situacao).toBe('REGULAR');
        expect(avaliarCovenant(-1500, -1000, 'MIN', 10).situacao).toBe('VIOLADO');
    });
});
