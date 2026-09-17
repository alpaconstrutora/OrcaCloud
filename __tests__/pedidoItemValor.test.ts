import { describe, expect, it } from 'vitest';
import {
    aplicarCotadoNosItens,
    cotadosDaProposta,
    fornecedorPodeCotar,
    montarItensDoPedidoDaCotacao,
    temCotacao,
    totalEfetivoDoPedido,
    totalReferenciaDoPedido,
    unitarioEfetivoDoItem,
    valorEfetivoDoItem,
} from '../utils/pedidoItemValor';

/**
 * Item do pedido com dois pares de preço — referência (`unitPrice`/`total`)
 * e cotado (`quotedUnitPrice`/`quotedTotal`). A regra "cotado quando houver,
 * senão referência" vive em `utils/pedidoItemValor.ts`; aqui ela é fixada.
 * Plano: docs/planos/2026-09-17-pedido-itens-valor-cotacao.md
 */

describe('valor efetivo — cotado quando houver, senão referência', () => {
    it('sem cotação usa a referência', () => {
        expect(valorEfetivoDoItem({ total: 10 })).toBe(10);
        expect(valorEfetivoDoItem({ total: 10, quotedTotal: null })).toBe(10);
        expect(valorEfetivoDoItem({ total: 10, quotedTotal: undefined })).toBe(10);
        expect(unitarioEfetivoDoItem({ unitPrice: 2.5 })).toBe(2.5);
        expect(unitarioEfetivoDoItem({ unitPrice: 2.5, quotedUnitPrice: null })).toBe(2.5);
    });

    it('com cotação usa o cotado — inclusive 0, que é cotação válida', () => {
        expect(valorEfetivoDoItem({ total: 10, quotedTotal: 7 })).toBe(7);
        expect(valorEfetivoDoItem({ total: 10, quotedTotal: 0 })).toBe(0);
        expect(unitarioEfetivoDoItem({ unitPrice: 2.5, quotedUnitPrice: 0 })).toBe(0);
    });

    it('item sem preço nenhum vale 0', () => {
        expect(valorEfetivoDoItem({})).toBe(0);
        expect(unitarioEfetivoDoItem({})).toBe(0);
    });

    it('temCotacao só é falso para null/ausente', () => {
        expect(temCotacao({ quotedTotal: 0 })).toBe(true);
        expect(temCotacao({ quotedTotal: 12 })).toBe(true);
        expect(temCotacao({ quotedTotal: null })).toBe(false);
        expect(temCotacao({})).toBe(false);
    });

    it('totais do pedido — efetivo mistura os pares, referência ignora o cotado', () => {
        const items = [
            { total: 10, quotedTotal: 8 },
            { total: 5 },
            { total: 3, quotedTotal: null },
        ];
        expect(totalEfetivoDoPedido(items)).toBe(16);
        expect(totalReferenciaDoPedido(items)).toBe(18);
        expect(totalEfetivoDoPedido([])).toBe(0);
        expect(totalEfetivoDoPedido(undefined)).toBe(0);
        expect(totalEfetivoDoPedido(null)).toBe(0);
    });
});

describe('fornecedorPodeCotar — janela por status', () => {
    it.each(['Rascunho', 'Enviado', 'Em Negociação', 'Confirmado', 'Separação', 'Em Trânsito'])(
        'pode em %s',
        status => expect(fornecedorPodeCotar(status)).toBe(true),
    );
    it.each(['Entregue', 'Recebido', 'Divergência', 'Cancelado'])(
        'não pode em %s',
        status => expect(fornecedorPodeCotar(status)).toBe(false),
    );
    it('status ausente não bloqueia', () => {
        expect(fornecedorPodeCotar(undefined)).toBe(true);
        expect(fornecedorPodeCotar(null)).toBe(true);
    });
});

