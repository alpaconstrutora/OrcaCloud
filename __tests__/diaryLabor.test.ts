import { describe, it, expect } from 'vitest';
import {
    sugestoesDosRecursos, comColaboradoresDoRh, nomeEstaNaLista, aplicarNomeNoEfetivo, normalizarNome, SugestaoEfetivo,
} from '../utils/diaryLabor';

const ORG = {
    resources: {
        roles: [{ id: 'r1', name: 'Pedreiro' }, { id: 'r2', name: 'Eletricista' }],
        workers: [{ id: 'w1', name: 'João Silva', roleId: 'r1' }],
        teams: [{ id: 't1', name: 'Equipe Alvenaria', memberIds: ['w1', 'w2'] }],
    },
};

describe('efetivo · sugestões dos recursos da organização', () => {
    it('trabalhadores (com a função), equipes e só as funções que têm alguém', () => {
        const s = sugestoesDosRecursos([ORG]);
        expect(s).toEqual([
            { id: 'w1', name: 'João Silva', type: 'worker', subLabel: 'Pedreiro' },
            { id: 't1', name: 'Equipe Alvenaria', type: 'team', subLabel: '2 integrantes' },
            { id: 'r1', name: 'Pedreiro', type: 'role' },
        ]);
    });
    it('duas organizações com o mesmo recurso não repetem; org sem recursos não quebra', () => {
        const s = sugestoesDosRecursos([ORG, ORG, { resources: null }, {}]);
        expect(s.filter(x => x.id === 'w1')).toHaveLength(1);
        expect(s.filter(x => x.type === 'role' && x.name === 'Pedreiro')).toHaveLength(1);
    });
});

describe('efetivo · colaboradores do RH', () => {
    it('só ativos, sem repetir nome que já está nos recursos', () => {
        const base = sugestoesDosRecursos([ORG]);
        const s = comColaboradoresDoRh(base, [
            { id: 'e1', name: 'joão  silva', role: 'Pedreiro', status: 'ATIVO' },   // mesmo nome, outra grafia
            { id: 'e2', name: 'Maria Souza', role: 'Servente', status: 'ATIVO' },
            { id: 'e3', name: 'Pedro Demitido', role: 'Servente', status: 'DESLIGADO' },
            { id: 'e4', name: '  ', status: 'ATIVO' },
        ]);
        expect(s.filter(x => x.type === 'rh')).toEqual([{ id: 'e2', name: 'Maria Souza', type: 'rh', subLabel: 'Servente' }]);
    });
});

describe('efetivo · nome digitado', () => {
    const sug: SugestaoEfetivo[] = [
        { id: 'w1', name: 'João Silva', type: 'worker', subLabel: 'Pedreiro' },
        { id: 't1', name: 'Equipe Alvenaria', type: 'team', subLabel: '2 integrantes' },
        { id: 'e2', name: 'Maria Souza', type: 'rh', subLabel: 'Servente' },
    ];
    it('normaliza espaços e maiúsculas', () => {
        expect(normalizarNome('  joão   SILVA ')).toBe('joão silva');
        expect(nomeEstaNaLista('joão silva', sug)).toBe(true);
        expect(nomeEstaNaLista('pedreiro joão', sug)).toBe(false);
        expect(nomeEstaNaLista('', sug)).toBe(false);
    });
    it('casou: grava a grafia da lista e traz a função para observações', () => {
        expect(aplicarNomeNoEfetivo({ category: '', quantity: 1 }, 'joão silva', sug))
            .toEqual({ category: 'João Silva', quantity: 1, observations: 'Pedreiro' });
        expect(aplicarNomeNoEfetivo({ category: '', quantity: 1 }, 'Maria Souza', sug).observations).toBe('Servente');
    });
    it('não sobrescreve observação já escrita; equipe não vira observação', () => {
        expect(aplicarNomeNoEfetivo({ category: '', quantity: 1, observations: 'Terceirizado' }, 'João Silva', sug).observations).toBe('Terceirizado');
        expect(aplicarNomeNoEfetivo({ category: '', quantity: 3 }, 'Equipe Alvenaria', sug)).toEqual({ category: 'Equipe Alvenaria', quantity: 3 });
    });
    it('fora da lista: fica como digitado (não bloqueia)', () => {
        expect(aplicarNomeNoEfetivo({ category: '', quantity: 1 }, 'Gesseiro avulso', sug)).toEqual({ category: 'Gesseiro avulso', quantity: 1 });
    });
});
