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
import { conferenciaDeIncendio } from '../../utils/blueprintConferenciaIncendio';
import { HIPOTESES_SPRINKLERS_PADRAO as HS, criterioDeSprinklers } from '../../utils/blueprintSprinklersIncendio';

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

  it('E2.4: a conferência aparece com os três estados, e o item que falta seleciona as peças', async () => {
    const m = modelo();
    const hip = { ...HIP, pressaoMaximaKpa: 300 };
    const c = calculoDeIncendio(m, hip);
    const onSelecionar = vi.fn();
    render(<PainelCalculoIncendio hip={hip} onHip={vi.fn()} calculo={c} nomeDe={() => 'H-1'} onSelecionar={onSelecionar} ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }} conferencia={conferenciaDeIncendio(m, c, hip)} />);
    const t = screen.getByTestId('calculo-incendio-conferencia');
    expect(t.textContent).toContain('Atende');
    expect(t.textContent).toContain('Falta');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pressão estática nos hidrantes e sprinklers' }));
    expect(onSelecionar).toHaveBeenCalledWith([m.terminais!.find((x) => x.tipoHidraulico === 'HIDRANTE_SIMPLES')!.id]);
  });

  it('trocar a fórmula grava a premissa', async () => {
    const onHip = vi.fn();
    render(<PainelCalculoIncendio hip={HIP} onHip={onHip} calculo={calculoDeIncendio(modelo(), HIP)} nomeDe={() => 'H-1'} onSelecionar={vi.fn()} ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }} />);
    await userEvent.setup().selectOptions(screen.getByLabelText('Fórmula de perda de carga'), 'FAIR_WHIPPLE_HSIAO');
    expect(onHip).toHaveBeenLastCalledWith(expect.objectContaining({ formula: 'FAIR_WHIPPLE_HSIAO' }));
  });
});

/** E5.1: bomba → coluna → ramal com 3 sprinklers K 80. */
function comSprinklers() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const t = (ax: number, ca: number, bx: number, cb: number): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: 50 }) as Command;
  const p = (tipo: string, x: number, c: number): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: c, tipoHidraulico: tipo, fatorK: 80 }) as Command;
  return applyBatch(m, [p('BOMBA_INCENDIO', 0, 300), t(0, 300, 0, 2600), t(0, 2600, 3000, 2600), t(3000, 2600, 6000, 2600), t(6000, 2600, 9000, 2600), p('SPRINKLER', 3000, 2600), p('SPRINKLER', 6000, 2600), p('SPRINKLER', 9000, 2600)]).model;
}

describe('PainelCalculoIncendio › sprinklers (E5.1)', () => {
  it('o risco sugerido pela ocupação, a cadeia derivada e o que a bomba tem de dar com os sprinklers', () => {
    const criterio = criterioDeSprinklers(HS, 'A-2');
    const c = calculoDeIncendio(comSprinklers(), HIP, criterio);
    render(<PainelCalculoIncendio hip={HIP} onHip={vi.fn()} calculo={c} nomeDe={() => 'SPK-3'} onSelecionar={vi.fn()} ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }} sprinklers={{ hs: HS, onHs: vi.fn(), criterio }} />);
    const sec = screen.getByTestId('calculo-incendio-sprinklers');
    expect(sec.textContent).toContain('Pela ocupação (Leve)');
    expect(sec.textContent).toMatch(/Risco sugerido: divisão A-2/);
    const tab = screen.getByTestId('sprinklers-criterio').textContent!;
    expect(tab).toContain('Sprinklers na área7');
    expect(tab).toContain('Vazão por sprinkler85,7 L/min');
    expect(screen.getByTestId('sprinklers-resultado').textContent).toMatch(/Os 3 sprinkler\(s\) mais desfavoráveis pedem [\d.]+ L\/min/);
    expect(screen.getByTestId('calculo-incendio-bomba').textContent).toContain('3 sprinkler(s) aberto(s)');
  });

  it('declarar o risco e esvaziar a densidade gravam nas premissas dos sprinklers', async () => {
    const onHs = vi.fn();
    const hs = { ...HS, densidadeLminM2: 5 };
    const criterio = criterioDeSprinklers(hs, 'A-2');
    render(<PainelCalculoIncendio hip={HIP} onHip={vi.fn()} calculo={calculoDeIncendio(comSprinklers(), HIP, criterio)} nomeDe={() => 'SPK-1'} onSelecionar={vi.fn()} ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }} sprinklers={{ hs, onHs, criterio }} />);
    await userEvent.setup().selectOptions(screen.getByLabelText('Classe de risco dos sprinklers'), 'ORDINARIO_1');
    expect(onHs).toHaveBeenLastCalledWith({ ...hs, risco: 'ORDINARIO_1' });
    await userEvent.setup().clear(screen.getByLabelText('Densidade (L/min/m²)'));
    expect(onHs).toHaveBeenLastCalledWith({ ...hs, densidadeLminM2: null });
  });
});
