// @vitest-environment jsdom
/**
 * O painel da cobertura dos hidrantes (30/09/2026, E3.3): o resumo, os
 * descobertos por pavimento, propor num lote e o botão desligado com o motivo.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelCoberturaIncendio from '../../components/blueprint/PainelCoberturaIncendio';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP } from '../../utils/blueprintCalculoIncendio';
import type { CoberturaDosHidrantes } from '../../utils/blueprintCoberturaIncendio';

const amb = (nome: string, coberto: boolean, distanciaM: number | null) => ({ spaceId: nome, levelId: 'l1', nome, centro: { x: 0, y: 0 }, hidranteId: null, distanciaM, coberto });
const cob = (ambientes: ReturnType<typeof amb>[]): CoberturaDosHidrantes => ({ alcanceHidranteM: 40, alcanceMangotinhoM: 40, ambientes, descobertos: ambientes.filter((a) => !a.coberto) });

describe('PainelCoberturaIncendio', () => {
  it('lista os descobertos do pavimento e propõe num lote', async () => {
    const onPropor = vi.fn();
    render(<PainelCoberturaIncendio hip={HIP} onHip={vi.fn()} cobertura={cob([amb('Sala 1', true, 9), amb('Sala 10', false, 56.2)])} nomeDoPavimento={() => 'Térreo'} proposta={{ hidrantes: 1, semSolucao: 0, onPropor }} />);
    expect(screen.getByTestId('cobertura-incendio-resumo').textContent).toBe('1 de 2 ambiente(s) fora do alcance dos hidrantes.');
    expect(screen.getByText('Térreo')).toBeInTheDocument();
    expect(screen.getByText(/Sala 10 — pior ponto a 56,2 m/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Propor hidrantes (1)' }));
    expect(onPropor).toHaveBeenCalled();
  });

  it('tudo coberto: resumo verde e propor desligado, dizendo por quê', () => {
    render(<PainelCoberturaIncendio hip={HIP} onHip={vi.fn()} cobertura={cob([amb('Sala 1', true, 9)])} nomeDoPavimento={() => 'Térreo'} proposta={{ hidrantes: 0, semSolucao: 0, onPropor: vi.fn() }} />);
    const b = screen.getByRole('button', { name: 'Propor hidrantes' });
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toMatch(/todo ambiente já está ao alcance/);
  });

  it('o jato é premissa editável', () => {
    const onHip = vi.fn();
    render(<PainelCoberturaIncendio hip={HIP} onHip={onHip} cobertura={cob([])} nomeDoPavimento={() => ''} proposta={{ hidrantes: 0, semSolucao: 0, onPropor: vi.fn() }} />);
    // Campo controlado com o mock que não atualiza: um change direto, e não digitação.
    fireEvent.change(screen.getByLabelText('Alcance do jato (m)'), { target: { value: '7' } });
    expect(onHip).toHaveBeenLastCalledWith(expect.objectContaining({ alcanceDoJatoM: 7 }));
  });
});
