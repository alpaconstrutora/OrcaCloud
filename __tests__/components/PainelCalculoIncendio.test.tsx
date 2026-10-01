// @vitest-environment jsdom
/**
 * O painel do cálculo hidráulico de incêndio (30/09/2026, E2.3): o que a bomba
 * tem de dar, os abertos com o nome da planta, a planilha, o ajuste de DN que
 * diz por que está desligado, e o motivo quando não há o que calcular.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelCalculoIncendio from '../../components/blueprint/PainelCalculoIncendio';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio } from '../../utils/blueprintCalculoIncendio';

function modelo(semBomba = false) {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const t = (ax: number, ca: number, bx: number, cb: number): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: 65 }) as Command;
  const p = (tipo: string, x: number, c: number): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: c, tipoHidraulico: tipo }) as Command;
  return applyBatch(m, [...(semBomba ? [] : [p('BOMBA_INCENDIO', 0, 300)]), t(0, 300, 0, 2600), t(0, 2600, 20000, 2600), t(20000, 2600, 20000, 1300), p('HIDRANTE_SIMPLES', 20000, 1300)]).model;
}

describe('PainelCalculoIncendio', () => {
  it('mostra o que a bomba tem de dar e o hidrante aberto pelo NOME da planta; o ajuste de DN diz por que está desligado', () => {
    const c = calculoDeIncendio(modelo(), HIP);
    render(<PainelCalculoIncendio hip={HIP} onHip={vi.fn()} calculo={c} nomeDe={() => 'H-1'} onSelecionar={vi.fn()} ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }} />);
    expect(screen.getByTestId('calculo-incendio-bomba').textContent).toMatch(/A bomba precisa dar 300 L\/min a [\d,]+ mca/);
    expect(screen.getByTestId('calculo-incendio-abertos').textContent).toContain('H-1');
    const b = screen.getByRole('button', { name: /Ajustar DN/ });
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toMatch(/nenhum trecho passa de 5,0 m\/s/);
  });

  it('com trechos a ajustar, o botão liga e chama o lote', async () => {
    const c = calculoDeIncendio(modelo(), HIP);
    const onAjustar = vi.fn();
    render(<PainelCalculoIncendio hip={HIP} onHip={vi.fn()} calculo={c} nomeDe={() => 'H-1'} onSelecionar={vi.fn()} ajusteDeDn={{ alterados: 3, onAjustar }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ajustar DN pela velocidade (3)' }));
    expect(onAjustar).toHaveBeenCalled();
  });

  it('sem bomba: o motivo aparece e não há tabela', () => {
    const c = calculoDeIncendio(modelo(true), HIP);
    render(<PainelCalculoIncendio hip={HIP} onHip={vi.fn()} calculo={c} nomeDe={(id) => id} onSelecionar={vi.fn()} ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }} />);
    expect(screen.getByTestId('calculo-incendio-motivo').textContent).toMatch(/sem bomba/);
    expect(screen.queryByTestId('calculo-incendio-trechos')).toBeNull();
  });

  it('trocar a fórmula grava a premissa', async () => {
    const onHip = vi.fn();
    render(<PainelCalculoIncendio hip={HIP} onHip={onHip} calculo={calculoDeIncendio(modelo(), HIP)} nomeDe={() => 'H-1'} onSelecionar={vi.fn()} ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }} />);
    await userEvent.setup().selectOptions(screen.getByLabelText('Fórmula de perda de carga'), 'FAIR_WHIPPLE_HSIAO');
    expect(onHip).toHaveBeenLastCalledWith(expect.objectContaining({ formula: 'FAIR_WHIPPLE_HSIAO' }));
  });
});
