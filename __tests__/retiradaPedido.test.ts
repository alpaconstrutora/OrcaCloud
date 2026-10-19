import { describe, expect, it } from 'vitest';
import {
    formatarCpf,
    itensParaAutorizar,
    itensRetiradoPor,
    motivoRetiradaDesligada,
    rotuloColaborador,
} from '../utils/retiradaPedido';

/**
 * Retirada de pedido FOB — quem pode retirar (vários, RH › Colaboradores) e
 * quem retirou. Plano: docs/planos/2026-10-19-forma-entrega-cif-fob.md
 */

const ana = { id: 'e-ana', nome: 'Ana Souza', cpf: '12345678901' };
const bia = { id: 'e-bia', nome: 'Beatriz Lima', cpf: '98765432100' };
const caio = { id: 'e-caio', nome: 'Caio Prado' };

describe('formatarCpf / rotuloColaborador', () => {
    it('formata 11 dígitos, aceita já formatado e devolve o resto como veio', () => {
        expect(formatarCpf('12345678901')).toBe('123.456.789-01');
        expect(formatarCpf('780.724.256-68')).toBe('780.724.256-68');
        expect(formatarCpf('123')).toBe('123');
        expect(formatarCpf(undefined)).toBe('');
    });

    it('rótulo leva o CPF quando há, e só o nome quando não há', () => {
        expect(rotuloColaborador(ana)).toBe('Ana Souza · CPF 123.456.789-01');
        expect(rotuloColaborador(caio)).toBe('Caio Prado');
    });
});

describe('itensParaAutorizar', () => {
    it('lista só quem ainda não está autorizado, com CPF no nome (busca acha pelo CPF)', () => {
        const itens = itensParaAutorizar([ana], [ana, bia, caio]);
        expect(itens.map(i => i.id)).toEqual(['e-bia', 'e-caio']);
        expect(itens[0].name).toContain('987.654.321-00');
        // Sem `code`: o seletor ordenaria por CPF em vez de nome.
        expect(itens.every(i => !i.code)).toBe(true);
    });
});

describe('itensRetiradoPor', () => {
    it('autorizados num grupo, demais colaboradores noutro; grupos não são escolhíveis', () => {
        const itens = itensRetiradoPor([bia], [ana, bia, caio]);
        const grupos = itens.filter(i => i.selecionavel === false);
        expect(grupos.map(g => g.name)).toEqual(['Autorizados a retirar', 'Outros colaboradores']);
        const deAutorizados = itens.filter(i => i.parentId === grupos[0].id).map(i => i.id);
        const deOutros = itens.filter(i => i.parentId === grupos[1].id).map(i => i.id);
        expect(deAutorizados).toEqual(['e-bia']);
        expect(deOutros).toEqual(['e-ana', 'e-caio']);   // autorizado não se repete
    });

    it('sem autorizados, só o grupo dos colaboradores', () => {
        const itens = itensRetiradoPor([], [ana]);
        expect(itens.filter(i => i.selecionavel === false).map(g => g.name)).toEqual(['Outros colaboradores']);
    });
});

describe('motivoRetiradaDesligada', () => {
    const ok = { status: 'Confirmado', dataRetirada: '2026-10-19', retiradoPorId: 'e-ana' };

    it('com status, data e quem retirou: liberado', () => {
        expect(motivoRetiradaDesligada(ok)).toBe('');
        expect(motivoRetiradaDesligada({ ...ok, status: 'Enviado' })).toBe('');
    });

    it('exige quem retirou', () => {
        expect(motivoRetiradaDesligada({ ...ok, retiradoPorId: '' })).toBe('Informe quem retirou.');
    });

    it('exige a data', () => {
        expect(motivoRetiradaDesligada({ ...ok, dataRetirada: '' })).toBe('Informe a data da retirada.');
    });

    it('status vem antes: Rascunho e Em Negociação dizem por quê', () => {
        expect(motivoRetiradaDesligada({ ...ok, status: 'Rascunho' })).toMatch(/Envie o pedido/);
        expect(motivoRetiradaDesligada({ ...ok, status: 'Em Negociação' })).toMatch(/negociação/);
    });
});
