// @vitest-environment jsdom
/**
 * 22/10/2026 — pedido com dois prints da planta Garden, elétrica ligada: *"Veja a total confusão de
 * sobreposicões de testos e componentes."* A cena do print num canto de cozinha: a luz do teto, o
 * interruptor ao lado da porta e três tomadas coladas na mesma parede — duas SUGERIDAS, com a
 * instrução "Posicione sobre a bancada da pia". Antes, cada texto ia a uma distância fixa do próprio
 * símbolo e caíam uns sobre os outros. Contexto 2D falso por Proxy que grava as chamadas (molde:
 * `BlueprintCanvasRotulosDasPecas.test.tsx`).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';

const INSTRUCAO = 'Posicione sobre a bancada da pia';

function cena(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, { type: 'AddWall', levelId, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(-2000, 1500), cotaMm: 1600 }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1', tensaoV: 127 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C2', tensaoV: 127 }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  const pontos: [Command, string][] = [
    [{ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Luz', tipoEletrico: 'ILUMINACAO_TETO', at: point(1500, 500), cotaMm: 2800, potenciaW: 100, comando: 'a' } as Command, c1],
    [{ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Int', tipoEletrico: 'INTERRUPTOR', interruptor: 'UMA_SECAO', comando: 'a', at: point(1250, 75), cotaMm: 1100 } as Command, c1],
    [{ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(1450, 75), cotaMm: 1100, potenciaW: 600, sugerida: true, rotulo: INSTRUCAO } as Command, c2],
    [{ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(1600, 75), cotaMm: 300, potenciaW: 100 } as Command, c2],
    [{ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(1750, 75), cotaMm: 1100, potenciaW: 600, sugerida: true, rotulo: INSTRUCAO } as Command, c2],
  ];
  for (const [cmd, circuitoId] of pontos) {
    m = applyCommand(m, cmd).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![m.terminais!.length - 1].id, circuitoId }).model;
  }
  return m;
}

describe('BlueprintCanvas · os textos elétricos sem colisão', () => {
  type Chamada = { metodo: string; args: unknown[]; base?: unknown; fonte?: unknown };
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
        if (prop === 'measureText') return (s: string) => ({ width: String(s).length * 7, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 2 });
        if (prop === 'getLineDash') return () => [];
        if (prop === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return (...args: unknown[]) => {
          chamadas.push({ metodo: String(prop), args, base: alvo.textBaseline, fonte: alvo.font });
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

  /** Os textos do ÚLTIMO quadro (depois do último `clearRect`), com a caixa de cada um. */
  function textosDoUltimoQuadro(escala: number) {
    const m = cena();
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
        escala={escala}
        dx={0}
        dy={0}
      />,
    );
    const inicio = chamadas.map((c) => c.metodo).lastIndexOf('clearRect');
    return chamadas
      .slice(inicio)
      .filter((c) => c.metodo === 'fillText')
      .map((c) => {
        const [texto, x, y] = c.args as [string, number, number];
        const h = Number(/(\d+)px/.exec(String(c.fonte))?.[1] ?? 11);
        const w = texto.length * 7;
        const caixa = c.base === 'top' ? { x0: x, y0: y, x1: x + w, y1: y + h } : c.base === 'middle' ? { x0: x, y0: y - h / 2, x1: x + w, y1: y + h / 2 } : { x0: x, y0: y - h, x1: x + w, y1: y };
        return { texto, caixa, base: c.base };
      });
  }

  const cruza = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  for (const escala of [0.08, 0.2]) {
    it(`⚠️ PRONTO QUANDO: no zoom ${escala} px/mm, nenhum texto da luz, do interruptor e das tomadas cobre outro`, () => {
      const textos = textosDoUltimoQuadro(escala);
      // Os textos dos pontos — qualquer que seja a linha de base (o desenho antigo usava a alfabética
      // e a 'middle'; o motor escreve com 'top'): circuito, potência, instrução, comando.
      const nossos = textos.filter((t) => ['C1', 'Luz teto · C1', 'Int · C1', '-2-', '600 VA', '100 VA', INSTRUCAO, 'a'].includes(t.texto));
      for (let i = 0; i < nossos.length; i++)
        for (let j = i + 1; j < nossos.length; j++) expect(cruza(nossos[i].caixa, nossos[j].caixa), `"${nossos[i].texto}" × "${nossos[j].texto}"`).toBe(false);
      expect(nossos.map((t) => t.texto)).toEqual(expect.arrayContaining(['C1', 'Int · C1', '-2-', '600 VA', '100 VA', INSTRUCAO, 'a']));
    });
  }

  it('a luminária escreve só o circuito ("C1"), não "Luz teto · C1"', () => {
    const textos = textosDoUltimoQuadro(0.2).map((t) => t.texto);
    expect(textos).toContain('C1');
    expect(textos.some((t) => t.startsWith('Luz teto'))).toBe(false);
  });

  it('a sugerida mantém a instrução, uma por tomada', () => {
    const textos = textosDoUltimoQuadro(0.2).map((t) => t.texto);
    expect(textos.filter((t) => t === INSTRUCAO)).toHaveLength(2);
  });
});
