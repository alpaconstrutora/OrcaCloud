// @vitest-environment jsdom
/**
 * O painel de extintores (01/10/2026, E7.1): o risco e a distância, os
 * ambientes longe demais em vermelho (do mais longe), a capacidade fraca, o
 * pavimento sem extintor, e a proposta que diz por que está desligada.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelExtintoresIncendio from '../../components/blueprint/PainelExtintoresIncendio';
import { FONTE_EXTINTORES, HIPOTESES_EXTINTORES_PADRAO as HE, type AnaliseDeExtintores } from '../../utils/blueprintExtintores';

const analise: AnaliseDeExtintores = {
  risco: 'MEDIO',
  motivoDoRisco: 'carga de incêndio média',
  distanciaMaximaM: 20,
  ambientes: [
    { spaceId: 's1', levelId: 'l', rotulo: 'Sala 2', classes: ['A'], motivo: 'ocupação comum (A)', distanciaM: 8, atende: true },
    { spaceId: 's2', levelId: 'l', rotulo: 'Sala 9', classes: ['A'], motivo: 'ocupação comum (A)', distanciaM: 44.2, atende: false },
    { spaceId: 's3', levelId: 'l', rotulo: 'Cozinha', classes: ['A', 'B'], motivo: 'cozinha (B)', distanciaM: null, atende: false },
  ],
  extintores: [{ terminalId: 'e1', agente: 'AGUA', classes: ['A'], capacidade: '2-A', capacidadeAtende: false }],
  pavimentosSemExtintor: [{ levelId: 'l2', nome: '1º' }],
  pendencias: [],
  fonte: FONTE_EXTINTORES,
};

describe('PainelExtintoresIncendio', () => {
  it('os longe demais do pior para o melhor; a classe que falta; a capacidade fraca; o pavimento sem extintor', async () => {
    const onSelecionar = vi.fn();
    render(<PainelExtintoresIncendio analise={analise} hip={HE} onHip={vi.fn()} onSelecionar={onSelecionar} nomeDe={() => 'EXT-1'} proposta={{ quantos: 2, motivo: null, semCobertura: [], onPropor: vi.fn() }} />);
    expect(screen.getByTestId('extintores-incendio').textContent).toContain('Risco médio (carga de incêndio média) · até 20 m');
    const linhas = screen.getByTestId('extintores-longe').textContent!;
    expect(linhas.indexOf('Cozinha')).toBeLessThan(linhas.indexOf('Sala 9'));
    expect(linhas).toContain('sem extintor da classe');
    expect(linhas).toContain('44,2 m');
    expect(screen.getByTestId('extintores-capacidade').textContent).toContain('EXT-1 (2-A)');
    expect(screen.getByText('1º: nenhum extintor no pavimento')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sala 9' }));
    expect(onSelecionar).toHaveBeenCalledWith(['s2']);
  });

  it('a proposta lança num clique; desligada diz por quê; a distância e o agente gravam nas premissas', async () => {
    const onPropor = vi.fn();
    const onHip = vi.fn();
    const { rerender } = render(<PainelExtintoresIncendio analise={analise} hip={HE} onHip={onHip} onSelecionar={vi.fn()} nomeDe={() => 'EXT-1'} proposta={{ quantos: 2, motivo: null, semCobertura: [], onPropor }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Propor 2 extintor(es)' }));
    expect(onPropor).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Distância máxima até o extintor (m)'), { target: { value: '25' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HE, distanciaMaximaM: 25 });
    await userEvent.setup().selectOptions(screen.getByLabelText('Agente do extintor da proposta'), 'CO2');
    expect(onHip).toHaveBeenLastCalledWith({ ...HE, agentePadrao: 'CO2' });
    rerender(<PainelExtintoresIncendio analise={{ ...analise, ambientes: [analise.ambientes[0]] }} hip={HE} onHip={onHip} onSelecionar={vi.fn()} nomeDe={() => 'EXT-1'} proposta={{ quantos: 0, motivo: 'todos os ambientes já estão cobertos', semCobertura: [], onPropor }} />);
    const b = screen.getByRole('button', { name: 'Propor extintores' });
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toBe('todos os ambientes já estão cobertos');
    expect(screen.getByTestId('extintores-cobertos').textContent).toContain('Todos os 1 ambientes');
  });
});
