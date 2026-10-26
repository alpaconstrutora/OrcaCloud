// @vitest-environment jsdom
/**
 * SortableHeader — ordenar também por TECLADO, e o leitor de tela sabe o sentido.
 *
 * Por quê: até 26/10/2026 o rótulo era um <div> dentro do <th onClick>. A
 * crítica da aba Análise de Locações mediu no DOM de produção: 14 cabeçalhos
 * com cursor de clique e `tabIndex=-1`, sem botão e sem `aria-sort` — ordenar
 * só funcionava com mouse, nas ~100 tabelas que usam o componente.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SortableHeader } from '../../components/ui/TableUtils';

const montar = (props: Partial<React.ComponentProps<typeof SortableHeader>> = {}) => {
    const onSort = vi.fn();
    render(
        <table>
            <thead>
                <tr>
                    <SortableHeader label="Receita mensal" colKey="receita" onSort={onSort} {...props} />
                </tr>
            </thead>
        </table>,
    );
    return { onSort };
};

describe('SortableHeader acessível', () => {
    it('o rótulo é um botão alcançável por Tab, e Enter ordena', async () => {
        const { onSort } = montar();
        const u = userEvent.setup();
        await u.tab();
        const botao = screen.getByRole('button', { name: /Receita mensal/ });
        expect(botao).toHaveFocus();
        await u.keyboard('{Enter}');
        expect(onSort).toHaveBeenCalledWith('receita');
        expect(onSort).toHaveBeenCalledTimes(1);   // o clique do botão sobe ao <th> uma vez só
    });

    it('anuncia o sentido da ordenação no <th>', () => {
        montar({ sortColumn: 'receita', sortDirection: 'desc' });
        expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending');
    });

    it('coluna não ordenada fica aria-sort="none"; coluna não ordenável não vira botão', () => {
        montar({ sortColumn: 'outra' });
        expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none');
    });

    it('sortable={false} continua sendo só texto', () => {
        montar({ sortable: false });
        expect(screen.queryByRole('button')).toBeNull();
    });
});
