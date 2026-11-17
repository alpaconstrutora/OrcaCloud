import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A Central só usa as CONTAGENS das divergências (`counts`, `as_of`). Até 11/11/2026
 * o bootstrap pedia 100 linhas de cada lista: 115 KB dos 168 KB da resposta, que a
 * tela jogava fora. Pedir só as contagens (limit 0) não muda o que a tela mostra.
 */
const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { centralControleService } from '../services/centralControleService';

describe('centralControleService.bootstrap', () => {
    beforeEach(() => {
        rpc.mockReset().mockResolvedValue({ data: {}, error: null });
    });

    it('pede só as contagens das divergências (limit 0)', async () => {
        await centralControleService.bootstrap('o1');
        expect(rpc).toHaveBeenCalledWith('fn_central_controle_bootstrap', expect.objectContaining({
            p_organization_id: 'o1',
            p_divergence_limit: 0,
        }));
    });

    it('"Todas" vai como null', async () => {
        await centralControleService.bootstrap(null);
        expect(rpc.mock.calls[0][1]).toMatchObject({ p_organization_id: null });
    });
});

/**
 * Plano B da Central (docs/planos/2026-11-16-central-blocos-isolados.md, Tarefa 2):
 * quando a chamada única cai (estouro dos 8 s, rede), a tela pede os blocos um a um,
 * cada um com o próprio limite — e um bloco que cai não leva os outros.
 */
describe('centralControleService.fontesSeparadas', () => {
    const BLOCOS = [
        'fn_financial_alerts', 'fn_reconciliation_divergences', 'fn_process_bottlenecks',
        'fn_approval_action_queue', 'fn_project_scorecard', 'fn_central_meu_dia',
    ];
    const MEU_DIA = { hoje: '2026-11-16', aprovacoes_hoje: 2 };

    beforeEach(() => {
        rpc.mockReset().mockImplementation(async (nome: string) => {
            if (nome === 'fn_reconciliation_divergences') {
                return { data: { as_of: '2026-11-16', counts: { value_mismatch: 0, bank_without_internal: 0, internal_without_bank: 0 } }, error: null };
            }
            if (nome === 'fn_central_meu_dia') return { data: MEU_DIA, error: null };
            return { data: [], error: null };
        });
    });

    /** Espera todas assentarem, para nenhuma rejeição sobrar sem dono no teste. */
    const assentar = (f: Record<string, Promise<unknown>>) => Promise.allSettled(Object.values(f));

    it('pede as 6 consultas da tela, com os mesmos parâmetros do bootstrap', async () => {
        await assentar(centralControleService.fontesSeparadas('o1') as unknown as Record<string, Promise<unknown>>);
        expect(rpc.mock.calls.map(c => c[0]).sort()).toEqual([...BLOCOS].sort());
        expect(rpc).toHaveBeenCalledWith('fn_reconciliation_divergences', expect.objectContaining({
            p_organization_id: 'o1', p_limit: 0, p_aging_days: 5, p_value_tolerance: 50,
        }));
        expect(rpc).not.toHaveBeenCalledWith('fn_approval_pending_summary', expect.anything());
    });

    it('"Todas" vai como null em todas', async () => {
        await assentar(centralControleService.fontesSeparadas(null) as unknown as Record<string, Promise<unknown>>);
        expect(rpc.mock.calls).toHaveLength(6);
        for (const [, args] of rpc.mock.calls) expect(args).toMatchObject({ p_organization_id: null });
    });

    it('uma consulta que cai não derruba as outras', async () => {
        rpc.mockImplementation(async (nome: string) => {
            if (nome === 'fn_project_scorecard') return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
            if (nome === 'fn_central_meu_dia') return { data: MEU_DIA, error: null };
            return { data: [], error: null };
        });
        const f = centralControleService.fontesSeparadas('o1');
        await expect(f.scorecards).rejects.toMatchObject({ code: '57014' });
        await expect(f.meu_dia).resolves.toEqual(MEU_DIA);
        await expect(f.action_queue).resolves.toEqual([]);
        await expect(f.financial_alerts).resolves.toEqual([]);
        await assentar(f as unknown as Record<string, Promise<unknown>>);
    });
});
