// @vitest-environment jsdom
/**
 * INCÊNDIO E1.3 (30/09/2026): o canvas desenha o SÍMBOLO de incêndio no lugar
 * da caixa cheia genérica. Contexto 2D falso por Proxy que grava as chamadas
 * (molde: `PainelCentroDeCargas.test.tsx`).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';

function cena(tipos: { tipo: string; disciplina: 'INCENDIO' | 'AGUA_FRIA' }[]): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  return applyBatch(
    m,
    tipos.map(({ tipo, disciplina }, i) => ({ type: 'AddTerminal', levelId: l, disciplina, tipo, at: point(i * 2000, 0), cotaMm: 1300, tipoHidraulico: tipo }) as Command),
  ).model;
}

describe('BlueprintCanvas · símbolos de incêndio', () => {
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

  const desenhar = (m: BlueprintModel) =>
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
      />,
    );

  const textos = () => chamadas.filter((c) => c.metodo === 'fillText').map((c) => c.args[0]);

  it('⚠️ PRONTO QUANDO: o pressostato sai com o "P" DENTRO do símbolo e o número "PS-1" ao lado (E1.4)', () => {
    desenhar(cena([{ tipo: 'PRESSOSTATO', disciplina: 'INCENDIO' }]));
    expect(textos()).toContain('P');
    expect(textos()).toContain('PS-1');
  });

  it('a jockey sai com o "J" do símbolo; o hidrante gira o desenho no centro da peça (translate)', () => {
    desenhar(cena([{ tipo: 'BOMBA_JOCKEY', disciplina: 'INCENDIO' }, { tipo: 'HIDRANTE_SIMPLES', disciplina: 'INCENDIO' }]));
    expect(textos()).toContain('J');
    expect(chamadas.filter((c) => c.metodo === 'translate').length).toBeGreaterThanOrEqual(2);
  });

  it('E1.4: a peça numerada escreve o número (H-1, H-2), e não só a sigla', () => {
    desenhar(cena([{ tipo: 'HIDRANTE_SIMPLES', disciplina: 'INCENDIO' }, { tipo: 'HIDRANTE_DUPLO', disciplina: 'INCENDIO' }]));
    expect(textos()).toEqual(expect.arrayContaining(['H-1', 'H-2']));
  });

  it('ponto de água fria não ganha símbolo de incêndio (nenhum "P" solto)', () => {
    desenhar(cena([{ tipo: 'LAVATORIO', disciplina: 'AGUA_FRIA' }]));
    expect(textos()).not.toContain('P');
    expect(textos()).toContain('LV');
  });
});
