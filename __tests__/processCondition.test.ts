/**
 * Condição por etapa — avaliador puro. Passo 4 de
 * docs/planos/2026-09-28-torre-p2p-processos.md.
 *
 * O que este arquivo trava: cada operador; condição nula = executa; campo
 * ausente no contexto = executa (nunca pula por falta de dado); valor não
 * comparável = executa; `in` com lista; descrição e validação para a UI.
 */
import { describe, it, expect } from 'vitest';
import { avaliarCondicao, descreverCondicao, validarCondicao } from '../utils/processCondition';
import type { ProcessCondition } from '../types/process';

const c = (field: ProcessCondition['field'], op: ProcessCondition['op'], value: ProcessCondition['value']): ProcessCondition => ({ field, op, value });

describe('avaliarCondicao — operadores numéricos sobre amount', () => {
    it.each([
        ['gt',  30000, 50000, true],  ['gt',  30000, 5000, false], ['gt',  30000, 30000, false],
        ['gte', 30000, 30000, true],  ['gte', 30000, 29999, false],
        ['lt',  5000,  4999,  true],  ['lt',  5000,  5000, false],
        ['lte', 5000,  5000,  true],  ['lte', 5000,  5001, false],
        ['eq',  100,   100,   true],  ['eq',  100,   101,  false],
        ['neq', 100,   101,   true],  ['neq', 100,   100,  false],
    ] as const)('%s %d com amount=%d → %s', (op, limite, amount, esperado) => {
        expect(avaliarCondicao(c('amount', op, limite), { amount })).toBe(esperado);
    });

    it('aceita valor como texto com vírgula ("30.000,50" não — "30000,5" sim)', () => {
        expect(avaliarCondicao(c('amount', 'gt', '30000,5'), { amount: 30001 })).toBe(true);
        expect(avaliarCondicao(c('amount', 'gt', '30000,5'), { amount: 30000 })).toBe(false);
    });
});

describe('avaliarCondicao — nunca pula por falta de dado', () => {
    it('condição nula/indefinida → executa', () => {
        expect(avaliarCondicao(null, { amount: 1 })).toBe(true);
        expect(avaliarCondicao(undefined, {})).toBe(true);
    });

    it('campo ausente, null ou vazio no contexto → executa', () => {
        const cond = c('amount', 'gt', 30000);
        expect(avaliarCondicao(cond, {})).toBe(true);
        expect(avaliarCondicao(cond, { amount: null })).toBe(true);
        expect(avaliarCondicao(c('project_id', 'eq', 'x'), { project_id: '' })).toBe(true);
    });

    it('valor não comparável (texto num operador numérico) → executa', () => {
        expect(avaliarCondicao(c('amount', 'gt', 'abc'), { amount: 10 })).toBe(true);
    });
});

describe('avaliarCondicao — obra e fornecedor', () => {
    it('eq/neq por id', () => {
        expect(avaliarCondicao(c('project_id', 'eq', 'obra1'), { project_id: 'obra1' })).toBe(true);
        expect(avaliarCondicao(c('project_id', 'eq', 'obra1'), { project_id: 'obra2' })).toBe(false);
        expect(avaliarCondicao(c('supplier_id', 'neq', 'sup1'), { supplier_id: 'sup2' })).toBe(true);
        expect(avaliarCondicao(c('supplier_id', 'neq', 'sup1'), { supplier_id: 'sup1' })).toBe(false);
    });

    it('in com lista; lista vazia → executa', () => {
        expect(avaliarCondicao(c('project_id', 'in', ['a', 'b']), { project_id: 'b' })).toBe(true);
        expect(avaliarCondicao(c('project_id', 'in', ['a', 'b']), { project_id: 'c' })).toBe(false);
        expect(avaliarCondicao(c('project_id', 'in', []), { project_id: 'c' })).toBe(true);
    });
});

describe('descreverCondicao / validarCondicao (UI)', () => {
    it('descreve valor em BRL e listas por contagem', () => {
        expect(descreverCondicao(c('amount', 'gt', 30000))).toMatch(/^Valor > R\$\s?30\.000,00$/);
        expect(descreverCondicao(c('project_id', 'in', ['a', 'b']))).toBe('Obra em 2 itens');
        expect(descreverCondicao(null)).toBeNull();
    });

    it('valida campo, operador por campo, valor vazio e numérico', () => {
        expect(validarCondicao(null)).toBeNull();
        expect(validarCondicao(c('amount', 'gt', 30000))).toBeNull();
        expect(validarCondicao({ field: 'x' as never, op: 'gt', value: 1 })).toMatch(/Campo/);
        expect(validarCondicao(c('project_id', 'gt', 'a'))).toMatch(/Operador/);
        expect(validarCondicao(c('amount', 'gt', ''))).toMatch(/vazio/);
        expect(validarCondicao(c('amount', 'gt', 'abc'))).toMatch(/numérico/);
        expect(validarCondicao(c('project_id', 'in', []))).toMatch(/Lista/);
    });
});
