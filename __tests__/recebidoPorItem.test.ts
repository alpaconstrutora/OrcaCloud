import { describe, expect, it } from 'vitest';
import { chaveDoItem, recebidoPorItem } from '../utils/recebidoPorItem';

/**
 * 3-Way Match — recebido por item. Caso real: PCO-011-017-0002 (19/10/2026),
 * 5 itens avulsos SEM código; o casamento só por código somava 14 em todas
 * as linhas.
 */

const pedido = [
    { code: '', description: 'Cimento CP2 50kg', unit: 'un', quantity: 7 },
    { code: '', description: 'Areia Grossa', unit: 'm²', quantity: 1 },
    { code: '', description: 'Pedra 1', unit: 'm', quantity: 1 },
    { code: '', description: 'Tabua 20 3,00', unit: 'un', quantity: 3 },
    { code: '', description: 'tabua 15 3,00', unit: 'un', quantity: 2 },
];
const recebimento = pedido.map(i => ({ code: '', description: i.description, unit: i.unit, quantityReceived: i.quantity }));

describe('recebidoPorItem', () => {
    it('PCO-011-017-0002: cada item sem código recebe a SUA quantidade (não 14 em todos)', () => {
        expect(recebidoPorItem(pedido, recebimento)).toEqual([7, 1, 1, 3, 2]);
    });

    it('com código, casa pelo código mesmo que a descrição tenha mudado', () => {
        const p = [{ code: 'A1', description: 'Cimento', unit: 'sc', quantity: 10 }];
        const r = [{ code: 'A1', description: 'Cimento CP-II (texto antigo)', unit: 'sc', quantityReceived: 4 }];
        expect(recebidoPorItem(p, r)).toEqual([4]);
    });

    it('soma recebimentos parciais do mesmo item', () => {
        const r = [
            { code: '', description: 'Cimento CP2 50kg', unit: 'un', quantityReceived: 3 },
            { code: '', description: 'cimento  cp2 50kg ', unit: 'UN', quantityReceived: 4 },   // normaliza caixa/espaços
        ];
        expect(recebidoPorItem(pedido, r)).toEqual([7, 0, 0, 0, 0]);
    });

    it('dois avulsos iguais dividem o recebido na ordem do pedido; sobra no último', () => {
        const p = [
            { code: '', description: 'Prego 18x27', unit: 'kg', quantity: 2 },
            { code: '', description: 'Prego 18x27', unit: 'kg', quantity: 3 },
        ];
        expect(recebidoPorItem(p, [{ code: '', description: 'Prego 18x27', unit: 'kg', quantityReceived: 5 }])).toEqual([2, 3]);
        expect(recebidoPorItem(p, [{ code: '', description: 'Prego 18x27', unit: 'kg', quantityReceived: 6 }])).toEqual([2, 4]);
        expect(recebidoPorItem(p, [{ code: '', description: 'Prego 18x27', unit: 'kg', quantityReceived: 1 }])).toEqual([1, 0]);
    });

    it('sem recebimento, tudo zero', () => {
        expect(recebidoPorItem(pedido, [])).toEqual([0, 0, 0, 0, 0]);
    });

    it('chave: código quando há; senão descrição + unidade', () => {
        expect(chaveDoItem({ code: ' X9 ', description: 'qualquer' })).toBe('c:X9');
        expect(chaveDoItem({ code: '', description: 'Areia  Grossa', unit: 'm²' })).toBe('d:areia grossa|m²');
        expect(chaveDoItem({ code: null, description: null })).toBe('d:|');
    });
});
