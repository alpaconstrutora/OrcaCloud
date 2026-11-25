/** Histórico › Editar/Excluir: só a última decisão valendo do contrato (pedido de 25/11/2026). */
import { describe, it, expect } from 'vitest';
import { motivoParaNaoAlterarDecisao } from '../utils/reajusteAniversario';

const d = (id: string, contract_id: string, aniversario: string, created_at: string, desfeito_em: string | null = null) =>
    ({ id, contract_id, aniversario, created_at, desfeito_em });

describe('motivoParaNaoAlterarDecisao', () => {
    const a1 = d('a1', 'c1', '2017-09-23', '2026-11-24T10:00:00Z');
    const a2 = d('a2', 'c1', '2018-09-23', '2026-11-24T11:00:00Z');
    const b1 = d('b1', 'c2', '2025-01-01', '2026-11-20T10:00:00Z');

    it('a última do contrato pode; a anterior não', () => {
        expect(motivoParaNaoAlterarDecisao(a2, [a1, a2, b1], 'Ativo')).toBeNull();
        expect(motivoParaNaoAlterarDecisao(a1, [a1, a2, b1], 'Ativo')).toMatch(/última decisão/);
    });

    it('a de outro contrato não conta', () => {
        expect(motivoParaNaoAlterarDecisao(b1, [a1, a2, b1], 'Ativo')).toBeNull();
    });

    it('desfeita não pode de novo, e deixa de bloquear a anterior', () => {
        const a2x = { ...a2, desfeito_em: '2026-11-25T09:00:00Z' };
        expect(motivoParaNaoAlterarDecisao(a2x, [a1, a2x], 'Ativo')).toMatch(/já foi desfeita/);
        expect(motivoParaNaoAlterarDecisao(a1, [a1, a2x], 'Ativo')).toBeNull();
    });

    it('mesmo aniversário: vale a gravada por último', () => {
        const x = d('x', 'c1', '2018-09-23', '2026-11-24T12:00:00Z');
        expect(motivoParaNaoAlterarDecisao(a2, [a2, x], 'Ativo')).toMatch(/última decisão/);
    });

    it('contrato encerrado não altera', () => {
        expect(motivoParaNaoAlterarDecisao(a2, [a1, a2], 'Encerrado')).toMatch(/"Encerrado"/);
    });
});
