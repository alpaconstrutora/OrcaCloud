// @vitest-environment jsdom
/**
 * Linha "Identificador" (Planta Inteligente › caixas de seleção).
 *
 * O que interessa provar: o rótulo curto é o MESMO que o IFC e o diff usam, o
 * botão copia o uid INTEIRO (não o rótulo), e elemento sem uid não desenha nada.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IdentificadorDoElemento from '../../components/blueprint/IdentificadorDoElemento';
import { rotuloCurto } from '../../utils/blueprintKernel';

const UID = '89b784bd-c5b2-4f62-9194-a1c051daa280';

afterEach(() => vi.restoreAllMocks());

describe('IdentificadorDoElemento', () => {
  it('mostra o rótulo curto e o uid inteiro no title', () => {
    render(<IdentificadorDoElemento uid={UID} familia="wall" />);
    expect(screen.getByText(rotuloCurto(UID, 'wall'))).toBeInTheDocument();
    expect(screen.getByText('P-89B7')).toHaveAttribute('title', UID);
  });

  it('o botão copia o uid INTEIRO e confirma', async () => {
    // `userEvent.setup()` instala o PRÓPRIO stub de clipboard e apaga qualquer
    // mock posto antes — então o espião entra DEPOIS do setup, sobre o stub.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');

    render(<IdentificadorDoElemento uid={UID} familia="opening" />);
    await user.click(screen.getByRole('button', { name: /copiar identificador completo/i }));

    expect(writeText).toHaveBeenCalledWith(UID);
    expect(await navigator.clipboard.readText()).toBe(UID);
    expect(await screen.findByTitle('Copiado')).toBeInTheDocument();
  });

  it('sem uid não renderiza nada', () => {
    const { container } = render(<IdentificadorDoElemento uid={undefined} familia="structural" />);
    expect(container).toBeEmptyDOMElement();
  });
});
