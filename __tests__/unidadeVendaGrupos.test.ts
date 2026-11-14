/**
 * "Agrupar" de Venda de Ativos › Unidades do edifício (guia de UI §6.12).
 */
import { describe, it, expect } from 'vitest';
import { agruparUnidadesVenda, rotuloDoAndar, type LeitorDaUnidadeVenda } from '../utils/unidadeVendaGrupos';

interface U { id: string; block?: string | null; floor?: number | null; status: string; price?: number }
const leitor: LeitorDaUnidadeVenda<U> = {
    bloco: u => u.block,
    andar: u => u.floor,
    status: u => u.status,
    preco: u => u.price,
};
const unidades: U[] = [
    { id: '101', block: 'Torre B', floor: 1, status: 'Disponível', price: 100 },
    { id: '1001', block: 'torre b', floor: 10, status: 'Contrato', price: 300 },
    { id: '201', block: 'Torre A', floor: 2, status: 'Vendido', price: 200 },
    { id: '002', block: null, floor: 0, status: 'Proposta', price: 50 },
    { id: 'T1', block: '', floor: null, status: 'Disponível' },
];

describe('agruparUnidadesVenda', () => {
    it('Bloco: alfabético, caixa diferente cai junto, sem bloco por último, total = soma do preço', () => {
        const g = agruparUnidadesVenda(unidades, 'bloco', 'asc', leitor);
        expect(g.map(x => [x.label, x.itens.length, x.total])).toEqual([
            ['Torre A', 1, 200], ['Torre B', 2, 400], ['Sem bloco', 2, 50],
        ]);
    });

    it('Andar: ordem numérica com o texto da célula; vazio e 0 são o térreo', () => {
        const g = agruparUnidadesVenda(unidades, 'andar', 'asc', leitor);
        expect(g.map(x => [x.label, x.itens.map(u => u.id)])).toEqual([
            ['Térreo', ['002', 'T1']], ['1º', ['101']], ['2º', ['201']], ['10º', ['1001']],
        ]);
        expect(agruparUnidadesVenda(unidades, 'andar', 'desc', leitor).map(x => x.label)).toEqual(['10º', '2º', '1º', 'Térreo']);
    });

    it('Status: na ordem do fluxo, não alfabética', () => {
        const g = agruparUnidadesVenda(unidades, 'status', 'asc', leitor);
        expect(g.map(x => x.label)).toEqual(['Disponível', 'Proposta', 'Contrato', 'Vendido']);
    });

    it('rotuloDoAndar espelha a célula', () => {
        expect(rotuloDoAndar(0)).toBe('Térreo');
        expect(rotuloDoAndar(null)).toBe('Térreo');
        expect(rotuloDoAndar(3)).toBe('3º');
    });
});
