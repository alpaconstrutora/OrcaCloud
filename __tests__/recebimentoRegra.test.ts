/**
 * lib/recebimento.ts — a regra do recebimento (celular, link e computador; a Edge
 * `pedido-recebimento` usa como verdade). docs/planos/2026-11-27-recebimento-mobile.md.
 */
import { describe, it, expect } from 'vitest';
import {
    podeReceber, motivoParaNaoReceber, saldoPorItem, montarLinhas, statusDoRecebimento,
    statusDoPedidoApos, divergenciasDe, relatorioLegado, caminhoDoComprovante, ErroDeRecebimento,
} from '../lib/recebimento';

const ITENS = [
    { code: 'C1', description: 'Cimento', unit: 'sc', quantity: 10 },
    { code: 'A1', description: 'Areia', unit: 'm3', quantity: 4 },
];

describe('podeReceber (CIF já "Em Trânsito"; FOB só retirado)', () => {
    it.each([
        ['Em Trânsito', false, true], ['Entregue', false, true], ['Separação', false, false], ['Confirmado', false, false],
        ['Recebido', false, false], ['Divergência', false, false],
        ['Entregue', true, true], ['Em Trânsito', true, false], ['Confirmado', true, false],
    ])('%s (FOB=%s) → %s', (status, fob, esperado) => {
        expect(podeReceber(status, fob)).toBe(esperado);
    });

    it('motivo de não poder', () => {
        expect(motivoParaNaoReceber('Entregue', false)).toBeNull();
        expect(motivoParaNaoReceber('Recebido', false)).toBe('Este pedido já foi conferido.');
        expect(motivoParaNaoReceber('Confirmado', true)).toBe('Registre a retirada antes de conferir.');
        expect(motivoParaNaoReceber('Separação', false)).toBe('O fornecedor ainda não despachou este pedido.');
    });
});

describe('saldoPorItem', () => {
    it('sem conferência anterior = quantidade do pedido', () => {
        expect(saldoPorItem(ITENS, [])).toEqual([10, 4]);
    });

    it('desconta só as conferências PARCIAIS, pelo índice', () => {
        const saldo = saldoPorItem(ITENS, [
            { status: 'Parcial', itens: [{ indice: 0, code: 'C1', quantidadeRecebida: 6 }, { indice: 1, code: 'A1', quantidadeRecebida: 4 }] },
            { status: 'Recebido', itens: [{ indice: 0, code: 'C1', quantidadeRecebida: 10 }] },
        ]);
        expect(saldo).toEqual([4, 0]);
    });

    it('conferência antiga sem índice casa pelo código, sem usar o mesmo item duas vezes', () => {
        const dois = [{ code: 'X', quantity: 5 }, { code: 'X', quantity: 5 }];
        const saldo = saldoPorItem(dois, [{ status: 'Parcial', itens: [{ code: 'X', quantidadeRecebida: 2 }, { code: 'X', quantidadeRecebida: 3 }] }]);
        expect(saldo).toEqual([3, 2]);
    });
});

