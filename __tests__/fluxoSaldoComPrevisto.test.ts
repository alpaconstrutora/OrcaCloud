/**
 * Fluxo de caixa — "Saldo com o previsto" = saldo realizado + TODOS os pendentes do
 * período (plano docs/planos/2026-11-14-controladoria-critica.md, passo 6).
 *
 * `saldo_prev` (fn_cash_flow) é o pendente DE CADA PERÍODO, não acumulado. Até
 * 15/11/2026 o serviço somava só o do último período, e o card repetia o realizado
 * (−R$ 12.640,41 nos dois, em produção).
 */
import { describe, it, expect, vi } from 'vitest';

const pontos = vi.hoisted(() => [
    { period_label: 'jan', credit_real: 1000, debit_real: 3000, saldo_real: -2000, saldo_acumulado: -2000, saldo_prev: 500 },
    { period_label: 'fev', credit_real: 0,    debit_real: 1000, saldo_real: -1000, saldo_acumulado: -3000, saldo_prev: -2500 },
    { period_label: 'mar', credit_real: 500,  debit_real: 0,    saldo_real: 500,   saldo_acumulado: -2500, saldo_prev: 0 },
]);
vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn(async () => ({ data: pontos, error: null })) } }));

import { financialReportService } from '../services/financialReportService';

describe('getCashFlow — saldo com o previsto', () => {
    it('soma os pendentes de todos os períodos ao saldo realizado', async () => {
        const r = await financialReportService.getCashFlow('org-1', '2026-01-01', '2026-03-31', 'month');
        expect(r.saldo_final).toBe(-2500);
        // −2500 + (500 − 2500 + 0); antes dava −2500 + 0 (só o último período)
        expect(r.saldo_previsto_final).toBe(-4500);
        expect(r.total_entradas).toBe(1500);
        expect(r.total_saidas).toBe(4000);
    });
});
