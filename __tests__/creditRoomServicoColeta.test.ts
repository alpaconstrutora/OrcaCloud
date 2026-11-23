/**
 * Coleta do serviço por obra (creditRoomService.coletarServicoPorObra), com o supabase simulado.
 *
 * Protege: só os contratos SERVICOS Ativo/Concluído da obra entram (o filtro de status vai na consulta);
 * o faturado vem dos títulos de `vw_receivables` ligados ao contrato por `originIdFromRef` (reference_id
 * composto), recebidos ou não; título de OUTRO contrato que casou pelo `like` é descartado; falha de leitura
 * devolve `null` (nunca zero).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Chamada = { tabela: string; filtros: [string, unknown[]][] };
const chamadas: Chamada[] = [];
let respostas: Record<string, unknown[]> = {};
let falhar: string | null = null;
/** Consultas já respondidas (tabela + filtros): a 2ª página da MESMA consulta vem vazia, senão a paginação não termina. */
const servidas = new Set<string>();

/** Query builder que registra os filtros e responde a 1ª página com as linhas da tabela, as demais vazias. */
const builder = (tabela: string) => {
    const c: Chamada = { tabela, filtros: [] };
    chamadas.push(c);
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'order']) {
        b[m] = (...args: unknown[]) => { c.filtros.push([m, args]); return b; };
    }
    b.range = () => {
        const chave = JSON.stringify([tabela, c.filtros]);
        const primeira = !servidas.has(chave);
        servidas.add(chave);
        if (falhar === tabela) return Promise.resolve({ data: null, error: new Error('falhou') });
        return Promise.resolve({ data: primeira ? (respostas[tabela] ?? []) : [], error: null });
    };
    return b;
};

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => builder(t), rpc: vi.fn() } }));

import { creditRoomService } from '../services/creditRoomService';

const OBRA = 'obra-1';
const K1 = '11111111-1111-4111-8111-111111111111';
const K2 = '22222222-2222-4222-8222-222222222222';
const K3 = '33333333-3333-4333-8333-333333333333';

describe('coletarServicoPorObra', () => {
    beforeEach(() => { chamadas.length = 0; servidas.clear(); respostas = {}; falhar = null; vi.spyOn(console, 'warn').mockImplementation(() => {}); });

    it('lê só SERVICOS Ativo/Concluído da obra e soma o faturado dos títulos do contrato (pagos ou não)', async () => {
        respostas.contracts = [
            { id: K1, project_id: OBRA, status: 'Ativo', current_value: 300_000 },
            { id: K2, project_id: OBRA, status: 'Concluído', current_value: 100_000 },
        ];
        respostas.vw_receivables = [
            { id: 't1', reference_id: `${K1}-p2026-10-10`, amount: 50_000 },
            { id: 't2', reference_id: `${K1}:p2`, amount: 25_000 },
            { id: 't3', reference_id: `${K2}-p2026-09-10`, amount: 40_000 },
            // Casou pelo `like` mas não é de nenhum contrato da obra: não entra.
            { id: 't4', reference_id: `${K3}-p2026-09-10`, amount: 999_999 },
        ];
        const r = await creditRoomService.coletarServicoPorObra(['org-1'], [OBRA]);
        expect(r!.get(OBRA)).toEqual({ n_contratos: 2, valor_contratos: 400_000, faturado: 115_000, a_faturar: 285_000 });

        const contratos = chamadas.find(c => c.tabela === 'contracts')!;
        expect(contratos.filtros).toContainEqual(['eq', ['domain', 'SERVICOS']]);
        expect(contratos.filtros).toContainEqual(['in', ['project_id', [OBRA]]]);
        expect(contratos.filtros).toContainEqual(['in', ['status', ['Ativo', 'Concluído']]]);
        const titulos = chamadas.find(c => c.tabela === 'vw_receivables')!;
        expect(titulos.filtros.find(f => f[0] === 'or')![1][0]).toBe(`reference_id.like.${K1}*,reference_id.like.${K2}*`);
    });

    it('obra sem contrato válido: n_contratos 0 e nenhuma leitura de títulos', async () => {
        respostas.contracts = [];
        const r = await creditRoomService.coletarServicoPorObra(['org-1'], [OBRA]);
        expect(r!.get(OBRA)).toEqual({ n_contratos: 0, valor_contratos: 0, faturado: 0, a_faturar: 0 });
        expect(chamadas.some(c => c.tabela === 'vw_receivables')).toBe(false);
    });

    it.each(['contracts', 'vw_receivables'])('falha na leitura de %s: null (não zero)', async tabela => {
        respostas.contracts = [{ id: K1, project_id: OBRA, status: 'Ativo', current_value: 10 }];
        falhar = tabela;
        expect(await creditRoomService.coletarServicoPorObra(['org-1'], [OBRA])).toBeNull();
    });

    it('sem obras: mapa vazio, sem consulta', async () => {
        const r = await creditRoomService.coletarServicoPorObra(['org-1'], []);
        expect(r!.size).toBe(0);
        expect(chamadas).toHaveLength(0);
    });
});
