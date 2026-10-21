/**
 * Tributo conciliado aparece como Pago em Tributos a Pagar (21/10/2026).
 * Plano: docs/planos/2026-10-21-tributos-gestao-pagamento-em-contas-a-pagar.md
 *
 * `vw_commercial_tax_payables` deriva `effective_status` só de
 * `business_status`. O pagamento passou a entrar só por Contas a Pagar e pela
 * conciliação, que gravam `status = CONCILIATED`; um tributo conciliado com
 * `business_status` PREVISTO aparecia Vencido aqui e Pago em Contas a Pagar.
 */
import { describe, it, expect, vi } from 'vitest';

const LINHAS = [
    { id: 'conciliado', reference_id: null, status: 'CONCILIATED', business_status: 'PREVISTO', effective_status: 'VENCIDO', amount: 90 },
    { id: 'aberto', reference_id: null, status: 'PENDING', business_status: 'PREVISTO', effective_status: 'VENCIDO', amount: 10 },
    { id: 'retido', reference_id: null, status: 'PENDING', business_status: 'RETIDO', effective_status: 'RETIDO', amount: 5 },
];

function consulta() {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq', 'gte', 'lte']) q[m] = () => q;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: LINHAS, error: null }).then(ok);
    return q;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: () => consulta(), rpc: vi.fn() } }));

import { taxPayableService } from '../services/taxPayableService';

describe('taxPayableService.list — status efetivo', () => {
    it('conciliado vira Pago; aberto e retido não mudam', async () => {
        const rows = await taxPayableService.list('org1');
        const porId = Object.fromEntries(rows.map(r => [r.id, r.effective_status]));
        expect(porId).toEqual({ conciliado: 'PAGO', aberto: 'VENCIDO', retido: 'RETIDO' });
    });

    it('o filtro de status usa o status já corrigido', async () => {
        const pagos = await taxPayableService.list('org1', { status: 'PAGO' });
        expect(pagos.map(r => r.id)).toEqual(['conciliado']);
        const vencidos = await taxPayableService.list('org1', { status: 'VENCIDO' });
        expect(vencidos.map(r => r.id)).toEqual(['aberto']);
    });
});
