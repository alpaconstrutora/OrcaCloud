// @vitest-environment jsdom
/**
 * Unidade de medida nova (21/11/2026): "implemente opção para criação de nova unidade de medida".
 * No cadastro de equivalência do item, a unidade sai do cadastro mestre num combobox criável
 * (guia §7.1.2): digitar uma que não existe oferece "Cadastrar", que abre o formulário de
 * unidade nova; criada, ela já fica escolhida. Plano: docs/planos/2026-11-21-unidade-de-medida-nova.md.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    listUnits: vi.fn(),
    addUnit: vi.fn(),
    salvar: vi.fn(),
}));
vi.mock('../../services/masterDataService', () => ({
    masterDataService: { listUnits: svc.listUnits, addUnit: svc.addUnit },
}));
vi.mock('../../services/equivalenciaUnidadesService', () => ({
    equivalenciaUnidadesService: { salvar: svc.salvar, excluir: vi.fn() },
}));
vi.mock('../../hooks/useEquivalencias', () => ({
    useEquivalencias: () => ({ equivalencias: new Map(), recarregar: vi.fn() }),
}));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import { EquivalenciasDoItem } from '../../components/database/EquivalenciasDoItem';

const notify = vi.fn();
const montar = () => render(<EquivalenciasDoItem code="32" unidadeDoItem="KG" podeEditar notify={notify} />);
const digitarUnidade = (texto: string) => {
    const campo = screen.getByRole('combobox');
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: texto } });
};
const adicionar = () => screen.getByRole('button', { name: /Adicionar/ });

describe('Equivalência — unidade de medida nova', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        svc.listUnits.mockResolvedValue([
            { id: 'u-m', symbol: 'm', name: 'Metro', category: 'comprimento', is_active: true },
            { id: 'u-br', symbol: 'br', name: 'Barra', category: 'comprimento', is_active: true },
        ]);
        svc.addUnit.mockImplementation(async (i: { symbol: string; name: string; category: string }) =>
            ({ id: 'u-novo', symbol: i.symbol, name: i.name, category: i.category, is_active: true }));
        svc.salvar.mockResolvedValue(undefined);
    });

    it('digitar uma unidade que não existe → Cadastrar → cria no mestre e já fica escolhida', async () => {
        montar();
        await waitFor(() => expect(svc.listUnits).toHaveBeenCalled());
        digitarUnidade('tb');
        expect(adicionar().closest('[title]')?.getAttribute('title')).toMatch(/não existe/);

        fireEvent.click(screen.getByRole('button', { name: /Cadastrar/ }));
        expect((screen.getByLabelText('Símbolo') as HTMLInputElement).value).toBe('tb');
        fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Tubo' } });
        fireEvent.change(screen.getByLabelText('Grandeza'), { target: { value: 'comprimento' } });
        fireEvent.click(screen.getByRole('button', { name: /Criar unidade/ }));

        await waitFor(() => expect(svc.addUnit).toHaveBeenCalledWith({ symbol: 'tb', name: 'Tubo', category: 'comprimento' }));
        await waitFor(() => expect(screen.queryByLabelText('Grandeza')).toBeNull());
        expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('TB');

        fireEvent.change(screen.getByLabelText(/quantos KG/), { target: { value: '6' } });
        fireEvent.click(adicionar());
        await waitFor(() => expect(svc.salvar).toHaveBeenCalledWith(expect.objectContaining({ itemCode: '32', unidadeBase: 'KG', unidade: 'TB', fator: 6 })));
    });

    it('o apelido de uma unidade que já existe vale sem cadastrar ("barra" = BR)', async () => {
        montar();
        await waitFor(() => expect(svc.listUnits).toHaveBeenCalled());
        digitarUnidade('barra');
        fireEvent.change(screen.getByLabelText(/quantos KG/), { target: { value: '2,94' } });
        fireEvent.click(adicionar());
        await waitFor(() => expect(svc.salvar).toHaveBeenCalledWith(expect.objectContaining({ unidade: 'BR', fator: 2.94 })));
        expect(svc.addUnit).not.toHaveBeenCalled();
    });

    it('não deixa criar unidade repetida: o botão desligado diz por quê', async () => {
        montar();
        await waitFor(() => expect(svc.listUnits).toHaveBeenCalled());
        digitarUnidade('tb');
        fireEvent.click(screen.getByRole('button', { name: /Cadastrar/ }));
        fireEvent.change(screen.getByLabelText('Símbolo'), { target: { value: 'Barra' } });
        fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Barra de novo' } });
        fireEvent.change(screen.getByLabelText('Grandeza'), { target: { value: 'comprimento' } });
        const criar = screen.getByRole('button', { name: /Criar unidade/ });
        expect((criar as HTMLButtonElement).disabled).toBe(true);
        expect(criar.closest('[title]')?.getAttribute('title')).toMatch(/BR, que já existe/);
    });
});
