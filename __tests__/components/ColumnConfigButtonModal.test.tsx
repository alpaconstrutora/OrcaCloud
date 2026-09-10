// @vitest-environment jsdom
/**
 * `ColumnConfigButton` — o seletor de colunas virou modal (10/09/2026).
 * Pedido: docs/planos/2026-09-10-colunas-visiveis-modal.md
 *
 * O painel antigo era um `fixed` ancorado logo abaixo do botão, com a lista em
 * `max-h-[60vh]` — um teto cego para a altura em que o botão estava. Com a
 * toolbar a meio caminho da tela e poucas linhas na tabela (página sem rolagem),
 * o painel saía pelo pé da janela e os últimos itens ficavam inalcançáveis.
 *
 * O que estes casos travam, em ordem de importância:
 *   1. o painel é um DIALOG montado em `document.body` (portal) — é isso que o
 *      torna imune a `overflow-hidden`/`transform` de qualquer ancestral e ao
 *      lugar onde o botão está;
 *   2. as colunas estão todas lá e marcar/desmarcar chama o callback certo;
 *   3. Restaurar e Salvar como padrão continuam funcionando; Esc e Fechar fecham.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { ColumnConfigButton, ColumnConfig } from '../../components/ui/TableUtils';

const COLUNAS: ColumnConfig[] = [
    { key: 'nome', label: 'Documento', sortable: true },
    { key: 'extensao', label: 'Extensão', sortable: true },
    { key: 'autor', label: 'Autor', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
];

function montar(extra: Partial<React.ComponentProps<typeof ColumnConfigButton>> = {}) {
    const props = {
        columns: COLUNAS,
        visibleColumns: ['nome', 'extensao', 'autor'],
        showColumnConfig: true,
        onToggleShow: vi.fn(),
        onToggleColumn: vi.fn(),
        onReset: vi.fn(),
        ...extra,
    };
    // Um ancestral com overflow-hidden E transform: é o pior caso para um
    // `fixed` que não seja portal — viraria containing block e recortaria.
    render(
        <div style={{ overflow: 'hidden', transform: 'translateZ(0)', height: 40 }}>
            <ColumnConfigButton {...props} />
        </div>
    );
    return props;
}

describe('ColumnConfigButton · modal de colunas visíveis', () => {
    it('1. abre como dialog em document.body, fora do ancestral que recortaria', () => {
        montar();
        const dialog = screen.getByRole('dialog');
        expect(dialog.parentElement).toBe(document.body);
        expect(within(dialog).getByText('Colunas visíveis')).toBeInTheDocument();
    });

    it('2. lista todas as colunas com o estado certo e diz quantas estão na tabela', () => {
        montar();
        const dialog = screen.getByRole('dialog');
        const caixas = within(dialog).getAllByRole('checkbox');
        expect(caixas).toHaveLength(4);
        expect(caixas.map(c => (c as HTMLInputElement).checked)).toEqual([true, true, true, false]);
        expect(within(dialog).getByText(/3 de 4 na tabela/)).toBeInTheDocument();
    });

    it('3. marcar a última coluna chama onToggleColumn com a chave dela', async () => {
        const user = userEvent.setup();
        const props = montar();
        await user.click(within(screen.getByRole('dialog')).getByLabelText('Status'));
        expect(props.onToggleColumn).toHaveBeenCalledWith('status');
    });

    it('4. Restaurar padrão e Salvar como padrão chamam os callbacks', async () => {
        const user = userEvent.setup();
        const props = montar({ onSaveDefault: vi.fn() });
        const dialog = screen.getByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: 'Restaurar padrão' }));
        expect(props.onReset).toHaveBeenCalled();
        await user.click(within(dialog).getByRole('button', { name: 'Salvar como padrão' }));
        expect(props.onSaveDefault).toHaveBeenCalled();
    });

    it('5. Fechar e Esc fecham', async () => {
        const user = userEvent.setup();
        const props = montar();
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar' }));
        expect(props.onToggleShow).toHaveBeenCalledTimes(1);
        await user.keyboard('{Escape}');
        expect(props.onToggleShow).toHaveBeenCalledTimes(2);
    });

    it('6. fechado, não há dialog nenhum no DOM', () => {
        montar({ showColumnConfig: false });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByTitle('Configurar Colunas')).toBeInTheDocument();
    });
});
