import { describe, it, expect, vi } from 'vitest';

// `darBaixa` usa só from().update().eq(), capturado aqui para conferir o payload.
// Espelho do teste de receivableService.darBaixa — plano
// docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md.
const db = vi.hoisted(() => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    return { from, update, eq };
});
vi.mock('../lib/supabase', () => ({ supabase: { from: db.from } }));
vi.mock('../services/propertyExpenseService', () => ({ propertyExpenseService: {} }));

import { payableService } from '../services/payableService';

describe('payableService.darBaixa — baixa de Contas a Pagar com os dados do painel', () => {
    it('grava PAGO/CONCILIATED com data e forma EXPLÍCITAS (a trigger só preenche vazio)', async () => {
        await payableService.darBaixa('tx-1', { paymentDate: '2026-09-25', paymentType: 'TED' });
        expect(db.from).toHaveBeenCalledWith('internal_transactions');
        expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
            business_status: 'PAGO',
            status: 'CONCILIATED',
            payment_date: '2026-09-25',
            payment_type: 'TED',
        }));
        expect(db.eq).toHaveBeenCalledWith('id', 'tx-1');
    });

    it('forma não informada vai como null (não como string vazia)', async () => {
        db.update.mockClear();
        await payableService.darBaixa('tx-2', { paymentDate: '2026-09-25', paymentType: null });
        expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ payment_type: null }));
    });
});
