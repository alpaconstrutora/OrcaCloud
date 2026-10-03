// @vitest-environment jsdom
/**
 * Portal escolhido no login — `selectLoginGroupForRoute` escolhe SÓ em memória.
 *
 * 03/10/2026: a rota /portal-parceiro gravava o portal do parceiro no navegador
 * (`orca_selectedLoginGroup = PARCEIRO`). Quem abriu o link do convite ficou com
 * ele marcado; a conta interna, reservada para Desenvolvedor, entrava pela tela
 * do parceiro, era recusada e voltava à mesma tela ("entra e cai"). A rota passou
 * a usar esta ação, que não grava nada. A escolha feita no seletor continua
 * gravando, como sempre.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../store/useStore';
import { ProfileGroup } from '../../types';

describe('useStore — portal escolhido no login', () => {
    beforeEach(() => {
        localStorage.clear();
        useStore.setState({ selectedLoginGroup: null });
    });

    it('selectLoginGroupForRoute escolhe o portal sem gravar no navegador', () => {
        useStore.getState().selectLoginGroupForRoute(ProfileGroup.PARTNER);
        expect(useStore.getState().selectedLoginGroup).toBe(ProfileGroup.PARTNER);
        expect(localStorage.getItem('orca_selectedLoginGroup')).toBeNull();
    });

    it('não apaga a escolha já gravada pelo seletor', () => {
        useStore.getState().setSelectedLoginGroup(ProfileGroup.DEVELOPER);
        useStore.getState().selectLoginGroupForRoute(ProfileGroup.PARTNER);
        expect(localStorage.getItem('orca_selectedLoginGroup')).toBe(ProfileGroup.DEVELOPER);
    });

    it('setSelectedLoginGroup (seletor) continua gravando e limpando', () => {
        useStore.getState().setSelectedLoginGroup(ProfileGroup.USER);
        expect(localStorage.getItem('orca_selectedLoginGroup')).toBe(ProfileGroup.USER);
        useStore.getState().setSelectedLoginGroup(null);
        expect(localStorage.getItem('orca_selectedLoginGroup')).toBeNull();
    });
});
