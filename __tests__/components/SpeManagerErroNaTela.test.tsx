// @vitest-environment jsdom
/**
 * Gestão de SPEs — falha aparece na tela, não só no console (26/10/2026).
 *
 * Desde o PR #184 o incremento de capital (`increment_spe_capital_call/paid`)
 * recusa com 42501 quem não é owner/admin, em vez de não gravar nada calado. Mas
 * o `SpeManager` só fazia `console.error` no catch de "Chamar/Pagar", de excluir
 * SPE e da carga inicial: o botão "não fazia nada", e a carga que falhava
 * mostrava "Nenhuma SPE cadastrada" — mentira sobre os dados. Excluir SPE também
 * apagava sem perguntar (guia §14).
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const speService = vi.hoisted(() => ({
    list: vi.fn(),
    listPartners: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    savePartner: vi.fn(),
    removePartner: vi.fn(),
    addCapitalCall: vi.fn(),
}));
const investorService = vi.hoisted(() => ({ listInvestors: vi.fn() }));

vi.mock('../../services/speService', () => ({ speService }));
vi.mock('../../services/investorService', () => ({ investorService }));
vi.mock('../../components/investor/CapitalCallPanel', () => ({ default: () => null }));

import SpeManager from '../../components/investor/SpeManager';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ToastProvider } from '../../components/ui/toast';

const SPE = { id: 'spe-1', organization_id: 'org-1', name: 'SPE Cambuí I', cnpj: '', capital_social: 1000 };
const SOCIO = {
    id: 'p-1', spe_entity_id: 'spe-1', investor_id: 'inv-1', quota_count: 1, ownership_pct: 100,
    capital_calls_total: 0, capital_paid: 0, investor_name: 'Maria Investidora', investor_email: 'maria@x.com',
};
const ERRO_RLS = { message: 'Sócio de SPE não encontrado ou sem permissão para alterá-lo', code: '42501' };

const montar = () => render(
    <ConfirmProvider>
        <ToastProvider>
            <SpeManager organizationId="org-1" isAdmin />
        </ToastProvider>
    </ConfirmProvider>,
);

const abrirSpe = async () => {
    fireEvent.click(await screen.findByText('SPE Cambuí I'));
    await screen.findByText('Maria Investidora');
};

beforeEach(() => {
    Object.values(speService).forEach(f => f.mockReset());
    investorService.listInvestors.mockReset().mockResolvedValue([]);
    speService.list.mockResolvedValue([SPE]);
    speService.listPartners.mockResolvedValue([SOCIO]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('SpeManager — erro na tela', () => {
    // Fase C2 (plano 2026-11-21-portal-do-investidor-consolidacao): "Chamar/Pagar" manual saiu — mexia no
    // chamado/integralizado sem chamada e sem aporte no extrato. O capital só se move pelas chamadas de capital.
    it('a tabela de sócios não tem mais chamar/pagar manual', async () => {
        const { container } = montar();
        await abrirSpe();
        expect(container.querySelector('td input')).toBeNull();
        expect(screen.queryByRole('option', { name: 'Pagar' })).toBeNull();
        expect(screen.queryByLabelText(/Registrar pagamento de capital/)).toBeNull();
        expect(speService.addCapitalCall).not.toHaveBeenCalled();
    });

    it('carga que falha NÃO diz "Nenhuma SPE cadastrada" e oferece tentar de novo', async () => {
        speService.list.mockRejectedValueOnce({ message: 'Failed to fetch' });
        montar();

        expect(await screen.findByText(/não foi possível carregar as SPEs/i)).toBeTruthy();
        expect(screen.queryByText('Nenhuma SPE cadastrada.')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
        expect(await screen.findByText('SPE Cambuí I')).toBeTruthy();
    });

    it('excluir SPE pergunta antes; cancelar não apaga', async () => {
        montar();
        fireEvent.click(await screen.findByTitle('Excluir'));

        fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull());
        expect(speService.remove).not.toHaveBeenCalled();
        expect(screen.getByText('SPE Cambuí I')).toBeTruthy();
    });

    it('exclusão que falha mantém a SPE na lista e mostra o erro', async () => {
        speService.remove.mockRejectedValue({ message: 'new row violates row-level security policy', code: '42501' });
        montar();
        fireEvent.click(await screen.findByTitle('Excluir'));
        const confirmar = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' });
        await act(async () => { fireEvent.click(confirmar); });

        expect(await screen.findByText(/proprietário ou administrador/i)).toBeTruthy();
        expect(screen.getByText('SPE Cambuí I')).toBeTruthy();
    });

    it('falha ao abrir os sócios aparece na tela', async () => {
        speService.listPartners.mockRejectedValue({ message: 'Failed to fetch' });
        montar();
        const cabecalho = await screen.findByText('SPE Cambuí I');
        await act(async () => { fireEvent.click(cabecalho); });

        expect(await screen.findByText(/não foi possível carregar os sócios/i)).toBeTruthy();
    });
});
