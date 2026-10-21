/**
 * Conciliação × DARF — plano docs/planos/2026-10-21-agrupar-tributos-em-darf.md (fase 5).
 *
 * O DARF é pago num débito só do extrato. A sugestão de grupo junta TODOS os
 * membros (tributos + multa/juros) — sem o limite de 3 de `findSubset` e sem
 * exigir o nome no extrato — e cada débito e cada DARF entram uma vez só.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../services/bankReconciliationService', () => ({ bankReconciliationService: {} }));

import { gruposDeDarf } from '../services/reconciliationGroupService';

const membro = (id: string, amount: number, darf_id: string | null = 'D1', due_date = '2026-10-30') =>
    ({ id, transaction_date: '2026-10-05', due_date, amount, direction: 'DEBIT' as const, description: id, darf_id });
const debito = (id: string, amount: number, transaction_date = '2026-10-30') =>
    ({ id, transaction_date, amount, direction: 'DEBIT' as const, description_raw: 'PAGTO DARF' });

describe('gruposDeDarf', () => {
    const MEMBROS = [membro('pis', 100), membro('cofins', 200), membro('irrf', 50), membro('csll', 40), membro('multa', 7.5)];

    it('um débito com o total do DARF vira grupo com TODOS os membros (5, acima do limite de 3)', () => {
        const [g, ...resto] = gruposDeDarf([debito('b1', 397.5)], MEMBROS);
        expect(resto).toHaveLength(0);
        expect(g.darfId).toBe('D1');
        expect(g.titles.map(t => t.id)).toEqual(['pis', 'cofins', 'irrf', 'csll', 'multa']);
        expect(g).toMatchObject({ total: 397.5, diff: 0 });
    });

    it('fora da janela (venc. −5 a +30 dias) ou do valor não casa', () => {
        expect(gruposDeDarf([debito('cedo', 397.5, '2026-10-20')], MEMBROS)).toHaveLength(0);
        expect(gruposDeDarf([debito('tarde', 397.5, '2026-12-05')], MEMBROS)).toHaveLength(0);
        expect(gruposDeDarf([debito('outro', 500)], MEMBROS)).toHaveLength(0);
    });

    it('cada débito casa com um DARF só, o mais próximo do valor', () => {
        const darf2 = [membro('a', 200, 'D2'), membro('b', 197.5, 'D2')];
        const grupos = gruposDeDarf([debito('b1', 397.5), debito('b2', 397.4)], [...MEMBROS, ...darf2]);
        expect(grupos).toHaveLength(2);
        expect(new Set(grupos.map(g => g.bank.id))).toEqual(new Set(['b1', 'b2']));
    });

    it('lançamento sem DARF não entra', () => {
        expect(gruposDeDarf([debito('b1', 100)], [membro('solto', 100, null)])).toHaveLength(0);
    });
});
