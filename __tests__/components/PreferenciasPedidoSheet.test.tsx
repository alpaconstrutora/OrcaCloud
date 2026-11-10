// @vitest-environment jsdom
/**
 * Suprimentos › Pedidos de Compra › Preferências (09/11/2026). O painel mostra
 * o valor herdado em cada campo vazio, deixa o membro comum só LER o padrão da
 * empresa (com o motivo) e grava só a camada que mudou.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

const estado = vi.hoisted(() => ({ papel: 'member' as 'member' | 'admin' }));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org-1' }),
    useDefaultWriteOrgId: () => 'org-1',
    useWritableOrganizations: () => [{ id: 'org-1', name: 'Alpa', members: [{ email: 'comprador@x.com', role: estado.papel }] }],
}));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: unknown) => unknown) => sel({ currentProfile: { email: 'comprador@x.com' }, organizations: [{ id: 'org-1', name: 'Alpa' }] }),
}));

const prefs = vi.hoisted(() => ({
    ler: vi.fn(),
    gravarEmpresa: vi.fn(async () => {}),
    gravarPessoal: vi.fn(async () => {}),
}));
vi.mock('../../services/pedidoPreferenciasService', () => ({ pedidoPreferenciasService: prefs }));
vi.mock('../../services/costCenterService', () => ({ costCenterService: { list: vi.fn(async () => []) } }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listPlanoContas: vi.fn(async () => []),
        listPaymentAccounts: vi.fn(async () => [{ id: 'conta-1', name: 'Sicredi 1234' }]),
    },
}));

import PreferenciasPedidoSheet from '../../components/suprimentos/PreferenciasPedidoSheet';

const montar = () => render(<PreferenciasPedidoSheet open onClose={() => {}} notify={() => {}} />);

describe('PreferenciasPedidoSheet', () => {
    beforeEach(() => {
        estado.papel = 'member';
        prefs.ler.mockResolvedValue({ empresa: { paymentMethod: 'Pix', paymentAccountId: 'conta-1' }, pessoal: {} });
        prefs.gravarEmpresa.mockClear();
        prefs.gravarPessoal.mockClear();
    });

    it('membro comum: padrão da empresa só leitura, com o motivo', async () => {
        montar();
        const forma = await screen.findByLabelText('Forma de pagamento') as HTMLSelectElement;
        expect(forma.value).toBe('Pix');
        expect(forma).toBeDisabled();
        expect(screen.getByText(/Só administradores da organização alteram o padrão da empresa/)).toBeInTheDocument();
    });

    it('"Meu padrão": vazio mostra o que vem da empresa; grava só a camada pessoal', async () => {
        montar();
        await screen.findByLabelText('Forma de pagamento');
        fireEvent.click(screen.getByRole('tab', { name: /Meu padrão/ }));

        const forma = screen.getByLabelText('Forma de pagamento') as HTMLSelectElement;
        expect(forma).toBeEnabled();
        expect(forma.value).toBe('');
        expect(forma.options[0].textContent).toBe('Seguir a empresa — Pix');
        expect((screen.getByLabelText('Conta de pagamento') as HTMLSelectElement).options[0].textContent)
            .toBe('Seguir a empresa — Sicredi 1234');

        fireEvent.change(forma, { target: { value: 'Boleto' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
        await waitFor(() => expect(prefs.gravarPessoal).toHaveBeenCalledWith('org-1', { paymentMethod: 'Boleto' }));
        expect(prefs.gravarEmpresa).not.toHaveBeenCalled();
    });

    it('gestor edita o padrão da empresa; Salvar desligado diz por quê enquanto nada mudou', async () => {
        estado.papel = 'admin';
        montar();
        const forma = await screen.findByLabelText('Forma de pagamento') as HTMLSelectElement;
        expect(forma).toBeEnabled();
        const salvar = screen.getByRole('button', { name: /Salvar/ });
        expect(salvar).toBeDisabled();
        expect(salvar.parentElement).toHaveAttribute('title', 'Nada mudou');

        fireEvent.change(screen.getByLabelText('Prazo de entrega (dias após o pedido)'), { target: { value: '7' } });
        fireEvent.click(salvar);
        await waitFor(() => expect(prefs.gravarEmpresa).toHaveBeenCalledWith('org-1', { paymentMethod: 'Pix', paymentAccountId: 'conta-1', prazoEntregaDias: 7 }));
    });
});
