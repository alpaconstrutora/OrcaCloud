// @vitest-environment jsdom
/**
 * Botão "Preferências" no cabeçalho do estudo e o painel (plano docs/planos/2026-11-20-imovib-preferencias-estudo.md).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const pref = vi.hoisted(() => ({ exibir: false, set: vi.fn() }));
vi.mock('../../hooks/useImovibPreferencias', () => ({
    useImovibPreferencias: () => ({ exibirNaoVendaveis: pref.exibir, setExibirNaoVendaveis: pref.set, carregando: false }),
}));

import ImovibPreferenciasSheet from '../../components/ImovibPreferenciasSheet';
import { ConfirmProvider } from '../../components/ui/confirm';

beforeEach(() => { pref.exibir = false; pref.set.mockReset(); });

describe('ImovibPreferenciasSheet', () => {
    it('mostra a preferência de Receitas desligada por padrão e liga ao clicar', async () => {
        render(<ConfirmProvider><ImovibPreferenciasSheet open onClose={vi.fn()} /></ConfirmProvider>);
        expect(screen.getByText('Preferências do estudo de viabilidade')).toBeTruthy();
        const sw = screen.getByRole('checkbox', { name: 'Exibir unidades não vendáveis no empreendimento' }) as HTMLInputElement;
        expect(sw.checked).toBe(false);
        expect(screen.getByText('Desligado')).toBeTruthy();
        await userEvent.click(sw);
        expect(pref.set).toHaveBeenCalledWith(true);
    });

    it('ligada: o interruptor aparece ligado', () => {
        pref.exibir = true;
        render(<ConfirmProvider><ImovibPreferenciasSheet open onClose={vi.fn()} /></ConfirmProvider>);
        expect((screen.getByRole('checkbox', { name: 'Exibir unidades não vendáveis no empreendimento' }) as HTMLInputElement).checked).toBe(true);
        expect(screen.getByText('Ligado')).toBeTruthy();
    });
});
