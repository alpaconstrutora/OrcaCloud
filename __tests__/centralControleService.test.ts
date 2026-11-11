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
