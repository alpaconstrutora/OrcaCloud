// @vitest-environment jsdom
/**
 * Caixa "Água selecionada" — `components/blueprint/PainelAguaSelecionada.tsx`.
 *
 * O que interessa provar: as DUAS áreas aparecem (real e projetada), a
 * inclinação em % vai ao comando como número, o beiral é escolhido por LADO com
 * o comprimento dele, e a cota vai em milímetro inteiro.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelAguaSelecionada from '../../components/blueprint/PainelAguaSelecionada';
import { point, type Agua } from '../../utils/blueprintKernel';

function agua(over: Partial<Agua> = {}): Agua {
  return {
    id: 'agu_0001',
    uid: '89b784bd-c5b2-4f62-9194-a1c051daa280',
    levelId: 'lvl_0001',
    pontos: [point(0, 0), point(6000, 0), point(6000, 4000), point(0, 4000)],
    beiralIndex: 0,
    inclinacaoPct: 30,
    baseMm: 2800,
    espessuraMm: 120,
    ...over,
  };
}

function montar(over: Partial<Agua> = {}) {
  const onProps = vi.fn();
  const onExcluir = vi.fn();
  render(<PainelAguaSelecionada agua={agua(over)} onProps={onProps} onExcluir={onExcluir} />);
  return { onProps, onExcluir };
}

describe('PainelAguaSelecionada', () => {
  it('sem água não renderiza nada', () => {
    const { container } = render(
      <PainelAguaSelecionada agua={null} onProps={vi.fn()} onExcluir={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra as DUAS áreas — telha e planta — e os graus derivados', () => {
    montar();
    // 24 m² em planta × 1,04403 = 25,06 m² de telha; atan(0,3) = 16,7°.
    expect(screen.getByText(/25,06 m² de telha/)).toBeInTheDocument();
    expect(screen.getByText(/24,00 m² em planta/)).toBeInTheDocument();
    expect(screen.getByText(/16,7°/)).toBeInTheDocument();
  });

  it('a inclinação vai ao comando em POR CENTO, como número', async () => {
    const { onProps } = montar();
    const campo = screen.getByRole('textbox', { name: /inclinação da água/i }) as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(campo);
    await user.type(campo, '40{enter}');
    expect(onProps).toHaveBeenCalledWith({ inclinacaoPct: 40 });
  });

  it('o beiral é escolhido por LADO, e cada opção traz o comprimento', () => {
    const { onProps } = montar();
    const select = screen.getByRole('combobox', { name: /qual lado do polígono é o beiral/i });
    const opcoes = Array.from((select as HTMLSelectElement).options).map((o) => o.textContent);
    expect(opcoes).toEqual(['Lado 1 · 6,00 m', 'Lado 2 · 4,00 m', 'Lado 3 · 6,00 m', 'Lado 4 · 4,00 m']);
    fireEvent.change(select, { target: { value: '2' } });
    expect(onProps).toHaveBeenCalledWith({ beiralIndex: 2 });
  });

  it('a cota do beiral vai em milímetro inteiro', () => {
    const { onProps } = montar();
    const cota = screen.getByRole('spinbutton', { name: /cota da linha do beiral/i });
    fireEvent.change(cota, { target: { value: '3.1' } });
    expect(onProps).toHaveBeenCalledWith({ baseMm: 3100 });
  });

  it('a espessura em cm vira mm ×10', async () => {
    const { onProps } = montar();
    const campo = screen.getByRole('textbox', { name: /espessura do pacote/i }) as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(campo);
    await user.type(campo, '15{enter}');
    expect(onProps).toHaveBeenCalledWith({ espessuraMm: 150 });
  });

  it('o ponto mais alto e o beiral saem na linha de rodapé', () => {
    montar();
    // 2800 + 4000 × 0,30 = 4000 mm; beiral (lado 0) = 6,00 m.
    expect(screen.getByText(/Ponto mais alto a 4,00 m do piso/)).toBeInTheDocument();
    expect(screen.getByText(/beiral de 6,00 m/)).toBeInTheDocument();
  });

  it('Excluir chama o callback', async () => {
    const { onExcluir } = montar();
    await userEvent.setup().click(screen.getByRole('button', { name: /excluir/i }));
    expect(onExcluir).toHaveBeenCalled();
  });
});