describe('aplicarCotadoNosItens — casa por índice + code, preserva o resto', () => {
    const base = [
        { code: 'A', description: 'Cimento', unit: 'sc', quantity: 2, unitPrice: 1, total: 2, avulso: true },
        { code: 'B', description: 'Areia', unit: 'm3', quantity: 3, unitPrice: 10, total: 30 },
        { code: 'A', description: 'Cimento (2ª linha)', unit: 'sc', quantity: 4, unitPrice: 1, total: 4 },
    ];

    it('índice + code: cota a linha certa mesmo com code duplicado', () => {
        const r = aplicarCotadoNosItens(base, [{ index: 2, code: 'A', quotedUnitPrice: 5, quotedTotal: 20 }]);
        expect(r[0].quotedTotal).toBeUndefined();
        expect(r[2]).toMatchObject({ quotedUnitPrice: 5, quotedTotal: 20, description: 'Cimento (2ª linha)' });
    });

    it('sem índice (ou índice que não bate): primeira linha do code ainda não cotada', () => {
        const r = aplicarCotadoNosItens(base, [
            { code: 'A', quotedUnitPrice: 5, quotedTotal: 10 },
            { code: 'A', quotedUnitPrice: 6, quotedTotal: 24 },
        ]);
        expect(r[0]).toMatchObject({ quotedUnitPrice: 5, quotedTotal: 10 });
        expect(r[2]).toMatchObject({ quotedUnitPrice: 6, quotedTotal: 24 });

        const errado = aplicarCotadoNosItens(base, [{ index: 1, code: 'A', quotedUnitPrice: 9, quotedTotal: 18 }]);
        expect(errado[1].quotedTotal).toBeUndefined(); // índice 1 é 'B', não casa
        expect(errado[0]).toMatchObject({ quotedUnitPrice: 9, quotedTotal: 18 });
    });

    it('code desconhecido é ignorado; referência, avulso e descrição ficam intactos', () => {
        const r = aplicarCotadoNosItens(base, [{ code: 'Z', quotedUnitPrice: 1, quotedTotal: 1 }, { index: 1, code: 'B', quotedUnitPrice: 8, quotedTotal: 24 }]);
        expect(r[1]).toMatchObject({ unitPrice: 10, total: 30, quotedUnitPrice: 8, quotedTotal: 24 });
        expect(r[0]).toMatchObject({ avulso: true, description: 'Cimento', unitPrice: 1, total: 2 });
    });

    it('não muta a entrada', () => {
        const copia = JSON.parse(JSON.stringify(base));
        aplicarCotadoNosItens(base, [{ index: 0, code: 'A', quotedUnitPrice: 5, quotedTotal: 10 }]);
        expect(base).toEqual(copia);
    });

    it('cotação null limpa o cotado', () => {
        const cotado = aplicarCotadoNosItens(base, [{ index: 1, code: 'B', quotedUnitPrice: 8, quotedTotal: 24 }]);
        const limpo = aplicarCotadoNosItens(cotado, [{ index: 1, code: 'B', quotedUnitPrice: null, quotedTotal: null }]);
        expect(temCotacao(limpo[1])).toBe(false);
        expect(limpo[1].total).toBe(30);
    });
});

describe('cotadosDaProposta — proposta legada vira cotado', () => {
    it('proposta antiga (só unitPrice/total) usa esses valores como cotado', () => {
        const r = cotadosDaProposta([{ code: 'A', unitPrice: 4, total: 8 }]);
        expect(r).toEqual([{ index: 0, code: 'A', quotedUnitPrice: 4, quotedTotal: 8 }]);
    });

    it('proposta nova leva o cotado dela, mesmo que seja null', () => {
        const r = cotadosDaProposta([
            { code: 'A', unitPrice: 4, total: 8, quotedUnitPrice: 3, quotedTotal: 6 },
            { code: 'B', unitPrice: 4, total: 8, quotedUnitPrice: null, quotedTotal: null },
        ]);
        expect(r[0]).toMatchObject({ index: 0, quotedUnitPrice: 3, quotedTotal: 6 });
        expect(r[1]).toMatchObject({ index: 1, quotedUnitPrice: null, quotedTotal: null });
    });
});

describe('montarItensDoPedidoDaCotacao — referência da RFQ, cotado da resposta', () => {
    const rfq = [
        { code: 'A', unitPrice: 10 },
        { code: 'M', unitPrice: undefined },   // item manual digitado na RFQ, sem preço
        { code: 'A', unitPrice: 12 },          // code repetido
    ];
    const resposta = [
        { code: 'A', description: 'Cimento', unit: 'sc', quantity: 2, unitPrice: 9, total: 18 },
        { code: 'M', description: 'Manual', unit: 'un', quantity: 1, unitPrice: 50 },
        { code: 'A', description: 'Cimento', unit: 'sc', quantity: 3, unitPrice: 8, total: 24 },
    ];

    it('code na RFQ com preço: referência = RFQ, cotado = resposta', () => {
        const [a] = montarItensDoPedidoDaCotacao(rfq, resposta);
        expect(a).toEqual({
            code: 'A', description: 'Cimento', unit: 'sc', quantity: 2,
            unitPrice: 10, total: 20, quotedUnitPrice: 9, quotedTotal: 18,
        });
    });

    it('item manual sem preço na RFQ: referência 0, cotado derivado quando a resposta não traz total', () => {
        const [, m] = montarItensDoPedidoDaCotacao(rfq, resposta);
        expect(m).toMatchObject({ unitPrice: 0, total: 0, quotedUnitPrice: 50, quotedTotal: 50 });
    });

    it('code duplicado casa a n-ésima ocorrência com a n-ésima', () => {
        const [, , a2] = montarItensDoPedidoDaCotacao(rfq, resposta);
        expect(a2).toMatchObject({ unitPrice: 12, total: 36, quotedUnitPrice: 8, quotedTotal: 24 });
    });

    it('code que não existe na RFQ: referência 0', () => {
        const [x] = montarItensDoPedidoDaCotacao([], [{ code: 'X', description: 'x', unit: 'un', quantity: 2, unitPrice: 1.005 }]);
        expect(x).toMatchObject({ unitPrice: 0, total: 0, quotedUnitPrice: 1.005, quotedTotal: 2.01 });
    });
});
