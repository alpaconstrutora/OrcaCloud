/**
 * Usuários › Convidar membro a partir de um colaborador do RH — quem aparece na busca.
 * Pedido de 16/11/2026; plano: docs/planos/2026-11-16-usuarios-convidar-colaborador.md (Tarefa 2).
 */
import { describe, it, expect } from 'vitest';
import { opcoesDeColaborador } from '../lib/convidarColaborador';
import type { Employee } from '../services/laborService';
import type { OrganizationMember } from '../types/users';

const colab = (id: string, name: string, extra: Partial<Employee> = {}) =>
    ({ id, org_id: 'org-1', name, status: 'ATIVO', ...extra }) as Employee;
const membro = (email: string, userId: string | null = null) =>
    ({ id: `m-${email}`, name: email, email, role: 'member', joinedAt: '2026-01-01', permissions: {}, userId }) as unknown as OrganizationMember;

describe('opcoesDeColaborador', () => {
    it('tira DESLIGADO e INATIVO, mantém ATIVO e AFASTADO', () => {
        const r = opcoesDeColaborador([
            colab('1', 'Ana'),
            colab('2', 'Bia', { status: 'DESLIGADO' }),
            colab('3', 'Caio', { status: 'INATIVO' }),
            colab('4', 'Davi', { status: 'AFASTADO' }),
        ], []);
        expect(r.map(o => o.id)).toEqual(['1', '4']);
    });

    it('normaliza o e-mail e usa vazio quando não há', () => {
        const r = opcoesDeColaborador([
            colab('1', 'Ana', { email: ' Ana@X.com ' }),
            colab('2', 'Bia', { email: undefined }),
        ], []);
        expect(r).toEqual([
            { id: '1', name: 'Ana', email: 'ana@x.com', userId: null },
            { id: '2', name: 'Bia', email: '', userId: null },
        ]);
    });

    it('desliga quem já é membro pelo userId', () => {
        const [o] = opcoesDeColaborador([colab('1', 'Ana', { user_id: 'u-1' })], [membro('outro@x.com', 'u-1')]);
        expect(o.motivoDesligado).toBe('Já é usuário desta organização');
    });

    it('desliga quem já é membro pelo e-mail, sem diferenciar caixa', () => {
        const [o] = opcoesDeColaborador([colab('1', 'Ana', { email: 'ANA@x.com' })], [membro('ana@X.com')]);
        expect(o.motivoDesligado).toBe('Já é usuário desta organização');
    });

    it('ficha vinculada a login que não é membro desta org continua convidável', () => {
        const [o] = opcoesDeColaborador([colab('1', 'Ana', { user_id: 'u-9', email: 'ana@x.com' })], [membro('bia@x.com', 'u-2')]);
        expect(o.motivoDesligado).toBeUndefined();
        expect(o.userId).toBe('u-9');
    });

    it('membro sem login (userId nulo) não desliga colaborador sem vínculo', () => {
        const [o] = opcoesDeColaborador([colab('1', 'Ana')], [membro('bia@x.com', null)]);
        expect(o.motivoDesligado).toBeUndefined();
    });

    it('ordena por nome em pt-BR', () => {
        const r = opcoesDeColaborador([colab('1', 'Érica'), colab('2', 'Ana'), colab('3', 'bruno')], []);
        expect(r.map(o => o.name)).toEqual(['Ana', 'bruno', 'Érica']);
    });
});
