/**
 * portalInviteService — convite por e-mail de Cliente/Fornecedor/Corretor
 * (16/10/2026). Molde: `partnerServiceConvite.test.ts`.
 *  - chama a function `portal-invite-user` com { portal, id } e devolve o tipo
 *    de link e a data gravada;
 *  - em erro, a MENSAGEM do corpo chega a quem chamou.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({
    supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { portalInviteService } from '../services/portalInviteService';

describe('portalInviteService — convite', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('chama a function com portal e id e devolve o tipo de link e a data', async () => {
        invoke.mockResolvedValue({ data: { ok: true, kind: 'recovery', invited_at: '2026-10-16T12:00:00.000Z' }, error: null });
        await expect(portalInviteService.enviarConvite('cliente', 'c1')).resolves.toEqual({ kind: 'recovery', invitedAt: '2026-10-16T12:00:00.000Z' });
        expect(invoke).toHaveBeenCalledWith('portal-invite-user', { body: { portal: 'cliente', id: 'c1' } });
    });

    it('erro da function: a mensagem do corpo chega a quem chamou', async () => {
        invoke.mockResolvedValue({
            data: null,
            error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'O cadastro não tem e-mail. Preencha o e-mail antes de convidar.' }) } },
        });
        await expect(portalInviteService.enviarConvite('fornecedor', 'f1')).rejects.toThrow('O cadastro não tem e-mail. Preencha o e-mail antes de convidar.');
    });

    it('resposta sem ok vira erro com a mensagem', async () => {
        invoke.mockResolvedValue({ data: { ok: false, error: 'O corretor está inativo.' }, error: null });
        await expect(portalInviteService.enviarConvite('corretor', 'b1')).rejects.toThrow('O corretor está inativo.');
    });
});
