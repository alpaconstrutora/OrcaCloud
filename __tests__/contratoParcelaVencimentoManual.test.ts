/**
 * Parcela de contrato com VENCIMENTO alterado à mão — o que o sync do contrato preserva.
 * Mesma regra do valor alterado à mão (contratoParcelaManual.test.ts), para a data.
 * Plano: docs/planos/2026-10-24-contrato-alterar-vencimento-da-parcela.md.
 */
import { describe, it, expect } from 'vitest';
import {
    planejarSyncParcelas, marcaDeVencimentoManual, parcelaComAlteracaoManual,
} from '../utils/contratoParcelaVariavel';

const lote = [
    { reference_id: 'c:p1', amount: 1000, due_date: '2026-11-10', transaction_date: '2026-11-10' },
    { reference_id: 'c:p2', amount: 1000, due_date: '2026-12-10', transaction_date: '2026-12-10' },
];

describe('planejarSyncParcelas — vencimento manual', () => {
    it('mantém a data DA LINHA; o valor segue o contrato', () => {
        const r = planejarSyncParcelas(lote, [
            {
                id: 'b', reference_id: 'c:p2', status: 'PENDING', amount: 900,
                due_date: '2026-12-20', transaction_date: '2026-12-20',
                vencimento_manual: true, vencimento_manual_anterior: '2026-12-10',
                vencimento_manual_em: '2026-10-24T12:00:00Z', vencimento_manual_por: 'u1',
            },
        ]);
        expect(r.normais.map(n => n.reference_id)).toEqual(['c:p1']);
        expect(r.manuais).toHaveLength(1);
        expect(r.manuais[0]).toMatchObject({
            reference_id: 'c:p2', amount: 1000,
            due_date: '2026-12-20', transaction_date: '2026-12-20',
            vencimento_manual: true, vencimento_manual_anterior: '2026-12-10', vencimento_manual_por: 'u1',
            valor_manual: false,
        });
        // atualizada (mesma linha), não apagada e recriada
        expect(r.idsApagar).toEqual([]);
    });

    it('valor E vencimento manuais: as duas coisas ficam', () => {
        const r = planejarSyncParcelas(lote, [{
            id: 'a', reference_id: 'c:p1', status: 'PENDING', amount: 1350,
            due_date: '2026-11-25', transaction_date: '2026-11-25',
            valor_manual: true, valor_manual_anterior: 1000, vencimento_manual: true, vencimento_manual_anterior: '2026-11-10',
        }]);
        expect(r.manuais[0]).toMatchObject({
            reference_id: 'c:p1', amount: 1350, due_date: '2026-11-25', valor_manual: true, vencimento_manual: true,
        });
    });

    it('só o valor manual: a data segue o contrato e a marca de vencimento fica falsa', () => {
        const r = planejarSyncParcelas(lote, [{
            id: 'a', reference_id: 'c:p1', status: 'PENDING', amount: 1350,
            due_date: '2026-11-25', transaction_date: '2026-11-25', valor_manual: true,
        }]);
        expect(r.manuais[0]).toMatchObject({
            amount: 1350, due_date: '2026-11-10', transaction_date: '2026-11-10', vencimento_manual: false,
        });
    });

    it('vencimento manual cuja parcela saiu do cronograma pode ser apagada', () => {
        const r = planejarSyncParcelas(lote.slice(0, 1), [
            { id: 'z', reference_id: 'c:p2', status: 'PENDING', amount: 1000, vencimento_manual: true },
        ]);
        expect(r.manuais).toEqual([]);
        expect(r.idsApagar).toEqual(['z']);
    });

    it('vencimento manual JÁ baixado é intocável, não "manual"', () => {
        const t = { id: 'b', reference_id: 'c:p2', status: 'CONCILIATED', amount: 1000, vencimento_manual: true };
        expect(parcelaComAlteracaoManual(t)).toBe(false);
        const r = planejarSyncParcelas(lote, [t]);
        expect(r.normais.map(n => n.reference_id)).toEqual(['c:p1']);
        expect(r.manuais).toEqual([]);
        expect(r.idsApagar).toEqual([]);
    });
});

describe('marcaDeVencimentoManual', () => {
    const agora = new Date('2026-10-24T14:32:00Z');
    it('primeira alteração guarda o vencimento que o contrato gerou', () => {
        expect(marcaDeVencimentoManual({ due_date: '2026-12-10', vencimento_manual: false }, 'u1', agora)).toEqual({
            vencimento_manual: true, vencimento_manual_anterior: '2026-12-10',
            vencimento_manual_em: agora.toISOString(), vencimento_manual_por: 'u1',
        });
    });
    it('alterações seguintes mantêm o vencimento original do contrato', () => {
        expect(marcaDeVencimentoManual(
            { due_date: '2026-12-20', vencimento_manual: true, vencimento_manual_anterior: '2026-12-10' }, 'u2', agora,
        )).toMatchObject({ vencimento_manual_anterior: '2026-12-10', vencimento_manual_por: 'u2' });
    });
    it('sem due_date usa transaction_date (linha antiga)', () => {
        expect(marcaDeVencimentoManual({ due_date: null, transaction_date: '2026-12-10T00:00:00' }, 'u1', agora))
            .toMatchObject({ vencimento_manual_anterior: '2026-12-10' });
    });
});
