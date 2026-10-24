// @vitest-environment jsdom
/**
 * `confirm({ hideCancel: true })` = aviso da própria tela no lugar de `window.alert`.
 * O alert nativo trava o navegador (e a automação) até alguém clicar OK — travou a
 * conferência das folhas em 24/10/2026 ("Re-sincronizar financeiro").
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfirmProvider, useConfirm, type ConfirmOptions } from '../../components/ui/confirm';

let abrir: ((o: ConfirmOptions) => Promise<boolean>) | null = null;
const Gancho = () => { abrir = useConfirm(); return null; };

describe('confirm › hideCancel', () => {
    it('mostra só o botão de confirmar e resolve true no OK', async () => {
        render(<ConfirmProvider><Gancho /></ConfirmProvider>);
        let p!: Promise<boolean>;
        act(() => { p = abrir!({ title: 'Financeiro re-sincronizado', message: 'linha 1\nlinha 2', confirmLabel: 'OK', hideCancel: true }); });

        expect(await screen.findByText('Financeiro re-sincronizado')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        await expect(p).resolves.toBe(true);
    });

    it('sem hideCancel, continua com os dois botões', async () => {
        render(<ConfirmProvider><Gancho /></ConfirmProvider>);
        let p!: Promise<boolean>;
        act(() => { p = abrir!({ title: 'Excluir?' }); });

        expect(await screen.findByRole('button', { name: 'Cancelar' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        await expect(p).resolves.toBe(false);
    });
});
