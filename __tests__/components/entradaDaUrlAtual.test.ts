// @vitest-environment jsdom
/**
 * `entradaDaUrlAtual()` lê o endereço NA HORA (16/10/2026).
 *
 * A primeira versão genérica do efeito de rota em App.tsx memorizava a entrada na
 * carga da página. Um login recusado troca o endereço para "/" com replaceState, mas
 * o efeito continuava forçando o portal: a tela voltava ao login do mesmo portal com
 * o endereço em "/", e o seletor nunca aparecia (medido em produção com Playwright).
 *
 * Trava: depois do replaceState('/'), a entrada some; com ?token=, não há entrada
 * (o gate do link manda); voltar para a rota traz a entrada de novo.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { entradaDaUrlAtual } from '../../lib/entradasDoPortal';
import { ProfileGroup } from '../../types';

describe('entradaDaUrlAtual', () => {
    afterEach(() => { window.history.replaceState(null, '', '/'); });

    it('acompanha o replaceState: a recusa que troca para "/" faz a entrada sumir', () => {
        window.history.replaceState(null, '', '/portal-cliente');
        expect(entradaDaUrlAtual()?.grupo).toBe(ProfileGroup.CLIENT);
        window.history.replaceState(null, '', '/');
        expect(entradaDaUrlAtual()).toBeNull();
        window.history.replaceState(null, '', '/portal-corretor');
        expect(entradaDaUrlAtual()?.grupo).toBe(ProfileGroup.BROKER);
    });

    it('com ?token= não há entrada própria: o gate do link manda', () => {
        window.history.replaceState(null, '', '/portal-fornecedor?token=abc');
        expect(entradaDaUrlAtual()).toBeNull();
        window.history.replaceState(null, '', '/portal-fornecedor');
        expect(entradaDaUrlAtual()?.grupo).toBe(ProfileGroup.SUPPLIER);
    });

    it('rota que não é entrada própria → null', () => {
        window.history.replaceState(null, '', '/portal-investidor');
        expect(entradaDaUrlAtual()).toBeNull();
    });
});
