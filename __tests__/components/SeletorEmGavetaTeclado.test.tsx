// @vitest-environment jsdom
import '@testing-library/jest-dom';
/**
 * Seletores em gaveta pelo teclado (28/10/2026, crítica 2 da Central de Clientes).
 *
 * 1. As linhas eram `<tr onClick>` sem foco: escolher cliente/fornecedor sem
 *    mouse era impossível — contra o "teclado completo" do PRODUCT.md.
 * 2. O `SupplierSelect` focava a busca com `autoFocus`, que dispara na MONTAGEM —
 *    com o Sheet ainda fechado (`inert` desde o #213) o navegador recusava, e a
 *    busca abria sem cursor. O foco agora vai quando a gaveta termina de abrir.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import ClientSelect from '../../components/ClientSelect';
import SupplierSelect from '../../components/SupplierSelect';
import { ConfirmProvider } from '../../components/ui/confirm';

const CLIENTES = [
    { id: 'a', name: 'Ana Souza', document: '111.111.111-11' },
    { id: 'b', name: 'Bruno Lima', document: '222.222.222-22' },
];

const abrirCliente = async (props: Partial<React.ComponentProps<typeof ClientSelect>> = {}) => {
    const onChange = vi.fn();
    render(<ConfirmProvider><ClientSelect clients={CLIENTES} value="" onChange={onChange} {...props} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    await screen.findByRole('dialog', { name: 'Selecionar Cliente' });
    const busca = screen.getByRole('textbox', { name: /Buscar cliente/ });
    await waitFor(() => expect(document.activeElement).toBe(busca));
    return { onChange, busca };
};

/** Linhas escolhíveis, na ordem da tela. */
const opcoes = () => [...document.querySelectorAll<HTMLElement>('tr[data-opcao]')];

describe('ClientSelect pelo teclado', () => {
    it('abre com o cursor na busca; ↓ entra na lista, ↓ anda, Enter escolhe', async () => {
        const { onChange, busca } = await abrirCliente();
        fireEvent.keyDown(busca, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(opcoes()[0]);
        expect(document.activeElement).toHaveTextContent('Ana Souza');
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
        expect(document.activeElement).toHaveTextContent('Bruno Lima');
        fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('b');
    });

    it('↑ na primeira linha volta para a busca; Espaço também escolhe', async () => {
        const { onChange, busca } = await abrirCliente();
        fireEvent.keyDown(busca, { key: 'ArrowDown' });
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
        expect(document.activeElement).toBe(busca);
        fireEvent.keyDown(busca, { key: 'ArrowDown' });
        fireEvent.keyDown(document.activeElement!, { key: ' ' });
        expect(onChange).toHaveBeenCalledWith('a');
    });

    it('Enter na busca escolhe o primeiro resultado — só com algo digitado', async () => {
        const { onChange, busca } = await abrirCliente();
        fireEvent.keyDown(busca, { key: 'Enter' });
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.change(busca, { target: { value: 'bru' } });
        fireEvent.keyDown(busca, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('b');
    });

    it('com a opção "Todos", Enter na busca escolhe o CLIENTE, não o "Todos"', async () => {
        const { onChange, busca } = await abrirCliente({ allowClear: false, allOption: { id: '__todos__', label: 'Todos os clientes' } });
        expect(opcoes()[0]).toHaveTextContent('Todos os clientes');
        fireEvent.change(busca, { target: { value: 'ana' } });
        fireEvent.keyDown(busca, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('a');
    });

    it('cliente bloqueado não entra no Tab nem é escolhido pelo teclado', async () => {
        const { busca } = await abrirCliente({ disabledIds: ['a'] });
        expect(opcoes().map(tr => tr.textContent)).not.toContain(expect.stringContaining('Ana Souza'));
        fireEvent.keyDown(busca, { key: 'ArrowDown' });
        expect(document.activeElement).toHaveTextContent('Bruno Lima');
    });
});

describe('foco ao abrir não rouba de quem já agiu na gaveta', () => {
    it('foco posto numa linha antes dos 50 ms fica na linha', async () => {
        render(<ConfirmProvider><ClientSelect clients={CLIENTES} value="" onChange={vi.fn()} /></ConfirmProvider>);
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        await screen.findByRole('dialog', { name: 'Selecionar Cliente' });
        const linha = opcoes()[1];
        linha.focus();                                   // antes do timer de 50 ms
        await new Promise(r => setTimeout(r, 120));      // timer já disparou
        expect(document.activeElement).toBe(linha);
    });
});

describe('SupplierSelect pelo teclado', () => {
    it('abre com o cursor na busca (era autoFocus na montagem) e escolhe pelo teclado', async () => {
        const onChange = vi.fn();
        render(<ConfirmProvider><SupplierSelect suppliers={[{ id: 's1', name: 'Cimento Forte', document: '00.000.000/0001-00' } as never]} value="" onChange={onChange} /></ConfirmProvider>);
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        await screen.findByRole('dialog');
        const busca = screen.getByRole('textbox', { name: /Buscar fornecedor/ });
        await waitFor(() => expect(document.activeElement).toBe(busca));
        fireEvent.keyDown(busca, { key: 'ArrowDown' });
        expect(document.activeElement).toHaveTextContent('Cimento Forte');
        fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('s1');
    });
});
