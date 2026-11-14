// @vitest-environment jsdom
/** SortableHeader com `title`: a dica da coluna no cabeçalho (pendência da Fase 2 do plano Imovib 2026-11-11). */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SortableHeader } from '../../components/ui/TableUtils';

const tabela = (th: React.ReactNode) => render(<table><thead><tr>{th}</tr></thead></table>);

describe('SortableHeader — title', () => {
    it('ordenável: a dica fica no cabeçalho', () => {
        tabela(<SortableHeader colKey="netVgv" label="VGV líquido" title="Receita dos compradores" />);
        expect(screen.getByRole('columnheader').getAttribute('title')).toBe('Receita dos compradores');
    });

    it('não ordenável também', () => {
        tabela(<SortableHeader colKey="x" label="X" sortable={false} title="Dica" />);
        expect(screen.getByRole('columnheader').getAttribute('title')).toBe('Dica');
    });

    it('sem title: nada muda', () => {
        tabela(<SortableHeader colKey="x" label="X" />);
        expect(screen.getByRole('columnheader').hasAttribute('title')).toBe(false);
    });
});
