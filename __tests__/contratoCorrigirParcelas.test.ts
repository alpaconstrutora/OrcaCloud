/**
 * Contrato › Financeiro › Parcelas — gravação das correções (plano
 * 2026-10-26-contrato-parcelas-conferencia-e-gerador, S1). O cronograma novo vem
 * da regra pura; aqui se prova que (1) a marca de valor/vencimento manual das
 * abertas reescritas é limpa ANTES — senão a sincronização manteria o valor
 * antigo em silêncio — e (2) a gravação é pelo `updateContract`, que sincroniza.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ ordem: [] as string[], updates: [] as { patch: Record<string, unknown>; ids: unknown; status: unknown }[] }));

vi.mock('../lib/supabase', () => {
    const consulta = (patch: Record<string, unknown>) => {
        const r = { patch, ids: undefined as unknown, status: undefined as unknown };
        const q: Record<string, unknown> = {
            in: (_c: string, v: unknown) => { r.ids = v; return q; },
            eq: (_c: string, v: unknown) => { r.status = v; return q; },
            then: (ok: (v: unknown) => void) => { m.updates.push(r); m.ordem.push('limpa-manual'); ok({ error: null }); },
        };
        return q;
    };
    return { supabase: { from: () => ({ update: consulta }) } };
});

import { contractService } from '../services/contractService';
import type { Contract } from '../types/contracts';

const contrato = { id: 'c1', organization_id: 'o1', payment_term_type: 'Parcelado' } as Contract;

describe('contractService.aplicarCronogramaCorrigido', () => {
    beforeEach(() => {
        m.ordem = []; m.updates = [];
        vi.spyOn(contractService, 'updateContract').mockImplementation(async (_id, u) => { m.ordem.push('updateContract'); return { ...contrato, ...u } as Contract; });
    });

    it('limpa a marca manual das abertas reescritas e depois grava o cronograma como Parcelado', async () => {
        const cronograma = [{ date: '2026-05-11', value: 1000 }, { date: '2026-06-11', value: 1850 }];
        await contractService.aplicarCronogramaCorrigido(contrato, cronograma, ['t2']);
        expect(m.ordem).toEqual(['limpa-manual', 'updateContract']);
        expect(m.updates[0]).toEqual({ patch: { valor_manual: false, vencimento_manual: false }, ids: ['t2'], status: 'PENDING' });
        expect(contractService.updateContract).toHaveBeenCalledWith('c1', {
            payment_schedule: cronograma, payment_term_type: 'Parcelado', payment_installments: 2,
        });
    });

    it('sem parcela reescrita não mexe em título, só grava o cronograma', async () => {
        await contractService.aplicarCronogramaCorrigido(contrato, [{ date: '2026-11-10', value: 150 }], []);
        expect(m.ordem).toEqual(['updateContract']);
    });
});

describe('contractService.ajustarValorDoContrato', () => {
    it('grava o Valor Original (o updateContract recalcula o Atual com os aditivos)', async () => {
        vi.spyOn(contractService, 'updateContract').mockResolvedValue(contrato);
        await contractService.ajustarValorDoContrato(contrato, 2550);
        expect(contractService.updateContract).toHaveBeenCalledWith('c1', { original_value: 2550 });
    });
});
