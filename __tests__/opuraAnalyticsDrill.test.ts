/**
 * ÒPURA · Relatórios — drill das 5 dimensões novas (2026-09-13) e o contrato
 * do serviço com a RPC fn_opura_entries (os 3 parâmetros novos precisam ir —
 * a função antiga foi DROPada; mandar nome desconhecido = 404 do PostgREST).
 */
import { describe, it, expect, vi } from 'vitest';

const rpc = vi.fn(async () => ({ data: [], error: null }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { opuraAnalyticsService } from '../services/opuraAnalyticsService';

describe('drillFilter — dimensões novas', () => {
    it('plano de contas → planoDeContasId', () => {
        expect(opuraAnalyticsService.drillFilter('plano_de_contas', 'pc1')).toEqual({ planoDeContasId: 'pc1' });
    });
    it('dimensões chaveadas por contrato → contractId, sem domínio (o contrato já o determina)', () => {
        for (const d of ['venda_ativos', 'locacoes', 'contratos_servico'] as const) {
            expect(opuraAnalyticsService.drillFilter(d, 'c1')).toEqual({ contractId: 'c1' });
        }
    });
    it('Gestão de Locações → locatário + domínio LOCACAO (o mesmo cliente pode ser comprador em VENDAS)', () => {
        expect(opuraAnalyticsService.drillFilter('locacoes_locatario', 'cli1'))
            .toEqual({ contractClientId: 'cli1', contractDomain: 'LOCACAO' });
        expect(opuraAnalyticsService.drillFilter('locacoes_locatario', null))
            .toEqual({ contractClientId: undefined, contractDomain: 'LOCACAO' });
    });
});

describe('entries() — parâmetros da RPC', () => {
    it('manda p_plano_de_contas_id, p_contract_domain e p_contract_client_id (null quando ausentes)', async () => {
        rpc.mockClear();
        await opuraAnalyticsService.entries('org1', { contractClientId: 'cli1', contractDomain: 'LOCACAO' }, 50, 0);
        const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
        expect(fn).toBe('fn_opura_entries');
        expect(args).toMatchObject({ p_contract_client_id: 'cli1', p_contract_domain: 'LOCACAO', p_plano_de_contas_id: null });
        expect(Object.keys(args)).toHaveLength(25);
    });
});
