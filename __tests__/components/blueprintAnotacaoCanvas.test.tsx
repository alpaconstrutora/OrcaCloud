// @vitest-environment jsdom
/**
 * Ferramenta ANOTAÇÃO no canvas (19/09/2026, E8.1): texto fecha no 1º clique,
 * leader no 2º, cota angular no 3º; linha e hachura acumulam e fecham no duplo
 * clique; clicar numa anotação existente a seleciona; Escape desiste do que
 * está em curso. O painel da anotação: campos disparam `SetAnotacaoProps` e a
 * cota mostra o ângulo derivado.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import PainelAnotacaoSelecionada from '../../components/blueprint/PainelAnotacaoSelecionada';
import { applyBatch, applyCommand, emptyModel, point, type Anotacao, type BlueprintModel, type TipoDeAnotacao } from '../../utils/blueprintKernel';

const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
const t = base.levels[0].id;

function montar(tipo: TipoDeAnotacao, model: BlueprintModel = base, onSelecionar = vi.fn()) {
  const onAddAnotacao = vi.fn();
  render(
    <BlueprintCanvas
      model={model}
      tool="anotacao"
      levelId={t}
      selectedIds={[]}
      onSelecionar={onSelecionar}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      onDelete={() => {}}
      larguraAberturaMm={900}
      espessuraMm={150}
      passoGradeMm={200}
      escala={0.05}
      dx={0}
      dy={0}
      anotacoes={model.anotacoes ?? []}
      tipoDeAnotacao={tipo}
      onAddAnotacao={onAddAnotacao}
    />,
  );
  const c = document.querySelector('canvas')!;
  (c as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  (c as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
  return { c, onAddAnotacao, onSelecionar };
}
// escala 0,05 px/mm, dx=dy=0: tela (px, py) → mundo (px/0,05, −py/0,05). O ímã pode arredondar à grade de 200.
const clique = (c: HTMLCanvasElement, x: number, y: number) => {
  fireEvent.pointerDown(c, { button: 0, pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(c, { button: 0, pointerId: 1, clientX: x, clientY: y });
  fireEvent.click(c, { button: 0, clientX: x, clientY: y });
};

describe('anotações · canvas (E8.1)', () => {
  beforeEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('TEXTO fecha no 1º clique; LEADER no 2º; COTA ANGULAR no 3º — com os pontos em mm do modelo', () => {
    const a = montar('TEXTO');
    clique(a.c, 100, 100);
    expect(a.onAddAnotacao).toHaveBeenCalledTimes(1);
    expect(a.onAddAnotacao.mock.calls[0][0]).toBe('TEXTO');
    expect(a.onAddAnotacao.mock.calls[0][1]).toHaveLength(1);
    // O canvas enquadra a vista por conta própria em jsdom; o que se prova é a
    // consistência: ponto inteiro, e o 2º clique do leader a 2× em x (dx = 0).
    const p0 = a.onAddAnotacao.mock.calls[0][1][0] as { x: number; y: number };
    expect(Number.isInteger(p0.x) && Number.isInteger(p0.y)).toBe(true);
    expect(p0.x).toBeGreaterThan(0);
    expect(p0.y).toBeLessThan(0);
    document.body.innerHTML = '';
    const b = montar('LEADER');
    clique(b.c, 100, 100);
    expect(b.onAddAnotacao).not.toHaveBeenCalled();
    clique(b.c, 200, 100);
    expect(b.onAddAnotacao).toHaveBeenCalledTimes(1);
    const [l1, l2] = b.onAddAnotacao.mock.calls[0][1] as { x: number; y: number }[];
    expect(l1).toEqual(p0);
    expect(l2.y).toBe(p0.y);
    expect(l2.x).toBeGreaterThan(p0.x); // 100 px à direita
    document.body.innerHTML = '';
    const d = montar('COTA_ANGULAR');
    clique(d.c, 100, 100);
    clique(d.c, 200, 100);
    expect(d.onAddAnotacao).not.toHaveBeenCalled();
    clique(d.c, 100, 200);
    expect(d.onAddAnotacao).toHaveBeenCalledTimes(1);
    expect(d.onAddAnotacao.mock.calls[0][1]).toHaveLength(3);
  });

  it('LINHA e HACHURA acumulam cliques e fecham no duplo clique; a hachura exige 3 vértices; Escape desiste', () => {
    const a = montar('LINHA');
    clique(a.c, 100, 100);
    clique(a.c, 200, 100);
    clique(a.c, 200, 200);
    expect(a.onAddAnotacao).not.toHaveBeenCalled();
    fireEvent.doubleClick(a.c, { clientX: 200, clientY: 200 });
    expect(a.onAddAnotacao).toHaveBeenCalledTimes(1);
    expect(a.onAddAnotacao.mock.calls[0][0]).toBe('LINHA');
    expect(a.onAddAnotacao.mock.calls[0][1]).toHaveLength(3);
    document.body.innerHTML = '';
    const h = montar('HACHURA');
    clique(h.c, 100, 100);
    clique(h.c, 200, 100);
    fireEvent.doubleClick(h.c, { clientX: 200, clientY: 100 });
    expect(h.onAddAnotacao).not.toHaveBeenCalled(); // 2 vértices não fecham região
    clique(h.c, 100, 100);
    clique(h.c, 200, 100);
    clique(h.c, 200, 200);
    fireEvent.doubleClick(h.c, { clientX: 200, clientY: 200 });
    expect(h.onAddAnotacao).toHaveBeenCalledTimes(1);
    expect(h.onAddAnotacao.mock.calls[0][0]).toBe('HACHURA');
    document.body.innerHTML = '';
    const e = montar('LINHA');
    clique(e.c, 100, 100);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.doubleClick(e.c, { clientX: 300, clientY: 300 });
    expect(e.onAddAnotacao).not.toHaveBeenCalled();
  });

  it('clicar numa anotação existente (com a ferramenta de seleção) seleciona-a — texto pela caixa, linha pelo traço', () => {
    // Sonda: descobre a que mundo a tela (100, 100) corresponde neste canvas.
    const sonda = montar('TEXTO');
    clique(sonda.c, 100, 100);
    const p = sonda.onAddAnotacao.mock.calls[0][1][0] as { x: number; y: number };
    document.body.innerHTML = '';
    const model = applyBatch(base, [
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'TEXTO', pontos: [point(p.x, p.y)], texto: 'Sala' },
      // 200 px abaixo na tela = 200 / 0,05 = 4000 mm a menos em y.
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'LINHA', pontos: [point(p.x - 2000, p.y - 4000), point(p.x + 2000, p.y - 4000)] },
    ]).model;
    const onSelecionar = vi.fn();
    render(
      <BlueprintCanvas
        model={model}
        tool="selecionar"
        levelId={t}
        selectedIds={[]}
        onSelecionar={onSelecionar}
        onAddWall={() => {}}
        onAddOpening={() => {}}
        onDelete={() => {}}
        larguraAberturaMm={900}
        espessuraMm={150}
        passoGradeMm={200}
        escala={0.05}
        dx={0}
        dy={0}
        anotacoes={model.anotacoes}
      />,
    );
    const c = document.querySelector('canvas')!;
    (c as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    (c as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
    // Texto em p → tela (100, 100); a caixa avança para +x e −y do mundo (para baixo na tela).
    clique(c, 103, 102);
    expect(onSelecionar.mock.lastCall?.[0]).toEqual([model.anotacoes[0].id]);
    // Linha 4000 mm abaixo → tela y = 300.
    clique(c, 100, 301);
    expect(onSelecionar.mock.lastCall?.[0]).toEqual([model.anotacoes[1].id]);
  });

  it('painel: texto, altura, traço, padrão da hachura, giro, cor e vértices disparam as props certas; a cota mostra o ângulo derivado', async () => {
    const model = applyBatch(base, [
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'HACHURA', pontos: [point(0, 0), point(1000, 0), point(1000, 1000)], texto: 'demolir' },
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'COTA_ANGULAR', pontos: [point(0, 0), point(1000, 0), point(0, 1000)] },
      { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'TEXTO', pontos: [point(0, 0)], texto: 'Sala' },
    ]).model;
    const [hach, cota, texto] = model.anotacoes as Anotacao[];
    const onProps = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<PainelAnotacaoSelecionada anotacao={hach} onProps={onProps} onExcluir={() => {}} />);
    const painel = screen.getByTestId('painel-anotacao');
    expect(painel).toHaveTextContent(/Região hachurada/);
    expect(painel).toHaveTextContent(/na planta · 3 ponto\(s\) · texto 250 mm/);
    await user.selectOptions(within(painel).getByLabelText('Padrão da hachura'), 'CRUZADA');
    expect(onProps).toHaveBeenLastCalledWith({ hachura: 'CRUZADA' });
    await user.selectOptions(within(painel).getByLabelText('Traço da anotação'), 'TRACEJADO');
    expect(onProps).toHaveBeenLastCalledWith({ traco: 'TRACEJADO' });
    const alt = within(painel).getByLabelText('Altura do texto da anotação (mm)');
    await user.clear(alt);
    await user.type(alt, '400{Enter}');
    expect(onProps).toHaveBeenLastCalledWith({ alturaMm: 400 });
    const txt = within(painel).getByLabelText('Texto da anotação');
    await user.clear(txt);
    await user.type(txt, 'a demolir');
    await user.tab();
    expect(onProps).toHaveBeenLastCalledWith({ texto: 'a demolir' });
    await user.click(within(painel).getByText(/Vértices \(3\)/));
    const x2 = within(painel).getByLabelText('X do vértice 2');
    await user.clear(x2);
    await user.type(x2, '1200');
    await user.tab();
    expect(onProps).toHaveBeenLastCalledWith({ pontos: [point(0, 0), point(1200, 0), point(1000, 1000)] });
    rerender(<PainelAnotacaoSelecionada anotacao={cota} onProps={onProps} onExcluir={() => {}} />);
    expect(screen.getByTestId('angulo-da-cota')).toHaveTextContent('90,0°');
    expect(screen.queryByLabelText('Texto da anotação')).toBeNull(); // cota não tem texto
    rerender(<PainelAnotacaoSelecionada anotacao={texto} onProps={onProps} onExcluir={() => {}} />);
    await user.selectOptions(screen.getByLabelText('Giro do texto'), '90');
    expect(onProps).toHaveBeenLastCalledWith({ rotacaoGraus: 90 });
  });

  // NUVEM DE REVISÃO (P2.15): o painel edita número e data da revisão e a descrição.
  it('painel da nuvem de revisão: número, data e descrição disparam as props; a nuvem se seleciona pelo polígono', async () => {
    const model = applyCommand(base, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId: t }, tipo: 'NUVEM', pontos: [point(0, 0), point(2000, 0), point(2000, 1500), point(0, 1500)], texto: 'Porta deslocada', revisao: { numero: 2, data: '2026-09-21' } }).model;
    const nuvem = model.anotacoes[0] as Anotacao;
    const onProps = vi.fn();
    const user = userEvent.setup();
    render(<PainelAnotacaoSelecionada anotacao={nuvem} onProps={onProps} onExcluir={() => {}} />);
    const painel = screen.getByTestId('painel-anotacao');
    expect(painel).toHaveTextContent(/Nuvem de revisão/);
    const num = within(painel).getByTestId('nuvem-revisao-numero');
    await user.clear(num);
    await user.type(num, '3{Enter}');
    expect(onProps).toHaveBeenLastCalledWith({ revisao: { numero: 3, data: '2026-09-21' } });
    const data = within(painel).getByTestId('nuvem-revisao-data');
    fireEvent.change(data, { target: { value: '2026-10-02' } });
    fireEvent.blur(data);
    expect(onProps).toHaveBeenLastCalledWith({ revisao: { numero: 2, data: '2026-10-02' } });
    const txt = within(painel).getByLabelText('Texto da anotação');
    await user.clear(txt);
    await user.type(txt, 'Janela ampliada');
    await user.tab();
    expect(onProps).toHaveBeenLastCalledWith({ texto: 'Janela ampliada' });
    expect(painel).toHaveTextContent(/Descrição da alteração/);
  });
});
