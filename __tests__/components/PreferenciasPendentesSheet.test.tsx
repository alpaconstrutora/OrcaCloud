// @vitest-environment jsdom
/**
 * Conciliação › Pendentes › Preferências (pedido de 23/11/2026): o modo de visualização
 * (Linha / Compacto / Grade) saiu da tela para o drawer. Uma escolha só, marcada, e o clique
 * devolve o modo.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import PreferenciasPendentesSheet from '../../components/reconciliation/PreferenciasPendentesSheet';
import { ConfirmProvider } from '../../components/ui/confirm';

describe('PreferenciasPendentesSheet', () => {
    it('mostra os três modos e marca o atual', () => {
        render(<ConfirmProvider><PreferenciasPendentesSheet open onClose={vi.fn()} modo="compacto" onModo={vi.fn()} /></ConfirmProvider>);
        const opcoes = screen.getAllByRole('radio');
        expect(opcoes).toHaveLength(3);
        ['Linha', 'Compacto', 'Grade'].forEach((rotulo, i) => expect(opcoes[i].textContent).toMatch(new RegExp(`^${rotulo}`)));
        expect(screen.getByRole('radio', { name: /Compacto/ }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('radio', { name: /Linha/ }).getAttribute('aria-checked')).toBe('false');
    });

    it('clicar num modo devolve a escolha', () => {
        const onModo = vi.fn();
        render(<ConfirmProvider><PreferenciasPendentesSheet open onClose={vi.fn()} modo="linha" onModo={onModo} /></ConfirmProvider>);
        fireEvent.click(screen.getByRole('radio', { name: /Grade/ }));
        expect(onModo).toHaveBeenCalledWith('grade');
    });
});
