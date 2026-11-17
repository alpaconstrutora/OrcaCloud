// @vitest-environment jsdom
/**
 * Configurações › menu das seções abaixo de `lg` (celular e tablet): recolhe atrás de um botão
 * que diz a seção atual. De `lg` para cima, a árvore lateral fica como sempre (guia §19.2).
 * Plano: docs/planos/2026-11-17-rotinas-itens-de-fora.md (Tarefa 2).
 * jsdom não aplica media query: aqui se prova o estado (aria-expanded, classe `hidden`) e as
 * classes de breakpoint; a largura de verdade é conferida no navegador.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/rotinasAutomaticasService', () => ({
    rotinasAutomaticasService: { souSuperadmin: () => Promise.resolve(false) },
}));
// as telas das folhas não interessam aqui
vi.mock('../../components/settings/NomenclaturaTable', () => ({ default: () => <div>nomenclatura</div> }));
vi.mock('../../components/InssBracketsSettings', () => ({ default: () => <div>tela do inss</div> }));

import Settings from '../../components/Settings';
import { ConfirmProvider } from '../../components/ui/confirm';

const montar = async () => {
    render(<ConfirmProvider><Settings /></ConfirmProvider>);
    await screen.findByText('nomenclatura');
};
const botaoMenu = () => screen.getByRole('button', { name: /^Seção:/ });
const lista = () => screen.getByRole('navigation', { name: 'Seções das configurações' });
const fechada = (el: HTMLElement) => el.className.split(/\s+/).includes('hidden');

describe('Settings › menu das seções no celular', () => {
    beforeEach(() => { localStorage.clear(); });

    it('começa fechado, atrás de um botão que diz a seção atual e controla a lista', async () => {
        const user = userEvent.setup();
        await montar();
        const b = botaoMenu();
        expect(b.getAttribute('aria-expanded')).toBe('false');
        expect(b.textContent).toMatch(/Seção:\s*Nomenclatura/);
        expect(b.getAttribute('aria-controls')).toBe(lista().id);
        expect(fechada(lista())).toBe(true);

        await user.click(b);
        expect(b.getAttribute('aria-expanded')).toBe('true');
        expect(fechada(lista())).toBe(false);
    });

    it('escolher uma seção fecha o menu e troca o nome do botão', async () => {
        const user = userEvent.setup();
        await montar();
        await user.click(botaoMenu());
        await user.click(screen.getByRole('button', { name: 'Banco de Dados' }));
        expect(botaoMenu().getAttribute('aria-expanded')).toBe('false');
        expect(fechada(lista())).toBe(true);
        expect(botaoMenu().textContent).toMatch(/Seção:\s*Banco de Dados$/);
        expect(screen.getByText('Banco de Dados SINAPI')).toBeTruthy();
    });

    it('abrir um grupo não fecha o menu; a folha do grupo leva o nome do grupo no botão', async () => {
        const user = userEvent.setup();
        await montar();
        await user.click(botaoMenu());
        await user.click(screen.getByRole('button', { name: 'Tributos e Impostos' }));
        expect(botaoMenu().getAttribute('aria-expanded')).toBe('true');
        await user.click(screen.getByRole('button', { name: 'INSS' }));
        expect(botaoMenu().getAttribute('aria-expanded')).toBe('false');
        expect(botaoMenu().textContent).toMatch(/Seção:\s*Tributos e Impostos › INSS$/);
        expect(await screen.findByText('tela do inss')).toBeTruthy();
    });

    it('pelo teclado: escolher a seção devolve o foco ao botão (a lista some e levaria o foco junto)', async () => {
        const user = userEvent.setup();
        await montar();
        botaoMenu().focus();
        await user.keyboard('{Enter}');
        expect(botaoMenu().getAttribute('aria-expanded')).toBe('true');
        screen.getByRole('button', { name: 'Banco de Dados' }).focus();
        await user.keyboard('{Enter}');
        expect(botaoMenu().getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(botaoMenu());
    });

    it('de lg para cima a árvore fica sempre à vista, ao lado da folha, e o botão some', async () => {
        await montar();
        expect(botaoMenu().className.split(/\s+/)).toContain('lg:hidden');
        expect(lista().className.split(/\s+/)).toContain('lg:flex');
        const caixa = lista().closest('aside') as HTMLElement;
        expect(caixa.className.split(/\s+/)).toEqual(expect.arrayContaining(['w-full', 'lg:w-64']));
        expect((caixa.parentElement as HTMLElement).className.split(/\s+/))
            .toEqual(expect.arrayContaining(['flex-col', 'lg:flex-row']));
    });
});
