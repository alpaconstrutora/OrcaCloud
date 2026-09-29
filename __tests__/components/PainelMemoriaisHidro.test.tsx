// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PainelMemoriaisHidro from '../../components/blueprint/PainelMemoriaisHidro';
import type { BlocoDoMemorial } from '../../utils/blueprintMemorialHidro';

const calculo: BlocoDoMemorial[] = [
  { tipo: 'titulo', texto: 'Memorial de cálculo — instalações hidrossanitárias' },
  { tipo: 'secao', texto: 'Premissas de cálculo' },
  { tipo: 'secao', texto: 'Esgoto sanitário' },
];
const descritivo: BlocoDoMemorial[] = [
  { tipo: 'titulo', texto: 'Memorial descritivo — instalações hidrossanitárias' },
  { tipo: 'secao', texto: 'Objeto' },
];

describe('PainelMemoriaisHidro (E3.1/E3.2)', () => {
  it('lista as seções de cada memorial e baixa no formato pedido', async () => {
    const onBaixar = vi.fn().mockResolvedValue(undefined);
    render(<PainelMemoriaisHidro calculo={calculo} descritivo={descritivo} onBaixar={onBaixar} />);
    const cartao = screen.getByTestId('memorial-calculo');
    expect(within(cartao).getByText('Esgoto sanitário')).toBeTruthy();
    fireEvent.click(within(cartao).getByRole('button', { name: /DOCX/ }));
    await waitFor(() => expect(onBaixar).toHaveBeenCalledWith('calculo', 'docx'));
    fireEvent.click(within(screen.getByTestId('memorial-descritivo')).getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(onBaixar).toHaveBeenCalledWith('descritivo', 'pdf'));
  });

  it('sem rede: botões desligados DIZENDO por quê', () => {
    render(<PainelMemoriaisHidro calculo={[calculo[0]]} descritivo={[descritivo[0]]} onBaixar={vi.fn()} />);
    const pdf = within(screen.getByTestId('memorial-calculo')).getByRole('button', { name: /PDF/ }) as HTMLButtonElement;
    expect(pdf.disabled).toBe(true);
    expect(pdf.title).toBe('Sem rede hidrossanitária no desenho');
    expect(screen.getAllByText(/não há o que memorializar/)).toHaveLength(2);
  });

  it('a falha ao gerar aparece no painel', async () => {
    const onBaixar = vi.fn().mockRejectedValue(new Error('pizzip falhou'));
    render(<PainelMemoriaisHidro calculo={calculo} descritivo={descritivo} onBaixar={onBaixar} />);
    fireEvent.click(within(screen.getByTestId('memorial-calculo')).getByRole('button', { name: /PDF/ }));
    expect(await screen.findByText('pizzip falhou')).toBeTruthy();
  });
});
