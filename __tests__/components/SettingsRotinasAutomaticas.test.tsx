// @vitest-environment jsdom
/**
 * Configurações › folha "Rotinas automáticas" — só aparece para superadmin.
 * Plano: docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md (Task 5).
 * (O banco recusa as RPCs para os demais; aqui é só o menu não oferecer o que não abre.)
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const souSuperadmin = vi.fn();
vi.mock('../../services/rotinasAutomaticasService', () => ({
    rotinasAutomaticasService: { souSuperadmin: (...a: unknown[]) => souSuperadmin(...a) },
}));
// a tela da folha e a folha inicial não interessam aqui
vi.mock('../../components/settings/RotinasAutomaticasSettings', () => ({ default: () => <div>tela das rotinas</div> }));
vi.mock('../../components/settings/NomenclaturaTable', () => ({ default: () => <div>nomenclatura</div> }));

import Settings from '../../components/Settings';
import { ConfirmProvider } from '../../components/ui/confirm';

const montar = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

describe('Settings › Rotinas automáticas', () => {
    beforeEach(() => { souSuperadmin.mockReset(); localStorage.clear(); });

    it('superadmin vê a folha e abre a tela', async () => {
        souSuperadmin.mockResolvedValue(true);
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('button', { name: /Rotinas automáticas/ }));
        expect(await screen.findByText('tela das rotinas')).toBeTruthy();
    });

    it('quem não é superadmin não vê a folha', async () => {
        souSuperadmin.mockResolvedValue(false);
        montar();
        await waitFor(() => expect(souSuperadmin).toHaveBeenCalled());
        await screen.findByText('nomenclatura');
        expect(screen.queryByRole('button', { name: /Rotinas automáticas/ })).toBeNull();
    });
});
