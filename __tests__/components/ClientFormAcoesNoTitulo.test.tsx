// @vitest-environment jsdom
/**
 * Minha Organização › Meus Clientes › edição do cliente.
 *
 * Pedido de 13/11/2026: "Mover botões voltar e salvar alterações para o topo,
 * na linha do título da tela, alinhado a direita." Mesmo molde de Meus
 * Fornecedores (`SupplierFormAcoesNoTitulo.test.tsx`).
 *
 * O que este teste trava:
 *  1. Voltar/Salvar vivem na MESMA linha do <h1> (não mais num rodapé do card);
 *  2. os botões ficam fora do <form> e mesmo assim salvam — o submit se liga ao
 *     formulário pelo atributo `form`, de qualquer aba;
 *  3. em edição o salvar nasce desligado (sem pendência, com o motivo no title)
 *     e liga ao editar;
 *  4. "Voltar" sem pendência chama onClose.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/clientCategoryService', () => ({
    clientCategoryService: { list: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Vendas' }]) },
}));
vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/clientEmpreendimentoService', () => ({
    clientEmpreendimentoService: { listIdsByClient: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/masterDataService', () => ({
    masterDataService: { listStates: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../lib/supabase', () => ({
    supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } },
}));
vi.mock('../../components/CityStateSelect', () => ({ default: () => null }));

import ClientForm from '../../components/ClientForm';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';

const CLIENTE = {
    id: 'cli-1',
    code: 'CLI-001',
    name: 'Filtrelec',
    type: 'PJ',
    category: 'Vendas',
    portal: 'Nenhum',
    organization_id: 'org-1',
} as never;

const montar = (onSubmit = vi.fn().mockImplementation(async (d: object) => ({ ...(CLIENTE as object), ...d }))) => {
    const onClose = vi.fn();
    render(
        <ConfirmProvider>
            <ClientForm initialData={CLIENTE} onSubmit={onSubmit} onClose={onClose} />
        </ConfirmProvider>,
    );
    return { onSubmit, onClose };
};

describe('ClientForm — ações na linha do título', () => {
    beforeEach(() => {
        useStore.setState({ organizations: [], activeOrganizationId: 'org-1', activeEmpresaId: null } as never);
    });

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

    it('em edição o Salvar nasce desligado (com o motivo) e liga ao alterar; clicar grava de outra aba', async () => {
        const { onSubmit } = montar();
        const salvar = screen.getByRole('button', { name: 'Salvar alterações' });
        expect(salvar).toBeDisabled();
        expect(salvar).toHaveAttribute('title', 'Nenhuma alteração para salvar');

        fireEvent.change(screen.getByDisplayValue('Filtrelec'), { target: { value: 'Filtrelec Comercio e Importação' } });
        expect(salvar).toBeEnabled();

        // Troca de aba: o salvar continua na linha do título e grava o cadastro inteiro.
        fireEvent.click(screen.getByRole('tab', { name: 'Endereços e contatos' }));
        fireEvent.click(salvar);
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Filtrelec Comercio e Importação' });
    });

    it('Voltar sem pendência sai direto', async () => {
        const { onClose } = montar();
        fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
});
