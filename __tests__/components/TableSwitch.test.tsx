import '@testing-library/jest-dom';
// @vitest-environment jsdom
/**
 * Interruptor de coluna — a página rolava para a direita além da tela.
 *
 * O `<input>` é `sr-only` (position: absolute). Sem um ancestral posicionado
 * por perto, ele se ancorava no `<main>` do Layout (`relative`) e escapava do
 * `overflow-x-auto` da tabela — que não é posicionado. Numa tabela mais larga
 * que a tela (Portal do Cliente, 25/10/2026), o input da coluna fora da vista
 * esticava a rolagem do `<main>` em ~390 px.
 *
 * jsdom não calcula layout; o que este teste prende é o pré-requisito: o próprio
 * `<label>` é o bloco de contenção do input, então o input fica dentro da
 * célula e é cortado pela rolagem da tabela, como o resto da linha.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TableSwitch from '../../components/ui/TableSwitch';

describe('TableSwitch', () => {
    it('o label é o bloco de contenção do input sr-only (não deixa vazar a rolagem)', () => {
        render(<TableSwitch checked onChange={() => {}} ariaLabel="Portal" />);
        const input = screen.getByRole('checkbox', { name: 'Portal' });
        expect(input).toHaveClass('sr-only');
        expect(input.parentElement?.tagName).toBe('LABEL');
        expect(input.parentElement).toHaveClass('relative');
    });
});
