// @vitest-environment jsdom
/**
 * lib/linkDeAcesso — o tipo do link (convite/redefinição) é capturado na CARGA do
 * módulo, antes do cliente do Supabase apagar o hash da URL (03/10/2026: o link
 * do convite abria o seletor em vez da tela de criar senha).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

async function carregarCom(hash: string) {
    window.history.replaceState(null, '', `/portal-parceiro${hash}`);
    vi.resetModules();
    const mod = await import('../lib/linkDeAcesso');
    // Depois de carregado, apagar o hash (como o Supabase faz) não muda o valor.
    window.history.replaceState(null, '', '/portal-parceiro');
    return mod.tipoDoLinkDeAcesso;
}

describe('tipoDoLinkDeAcesso', () => {
    beforeEach(() => { window.history.replaceState(null, '', '/'); });

    it('convite', async () => {
        expect(await carregarCom('#access_token=x&type=invite')).toBe('invite');
    });
    it('redefinição de senha', async () => {
        expect(await carregarCom('#access_token=x&type=recovery')).toBe('recovery');
    });
    it('carga normal ou outro tipo: null', async () => {
        expect(await carregarCom('')).toBeNull();
        expect(await carregarCom('#access_token=x&type=magiclink')).toBeNull();
    });
});
