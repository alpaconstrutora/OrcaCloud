/**
 * Edição em Lote › Mudar organização (13/11/2026, pedido "Poder alterar organização ao
 * editar em lote"). A regra é a mesma do boleto individual (24/09/2026): só rascunho e
 * revisão mudam — aprovado já tem título no financeiro da org dele. O lote não pode ser
 * mais permissivo que o formulário, senão vira o atalho que contorna a trava.
 */
import { describe, it, expect } from 'vitest';
import {
    podeMudarOrganizacao,
    motivoParaNaoMudarOrganizacao,
    resumoDeOrganizacaoEmLote,
} from '../utils/boletoOrganizacaoLote';
import type { Boleto } from '../types';

const b = (id: string, status: Boleto['status'], extra: Partial<Boleto> = {}) =>
    ({ id, status, organization_id: 'A', ...extra });

describe('mudar organização de boletos', () => {
    it('só rascunho e revisão mudam; cada outro status diz por quê', () => {
        expect(podeMudarOrganizacao('rascunho')).toBe(true);
        expect(podeMudarOrganizacao('revisao')).toBe(true);
        for (const s of ['aprovado', 'pago', 'cancelado', 'programado'] as const) {
            expect(podeMudarOrganizacao(s)).toBe(false);
            expect(motivoParaNaoMudarOrganizacao(s)).toBeTruthy();
        }
        expect(motivoParaNaoMudarOrganizacao('aprovado')).toMatch(/título/);
    });

    it('o resumo do lote conta quem muda, quem fica e quem perde as dimensões', () => {
        const r = resumoDeOrganizacaoEmLote([
            b('1', 'rascunho', { supplier_id: 'f1', cost_center_id: 'c1' }),
            b('2', 'revisao'),
            b('3', 'aprovado', { supplier_id: 'f1' }),
            b('4', 'rascunho', { organization_id: 'B' }),
        ], 'B');
        expect(r.mudam).toBe(2);
        expect(r.ficam).toBe(2);
        expect(r.perdemDimensoes).toBe(1);
        expect(r.porId.get('1')).toEqual({ muda: true });
        expect(r.porId.get('3')).toMatchObject({ muda: false });
        expect(r.porId.get('4')).toEqual({ muda: false, motivo: 'Já é desta organização.' });
    });
});
