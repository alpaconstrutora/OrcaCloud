// @vitest-environment jsdom
/**
 * Renovações num lugar só (plano docs/planos/2026-11-25-renovacoes-e-reajustes-um-lugar.md):
 *  - item 2: na fila, Renovar e Editar abrem a gaveta AQUI (não a negociação);
 *  - item 4: a negociação mostra só a situação da vigência, com atalho para cá.
 * Caso real: CTL-006-012-0001 depois do AD-004 (25/11/2026).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const CTL = {
    id: 'c1', number: 'CTL-006-012-0001', title: 'Contrato de Locação — Salão', status: 'Ativo', client_id: 'cl1',
    start_date: '2016-09-23', end_date: '2021-09-22', current_value: 5832.48, reajuste_index: 'IGP-M',
    reajuste_proximo: '2020-11-05', days_until_end: -1890, renewed: false, negociacaoId: 'neg1',
    last_addendum: { id: 'ad4', number: 'AD-004' },
};
const AD4 = { id: 'ad4', contract_id: 'c1', number: 'AD-004', status: 'Aprovado', new_start_date: '2020-03-23', new_end_date: '2021-09-22', created_at: '2026-11-25T19:28:00Z' };
const AD3 = { ...AD4, id: 'ad3', number: 'AD-003', new_start_date: '2019-03-23', new_end_date: '2020-03-22', created_at: '2026-11-25T18:51:00Z' };

vi.mock('../../services/contractRenewalService', async (original) => ({
    ...(await original<typeof import('../../services/contractRenewalService')>()),
    contractRenewalService: {
        listRentalsExpiring: vi.fn(async () => [CTL]),
        getRenewalChain: vi.fn(async () => [CTL]),
        // a gaveta pede a prévia; aqui basta ela não responder
        previewRenewal: vi.fn(() => new Promise(() => {})),
    },
}));
vi.mock('../../services/contractService', () => ({
    contractService: {
        getAddendumById: vi.fn(async () => AD4),
        // do mais recente para o mais antigo, como o serviço
        listAddendums: vi.fn(async () => [AD4, AD3, { ...AD3, id: 'ad2', number: 'AD-002', status: 'Cancelado' }]),
    },
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import RentalRenewals from '../../components/rentals/RentalRenewals';
import SituacaoDaVigencia from '../../components/rentals/SituacaoDaVigencia';
import type { Contract } from '../../types';

beforeEach(() => { localStorage.clear(); });

describe('Fila de renovações — a gaveta abre aqui', () => {
    it('Renovar abre a gaveta de renovação, sem abrir a negociação', async () => {
        const abrirNegociacao = vi.fn();
        render(<ConfirmProvider><RentalRenewals organizationId="org1" onOpenContract={abrirNegociacao} /></ConfirmProvider>);
        fireEvent.click(await screen.findByRole('button', { name: 'Renovar' }));
        expect(await screen.findByText('Renovar contrato')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Gerar aditivo' })).toBeTruthy();
        expect(abrirNegociacao).not.toHaveBeenCalled();
    });

    it('Editar o AD-004 abre a gaveta em modo edição', async () => {
        const abrirNegociacao = vi.fn();
        render(<ConfirmProvider><RentalRenewals organizationId="org1" onOpenContract={abrirNegociacao} /></ConfirmProvider>);
        fireEvent.click(await screen.findByRole('button', { name: 'Editar o aditivo AD-004' }));
        expect(await screen.findByText('Editar renovação AD-004')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy();
        expect(abrirNegociacao).not.toHaveBeenCalled();
    });

    it('Ver contrato continua abrindo a negociação', async () => {
        const abrirNegociacao = vi.fn();
        render(<ConfirmProvider><RentalRenewals organizationId="org1" onOpenContract={abrirNegociacao} /></ConfirmProvider>);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver contrato' }));
        expect(abrirNegociacao).toHaveBeenCalledWith('c1');
    });
});

describe('Negociação — situação da vigência, só leitura', () => {
    it('CTL-006: vigência, última renovação e próximo reajuste, com atalho para as abas', async () => {
        const irPara = vi.fn();
        render(<SituacaoDaVigencia contract={CTL as unknown as Contract} onIrPara={irPara} />);
        expect(await screen.findByText('Vigência até 22/09/2021 · última renovação AD-004 · próximo reajuste 05/11/2020')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Renovações' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reajustes' }));
        expect(irPara.mock.calls).toEqual([['renewals'], ['reajustes']]);
    });

    it('fora da Gestão de Unidades: sem atalho, diz onde ficam', async () => {
        render(<SituacaoDaVigencia contract={CTL as unknown as Contract} />);
        await waitFor(() => expect(screen.getByText(/última renovação AD-004/)).toBeTruthy());
        expect(screen.getByText('Renovações e reajustes ficam em Gestão de Unidades.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Renovações' })).toBeNull();
    });
});
