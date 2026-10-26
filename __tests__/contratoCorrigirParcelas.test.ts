/**
 * Contrato › Financeiro › Parcelas — gravação das correções (plano
 * 2026-10-26-contrato-parcelas-conferencia-e-gerador, S1). O cronograma novo vem
 * da regra pura; aqui se prova que (1) a marca de valor/vencimento manual das
 * abertas reescritas é limpa ANTES — senão a sincronização manteria o valor
 * antigo em silêncio —, (2) a gravação é pelo `updateContract`, que sincroniza, e
 * (3) se a gravação falhar, as marcas VOLTAM (revisão de 26/10: sem isso, o valor
 * manual ficava sem a marca e o próximo "Salvar" o desfazia).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
    ordem: [] as string[],
    updates: [] as { patch: Record<string, unknown>; ids: unknown; eqs: [string, unknown][] }[],
    marcas: [] as { id: string; valor_manual: boolean; vencimento_manual: boolean }[],
}));

vi.mock('../lib/supabase', () => {
    const update = (patch: Record<string, unknown>) => {
        const r = { patch, ids: undefined as unknown, eqs: [] as [string, unknown][] };
        const q: Record<string, unknown> = {
            in: (_c: string, v: unknown) => { r.ids = v; return q; },
            eq: (c: string, v: unknown) => { r.eqs.push([c, v]); return q; },
            then: (ok: (v: unknown) => void) => {
                m.updates.push(r);
                m.ordem.push(patch.valor_manual === false && patch.vencimento_manual === false ? 'limpa-manual' : 'restaura-manual');
                ok({ error: null });
            },
        };
        return q;
    };
    const select = () => {
        const q: Record<string, unknown> = {
            in: () => q,
            then: (ok: (v: unknown) => void) => { m.ordem.push('le-marcas'); ok({ data: m.marcas, error: null }); },
        };
        return q;
    };
    return { supabase: { from: () => ({ update, select }) } };
});

import { contractService } from '../services/contractService';
import type { Contract } from '../types/contracts';

const contrato = { id: 'c1', organization_id: 'o1', payment_term_type: 'Parcelado' } as Contract;

describe('contractService.aplicarCronogramaCorrigido', () => {
    beforeEach(() => {
        m.ordem = []; m.updates = []; m.marcas = [{ id: 't2', valor_manual: true, vencimento_manual: false }];
        vi.spyOn(contractService, 'updateContract').mockImplementation(async (_id, u) => { m.ordem.push('updateContract'); return { ...contrato, ...u } as Contract; });
    });

    it('lê e limpa a marca manual das abertas reescritas e depois grava o cronograma como Parcelado', async () => {
        const cronograma = [{ date: '2026-05-11', value: 1000 }, { date: '2026-06-11', value: 1850 }];
        await contractService.aplicarCronogramaCorrigido(contrato, cronograma, ['t2']);
        expect(m.ordem).toEqual(['le-marcas', 'limpa-manual', 'updateContract']);
        expect(m.updates[0]).toEqual({ patch: { valor_manual: false, vencimento_manual: false }, ids: ['t2'], eqs: [['status', 'PENDING']] });
        expect(contractService.updateContract).toHaveBeenCalledWith('c1', {
            payment_schedule: cronograma, payment_term_type: 'Parcelado', payment_installments: 2,
        });
    });

    it('se a gravação falhar, devolve as marcas manuais e repassa o erro', async () => {
        vi.spyOn(contractService, 'updateContract').mockRejectedValue(new Error('timeout'));
        await expect(contractService.aplicarCronogramaCorrigido(contrato, [{ date: '2026-11-10', value: 150 }], ['t2'])).rejects.toThrow('timeout');
        expect(m.ordem).toEqual(['le-marcas', 'limpa-manual', 'restaura-manual']);
        expect(m.updates[1]).toEqual({ patch: { valor_manual: true, vencimento_manual: false }, ids: undefined, eqs: [['id', 't2']] });
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
