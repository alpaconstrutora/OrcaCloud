import { describe, it, expect } from 'vitest';
import { agruparEmpreendimentos, type LeitorDoEmpreendimento } from '../utils/empreendimentoGrupos';

// Pedido de 21/11/2026 — docs/planos/2026-11-21-empreendimentos-objetivo-servico-agrupar.md.
const leitor: LeitorDoEmpreendimento = {
    tipo: id => ({ t1: 'Lote', t2: 'Edifício Residencial' } as Record<string, string>)[id] ?? '',
    organizacao: id => ({ o1: 'Alpa', o2: 'Altair', o3: 'Alpa' } as Record<string, string>)[id] ?? '—',
    rotulosDeStatus: { PLANEJAMENTO: 'Planejamento', EM_OBRAS: 'Em Obras', ENTREGUE: 'Entregue' },
};
const e = (id: string, p: Partial<{ tipo: string | null; objetivo: string | null; status: string; organization_id: string | null; vgv_total: number | null }> = {}) =>
    ({ id, status: 'PLANEJAMENTO', ...p });
const rotulos = (gs: { label: string }[]) => gs.map(g => g.label);

describe('agruparEmpreendimentos', () => {
    it('Status segue o ciclo de vida, não a ordem alfabética; Decrescente inverte', () => {
        const lista = [e('a', { status: 'ENTREGUE' }), e('b', { status: 'PLANEJAMENTO' }), e('c', { status: 'EM_OBRAS' })];
        expect(rotulos(agruparEmpreendimentos(lista, 'status', 'asc', leitor))).toEqual(['Planejamento', 'Em Obras', 'Entregue']);
        expect(rotulos(agruparEmpreendimentos(lista, 'status', 'desc', leitor))).toEqual(['Entregue', 'Em Obras', 'Planejamento']);
    });

    it('Objetivo na ordem do seletor, com Serviço por último; sem objetivo conta como Misto', () => {
        const lista = [e('a', { objetivo: 'SERVICO' }), e('b', { objetivo: null }), e('c', { objetivo: 'VENDAS' })];
        const gs = agruparEmpreendimentos(lista, 'objetivo', 'asc', leitor);
        expect(rotulos(gs)).toEqual(['Vendas', 'Misto (venda e locação)', 'Serviço']);
        expect(gs[1].itens.map(i => i.id)).toEqual(['b']);
    });

    it('Organização agrupa pelo id (homônimas não se fundem) e "Sem organização" vai por último', () => {
        const lista = [e('a', { organization_id: 'o1' }), e('b', { organization_id: null }), e('c', { organization_id: 'o3' }), e('d', { organization_id: 'o2' })];
        const gs = agruparEmpreendimentos(lista, 'organizacao', 'asc', leitor);
        expect(gs.map(g => g.key)).toEqual(['o1', 'o3', 'o2', '__vazio__']);
        expect(gs[3].label).toBe('Sem organização');
    });

    it('Tipo sem cadastro cai em "Sem tipo"; total do grupo = soma do VGV', () => {
        const lista = [e('a', { tipo: 't1', vgv_total: 100 }), e('b', { tipo: 't1', vgv_total: 50 }), e('c', { tipo: null, vgv_total: 7 })];
        const gs = agruparEmpreendimentos(lista, 'tipo', 'asc', leitor);
        expect(gs.map(g => [g.label, g.total])).toEqual([['Lote', 150], ['Sem tipo', 7]]);
    });

    it('a ordem dentro do grupo é a da lista que entrou (coluna clicada)', () => {
        const lista = [e('z', { status: 'EM_OBRAS' }), e('y', { status: 'EM_OBRAS' }), e('x', { status: 'EM_OBRAS' })];
        expect(agruparEmpreendimentos(lista, 'status', 'asc', leitor)[0].itens.map(i => i.id)).toEqual(['z', 'y', 'x']);
    });
});
