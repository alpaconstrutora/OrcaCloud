/**
 * partnerService — convite por e-mail do Portal do Parceiro (03/10/2026).
 *  - savePartnerUser grava o e-mail minúsculo e sem espaço (a autorização do modo
 *    logado compara com o e-mail do JWT letra a letra);
 *  - invitePartnerUser devolve o tipo de link e, em erro, a MENSAGEM da Edge
 *    Function (não o genérico "Edge Function returned a non-2xx status code").
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const insert = vi.fn();
const invoke = vi.fn();

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => ({
            insert: (row: unknown) => {
                insert(row);
                return { select: () => ({ single: async () => ({ data: { id: 'novo', ...(row as object) }, error: null }) }) };
            },
        }),
        functions: { invoke: (...a: unknown[]) => invoke(...a) },
    },
}));
vi.mock('../services/documentService', () => ({ documentService: {} }));
vi.mock('../services/notificationService', () => ({ notificationService: {} }));

import { partnerService } from '../services/partnerService';

describe('partnerService — convite', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('savePartnerUser grava o e-mail minúsculo e sem espaço', async () => {
        await partnerService.savePartnerUser({ partner_workspace_id: 'ws1', email: '  Ana.Souza@Parceiro.COM ', name: 'Ana' });
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana.souza@parceiro.com' }));
    });

    it('invitePartnerUser chama a function com o id e devolve o tipo de link', async () => {
        invoke.mockResolvedValue({ data: { ok: true, kind: 'recovery' }, error: null });
        await expect(partnerService.invitePartnerUser('u1')).resolves.toEqual({ kind: 'recovery' });
        expect(invoke).toHaveBeenCalledWith('partner-invite-user', { body: { partner_user_id: 'u1' } });
    });

    it('erro da function: a mensagem do corpo chega a quem chamou', async () => {
        invoke.mockResolvedValue({
            data: null,
            error: {
                message: 'Edge Function returned a non-2xx status code',
                context: new Response(JSON.stringify({ error: 'Sem acesso a esta organização.' }), { status: 403 }),
            },
        });
        await expect(partnerService.invitePartnerUser('u1')).rejects.toThrow('Sem acesso a esta organização.');
    });

    it('erro sem corpo JSON: cai na mensagem do cliente', async () => {
        invoke.mockResolvedValue({
            data: null,
            error: { message: 'Failed to send a request to the Edge Function', context: undefined },
        });
        await expect(partnerService.invitePartnerUser('u1')).rejects.toThrow('Failed to send a request to the Edge Function');
    });
});
