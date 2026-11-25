import { describe, expect, it } from 'vitest';
import { agruparUnidades, type LeitorDaUnidade } from '../utils/unidadesGrupos';
import { CHAVE_VAZIA } from '../utils/agruparLinhas';

// docs/planos/2026-11-25-unidades-agrupar.md
const LEITOR: LeitorDaUnidade = {
    nomeDoAndar: andar => (andar === -1 ? 'Estacionamento 1' : andar === 0 ? 'Pavimento Térreo' : undefined),
    tipoDoPavimento: { SUBSOLO: 'Subsolo', TERREO: 'Térreo', TIPO: 'Tipo' },
    posicao: { FRENTE: 'Frente', FUNDOS: 'Fundos', LATERAL: 'Lateral' },
    vista: { MAR: 'Mar', SEM_VISTA: 'Sem vista' },
    orientacao: { NORTE: 'Norte', SUL: 'Sul' },
};
const u = (id: string, campos: Record<string, unknown> = {}) => ({ id, ...campos });
const chaves = (gs: { key: string }[]) => gs.map(g => g.key);

describe('agruparUnidades', () => {
    it('Pavimento: ordem numérica (subsolo antes do térreo), rótulo = nome do pavimento, sem andar por último', () => {
        const lista = [u('a', { floor: 10 }), u('b', { floor: null }), u('c', { floor: -1 }), u('d', { floor: 2 }), u('e', { floor: 0 })];
        const gs = agruparUnidades(lista, 'pavimento', 'asc', LEITOR);
        expect(chaves(gs)).toEqual(['-1', '0', '2', '10', CHAVE_VAZIA]);
        expect(gs.map(g => g.label)).toEqual(['Estacionamento 1', 'Pavimento Térreo', 'Pavimento 2', 'Pavimento 10', 'Sem pavimento']);
    });

    it('Decrescente inverte os grupos; o "Sem …" segue no fim', () => {
        const lista = [u('a', { floor: 1 }), u('b', {}), u('c', { floor: 3 })];
        expect(chaves(agruparUnidades(lista, 'pavimento', 'desc', LEITOR))).toEqual(['3', '1', CHAVE_VAZIA]);
    });

    it('Dormitórios: numérico e com o rótulo no singular/plural', () => {
        const gs = agruparUnidades([u('a', { bedrooms: 3 }), u('b', { bedrooms: 1 }), u('c', { bedrooms: 10 })], 'bedrooms', 'asc', LEITOR);
        expect(gs.map(g => g.label)).toEqual(['1 dormitório', '3 dormitórios', '10 dormitórios']);
    });

    it('Posição, Vista e Orientação na ordem do seletor, com o rótulo da célula', () => {
        const gs = agruparUnidades([u('a', { position_type: 'LATERAL' }), u('b', { position_type: 'FRENTE' })], 'position_type', 'asc', LEITOR);
        expect(gs.map(g => g.label)).toEqual(['Frente', 'Lateral']);
    });

    it('Tipologia: A→Z natural, sem caixa; dentro do grupo, a ordem que entrou', () => {
        const lista = [u('a', { typology: 'Tipo 4' }), u('b', { typology: 'tipo 1' }), u('c', { typology: 'Tipo 4' }), u('d', { typology: 'Tipo 10' })];
        const gs = agruparUnidades(lista, 'typology', 'asc', LEITOR);
        expect(gs.map(g => g.label)).toEqual(['tipo 1', 'Tipo 4', 'Tipo 10']);
        expect(gs[1].itens.map(i => i.id)).toEqual(['a', 'c']);
    });
});
