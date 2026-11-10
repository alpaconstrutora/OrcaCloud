/**
 * Linhas do orçamento para "+ Item do orçamento" do Pedido de Compra
 * (10/11/2026) — e a mesma base da Solicitação de Compra › "Do orçamento".
 * Plano: docs/planos/2026-11-10-pedido-item-do-orcamento-painel.md
 */
import { describe, it, expect } from 'vitest';
import { montarLinhas, linhasDoOrcamentoParaPedido, materiaisDaComposicao, composicoesInternasAResolver, type SubComposicoes } from '../lib/orcamentoLinhas';
import type { CompositionComponent } from '../types/budget';
import { SinapiType, type BudgetEntry } from '../types/budget';

const ORCAMENTO = [
    { id: 'b1', quantity: 10, sinapiItem: { code: 'CIM', description: 'Cimento', unit: 'sc', price: 40, type: SinapiType.INPUT } },
    { id: 'b2', quantity: 5.7375, sinapiItem: {
        code: '101751', description: 'Piso em taco', unit: 'm2', price: 351.78, type: SinapiType.COMPOSITION,
        composition: [
            { code: 'TACO', description: 'Taco de madeira', unit: 'm2', price: 120, type: SinapiType.INPUT, quantity: 1.05 },
            { code: 'COLA', description: 'Cola PVA', unit: 'kg', price: 30, type: SinapiType.INPUT, quantity: 0.4 },
            { code: '88316', description: 'SERVENTE COM ENCARGOS COMPLEMENTARES', unit: 'H', price: 20.92, type: SinapiType.COMPOSITION, quantity: 0.24 },
            { code: '5631', description: 'ESCAVADEIRA HIDRÁULICA', unit: 'CHP', price: 250, type: SinapiType.COMPOSITION, quantity: 0.01 },
        ],
    } },
    { id: 'b3', quantity: 1, sinapiItem: { code: 'SRV', description: 'Limpeza final', unit: 'vb', price: 900, type: SinapiType.SERVICE } },
    // Composição só de mão de obra e equipamento: não tem o que comprar em pedido.
    { id: 'b4', quantity: 20, sinapiItem: {
        code: '101235', description: 'Escavação vertical', unit: 'm3', price: 18, type: SinapiType.COMPOSITION,
        composition: [
            { code: '89877', description: 'CAMINHÃO BASCULANTE 14 M3', unit: 'CHI', price: 90, type: SinapiType.COMPOSITION, quantity: 0.02 },
            { code: '88316', description: 'SERVENTE COM ENCARGOS COMPLEMENTARES', unit: 'H', price: 20.92, type: SinapiType.COMPOSITION, quantity: 0.1 },
        ],
    } },
    // Insumo de topo em hora (mão de obra lançada direto no orçamento).
    { id: 'b5', quantity: 40, sinapiItem: { code: '4750', description: 'PEDREIRO', unit: 'H', price: 25, type: SinapiType.INPUT } },
] as unknown as BudgetEntry[];

describe('montarLinhas (base comum)', () => {
    it('desdobra a composição nos insumos, com coeficiente × quantidade orçada, e usa o preço SINAPI quando houver', () => {
        const linhas = montarLinhas(ORCAMENTO, new Map([['COLA', 33]]));
        expect(linhas.map(l => l.code)).toEqual(['CIM', '101751', 'TACO', 'COLA', '88316', '5631', 'SRV', '101235', '89877', '88316', '4750']);
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

    it('só material: mão de obra (H) e hora de equipamento (CHP/CHI) ficam de fora — na composição e no topo', () => {
        expect(linhas.map(l => l.code)).toEqual(['CIM', '101751', 'TACO', 'COLA']);
    });

    it('composição sem nenhum insumo de material não aparece (nem o título)', () => {
        expect(linhas.some(l => l.code === '101235')).toBe(false);
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

describe('composição dentro de composição: desce até o material', () => {
    const c = (code: string, unit: string, type: SinapiType, quantity: number, description = code) =>
        ({ code, description, unit, type, quantity, price: 0 }) as unknown as CompositionComponent;
    // Alvenaria (topo, 10 m2) → argamassa (interna) → cimento + areia + betoneira;
    //                         → armação (interna, SEM detalhamento na base);
    //                         → bloco (insumo direto) e servente (mão de obra).
    const ALVENARIA = [{ id: 'a1', quantity: 10, sinapiItem: {
        code: '100351', description: 'Alvenaria estrutural', unit: 'm2', price: 200, type: SinapiType.COMPOSITION,
        composition: [
            c('BLOCO', 'UN', SinapiType.INPUT, 12.5),
            c('87298', 'M3', SinapiType.COMPOSITION, 0.02, 'ARGAMASSA TRAÇO 1:3'),
            c('92759', 'KG', SinapiType.COMPOSITION, 1.5, 'ARMAÇÃO DE PILAR'),
            c('88316', 'H', SinapiType.COMPOSITION, 0.8, 'SERVENTE'),
        ],
    } }] as unknown as BudgetEntry[];
    const sub: SubComposicoes = new Map([
        ['87298', [c('CIMENTO', 'KG', SinapiType.INPUT, 430), c('AREIA', 'M3', SinapiType.INPUT, 1.1), c('88831', 'CHI', SinapiType.COMPOSITION, 3.39)]],
        ['92759', []],
    ]);

    it('a interna vira os materiais dela, com o coeficiente acumulado; hora e mão de obra saem', () => {
        const mats = materiaisDaComposicao(ALVENARIA[0].sinapiItem!.composition!, sub);
        const coef = Object.fromEntries(mats.map(m => [m.item.code, Math.round(m.coef * 10000) / 10000]));
        expect(coef).toEqual({ BLOCO: 12.5, CIMENTO: 8.6, AREIA: 0.022, 92759: 1.5 });
    });

    it('interna sem detalhamento na base continua, marcada — nada some calado', () => {
        const linhas = linhasDoOrcamentoParaPedido(ALVENARIA, new Map(), new Map(), new Set(), sub);
        const armacao = linhas.find(l => l.code === '92759')!;
        expect(armacao.origem).toBe('Composição de 100351 (sem detalhamento)');
        expect(linhas.find(l => l.code === 'CIMENTO')).toMatchObject({ quantity: 86, origem: 'Insumo de 100351' });
        expect(linhas.some(l => l.code === '87298' || l.code === '88831' || l.code === '88316')).toBe(false);
    });

    it('o mesmo material por dois caminhos soma numa linha só', () => {
        const dupla = [c('87298', 'M3', SinapiType.COMPOSITION, 0.01), c('CIMENTO', 'KG', SinapiType.INPUT, 2)];
        const mats = materiaisDaComposicao(dupla, sub);
        expect(mats.filter(m => m.item.code === 'CIMENTO')).toHaveLength(1);
        expect(mats.find(m => m.item.code === 'CIMENTO')!.coef).toBeCloseTo(6.3);
    });

    it('lista o que falta buscar na base, inclusive dentro do que já veio', () => {
        expect(composicoesInternasAResolver(ALVENARIA, new Map()).sort()).toEqual(['87298', '92759']);
        expect(composicoesInternasAResolver(ALVENARIA, sub)).toEqual([]);
        const comNeta: SubComposicoes = new Map([...sub, ['87298', [c('94974', 'M3', SinapiType.COMPOSITION, 1)]]]);
        expect(composicoesInternasAResolver(ALVENARIA, comNeta)).toEqual(['94974']);
    });
});
