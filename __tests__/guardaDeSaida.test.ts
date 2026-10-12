import { describe, it, expect, beforeEach } from 'vitest';
import { registrarPendencia, haPendenciaDeSaida, limparPendencias } from '../lib/guardaDeSaida';

/**
 * Registro global de edição não salva (lib/guardaDeSaida.ts), consultado pelo
 * menu (App.trocarDeTela), pelo voltar do navegador (useTabRouter) e no
 * fechar da aba (beforeunload).
 */
describe('guarda de saída — registro global', () => {
    beforeEach(() => limparPendencias());

    it('sem tela registrada, não há pendência', () => {
        expect(haPendenciaDeSaida()).toBe(false);
    });

    it('registrar e desregistrar por id', () => {
        registrarPendencia('premissas', true);
        expect(haPendenciaDeSaida()).toBe(true);
        registrarPendencia('premissas', false);
        expect(haPendenciaDeSaida()).toBe(false);
    });

    it('duas telas: só some quando as duas saem', () => {
        registrarPendencia('a', true);
        registrarPendencia('b', true);
        registrarPendencia('a', false);
        expect(haPendenciaDeSaida()).toBe(true);
        registrarPendencia('b', false);
        expect(haPendenciaDeSaida()).toBe(false);
    });

    it('limpar depois de o usuário confirmar o descarte', () => {
        registrarPendencia('a', true);
        limparPendencias();
        expect(haPendenciaDeSaida()).toBe(false);
    });
});
