// @vitest-environment jsdom
/**
 * CENTRO DE CARGAS NA TELA (E6.2, 29/09/2026).
 *
 * Aba Quadros: a linha do centro de cargas com "Mostrar na planta" e "Levar o
 * quadro ao centro" (um lote); sem quadro, "Criar quadro no centro". No canvas,
 * a região é um círculo tracejado com o rótulo — só no pavimento dela.
 *
 * O jsdom não tem contexto 2D: o teste do canvas instala um contexto FALSO que
 * grava cada chamada (arc, setLineDash, fillText) e responde ao resto.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PainelEletrica from '../../components/blueprint/PainelEletrica';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../../utils/blueprintKernel';
import { HIPOTESES_PADRAO } from '../../utils/blueprintEletricaDimensionamento';

function cena(comQuadro: boolean, comPotencia = true): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  let circuitoId: string | null = null;
  if (comQuadro) {
    m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(-6000, 0), cotaMm: 1600 }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 127 }).model;
    circuitoId = m.circuitos[0].id;
  }
  for (const [x, y, va] of [[0, 0, 1000], [4000, 0, 3000], [4000, 4000, 1000], [0, 4000, 1000]]) {
    m = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUE', at: point(x, y), cotaMm: 300, tipoEletrico: 'TUE', ...(comPotencia ? { potenciaW: va } : {}) }).model;
    if (circuitoId) m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId }).model;
  }
  return m;
}

const painel = (m: BlueprintModel, extras: Record<string, unknown> = {}) => {
  const onDR = vi.fn();
  const onCentro = vi.fn();
  render(
    <PainelEletrica model={m} onAddCircuito={vi.fn()} onCircuitoProps={vi.fn()} onQuadroProps={vi.fn()} onDR={onDR} onCentroDeCargasNaPlanta={onCentro} hipoteses={HIPOTESES_PADRAO} {...extras} />,
  );
  return { onDR, onCentro };
};
const abrirQuadros = () => userEvent.setup().click(screen.getByRole('tab', { name: /^quadros/i }));

describe('PainelEletrica · centro de cargas (E6.2)', () => {
  it('com quadro longe: diz a distância e o ganho; "Mostrar na planta" marca o quadro; "Levar" manda o TranslateEntities num lote', async () => {
    const m = cena(true);
    const { onDR, onCentro } = painel(m);
    await abrirQuadros();
    const linha = screen.getByLabelText('Centro de cargas do quadro QDC');
    expect(linha.textContent).toMatch(/4 pontos · 6\.000 VA · região de raio 0,8 m/);
    expect(linha.textContent).toMatch(/a 8,8 m do centro, fora da região/);
    expect(linha.textContent).toMatch(/Σ VA·d .* VA·m \(−\d+ %\)/);
    await userEvent.click(within(linha).getByRole('button', { name: 'Mostrar na planta' }));
    expect(onCentro).toHaveBeenCalledWith(m.quadros[0].id);
    await userEvent.click(within(linha).getByRole('button', { name: 'Levar o quadro ao centro' }));
    expect(onDR).toHaveBeenCalledWith([expect.objectContaining({ type: 'TranslateEntities', quadroIds: [m.quadros[0].id], delta: { x: 8667, y: 1333 } })]);
  });

  it('marcado: o botão vira "Tirar da planta" e desmarca', async () => {
    const m = cena(true);
    const { onCentro } = painel(m, { centroDeCargasNaPlanta: m.quadros[0].id });
    await abrirQuadros();
    const b = screen.getByRole('button', { name: 'Tirar da planta' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(b);
    expect(onCentro).toHaveBeenLastCalledWith(null);
  });

  it('sem quadro: o centro de todos os pontos; "Criar quadro no centro" manda o AddQuadro', async () => {
    const m = cena(false);
    const { onDR, onCentro } = painel(m);
    await abrirQuadros();
    const linha = screen.getByLabelText('Centro de cargas de todos os pontos');
    await userEvent.click(within(linha).getByRole('button', { name: 'Criar quadro no centro' }));
    expect(onDR).toHaveBeenCalledWith([{ type: 'AddQuadro', levelId: m.levels[0].id, nome: 'QDC', at: { x: 2667, y: 1333 }, cotaMm: 1600 }]);
    await userEvent.click(within(linha).getByRole('button', { name: 'Mostrar na planta' }));
    expect(onCentro).toHaveBeenCalledWith('TODOS');
  });

  it('sem potência declarada: diz o que fazer (e não mostra botão nenhum)', async () => {
    painel(cena(true, false));
    await abrirQuadros();
    const linha = screen.getByLabelText('Centro de cargas do quadro QDC');
    expect(linha.textContent).toMatch(/declare a potência dos pontos/);
    expect(within(linha).queryByRole('button')).toBeNull();
  });

  it('sem o callback do editor, a linha não aparece (telas só de leitura)', async () => {
    render(<PainelEletrica model={cena(true)} onAddCircuito={vi.fn()} onCircuitoProps={vi.fn()} onQuadroProps={vi.fn()} hipoteses={HIPOTESES_PADRAO} />);
    await abrirQuadros();
    expect(screen.queryByLabelText('Centro de cargas do quadro QDC')).toBeNull();
  });
});

describe('BlueprintCanvas · a região do centro de cargas', () => {
  type Chamada = { metodo: string; args: unknown[] };
  let chamadas: Chamada[] = [];
  const original = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    chamadas = [];
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    const estado: Record<string | symbol, unknown> = {};
    const ctx: unknown = new Proxy(estado, {
      get(alvo, prop) {
        if (prop in alvo) return alvo[prop];
        if (prop === 'canvas') return { width: 800, height: 600 };
        if (prop === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 2 });
        if (prop === 'getLineDash') return () => [];
        if (prop === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return (...args: unknown[]) => {
          chamadas.push({ metodo: String(prop), args });
          // gradientes e padrões: um objeto que aceita addColorStop/setTransform
          return { addColorStop() {}, setTransform() {} };
        };
      },
      set(alvo, prop, valor) {
        alvo[prop] = valor;
        return true;
      },
    });
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = original;
  });

  const desenhar = (centro: { levelId: string } | null, m: BlueprintModel) =>
    render(
      <BlueprintCanvas
        model={m}
        tool="selecionar"
        levelId={m.levels[0].id}
        selectedIds={[]}
        onSelecionar={() => {}}
        onAddWall={() => {}}
        onAddOpening={() => {}}
        onDelete={() => {}}
        larguraAberturaMm={900}
        espessuraMm={150}
        passoGradeMm={200}
        escala={0.05}
        dx={0}
        dy={0}
        centroDeCargas={centro ? { levelId: centro.levelId, centro: { x: 2667, y: 1333 }, raioMm: 843, posicaoSugerida: { x: 2667, y: 0 }, rotulo: 'Centro de cargas · QDC' } : null}
      />,
    );

  it('⚠️ PRONTO QUANDO: o canvas desenha a região — círculo tracejado, cruz, ponto sugerido e o rótulo', () => {
    const m = cena(true);
    desenhar({ levelId: m.levels[0].id }, m);
    const textos = chamadas.filter((c) => c.metodo === 'fillText').map((c) => c.args[0]);
    expect(textos).toContain('Centro de cargas · QDC');
    expect(chamadas.some((c) => c.metodo === 'setLineDash' && JSON.stringify(c.args[0]) === '[6,4]')).toBe(true);
    // O círculo da região: um arc de volta inteira com raio > 6 px.
    expect(chamadas.some((c) => c.metodo === 'arc' && (c.args[4] as number) === Math.PI * 2 && (c.args[2] as number) >= 6)).toBe(true);
  });

  it('noutro pavimento, ou sem a marca, nada de região', () => {
    const m = cena(true);
    desenhar({ levelId: 'lvl_outro' }, m);
    expect(chamadas.filter((c) => c.metodo === 'fillText').map((c) => c.args[0])).not.toContain('Centro de cargas · QDC');
    document.body.innerHTML = '';
    chamadas = [];
    desenhar(null, m);
    expect(chamadas.filter((c) => c.metodo === 'fillText').map((c) => c.args[0])).not.toContain('Centro de cargas · QDC');
  });
});
