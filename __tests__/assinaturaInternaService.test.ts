import { describe, expect, it } from 'vitest';
import { acessoDoLinkDaTestemunha, aguardaMinhaAssinatura, signatarioDaUrl } from '../services/assinaturaInternaService';

/**
 * Auxiliares do lado do navegador da assinatura interna
 * (docs/planos/2026-11-21-assinatura-eletronica-interna.md, F3).
 */

const SIG = '11111111-2222-4333-8444-555555555555';

describe('signatarioDaUrl', () => {
    it('lê o ?assinar do e-mail e ignora o que não é uuid', () => {
        expect(signatarioDaUrl(`?token=abc&assinar=${SIG}`)).toBe(SIG);
        expect(signatarioDaUrl('?assinar=../../x')).toBe(null);
        expect(signatarioDaUrl('?token=abc')).toBe(null);
    });
});

describe('acessoDoLinkDaTestemunha', () => {
    it('lê signatário e token do fragmento', () => {
        expect(acessoDoLinkDaTestemunha(`#s=${SIG}&t=a-b_c`)).toEqual({ signatarioId: SIG, token: 'a-b_c' });
        expect(acessoDoLinkDaTestemunha(`#s=${SIG}`)).toBe(null);
        expect(acessoDoLinkDaTestemunha('#t=x')).toBe(null);
        expect(acessoDoLinkDaTestemunha('')).toBe(null);
    });
});

describe('aguardaMinhaAssinatura', () => {
    it('só quando eu não assinei e o envelope está aberto', () => {
        expect(aguardaMinhaAssinatura({ minha_situacao: 'PENDENTE', situacao: 'ENVIADO' })).toBe(true);
        expect(aguardaMinhaAssinatura({ minha_situacao: 'ASSINADO', situacao: 'ENVIADO' })).toBe(false);
        expect(aguardaMinhaAssinatura({ minha_situacao: 'PENDENTE', situacao: 'EXPIRADO' })).toBe(false);
        expect(aguardaMinhaAssinatura({ minha_situacao: 'PENDENTE', situacao: 'CONCLUIDO' })).toBe(false);
    });
});
