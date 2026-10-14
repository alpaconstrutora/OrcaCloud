// @vitest-environment jsdom
/**
 * Campo numérico das hipóteses (14/10/2026): digitar não grava; sair do campo ou
 * Enter grava; vazio/Esc voltam; fora da faixa encosta no limite. Nasceu do
 * `Number(texto) || -150` da gaveta de esgoto, que gravava −150 quando se
 * digitava 0.
 */
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CampoNumericoDeHipotese, { interpretarNumero } from '../../components/blueprint/CampoNumericoDeHipotese';

function Controlado({ inicial, onCommit, ...props }: { inicial: number; onCommit: (v: number) => void; min?: number; max?: number; casas?: number }) {
  const [v, setV] = useState(inicial);
  return (
    <CampoNumericoDeHipotese
      value={v}
      onCommit={(n) => {
        setV(n);
        onCommit(n);
      }}
      aria-label="Campo"
      {...props}
    />
  );
}

describe('interpretarNumero', () => {
  it('lê inteiro, vírgula e negativo; vazio e lixo dão null', () => {
    expect(interpretarNumero('0', { max: 0 })).toBe(0);
    expect(interpretarNumero('-150', {})).toBe(-150);
    expect(interpretarNumero('1,5', { casas: 1 })).toBe(1.5);
    expect(interpretarNumero('1,56', { casas: 0 })).toBe(2);
    expect(interpretarNumero('', {})).toBeNull();
    expect(interpretarNumero('-', {})).toBeNull();
    expect(interpretarNumero('abc', {})).toBeNull();
  });
  it('encosta nos limites', () => {
    expect(interpretarNumero('100', { max: 0 })).toBe(0);
    expect(interpretarNumero('10', { min: 300 })).toBe(300);
  });
});

describe('CampoNumericoDeHipotese', () => {
  it('digitar 0 num campo que aceita 0 grava 0 — e só ao sair do campo', async () => {
    const onCommit = vi.fn();
    render(<Controlado inicial={-150} max={0} onCommit={onCommit} />);
    const user = userEvent.setup();
    const campo = screen.getByLabelText('Campo');
    await user.clear(campo);
    await user.type(campo, '0');
    expect(onCommit).not.toHaveBeenCalled();
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(0);
    expect(campo).toHaveValue(0);
  });

  it('apagar e sair não grava nada: volta ao último valor', async () => {
    const onCommit = vi.fn();
    render(<Controlado inicial={1500} min={300} onCommit={onCommit} />);
    const user = userEvent.setup();
    const campo = screen.getByLabelText('Campo');
    await user.clear(campo);
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(campo).toHaveValue(1500);
  });

  it('Enter grava; abaixo do mínimo grava o mínimo', async () => {
    const onCommit = vi.fn();
    render(<Controlado inicial={1500} min={300} onCommit={onCommit} />);
    const user = userEvent.setup();
    const campo = screen.getByLabelText('Campo');
    await user.clear(campo);
    await user.type(campo, '100{Enter}');
    expect(onCommit).toHaveBeenCalledWith(300);
    expect(campo).toHaveValue(300);
  });

  it('Esc desfaz o rascunho e não deixa a tecla subir (a gaveta em volta não fecha)', async () => {
    const onCommit = vi.fn();
    const noDocumento = vi.fn();
    document.addEventListener('keydown', noDocumento);
    render(<Controlado inicial={1500} onCommit={onCommit} />);
    const user = userEvent.setup();
    const campo = screen.getByLabelText('Campo');
    await user.clear(campo);
    await user.type(campo, '999');
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(campo).toHaveValue(1500);
    expect(noDocumento.mock.calls.some(([e]) => (e as KeyboardEvent).key === 'Escape')).toBe(false);
    document.removeEventListener('keydown', noDocumento);
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('mesmo valor não grava de novo', async () => {
    const onCommit = vi.fn();
    render(<Controlado inicial={700} onCommit={onCommit} />);
    const user = userEvent.setup();
    const campo = screen.getByLabelText('Campo');
    await user.clear(campo);
    await user.type(campo, '700');
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('valor que muda por fora aparece no campo', () => {
    const { rerender } = render(<CampoNumericoDeHipotese value={10} onCommit={() => {}} aria-label="Campo" />);
    rerender(<CampoNumericoDeHipotese value={20} onCommit={() => {}} aria-label="Campo" />);
    expect(screen.getByLabelText('Campo')).toHaveValue(20);
  });
});
