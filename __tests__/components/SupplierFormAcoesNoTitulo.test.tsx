// @vitest-environment jsdom
/**
 * Minha Organização › Meus Fornecedores › edição do fornecedor.
 *
 * Pedido de 2026-10-28: "mover os botões de salvar, alterar e voltar para a
 * linha do título da tela e alinhado à direita".
 *
 * O que este teste trava:
 *  1. Voltar/Salvar vivem na MESMA linha do <h1> (não mais num rodapé do card);
 *  2. os botões ficam fora do <form> e mesmo assim salvam — o submit se liga ao
 *     formulário pelo atributo `form`;
 *  3. em edição o salvar nasce desligado (sem pendência) e liga ao editar;
 *  4. Salvar chama onSubmit; "Voltar" sem pendência chama onClose.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../services/supplierCategoryService', () => ({
    supplierCategoryService: { listCategories: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/organizationService', () => ({
    organizationService: { listOrganizations: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/supplierService', () => ({
    supplierService: { lookupCnpjRegistration: vi.fn(), syncRealEstateBrokerProfile: vi.fn() },
}));
vi.mock('../../lib/supabase', () => ({
    supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } },
}));
vi.mock('../../components/SupplierBankAccountsTab', () => ({ default: () => null }));
vi.mock('../../components/CityStateSelect', () => ({ default: () => null }));

import SupplierForm from '../../components/SupplierForm';
import { ConfirmProvider } from '../../components/ui/confirm';

const FORNECEDOR = {
    id: 'sup-1',
    code: 'FOR-001',
    name: 'Cimento Forte Ltda',
    type: 'PJ',
    category: 'Materiais',
    portal: 'Nenhum',
    organization_id: 'org-1',
    is_shared: false,
} as never;

const montar = (onSubmit = vi.fn().mockResolvedValue(true)) => {
    const onClose = vi.fn();
    render(
        <ConfirmProvider>
            <SupplierForm initialData={FORNECEDOR} onSubmit={onSubmit} onClose={onClose} />
        </ConfirmProvider>,
    );
    return { onSubmit, onClose };
};

describe('SupplierForm — ações na linha do título', () => {
    it('Voltar e Salvar ficam na mesma linha do <h1>, não no rodapé do card', () => {
        montar();
        const linhaDoTitulo = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement;
        expect(linhaDoTitulo).toContainElement(screen.getByRole('button', { name: 'Voltar' }));
        expect(linhaDoTitulo).toContainElement(screen.getByRole('button', { name: 'Salvar alterações' }));
    });

    it('os botões ficam fora do <form> e o submit se liga a ele pelo atributo form', () => {
        montar();
        const salvar = screen.getByRole('button', { name: 'Salvar alterações' });
        const formulario = document.querySelector('form') as HTMLFormElement;
        expect(formulario).not.toContainElement(salvar);
        expect(formulario.id).toBeTruthy();
        expect(salvar.getAttribute('form')).toBe(formulario.id);
    });

    it('em edição o Salvar nasce desligado e liga ao alterar um campo; clicar grava', async () => {
        const { onSubmit } = montar();
        const salvar = screen.getByRole('button', { name: 'Salvar alterações' });
        expect(salvar).toBeDisabled();

        const nome = screen.getByDisplayValue('Cimento Forte Ltda');
        fireEvent.change(nome, { target: { value: 'Cimento Forte S/A' } });
        expect(salvar).toBeEnabled();

        fireEvent.click(salvar);
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Cimento Forte S/A' });
    });

    it('Voltar sem pendência sai direto', async () => {
        const { onClose } = montar();
        fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
});
