/**
 * Parcela de contrato com valor alterado à mão — o que o sync do contrato preserva.
 * Plano: docs/planos/2026-10-19-contrato-alterar-valor-da-parcela.md.
 */
import { describe, it, expect } from 'vitest';
import {
    planejarSyncParcelas, marcaDeValorManual, parcelaComValorManual, parcelaBaixada,
} from '../utils/contratoParcelaVariavel';

const lote = [
    { reference_id: 'c:p1', amount: 1000, description: 'Parcela 1/3' },
    { reference_id: 'c:p2', amount: 1000, description: 'Parcela 2/3' },
    { reference_id: 'c:p3', amount: 1000, description: 'Parcela 3/3' },
];

describe('planejarSyncParcelas', () => {
    it('parcela baixada fica fora do lote e nunca é apagada', () => {
        const r = planejarSyncParcelas(lote, [
            { id: 'a', reference_id: 'c:p1', status: 'CONCILIATED', amount: 1000 },
            { id: 'b', reference_id: 'c:p2', status: 'PENDING', business_status: 'PAGO', amount: 1000 },
            { id: 'x', reference_id: 'c:p3', status: 'PAID', amount: 1000 },
        ]);
        expect(r.normais).toEqual([]);
        expect(r.manuais).toEqual([]);
        expect(r.idsApagar).toEqual([]);
    });

    it('manual em aberto mantém valor e desconto da linha; o resto segue o contrato', () => {
        const r = planejarSyncParcelas(lote, [
            { id: 'a', reference_id: 'c:p1', status: 'PENDING', amount: 1000 },
            {
                id: 'b', reference_id: 'c:p2', status: 'PENDING', business_status: 'PREVISTO',
                amount: 1350, original_amount: 1400, discount_type: 'VALUE', discount_amount: 50,
                valor_manual: true, valor_manual_anterior: 1000, valor_manual_em: '2026-10-19T12:00:00Z', valor_manual_por: 'u1',
            },
        ]);
        expect(r.normais.map(n => n.reference_id)).toEqual(['c:p1', 'c:p3']);
        expect(r.manuais).toHaveLength(1);
        expect(r.manuais[0]).toMatchObject({
            reference_id: 'c:p2', description: 'Parcela 2/3',
            amount: 1350, original_amount: 1400, discount_type: 'VALUE', discount_amount: 50,
            valor_manual: true, valor_manual_anterior: 1000, valor_manual_por: 'u1',
        });
        // a manual é ATUALIZADA (mesma linha), não apagada e recriada
        expect(r.idsApagar).toEqual(['a']);
    });

    it('manual cuja parcela saiu do cronograma pode ser apagada', () => {
        const r = planejarSyncParcelas(lote.slice(0, 2), [
            { id: 'z', reference_id: 'c:p3', status: 'PENDING', amount: 900, valor_manual: true },
        ]);
        expect(r.manuais).toEqual([]);
        expect(r.idsApagar).toEqual(['z']);
    });

    it('linha sem a marca segue o valor do contrato', () => {
        const r = planejarSyncParcelas(lote, [
            { id: 'a', reference_id: 'c:p1', status: 'PENDING', amount: 700, valor_manual: false },
        ]);
        expect(r.normais[0]).toMatchObject({ reference_id: 'c:p1', amount: 1000 });
        expect(r.idsApagar).toEqual(['a']);
    });

    it('manual JÁ baixada é tratada como baixada (intocável), não como manual', () => {
        const t = { id: 'b', reference_id: 'c:p2', status: 'CONCILIATED', amount: 1350, valor_manual: true };
        expect(parcelaBaixada(t)).toBe(true);
        expect(parcelaComValorManual(t)).toBe(false);
        const r = planejarSyncParcelas(lote, [t]);
        expect(r.normais.map(n => n.reference_id)).toEqual(['c:p1', 'c:p3']);
        expect(r.manuais).toEqual([]);
        expect(r.idsApagar).toEqual([]);
    });
});

describe('marcaDeValorManual', () => {
    const agora = new Date('2026-10-19T14:32:00Z');
    it('primeira alteração guarda o valor que o contrato gerou', () => {
        expect(marcaDeValorManual({ amount: 1000, valor_manual: false }, 'u1', agora)).toEqual({
            valor_manual: true, valor_manual_anterior: 1000, valor_manual_em: agora.toISOString(), valor_manual_por: 'u1',
        });
    });
    it('alterações seguintes mantêm o valor original do contrato', () => {
        expect(marcaDeValorManual({ amount: 1350, valor_manual: true, valor_manual_anterior: 1000 }, 'u2', agora))
            .toMatchObject({ valor_manual_anterior: 1000, valor_manual_por: 'u2' });
    });
});
