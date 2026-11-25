/**
 * Locações › Renovações › Histórico (pedido de 25/11/2026): historicoGeral junta
 * aditivos de prorrogação (inclusive cancelados) e contratos novos de renovação,
 * mais recentes primeiro, com autor e cancelamento.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const respostas: Record<string, unknown[]> = {};
const filtros: Record<string, unknown[][]> = {};
let chamadasContracts = 0;
function table(name: string) {
    const chave = name === 'contracts' ? `contracts#${++chamadasContracts}` : name;
    filtros[chave] = [];
    const b: Record<string, unknown> = {};
    const filt = (...a: unknown[]) => { filtros[chave].push(a); return b; };
    Object.assign(b, {
        select: (...a: unknown[]) => { filtros[chave].push(['select', ...a]); return b; },
        eq: filt, not: filt, in: filt, order: filt,
        then: (resolve: (v: unknown) => void) => resolve({ data: respostas[chave] ?? [], error: null }),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (n: string) => table(n), rpc: vi.fn() } }));
vi.mock('../services/negociacaoDoContratoService', () => ({
    negociacoesDosContratos: async (cs: { id: string }[]) => new Map(cs.map(c => [c.id, `neg-${c.id}`])),
}));

import { contractRenewalService } from '../services/contractRenewalService';

const CTL = { number: 'CTL-006-012-0001', title: 'Salão', client_id: 'cl1', status: 'Ativo', deal_id: 'd1', parent_contract_id: null, domain: 'LOCACAO' };
const ad = (n: number, extra: Record<string, unknown>) => ({
    id: `ad${n}`, contract_id: 'c1', number: `AD-00${n}`, status: 'Aprovado', new_start_date: '2019-03-23',
    new_end_date: '2021-09-22', previous_end_date: '2019-03-22', new_value: 4784.92, previous_value: 4784.92,
    installments_generated: 30, description: 'Prorrogação', requested_by: null, cancelado_em: null, cancelado_por: null,
    created_at: `2026-11-25T1${n}:00:00Z`, contracts: CTL, ...extra,
});

beforeEach(() => {
    chamadasContracts = 0;
    for (const k of Object.keys(respostas)) delete respostas[k];
});

describe('historicoGeral', () => {
    it('CTL-006: os 4 aditivos, mais recente primeiro, com autor e cancelamento', async () => {
        respostas.contract_addendums = [
            ad(1, { status: 'Cancelado', installments_generated: 0 }),
            ad(2, { status: 'Cancelado', installments_generated: 0 }),
            ad(3, { new_end_date: '2020-03-22', installments_generated: 12 }),
            ad(4, {
                new_start_date: '2020-03-23', previous_end_date: '2020-03-22', new_value: 5832.48, previous_value: 5832.48,
                installments_generated: 18, requested_by: 'quem@exemplo.com',
            }),
        ];
        const r = await contractRenewalService.historicoGeral('org1');
        expect(r.map(x => x.numero)).toEqual(['AD-004', 'AD-003', 'AD-002', 'AD-001']);
        expect(r[0]).toMatchObject({
            via: 'ADITIVO', contract_id: 'c1', inicio: '2020-03-23', fim: '2021-09-22', valor: 5832.48, parcelas: 18,
            criado_por: 'quem@exemplo.com', negociacaoId: 'neg-c1', contrato: { number: 'CTL-006-012-0001', status: 'Ativo' },
        });
        expect(r[0].aditivo?.id).toBe('ad4');
        expect(r[3].status).toBe('Cancelado');
    });

    it('lê só prorrogação de locação, da org do topo, inclusive canceladas', async () => {
        await contractRenewalService.historicoGeral('org1');
        const f = filtros.contract_addendums;
        expect(f).toContainEqual(['new_start_date', 'is', null]);
        expect(f).toContainEqual(['contracts.domain', 'LOCACAO']);
        expect(f).toContainEqual(['organization_id', 'org1']);
        expect(f.some(x => x[0] === 'status')).toBe(false);
        expect(String(f[0][1])).toContain('cancelado_em, cancelado_por');
    });

    it('"Todas as organizações": não filtra org (a RLS recorta)', async () => {
        await contractRenewalService.historicoGeral(null);
        expect(filtros.contract_addendums.some(x => x[0] === 'organization_id')).toBe(false);
    });

    it('renovação por contrato novo: linha do filho, pendurada no pai; filho já renovado marcado', async () => {
        respostas['contracts#1'] = [
            { id: 'f1', number: 'CTL-001-0002', status: 'Encerrado', start_date: '2025-01-01', end_date: '2025-12-31', current_value: 1100, original_value: 1100, created_at: '2026-10-01T00:00:00Z', parent_contract_id: 'p1' },
            { id: 'f2', number: 'CTL-001-0003', status: 'Ativo', start_date: '2026-01-01', end_date: '2026-12-31', current_value: 1200, original_value: 1200, created_at: '2026-11-01T00:00:00Z', parent_contract_id: 'f1' },
        ];
        respostas['contracts#2'] = [
            { id: 'p1', number: 'CTL-001-0001', title: null, client_id: 'cl9', status: 'Encerrado', deal_id: 'd9', parent_contract_id: null, end_date: '2024-12-31', current_value: 1000 },
            { id: 'f1', number: 'CTL-001-0002', title: null, client_id: 'cl9', status: 'Encerrado', deal_id: null, parent_contract_id: 'p1', end_date: '2025-12-31', current_value: 1100 },
        ];
        const r = await contractRenewalService.historicoGeral('org1');
        expect(r.map(x => [x.numero, x.contract_id, x.filhoTemRenovacao])).toEqual([
            ['CTL-001-0003', 'f1', false],
            ['CTL-001-0002', 'p1', true],
        ]);
        expect(r[1]).toMatchObject({ via: 'CONTRATO', filhoId: 'f1', valorAnterior: 1000, valor: 1100, criado_por: null, fimAnterior: '2024-12-31' });
    });
});
