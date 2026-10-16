/**
 * validateAccess de Cliente, Fornecedor e Corretor (16/10/2026): a validação é a
 * RPC `portal_token_para_mim` — pela pessoa do JWT, SECURITY DEFINER — e devolve
 * o token do portal para o App abrir a casca do link. Antes, Cliente e Fornecedor
 * eram validados em tabela direta, que a RLS só libera a membro de organização.
 *
 * Trava:
 *  1. 'ok' com token → válido e o token chega a quem chamou;
 *  2. 'nao_cadastrado' → recusa com a mensagem do portal; 'revogado' → recusa
 *     dizendo que foi desativado; 'sem_organizacao' → pede o convite;
 *  3. erro da RPC → mensagem de suporte (nunca libera);
 *  4. a RPC recebe o nome do portal certo para cada grupo.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({
    supabase: { rpc: (...a: unknown[]) => rpc(...a), from: () => { throw new Error('não deve ler tabela direta'); } },
}));

import { profileService } from '../services/profileService';
import { ProfileGroup } from '../types';

const EMAIL = 'cliente@exemplo.com.br';

describe('validateAccess — portais com token', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('1. ok com token → válido, com o token', async () => {
        rpc.mockResolvedValue({ data: { situacao: 'ok', token: 'tok-1', org_id: 'org-1' }, error: null });
        const r = await profileService.validateAccess(EMAIL, ProfileGroup.CLIENT);
        expect(r).toEqual({ isValid: true, portalToken: 'tok-1' });
    });

    it('2. recusas com a mensagem certa', async () => {
        rpc.mockResolvedValue({ data: { situacao: 'nao_cadastrado' }, error: null });
        expect(await profileService.validateAccess(EMAIL, ProfileGroup.SUPPLIER)).toEqual({ isValid: false, error: 'Seu e-mail não está cadastrado como fornecedor autorizado.' });

        rpc.mockResolvedValue({ data: { situacao: 'revogado', nome: 'Fulano' }, error: null });
        expect((await profileService.validateAccess(EMAIL, ProfileGroup.CLIENT)).error).toMatch(/foi desativado/);

        rpc.mockResolvedValue({ data: { situacao: 'sem_organizacao' }, error: null });
        expect((await profileService.validateAccess(EMAIL, ProfileGroup.BROKER)).error).toMatch(/convite por e-mail/);
    });

    it('3. erro da RPC nunca libera', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
        const r = await profileService.validateAccess(EMAIL, ProfileGroup.BROKER);
        expect(r.isValid).toBe(false);
        expect(r.error).toMatch(/contate o suporte/);
    });

    it('4. cada grupo pede o seu portal', async () => {
        rpc.mockResolvedValue({ data: { situacao: 'ok', token: 't' }, error: null });
        await profileService.validateAccess(EMAIL, ProfileGroup.CLIENT);
        await profileService.validateAccess(EMAIL, ProfileGroup.SUPPLIER);
        await profileService.validateAccess(EMAIL, ProfileGroup.BROKER);
        expect(rpc.mock.calls.map(c => c[1])).toEqual([
            { p_portal: 'cliente' }, { p_portal: 'fornecedor' }, { p_portal: 'corretor' },
        ]);
        expect(rpc.mock.calls.every(c => c[0] === 'portal_token_para_mim')).toBe(true);
    });
});
