/**
 * EAC — o número que o PRD (§124) usa para vender o produto.
 *
 * O que estes testes protegem: que a conta NÃO se anule (um EAC que devolve
 * sempre o orçado é pior que nenhum, porque parece rigoroso), que o desvio
 * observado seja projetado para o que falta, e que a falta de dado apareça
 * como `null` em vez de um R$ 0,00 tranquilizador.
 */

import { describe, expect, it } from 'vitest';
import { calcularEac, type ItemOrcado } from '../utils/creditRoomEac';

/** 3 itens de R$ 100.000 cada, sem BDI: orçado total R$ 300.000. */
const orcamento: ItemOrcado[] = [
    { id: 'a', quantity: 1000, sinapiItem: { price: 100 } },
    { id: 'b', quantity: 1000, sinapiItem: { price: 100 } },
    { id: 'c', quantity: 1000, sinapiItem: { price: 100 } },
];

describe('calcularEac', () => {
    it('sem nada contratado, o EAC é o próprio orçamento — e o fator é null, não 1', () => {
        const r = calcularEac(orcamento, []);
        expect(r.orcado).toBe(300_000);
        expect(r.contratado).toBe(0);
        expect(r.aContratar).toBe(300_000);
        expect(r.fator).toBeNull();          // não há desvio observado
        expect(r.eac).toBe(300_000);
        expect(r.desvioPct).toBe(0);
    });

    it('contratando NO orçado, o EAC continua o orçado (fator 1)', () => {
        const r = calcularEac(orcamento, [{ budgetItemId: 'a', totalPrice: 100_000 }]);
        expect(r.fator).toBe(1);
        expect(r.eac).toBe(300_000);
        expect(r.desvioPct).toBe(0);
    });

    it('🔴 o ponto do EAC: contratar ACIMA projeta o estouro para o que falta', () => {
        // Item 'a' orçado em 100k saiu por 120k → fator 1,2.
        // a_contratar = 200k → EAC = 120k + 200k×1,2 = 360k, +20% sobre o orçado.
        const r = calcularEac(orcamento, [{ budgetItemId: 'a', totalPrice: 120_000 }]);
        expect(r.fator).toBe(1.2);
        expect(r.orcadoDosContratados).toBe(100_000);
        expect(r.aContratar).toBe(200_000);
        expect(r.eac).toBe(360_000);
        expect(r.desvioPct).toBe(20);
        // E o essencial: o EAC NÃO é igual ao orçado — a conta não se anulou.
        expect(r.eac).toBeGreaterThan(r.orcado);
    });

    it('contratar ABAIXO projeta economia, e o desvio fica negativo', () => {
        const r = calcularEac(orcamento, [{ budgetItemId: 'a', totalPrice: 90_000 }]);
        expect(r.fator).toBe(0.9);
        expect(r.eac).toBe(270_000);         // 90k + 200k×0,9
        expect(r.desvioPct).toBe(-10);
    });

    it('com tudo contratado, não sobra o que projetar: EAC = contratado', () => {
        const r = calcularEac(orcamento, [
            { budgetItemId: 'a', totalPrice: 120_000 },
            { budgetItemId: 'b', totalPrice: 100_000 },
            { budgetItemId: 'c', totalPrice: 100_000 },
        ]);
        expect(r.aContratar).toBe(0);
        expect(r.eac).toBe(320_000);
        expect(r.desvioPct).toBe(6.67);
    });

    it('vários contratos no MESMO item somam, e o item conta uma vez no denominador', () => {
        const r = calcularEac(orcamento, [
            { budgetItemId: 'a', totalPrice: 60_000 },
            { budgetItemId: 'a', totalPrice: 60_000 },   // aditivo
        ]);
        expect(r.orcadoDosContratados).toBe(100_000);    // 'a' uma vez só
        expect(r.fator).toBe(1.2);
    });

    it('item contratado FORA do orçamento não distorce o fator, mas entra no contratado', () => {
        // 'z' não existe no orçamento: sem denominador, ficaria fora da razão.
        const r = calcularEac(orcamento, [
            { budgetItemId: 'a', totalPrice: 120_000 },
            { budgetItemId: 'z', totalPrice: 50_000 },
        ]);
        expect(r.contratadosSemOrcamento).toBe(50_000);
        expect(r.fator).toBe(1.2);                       // calculado só sobre 'a'
        expect(r.contratado).toBe(170_000);              // mas o total inclui 'z'
        expect(r.eac).toBe(410_000);                     // 170k + 200k×1,2
    });

    it('sem orçamento, o EAC é null — nunca R$ 0,00', () => {
        const r = calcularEac([], [{ budgetItemId: 'a', totalPrice: 10_000 }]);
        expect(r.eac).toBeNull();
        expect(r.desvioPct).toBeNull();
        expect(r.fator).toBeNull();
        expect(calcularEac(null, null).eac).toBeNull();
    });

    it('o BDI entra no orçado, e o do item vence o padrão', () => {
        const r = calcularEac(
            [{ id: 'a', quantity: 1000, sinapiItem: { price: 100 } },
             { id: 'b', quantity: 1000, bdi: 0, sinapiItem: { price: 100 } }],
            [], 20,
        );
        expect(r.orcado).toBe(220_000);   // 120.000 (com BDI) + 100.000 (sem)
    });
});
