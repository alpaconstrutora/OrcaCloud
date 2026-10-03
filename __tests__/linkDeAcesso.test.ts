// @vitest-environment jsdom
/**
 * lib/linkDeAcesso — o link (convite/redefinição) é lido na CARGA do módulo,
 * antes do cliente do Supabase apagar o hash da URL (03/10/2026: o link do
 * convite abria o seletor em vez da tela de criar senha). Guarda também o
 * e-mail que o link identifica (a tela de senha só grava para ele) e o erro que
 * o servidor manda quando o link já foi usado ou venceu.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lerLinkDeAcesso } from '../lib/linkDeAcesso';

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (email: string) => `${b64({ alg: 'HS256' })}.${b64({ sub: 'u', email })}.assinatura`;

async function carregarCom(hash: string) {
    window.history.replaceState(null, '', `/portal-parceiro${hash}`);
    vi.resetModules();
    const mod = await import('../lib/linkDeAcesso');
    // Depois de carregado, apagar o hash (como o Supabase faz) não muda o valor.
    window.history.replaceState(null, '', '/portal-parceiro');
    return mod;
}

describe('linkDeAcesso', () => {
    beforeEach(() => { window.history.replaceState(null, '', '/'); });

    it('convite: tipo e e-mail do token, capturados antes de o hash sumir', async () => {
        const { linkDeAcesso, tipoDoLinkDeAcesso } = await carregarCom(`#access_token=${token('Parceiro@Fornecedor.com')}&type=invite`);
        expect(tipoDoLinkDeAcesso).toBe('invite');
        expect(linkDeAcesso).toEqual({ tipo: 'invite', email: 'parceiro@fornecedor.com', erro: null });
    });

    it('redefinição de senha', async () => {
        const { tipoDoLinkDeAcesso } = await carregarCom(`#access_token=${token('a@b.com')}&type=recovery`);
        expect(tipoDoLinkDeAcesso).toBe('recovery');
    });

    it('link já usado/vencido: erro do servidor, sem tipo (o retorno real não traz type)', () => {
        expect(lerLinkDeAcesso('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb='))
            .toEqual({ tipo: null, email: null, erro: 'otp_expired' });
    });

    it('carga normal, outro tipo ou token ilegível', async () => {
        expect((await carregarCom('')).linkDeAcesso).toEqual({ tipo: null, email: null, erro: null });
        expect(lerLinkDeAcesso('#access_token=x&type=magiclink')).toEqual({ tipo: null, email: null, erro: null });
        expect(lerLinkDeAcesso('#access_token=nao-e-jwt&type=invite').email).toBeNull();
    });
});
