/**
 * `clientPropagacaoService` — planejar (só lê) e aplicar (grava em lote, cai
 * para linha a linha quando o banco recusa uma linha, e conta o que a RLS pulou).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
const h = vi.hoisted(() => ({
    dados: {} as Record<string, Linha[]>,
    /** ids que o banco recusa (ex.: título a pagar em competência fechada). */
    travados: new Set<string>(),
    /** ids que a RLS de UPDATE pula em silêncio. */
    invisiveis: new Set<string>(),
    updates: [] as { tabela: string; patch: Linha; ids: string[] }[],
}));

vi.mock('../lib/supabase', () => {
    const from = (tabela: string) => ({
        select: () => ({
            eq: async () => ({ data: h.dados[tabela] ?? [], error: null }),
        }),
        update: (patch: Linha) => {
            const exec = (ids: string[]) => ({
                select: async () => {
                    h.updates.push({ tabela, patch, ids });
                    if (ids.some(id => h.travados.has(id))) {
                        return { data: null, error: { message: 'Competência 10/2026 já fechada em Contas a Pagar.' } };
                    }
                    return { data: ids.filter(id => !h.invisiveis.has(id)).map(id => ({ id })), error: null };
                },
            });
            return { in: (_c: string, ids: string[]) => exec(ids), eq: (_c: string, id: string) => exec([id]) };
        },
    });
    return { supabase: { from } };
});

import { clientPropagacaoService, contagemDoPlano } from '../services/clientPropagacaoService';

beforeEach(() => {
    h.dados = {};
    h.travados = new Set();
    h.invisiveis = new Set();
    h.updates = [];
});

describe('planejar', () => {
    it('conta só as cópias que mudariam, por destino', async () => {
        h.dados = {
            internal_transactions: [
                { id: 't1', party_name: 'Filtrelec', entity_name: 'Filtrelec' },
                { id: 't2', party_name: 'Filtrelec Ltda', entity_name: 'Filtrelec Ltda' },
            ],
            client_charges: [{ id: 'k1', party_name: 'Filtrelec' }],
            warranty_claims: [{ id: 'w1', client_name: 'Filtrelec Ltda' }],
            projects: [{ id: 'p1', settings: { client: 'Filtrelec', clientId: 'cli-1', classification: 'OBRA' } }],
        };
        const plano = await clientPropagacaoService.planejar('cli-1', { name: 'Filtrelec Ltda' });
        expect(contagemDoPlano(plano)).toEqual({ financeiro: 1, cobrancas: 1, obras: 1 });
        // A obra regrava `settings` inteiro, só com `client` trocado.
        expect(plano.porDestino.obras![0].patch).toEqual({ settings: { client: 'Filtrelec Ltda', clientId: 'cli-1', classification: 'OBRA' } });
        expect(h.updates).toEqual([]);
    });
});

describe('aplicar', () => {
    it('agrupa linhas de patch idêntico num UPDATE só', async () => {
        h.dados = { internal_transactions: [1, 2, 3].map(i => ({ id: `t${i}`, party_name: 'Filtrelec', entity_name: 'Filtrelec' })) };
        const plano = await clientPropagacaoService.planejar('cli-1', { name: 'Filtrelec Ltda' });
        const r = await clientPropagacaoService.aplicar(plano);
        expect(r).toMatchObject({ atualizados: 3, recusados: 0 });
        expect(h.updates).toHaveLength(1);
        expect(h.updates[0].ids).toEqual(['t1', 't2', 't3']);
    });

    it('uma linha travada não impede as outras: refaz uma a uma e devolve o motivo', async () => {
        h.dados = { internal_transactions: [1, 2, 3].map(i => ({ id: `t${i}`, party_name: 'Filtrelec' })) };
        h.travados.add('t2');
        const plano = await clientPropagacaoService.planejar('cli-1', { name: 'Filtrelec Ltda' });
        const r = await clientPropagacaoService.aplicar(plano);
        expect(r.atualizados).toBe(2);
        expect(r.recusados).toBe(1);
        expect(r.motivo).toMatch(/Competência 10\/2026/);
    });

    it('linha que a RLS pulou em silêncio conta como recusada, não como atualizada', async () => {
        h.dados = { client_charges: [{ id: 'k1', party_name: 'A' }, { id: 'k2', party_name: 'A' }] };
        h.invisiveis.add('k2');
        const plano = await clientPropagacaoService.planejar('cli-1', { name: 'B' });
        const r = await clientPropagacaoService.aplicar(plano);
        expect(r).toMatchObject({ atualizados: 1, recusados: 1, obrasAlteradas: false });
    });
});
