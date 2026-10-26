import { describe, expect, it } from 'vitest';
import { mensagemDoPortalColaborador } from '../utils/portalColaboradorErro';

describe('mensagemDoPortalColaborador', () => {
    it('link expirado/revogado (RAISE da fn_colab_portal_employee) pede um link novo ao RH', () => {
        const erro = { code: 'P0001', message: 'PORTAL_TOKEN_INVALIDO', hint: 'Link do portal invalido, expirado ou revogado.' };
        expect(mensagemDoPortalColaborador(erro)).toMatch(/link.*expirou.*RH/i);
    });

    it('holerite de outra pessoa / fora da lista explica que não está disponível', () => {
        expect(mensagemDoPortalColaborador(new Error('PORTAL_HOLERITE_INDISPONIVEL'))).toMatch(/holerite não está disponível/i);
    });

    it('queda de rede vira "sem conexão", não o texto do navegador', () => {
        const msg = mensagemDoPortalColaborador(new TypeError('Failed to fetch'));
        expect(msg).toMatch(/conexão/i);
        expect(msg).not.toMatch(/fetch/i);
    });

    it('timeout do client também é rede', () => {
        expect(mensagemDoPortalColaborador(new Error('AbortError: The operation was aborted'))).toMatch(/conexão/i);
    });

    it('erro técnico desconhecido nunca vaza para o colaborador', () => {
        const msg = mensagemDoPortalColaborador(new Error('getRun: JSON object requested, multiple (or no) rows returned'));
        expect(msg).not.toMatch(/getRun|JSON|rows/);
        expect(msg).toMatch(/tente de novo/i);
    });

    it('aceita null/undefined/string sem quebrar', () => {
        expect(mensagemDoPortalColaborador(null)).toMatch(/tente de novo/i);
        expect(mensagemDoPortalColaborador(undefined)).toMatch(/tente de novo/i);
        expect(mensagemDoPortalColaborador('PORTAL_TOKEN_INVALIDO')).toMatch(/link/i);
    });
});
