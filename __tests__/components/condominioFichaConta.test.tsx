// @vitest-environment jsdom
/**
 * Condomínio › Ficha: "Conta do condomínio" (27/11/2026).
 * Plano: docs/planos/2026-11-27-condominio-conta-de-recebimento.md
 *
 * O que fica travado:
 *  1. o campo lista as contas de Minha Organização › Contas agrupadas por organização,
 *     e "Salvar ficha" manda a escolhida (e "Nenhuma" manda null);
 *  2. condomínio sem organização própria: campo desligado com o motivo, e a ficha não manda o campo;
 *  3. trocar uma conta de OUTRA org avisa que ela continua atendendo o condomínio (opção "a", 27/11).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const empSvc = vi.hoisted(() => ({ salvarFichaCondominio: vi.fn() }));
const rateioSvc = vi.hoisted(() => ({ getCentrosDeCusto: vi.fn(), listarDisponiveis: vi.fn() }));
const regSvc = vi.hoisted(() => ({ listPaymentAccounts: vi.fn() }));
const cliSvc = vi.hoisted(() => ({ listClients: vi.fn() }));
vi.mock('../../services/empreendimentoService', async (orig) => ({
    ...(await orig<typeof import('../../services/empreendimentoService')>()), empreendimentoService: empSvc,
}));
vi.mock('../../services/condominioRateioService', async (orig) => ({
    ...(await orig<typeof import('../../services/condominioRateioService')>()), condominioRateioService: rateioSvc,
}));
vi.mock('../../services/financialRegistryService', async (orig) => ({
    ...(await orig<typeof import('../../services/financialRegistryService')>()), financialRegistryService: regSvc,
}));
vi.mock('../../services/clientService', async (orig) => ({
    ...(await orig<typeof import('../../services/clientService')>()), clientService: cliSvc,
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import CondominioDetail from '../../components/condominio/CondominioDetail';
import { useStore } from '../../store/useStore';
import { MOTIVO_SEM_ORG_PROPRIA } from '../../utils/contaDoCondominio';
import type { Empreendimento } from '../../types/empreendimento';

const BASE = { id: 'e1', name: '007 - Bella Vista', organization_id: 'alpa', condominio_org_id: 'bv' } as unknown as Empreendimento;

beforeEach(() => {
    [empSvc, rateioSvc, regSvc, cliSvc].forEach(s => Object.values(s).forEach(f => f.mockReset()));
    empSvc.salvarFichaCondominio.mockResolvedValue(undefined);
    rateioSvc.getCentrosDeCusto.mockResolvedValue([]);
    rateioSvc.listarDisponiveis.mockResolvedValue([]);
    cliSvc.listClients.mockResolvedValue([]);
    regSvc.listPaymentAccounts.mockResolvedValue([
        { id: 'sic', name: 'Sicredi', bank: '', organization_id: 'alpa', is_active: true },
        { id: 'cx', name: 'Caixa do condomínio', bank: '', organization_id: 'bv', is_active: true },
    ]);
    useStore.setState({ organizations: [
        { id: 'alpa', name: 'Alpa Construtora' }, { id: 'bv', name: 'Condomínio Bella Vista' },
    ] as never });
});

const montar = (e: Empreendimento) =>
    render(<ConfirmProvider><CondominioDetail empreendimento={e} onBack={() => {}} /></ConfirmProvider>);

describe('Ficha › Conta do condomínio', () => {
    it('1. lista agrupada por organização e salva a escolhida', async () => {
        montar(BASE);
        const campo = await screen.findByLabelText('Conta') as HTMLSelectElement;
        await waitFor(() => expect(campo.querySelectorAll('optgroup').length).toBe(2));
        expect([...campo.querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Alpa Construtora', 'Condomínio Bella Vista']);

        fireEvent.change(campo, { target: { value: 'sic' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar ficha/ }));
        await waitFor(() => expect(empSvc.salvarFichaCondominio).toHaveBeenCalled());
        expect(empSvc.salvarFichaCondominio.mock.calls[0][1]).toMatchObject({ condominio_payment_account_id: 'sic' });

        fireEvent.change(campo, { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar ficha/ }));
        await waitFor(() => expect(empSvc.salvarFichaCondominio).toHaveBeenCalledTimes(2));
        expect(empSvc.salvarFichaCondominio.mock.calls[1][1]).toMatchObject({ condominio_payment_account_id: null });
    });

    it('3. limpar a conta de outra org avisa que ela continua atendendo o condomínio', async () => {
        montar({ ...BASE, condominio_payment_account_id: 'sic' } as Empreendimento);
        const campo = await screen.findByLabelText('Conta') as HTMLSelectElement;
        await waitFor(() => expect(campo.value).toBe('sic'));
        fireEvent.change(campo, { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar ficha/ }));
        expect(await screen.findByText(/A conta Sicredi \(Alpa Construtora\) continua atendendo Condomínio Bella Vista/)).toBeTruthy();
    });

    it('2. sem organização própria: desligado com o motivo e a ficha não manda o campo', async () => {
        montar({ ...BASE, condominio_org_id: null } as Empreendimento);
        const campo = await screen.findByLabelText('Conta') as HTMLSelectElement;
        expect(campo.disabled).toBe(true);
        expect(campo.closest('div')?.getAttribute('title')).toBe(MOTIVO_SEM_ORG_PROPRIA);
        fireEvent.click(screen.getByRole('button', { name: /Salvar ficha/ }));
        await waitFor(() => expect(empSvc.salvarFichaCondominio).toHaveBeenCalled());
        expect(empSvc.salvarFichaCondominio.mock.calls[0][1]).not.toHaveProperty('condominio_payment_account_id');
    });
});
