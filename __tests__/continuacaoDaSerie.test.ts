/**
 * Renovação por aditivo continua a série (pedido de 25/11/2026). Caso real
 * CTL-006-012-0001: vigência 23/09/2016 → 22/03/2019, 30 parcelas no dia 10 de
 * 10/11/2016 a 10/04/2019 (cobra o mês depois); aditivo 23/03/2019 → 22/09/2021.
 * O app gerou 23/03/2019 … 23/08/2021 (março e abril em dobro).
 */
import { describe, it, expect } from 'vitest';
import { continuacaoDaSerie, ciclosNoPeriodo } from '../utils/continuacaoDaSerie';

describe('continuacaoDaSerie', () => {
    it('CTL-006: continua em 10/05/2019, 30 parcelas (até 10/10/2021)', () => {
        expect(continuacaoDaSerie({ ultimoVencimento: '2019-04-10', inicio: '2019-03-23', fim: '2021-09-22', ciclo: 'Mensal', dia: 10 }))
            .toEqual({ primeiro: '2019-05-10', quantidade: 30 });
    });

    it('sem dia informado, segue o dia da última parcela', () => {
        expect(continuacaoDaSerie({ ultimoVencimento: '2019-04-10', inicio: '2019-03-23', fim: '2021-09-22', ciclo: 'Mensal' })?.primeiro)
            .toBe('2019-05-10');
    });

    it('dia da renovação diferente do da série: mês seguinte à última, no dia novo', () => {
        expect(continuacaoDaSerie({ ultimoVencimento: '2019-04-10', inicio: '2019-03-23', fim: '2021-09-22', ciclo: 'Mensal', dia: 5 })?.primeiro)
            .toBe('2019-05-05');
    });

    it('série que cobra o mês corrente (última no início do último mês) continua no início do período novo', () => {
        expect(continuacaoDaSerie({ ultimoVencimento: '2019-02-23', inicio: '2019-03-23', fim: '2020-03-22', ciclo: 'Mensal', dia: 23 }))
            .toEqual({ primeiro: '2019-03-23', quantidade: 12 });
    });

    it('dia 31 em mês curto para no último dia', () => {
        expect(continuacaoDaSerie({ ultimoVencimento: '2025-01-31', inicio: '2025-02-01', fim: '2025-12-31', ciclo: 'Mensal', dia: 31 })?.primeiro)
            .toBe('2025-02-28');
    });

    it('sem parcela, ou série parada muito antes do período novo: não continua (gera do início)', () => {
        expect(continuacaoDaSerie({ ultimoVencimento: null, inicio: '2019-03-23', fim: '2021-09-22' })).toBeNull();
        expect(continuacaoDaSerie({ ultimoVencimento: '2018-06-10', inicio: '2019-03-23', fim: '2021-09-22', ciclo: 'Mensal' })).toBeNull();
    });

    it('ciclosNoPeriodo: meses inteiros, o incompleto conta; trimestral divide', () => {
        expect(ciclosNoPeriodo('2019-03-23', '2021-09-22', 1)).toBe(30);
        expect(ciclosNoPeriodo('2019-03-23', '2021-09-30', 1)).toBe(31);
        expect(ciclosNoPeriodo('2025-01-01', '2025-12-31', 1)).toBe(12);
        expect(ciclosNoPeriodo('2025-01-01', '2025-12-31', 3)).toBe(4);
    });
});
