import { describe, it, expect } from 'vitest';
import { agruparBoletos, rotuloMes, type ResolvedoresGrupo } from '../utils/boletoGrupos';
import type { Boleto } from '../types';

const b = (id: string, extra: Partial<Boleto> = {}): Boleto =>
    ({ id, status: 'rascunho', valor: 10, vencimento: '2026-07-10', ...extra } as Boleto);

const forn: Record<string, string> = { f1: 'Energisa', f2: 'Receita Federal' };
const r: ResolvedoresGrupo = {
    fornecedor: x => (x.supplier_id ? forn[x.supplier_id] : null),
    obra: () => null,
    centroCusto: () => null,
    capturadoPor: () => null,
};

describe('agruparBoletos', () => {
    it('sem agrupamento devolve um grupo só, na mesma ordem', () => {
        const lista = [b('1'), b('2')];
        const g = agruparBoletos(lista, 'none', r);
        expect(g).toHaveLength(1);
        expect(g[0].itens.map(x => x.id)).toEqual(['1', '2']);
    });

    it('fornecedor: grupos na ordem de 1ª aparição, com contagem e total; "Sem fornecedor" por último', () => {
        const lista = [b('1', { supplier_id: 'f2', valor: 5 }), b('2'), b('3', { supplier_id: 'f1', valor: 7 }), b('4', { supplier_id: 'f2', valor: 1.5 })];
        const g = agruparBoletos(lista, 'fornecedor', r);
        expect(g.map(x => x.label)).toEqual(['Receita Federal', 'Energisa', 'Sem fornecedor']);
        expect(g[0].itens.map(x => x.id)).toEqual(['1', '4']);
        expect(g[0].total).toBe(6.5);
    });

    it('vencimento: um grupo por mês, em ordem cronológica, rótulo "Mês/AAAA"', () => {
        const lista = [b('1', { vencimento: '2026-09-01' }), b('2', { vencimento: '2025-12-31' }), b('3', { vencimento: null as unknown as string }), b('4', { vencimento: '2026-09-30' })];
        const g = agruparBoletos(lista, 'vencimento', r);
        expect(g.map(x => x.label)).toEqual(['Dezembro/2025', 'Setembro/2026', 'Sem vencimento']);
        expect(g[1].itens.map(x => x.id)).toEqual(['1', '4']);
    });

    it('status: na ordem do fluxo (rascunho → … → cancelado), com o rótulo da tela', () => {
        const lista = [b('1', { status: 'pago' }), b('2', { status: 'rascunho' }), b('3', { status: 'aprovado' })];
        expect(agruparBoletos(lista, 'status', r).map(x => x.label)).toEqual(['Rascunho', 'Aprovado', 'Pago']);
    });

    it('nomes que diferem só em maiúsculas caem no mesmo grupo', () => {
        const rr: ResolvedoresGrupo = { ...r, obra: x => (x.id === '1' ? 'Garden' : 'GARDEN') };
        const g = agruparBoletos([b('1'), b('2')], 'obra', rr);
        expect(g).toHaveLength(1);
        expect(g[0].label).toBe('Garden');
    });

    it('valor vazio não vira NaN no total', () => {
        const g = agruparBoletos([b('1', { valor: null as unknown as number }), b('2', { valor: 3 })], 'status', r);
        expect(g[0].total).toBe(3);
    });

    it('rotuloMes', () => {
        expect(rotuloMes('2026-01')).toBe('Janeiro/2026');
        expect(rotuloMes('xx')).toBe('xx');
    });
});
