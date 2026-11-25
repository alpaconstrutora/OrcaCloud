/**
 * Locações › Reajustes › Histórico (pedido de 24/11/2026: "quero ver historico de
 * reajuste"). O contrato decidido sai da fila (CTL-006-012-0001: reajustado em
 * 05/11/2018, próximo aniversário depois do fim da vigência) e o histórico só
 * abria por uma linha da fila. `historicoGeral` lista TODAS as decisões, com o
 * contrato e a negociação (para recortar pelo empreendimento aberto).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const filtros: unknown[][] = [];
const REGISTROS = [
    {
        id: 'r1', contract_id: 'c-006', aniversario: '2018-11-05', data_base: '2016-09-23', decisao: 'VALOR', percentual_aplicado: 9.75,
        valor_anterior: 4556, valor_novo: 5000, parcelas_atualizadas: 6, criado_por: 'altair.rosa@alpaconstrutora.com.br', created_at: '2026-11-25T00:02:00Z',
        contracts: { number: 'CTL-006-012-0001', title: 'Salão', client_id: 'cl1', deal_id: 'd-006', parent_contract_id: null },
    },
    {
        id: 'r2', contract_id: 'c-ren', aniversario: '2025-01-10', data_base: '2024-01-10', decisao: 'NAO_APLICADO', percentual_aplicado: 0,
        valor_anterior: 1000, valor_novo: 1000, parcelas_atualizadas: 0, criado_por: null, created_at: '2026-11-20T12:00:00Z',
        contracts: { number: 'CTL-010-0009', title: 'Sala', client_id: 'cl2', deal_id: null, parent_contract_id: 'c-pai' },
    },
];
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => {
            const q: Record<string, unknown> = {};
            const f = (nome: string) => (...a: unknown[]) => { filtros.push([nome, ...a]); return q; };
            for (const m of ['select', 'eq', 'order']) q[m] = f(m);
            q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: REGISTROS, error: null }).then(ok);
            return q;
        },
    },
}));
vi.mock('../services/negociacaoDoContratoService', () => ({
    negociacoesDosContratos: vi.fn(async (cs: { id: string; deal_id?: string | null }[]) =>
        new Map(cs.map(c => [c.id, c.deal_id ?? (c.id === 'c-ren' ? 'd-010' : null)]))),
}));
vi.mock('../services/taxPayableService', () => ({ taxPayableService: { generateForDeal: vi.fn() } }));
vi.mock('../services/contractIndexService', () => ({ normalizeIndexName: (s: string) => s, contractIndexService: { getClosestTo: vi.fn() } }));

import { reajusteLocacaoService } from '../services/reajusteLocacaoService';

describe('reajusteLocacaoService.historicoGeral', () => {
    beforeEach(() => { filtros.length = 0; });

    it('traz cada decisão com o número do contrato, o locatário e a negociação (a da raiz, no renovado)', async () => {
        const h = await reajusteLocacaoService.historicoGeral('org1');
        expect(h.map(r => [r.contrato.number, r.negociacaoId])).toEqual([
            ['CTL-006-012-0001', 'd-006'],
            ['CTL-010-0009', 'd-010'],
        ]);
        expect(h[0]).toMatchObject({ aniversario: '2018-11-05', valor_novo: 5000, contrato: { client_id: 'cl1' } });
    });

    it('recorta pela organização do topo; "Todas" (null) não filtra', async () => {
        await reajusteLocacaoService.historicoGeral('org1');
        expect(filtros).toContainEqual(['eq', 'organization_id', 'org1']);
        filtros.length = 0;
        await reajusteLocacaoService.historicoGeral(null);
        expect(filtros.some(f => f[0] === 'eq' && f[1] === 'organization_id')).toBe(false);
    });

    it('mais recente primeiro (pela data da decisão)', async () => {
        await reajusteLocacaoService.historicoGeral('org1');
        expect(filtros).toContainEqual(['order', 'created_at', { ascending: false }]);
    });
});
