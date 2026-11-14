import { describe, it, expect } from 'vitest';
import { agruparContasPagamento } from '../utils/contasPagamentoGrupos';

/**
 * "Agrupar" de Minha Organização › Contas de Pagamento (guia de UI §6.12):
 * Organização (pelo id, rótulo = nome da célula), Banco e Situação (Ativa antes de Inativa),
 * "Sem …" sempre por último.
 */

const ORGS = new Map([['o1', 'Alpa'], ['o2', 'Garden'], ['o3', 'Alpa']]);
const nomeOrg = (id?: string) => (id ? ORGS.get(id) : undefined);

const conta = (id: string, extra: Record<string, unknown> = {}) => ({ id, organization_id: 'o1', bank: 'Itaú', ...extra });

const CONTAS = [
    conta('a', { bank: 'Sicredi' }),
    conta('b', { organization_id: 'o2', bank: 'Itaú' }),
    conta('c', { organization_id: 'o2', bank: undefined, is_active: false }),
    conta('d', { bank: 'Asaas', is_active: false }),
];

const rotulos = (g: ReturnType<typeof agruparContasPagamento>) => g.map(x => `${x.label}:${x.itens.length}`);

describe('agruparContasPagamento', () => {
    it('banco: alfabético; nomes que só diferem na caixa/espaço caem juntos; sem banco vai para o fim nos dois sentidos', () => {
        expect(rotulos(agruparContasPagamento(CONTAS, 'banco', 'asc', nomeOrg))).toEqual(['Asaas:1', 'Itaú:1', 'Sicredi:1', 'Sem banco:1']);
        expect(rotulos(agruparContasPagamento(CONTAS, 'banco', 'desc', nomeOrg))).toEqual(['Sicredi:1', 'Itaú:1', 'Asaas:1', 'Sem banco:1']);
        const juntas = agruparContasPagamento([conta('x', { bank: 'Itaú' }), conta('y', { bank: 'ITAÚ' })], 'banco', 'asc', nomeOrg);
        expect(rotulos(juntas)).toEqual(['Itaú:2']);
    });

    it('situação: Ativa → Inativa (ordem do interruptor), ausente conta como ativa; Decrescente inverte', () => {
        expect(rotulos(agruparContasPagamento(CONTAS, 'situacao', 'asc', nomeOrg))).toEqual(['Ativa:2', 'Inativa:2']);
        expect(rotulos(agruparContasPagamento(CONTAS, 'situacao', 'desc', nomeOrg))).toEqual(['Inativa:2', 'Ativa:2']);
    });

    it('organização: a chave é o id — duas organizações com o mesmo nome não se fundem', () => {
        const itens = [conta('a'), conta('b', { organization_id: 'o3' }), conta('c', { organization_id: 'o2' })];
        const g = agruparContasPagamento(itens, 'organizacao', 'asc', nomeOrg);
        expect(g).toHaveLength(3);
        expect(new Set(g.map(x => x.key))).toEqual(new Set(['o1', 'o2', 'o3']));
        expect(g.map(x => x.label)).toEqual(['Alpa', 'Alpa', 'Garden']);
    });

    it('organização sem nome conhecido vai para "Sem organização", no fim', () => {
        const g = agruparContasPagamento([conta('a', { organization_id: 'zz' }), conta('b')], 'organizacao', 'asc', nomeOrg);
        expect(rotulos(g)).toEqual(['Alpa:1', 'Sem organização:1']);
    });

    it('mantém a ordem das linhas recebidas dentro do grupo (a da coluna ordenada)', () => {
        const g = agruparContasPagamento([conta('1'), conta('2'), conta('3')], 'banco', 'asc', nomeOrg);
        expect(g[0].itens.map(i => i.id)).toEqual(['1', '2', '3']);
    });
});