describe('montarLinhas + status', () => {
    it('tudo recebido → Recebido; pedido fica Recebido; nenhuma divergência', () => {
        const linhas = montarLinhas(ITENS, [10, 4], [{ indice: 0, recebida: 10 }, { indice: 1, recebida: 4 }]);
        expect(statusDoRecebimento(linhas)).toBe('Recebido');
        expect(statusDoPedidoApos('Recebido')).toBe('Recebido');
        expect(divergenciasDe(linhas)).toEqual([]);
        expect(relatorioLegado(linhas)).toBeNull();
    });

    it('a menor SEM "o resto vem depois" → Divergência faltando, com a quantidade que faltou (paridade com o modal antigo)', () => {
        const linhas = montarLinhas(ITENS, [10, 4], [{ indice: 0, recebida: 7 }, { indice: 1, recebida: 4 }]);
        expect(statusDoRecebimento(linhas)).toBe('Divergência');
        expect(divergenciasDe(linhas)).toEqual([{ orderItemCode: 'C1', description: 'Cimento', unit: 'sc', issue: 'faltando', quantity: 3, notes: null }]);
    });

    it('quebrado → Divergência quebrado', () => {
        const linhas = montarLinhas(ITENS, [10, 4], [{ indice: 0, recebida: 8, problema: 'quebrado', obs: '2 sacos rasgados' }, { indice: 1, recebida: 4 }]);
        expect(statusDoRecebimento(linhas)).toBe('Divergência');
        expect(divergenciasDe(linhas)[0]).toMatchObject({ issue: 'quebrado', quantity: 2, notes: '2 sacos rasgados' });
    });

    it('a menor COM "o resto vem depois" → Parcial; pedido fica Entregue; sem divergência', () => {
        const linhas = montarLinhas(ITENS, [10, 4], [{ indice: 0, recebida: 6, restoDepois: true }, { indice: 1, recebida: 4 }]);
        expect(statusDoRecebimento(linhas)).toBe('Parcial');
        expect(statusDoPedidoApos('Parcial')).toBe('Entregue');
        expect(divergenciasDe(linhas)).toEqual([]);
    });

    it('segunda conferência: só os itens com saldo, esperando o saldo', () => {
        const saldo = saldoPorItem(ITENS, [{ status: 'Parcial', itens: [{ indice: 0, quantidadeRecebida: 6 }, { indice: 1, quantidadeRecebida: 4 }] }]);
        const linhas = montarLinhas(ITENS, saldo, [{ indice: 0, recebida: 4 }]);
        expect(linhas).toHaveLength(1);
        expect(linhas[0]).toMatchObject({ indice: 0, pedida: 4, recebida: 4 });
        expect(statusDoRecebimento(linhas)).toBe('Recebido');
    });

    it('uma divergência pesa mais que o parcial', () => {
        const linhas = montarLinhas(ITENS, [10, 4], [{ indice: 0, recebida: 6, restoDepois: true }, { indice: 1, recebida: 1 }]);
        expect(statusDoRecebimento(linhas)).toBe('Divergência');
        expect(divergenciasDe(linhas).map(d => d.orderItemCode)).toEqual(['A1']);
    });

    it('descrição e unidade vêm do pedido, não da entrada', () => {
        const linhas = montarLinhas(ITENS, [10, 4], [
            { indice: 0, recebida: 10, ...({ description: 'forjada' } as object) },
            { indice: 1, recebida: 4 },
        ]);
        expect(linhas[0].description).toBe('Cimento');
    });
});

describe('montarLinhas recusa entrada inválida', () => {
    const casos: [string, Parameters<typeof montarLinhas>[2], RegExp][] = [
        ['índice fora do pedido', [{ indice: 5, recebida: 1 }], /não existe/],
        ['item repetido', [{ indice: 0, recebida: 1 }, { indice: 0, recebida: 1 }, { indice: 1, recebida: 4 }], /duas vezes/],
        ['item com saldo sem conferência', [{ indice: 0, recebida: 10 }], /Falta conferir o item 2/],
        ['quantidade negativa', [{ indice: 0, recebida: -1 }, { indice: 1, recebida: 4 }], /inválida/],
        ['quantidade NaN', [{ indice: 0, recebida: Number.NaN }, { indice: 1, recebida: 4 }], /inválida/],
        ['acima do saldo', [{ indice: 0, recebida: 11 }, { indice: 1, recebida: 4 }], /mais do que o saldo/],
        ['resto depois sem falta', [{ indice: 0, recebida: 10, restoDepois: true }, { indice: 1, recebida: 4 }], /só vale para item recebido a menor/],
        ['resto depois + problema', [{ indice: 0, recebida: 5, restoDepois: true, problema: 'quebrado' }, { indice: 1, recebida: 4 }], /não os dois/],
        ['problema desconhecido', [{ indice: 0, recebida: 5, problema: 'sumiu' as never }, { indice: 1, recebida: 4 }], /Problema inválido/],
    ];
    it.each(casos)('%s', (_n, entradas, msg) => {
        expect(() => montarLinhas(ITENS, [10, 4], entradas)).toThrow(ErroDeRecebimento);
        expect(() => montarLinhas(ITENS, [10, 4], entradas)).toThrow(msg);
    });

    it('item já todo recebido não entra', () => {
        expect(() => montarLinhas(ITENS, [0, 4], [{ indice: 0, recebida: 1 }, { indice: 1, recebida: 4 }])).toThrow(/já foi todo recebido/);
    });
});

it('caminho do comprovante: pasta = pedido (política do bucket receipts)', () => {
    expect(caminhoDoComprovante('po1', 'r1')).toBe('po1/receipt_r1.jpg');
});
