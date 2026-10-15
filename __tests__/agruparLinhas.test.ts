import { describe, it, expect } from 'vitest';
import {
    agruparLinhas, chavePorNome, chavePorMes, chavePorRotulo, rotuloMes,
    linhasDaTela, entradasDaPagina, contarLinhasDaTela, type EntradaDaTela,
} from '../utils/agruparLinhas';

type L = { id: string; nome?: string; data?: string; st?: string; v?: number | null };
const l = (id: string, extra: Partial<L> = {}): L => ({ id, v: 10, ...extra });

const porNome = { chave: (x: L) => chavePorNome(x.nome), semRotulo: 'Sem nome', valor: (x: L) => x.v };

/** "G:rotulo" / "G:rotulo+" (continua) / "R:rotulo" (recolhido) / id da linha. */
const resumo = (e: EntradaDaTela<L>[]) => e.map(x => (x.tipo === 'grupo'
    ? `${x.recolhido ? 'R' : 'G'}:${x.grupo.label}${x.continua ? '+' : ''}`
    : x.item.id));

describe('agruparLinhas', () => {
    it('ordem de 1ª aparição, contagem e total; "Sem …" por último; caixa não separa', () => {
        const g = agruparLinhas([l('1', { nome: 'Maria', v: 5 }), l('2'), l('3', { nome: 'joão' }), l('4', { nome: 'MARIA', v: 1.5 })], porNome);
        expect(g.map(x => x.label)).toEqual(['Maria', 'joão', 'Sem nome']);
        expect(g[0].itens.map(x => x.id)).toEqual(['1', '4']);
        expect(g[0].total).toBe(6.5);
    });

    it('ordem "chave" deixa o mês cronológico', () => {
        const g = agruparLinhas([l('1', { data: '2026-09-01' }), l('2', { data: '2025-12-31' }), l('3')],
            { chave: x => chavePorMes(x.data), semRotulo: 'Sem vencimento', ordem: 'chave' });
        expect(g.map(x => x.label)).toEqual(['Dezembro/2025', 'Setembro/2026', 'Sem vencimento']);
    });

    it('ordem por lista (status na ordem do fluxo), chave fora da lista no fim', () => {
        const R = { A: 'Aberto', P: 'Pago' };
        const g = agruparLinhas([l('1', { st: 'P' }), l('2', { st: 'X' }), l('3', { st: 'A' })],
            { chave: x => chavePorRotulo(x.st, R), semRotulo: 'Sem status', ordem: Object.keys(R) });
        expect(g.map(x => x.label)).toEqual(['Aberto', 'Pago', 'X']);
    });

    it('valor nulo não vira NaN', () => {
        expect(agruparLinhas([l('1', { v: null }), l('2', { v: 3 })], porNome)[0].total).toBe(3);
    });

    it('rotuloMes', () => {
        expect(rotuloMes('2026-01')).toBe('Janeiro/2026');
        expect(rotuloMes('xx')).toBe('xx');
    });
});

describe('linhas e entradas da tela', () => {
    // A: a1 a2 a3 · B: b1 · C: c1 c2
    const lista = [l('a1', { nome: 'A' }), l('a2', { nome: 'A' }), l('a3', { nome: 'A' }), l('b1', { nome: 'B' }), l('c1', { nome: 'C' }), l('c2', { nome: 'C' })];
    const grupos = agruparLinhas(lista, porNome);

    it('sem recolher e sem página: cabeçalho antes de cada grupo, índice global', () => {
        const e = entradasDaPagina(grupos, new Set());
        expect(resumo(e)).toEqual(['G:A', 'a1', 'a2', 'a3', 'G:B', 'b1', 'G:C', 'c1', 'c2']);
        const c2 = e.at(-1)!;
        expect(c2.tipo === 'linha' && c2.indice).toBe(5);
    });

    it('página que começa no meio de um grupo repete o cabeçalho com "continua"', () => {
        expect(resumo(entradasDaPagina(grupos, new Set(), 0, 2))).toEqual(['G:A', 'a1', 'a2']);
        expect(resumo(entradasDaPagina(grupos, new Set(), 2, 4))).toEqual(['G:A+', 'a3', 'G:B', 'b1']);
        expect(resumo(entradasDaPagina(grupos, new Set(), 4, 6))).toEqual(['G:C', 'c1', 'c2']);
    });

    it('grupo recolhido: some das linhas da tela e aparece só como cabeçalho, na página em que cairia', () => {
        const rec = new Set(['b']);
        expect(linhasDaTela(grupos, rec).map(x => x.id)).toEqual(['a1', 'a2', 'a3', 'c1', 'c2']);
        expect(contarLinhasDaTela(grupos, rec)).toBe(5);
        // B fica entre a3 (posição 2) e c1 (posição 3): posição 3 → página [3,5)
        expect(resumo(entradasDaPagina(grupos, rec, 0, 3))).toEqual(['G:A', 'a1', 'a2', 'a3']);
        expect(resumo(entradasDaPagina(grupos, rec, 3, 5))).toEqual(['R:B', 'G:C', 'c1', 'c2']);
    });

    it('recolhido no fim da lista aparece na última página; tudo recolhido = só cabeçalhos', () => {
        const rec = new Set(['c']);
        expect(resumo(entradasDaPagina(grupos, rec, 2, 4))).toEqual(['G:A+', 'a3', 'G:B', 'b1', 'R:C']);
        const todos = new Set(grupos.map(g => g.key));
        expect(resumo(entradasDaPagina(grupos, todos, 0, 100))).toEqual(['R:A', 'R:B', 'R:C']);
    });

    it('cada cabeçalho aparece uma única vez por página', () => {
        for (let ini = 0; ini < 6; ini += 2) {
            const g = entradasDaPagina(grupos, new Set(['b']), ini, ini + 2).filter(x => x.tipo === 'grupo').map(x => x.tipo === 'grupo' && x.grupo.key);
            expect(new Set(g).size).toBe(g.length);
        }
    });
});
