/**
 * Linhas do orçamento para "+ Item do orçamento" do Pedido de Compra
 * (10/11/2026) — e a mesma base da Solicitação de Compra › "Do orçamento".
 * Plano: docs/planos/2026-11-10-pedido-item-do-orcamento-painel.md
 */
import { describe, it, expect } from 'vitest';
import { montarLinhas, linhasDoOrcamentoParaPedido } from '../lib/orcamentoLinhas';
import { SinapiType, type BudgetEntry } from '../types/budget';

const ORCAMENTO = [
    { id: 'b1', quantity: 10, sinapiItem: { code: 'CIM', description: 'Cimento', unit: 'sc', price: 40, type: SinapiType.INPUT } },
    { id: 'b2', quantity: 5.7375, sinapiItem: {
        code: '101751', description: 'Piso em taco', unit: 'm2', price: 351.78, type: SinapiType.COMPOSITION,
        composition: [
            { code: 'TACO', description: 'Taco de madeira', unit: 'm2', price: 120, type: SinapiType.INPUT, quantity: 1.05 },
            { code: 'COLA', description: 'Cola PVA', unit: 'kg', price: 30, type: SinapiType.INPUT, quantity: 0.4 },
        ],
    } },
    { id: 'b3', quantity: 1, sinapiItem: { code: 'SRV', description: 'Limpeza final', unit: 'vb', price: 900, type: SinapiType.SERVICE } },
] as unknown as BudgetEntry[];

describe('montarLinhas (base comum)', () => {
    it('desdobra a composição nos insumos, com coeficiente × quantidade orçada, e usa o preço SINAPI quando houver', () => {
        const linhas = montarLinhas(ORCAMENTO, new Map([['COLA', 33]]));
        expect(linhas.map(l => l.code)).toEqual(['CIM', '101751', 'TACO', 'COLA', 'SRV']);
        const taco = linhas.find(l => l.code === 'TACO')!;
        expect(taco.quantity).toBe(6.0244); // 1.05 × 5.7375 = 6.024375
        expect(taco.compositionCode).toBe('101751');
        expect(linhas.find(l => l.code === 'COLA')!.price).toBe(33);
        expect(linhas.find(l => l.code === 'CIM')!.price).toBe(40);
    });
});

describe('linhasDoOrcamentoParaPedido', () => {
    const linhas = linhasDoOrcamentoParaPedido(ORCAMENTO, new Map(), new Map([['CIM', 4], ['TACO', 10]]), new Set(['COLA']));
    const por = (code: string) => linhas.find(l => l.code === code)!;

    it('serviço de topo fica de fora — pedido de compra não compra serviço', () => {
        expect(linhas.some(l => l.code === 'SRV')).toBe(false);
    });

    it('a composição é título (não se marca); os insumos dela, sim', () => {
        expect(por('101751').titulo).toBe(true);
        expect(por('TACO').titulo).toBe(false);
    });

    it('a comprar = orçada − comprada, nunca negativa', () => {
        expect(por('CIM')).toMatchObject({ comprada: 4, aComprar: 6 });
        expect(por('TACO')).toMatchObject({ comprada: 10, aComprar: 0 });
        expect(por('COLA')).toMatchObject({ comprada: 0, aComprar: 2.295 });
    });

    it('marca o que já está neste pedido', () => {
        expect(por('COLA').jaNoPedido).toBe(true);
        expect(por('CIM').jaNoPedido).toBe(false);
    });
});
