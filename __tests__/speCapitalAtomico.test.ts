/**
 * Totalizadores de capital do sócio de SPE (`spe_partners.capital_calls_total`
 * e `capital_paid`) — 26/10/2026.
 *
 * Antes, `addCapitalCall` chamava a RPC `increment_spe_capital_call`, que nunca
 * existiu no banco, e caía num fallback "lê, soma, grava" sem conferir o erro.
 * `addCapitalPayment` fazia o mesmo lê-soma-grava direto. Dois defeitos:
 *   - `capitalCallService.createCall` dispara os incrementos em paralelo
 *     (`Promise.all`): dois para o mesmo sócio leem o mesmo total e um se perde;
 *   - a RLS só deixa owner/admin gravar em `spe_partners` — para membro comum o
 *     UPDATE afeta 0 linhas, sem erro, e o total fica errado calado.
 *
 * Agora o incremento é atômico no banco (migration
 * `20271026900000_spe_capital_incremento_atomico.sql`) e erro sobe. Este teste
 * trava o lado do serviço: só a RPC, nenhum lê-soma-grava, erro não é engolido.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: (...args: unknown[]) => rpc(...args),
        from: (...args: unknown[]) => from(...args),
    },
}));

import { speService } from '../services/speService';

beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation(() => {
        throw new Error('não pode ler-somar-gravar spe_partners pelo cliente');
    });
});

describe('speService — incremento atômico dos totalizadores de capital', () => {
    it('addCapitalCall incrementa pela RPC, sem tocar a tabela', async () => {
        rpc.mockResolvedValue({ data: 1500, error: null });
        await speService.addCapitalCall('p-1', 500);
        expect(rpc).toHaveBeenCalledWith('increment_spe_capital_call', { p_partner_id: 'p-1', p_amount: 500 });
        expect(from).not.toHaveBeenCalled();
    });

    it('addCapitalCall propaga o erro da RPC (sem fallback)', async () => {
        const erro = { message: 'sem permissão para alterar este sócio', code: '42501' };
        rpc.mockResolvedValue({ data: null, error: erro });
        await expect(speService.addCapitalCall('p-1', 500)).rejects.toBe(erro);
        expect(from).not.toHaveBeenCalled();
    });

    it('addCapitalPayment incrementa pela RPC, sem tocar a tabela', async () => {
        rpc.mockResolvedValue({ data: 200, error: null });
        await speService.addCapitalPayment('p-2', 200);
        expect(rpc).toHaveBeenCalledWith('increment_spe_capital_paid', { p_partner_id: 'p-2', p_amount: 200 });
        expect(from).not.toHaveBeenCalled();
    });

    it('addCapitalPayment propaga o erro da RPC', async () => {
        const erro = { message: 'sem permissão para alterar este sócio', code: '42501' };
        rpc.mockResolvedValue({ data: null, error: erro });
        await expect(speService.addCapitalPayment('p-2', 200)).rejects.toBe(erro);
    });
});
