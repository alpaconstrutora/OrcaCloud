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

  it('D1.2: o bloco da IT 17 — sistema, divergências; o botão aplica, e desliga dizendo por quê', async () => {
    const onAplicar = vi.fn();
    const c = calculoDeIncendio(modelo(), HIP);
    const { rerender } = render(
      <PainelCalculoIncendio hip={HIP} onHip={vi.fn()} calculo={c} nomeDe={() => 'H-1'} onSelecionar={vi.fn()} ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }}
        it17={{ descricao: 'A-2, área total até 3.000 m²: tipo 2 (hidrante), reserva de 8 m³', fonte: 'IT 17 do CBMMG (Portaria 70/2022), Tabela 4 (coluna 1) e Tabela 2', divergencias: ['Jato de 10 m somado à cobertura — a IT 17 desconsidera o alcance do jato (5.8.2)'], onAplicar }} />,
    );
    const bloco = screen.getByTestId('calculo-incendio-it17');
    expect(bloco).toHaveTextContent('tipo 2 (hidrante), reserva de 8 m³');
    expect(bloco).toHaveTextContent('5.8.2');
    await userEvent.click(screen.getByRole('button', { name: 'Usar os valores da IT 17' }));
    expect(onAplicar).toHaveBeenCalled();
    rerender(
      <PainelCalculoIncendio hip={HIP} onHip={vi.fn()} calculo={c} nomeDe={() => 'H-1'} onSelecionar={vi.fn()} ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }}
        it17={{ descricao: 'C-2 não consta na Tabela 4', fonte: 'IT 17', divergencias: [], onAplicar: null }} />,
    );
    expect(screen.getByRole('button', { name: 'Usar os valores da IT 17' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Usar os valores da IT 17' })).toHaveAttribute('title', expect.stringMatching(/não decide/));
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

describe('PainelCalculoIncendio › áreas de operação (E5.2)', () => {
  it('lista a área com o tamanho contra o exigido; desenhar, risco e apagar chamam o editor; a proposta desligada diz por quê', async () => {
    let m = comSprinklers();
    m = applyCommand(m, { type: 'AddAreaDeOperacao', levelId: m.levels[0].id, pontos: [point(5000, -1000), point(10000, -1000), point(10000, 1000), point(5000, 1000)] } as Command).model;
    const criterio = criterioDeSprinklers(HS, 'A-2');
    const c = calculoDeIncendio(m, HIP, criterio);
    const areas = {
      lista: [{ id: m.areasDeOperacao![0].id, nome: 'AO-1', risco: null }],
      onDesenhar: vi.fn(),
      proposta: { motivo: 'nenhum sprinkler ligado à rede', areaM2: 0, onPropor: vi.fn() },
      onRisco: vi.fn(),
      onApagar: vi.fn(),
    };
    render(<PainelCalculoIncendio hip={HIP} onHip={vi.fn()} calculo={c} nomeDe={() => 'SPK-1'} onSelecionar={vi.fn()} ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }} sprinklers={{ hs: HS, onHs: vi.fn(), criterio, areas }} />);
    const sec = screen.getByTestId('sprinklers-areas');
    // 5 × 2 m = 10 m² desenhados contra 139 exigidos; dois sprinklers (x = 6 e 9 m) dentro.
    expect(sec.textContent).toContain('10 m² / 139');
    expect(sec.textContent).toContain('Proposta: nenhum sprinkler ligado à rede.');
    const propor = screen.getByRole('button', { name: 'Propor na região mais desfavorável' });
    expect(propor).toBeDisabled();
    expect(propor.getAttribute('title')).toBe('nenhum sprinkler ligado à rede');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Desenhar' }));
    expect(areas.onDesenhar).toHaveBeenCalled();
    await u.selectOptions(screen.getByLabelText('Risco da AO-1'), 'EXTRA_1');
    expect(areas.onRisco).toHaveBeenCalledWith(m.areasDeOperacao![0].id, 'EXTRA_1');
    await u.click(screen.getByRole('button', { name: 'Apagar a AO-1' }));
    expect(areas.onApagar).toHaveBeenCalledWith(m.areasDeOperacao![0].id);
  });
});

describe('PainelCalculoIncendio › tabelas e demanda combinada (E5.4)', () => {
  it('o método das tabelas diz quantos trechos estão abaixo e ajusta; a demanda combinada grava nas premissas', async () => {
    const onHs = vi.fn();
    const onAjustar = vi.fn();
    const criterio = criterioDeSprinklers(HS, 'A-2');
    render(
      <PainelCalculoIncendio
        hip={HIP}
        onHip={vi.fn()}
        calculo={calculoDeIncendio(comSprinklers(), HIP, criterio)}
        nomeDe={() => 'SPK-1'}
        onSelecionar={vi.fn()}
        ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }}
        sprinklers={{ hs: HS, onHs, criterio, tabelas: { aplicavel: true, motivo: null, abaixo: 2, onAjustar } }}
      />,
    );
    expect(screen.getByTestId('sprinklers-tabelas').textContent).toContain('2 trecho(s) abaixo do DN da tabela');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Ajustar DN pelas tabelas' }));
    expect(onAjustar).toHaveBeenCalled();
    await u.click(screen.getByLabelText('Demanda combinada'));
    expect(onHs).toHaveBeenLastCalledWith({ ...HS, demandaCombinada: false });
  });

  it('na grelha, o ajuste pelas tabelas fica desligado com o motivo', () => {
    const criterio = criterioDeSprinklers(HS, 'A-2');
    render(
      <PainelCalculoIncendio
        hip={HIP}
        onHip={vi.fn()}
        calculo={calculoDeIncendio(comSprinklers(), HIP, criterio)}
        nomeDe={() => 'SPK-1'}
        onSelecionar={vi.fn()}
        ajusteDeDn={{ alterados: 0, onAjustar: vi.fn() }}
        sprinklers={{ hs: HS, onHs: vi.fn(), criterio, tabelas: { aplicavel: false, motivo: 'a rede tem laço (grelha ou malha) — vale o cálculo hidráulico', abaixo: 0, onAjustar: vi.fn() } }}
      />,
    );
    const b = screen.getByRole('button', { name: 'Ajustar DN pelas tabelas' });
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toMatch(/laço/);
  });
});

