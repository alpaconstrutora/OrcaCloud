// @vitest-environment jsdom
/**
 * 11/10/2026 (teste do usuário no app real): "EV-1" encostado em "SF-1" e "CD-1" por
 * cima do desenho da condensadora. O rótulo da peça tipada agora sai FORA da caixa
 * dela e sem cobrir outro rótulo (`posicionarRotulos`). Contexto 2D falso por Proxy
 * que grava as chamadas (molde: `BlueprintCanvasMarcasTexto.test.tsx`).
 *
 * A escala da tela vem do próprio desenho: o `translate` de cada símbolo de
 * climatização é o centro da peça na tela, e a evaporadora e a condensadora estão a
 * 700 mm uma da outra no modelo.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';

/** A cena do print: evaporadora comprida, o sifão colado na ponta dela, a condensadora logo abaixo. */
function cena(): BlueprintModel {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m0.levels[0].id;
  let m = applyBatch(m0, [
    { type: 'AddTerminal', levelId: l, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(2000, 2000), cotaMm: 2200, larguraMm: 900, profundidadeMm: 220, alturaMm: 300 } as Command,
    { type: 'AddTerminal', levelId: l, disciplina: 'FRIGORIGENA', tipo: 'CD', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(2000, 1300), cotaMm: 350, larguraMm: 850, profundidadeMm: 330, alturaMm: 700 } as Command,
    { type: 'AddTerminal', levelId: l, disciplina: 'DRENO_AC', tipo: 'Sifão', tipoHidraulico: 'SIFAO_DRENO', at: point(2400, 2050), cotaMm: 2196 } as Command,
  ]).model;
  const ev = m.terminais!.find((t) => t.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
  const cd = m.terminais!.find((t) => t.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: ev.id, condensadoraId: cd.id }).model;
  return m;
}

describe('BlueprintCanvas · o rótulo da peça fora dela e sem colisão', () => {
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

  it('⚠️ PRONTO QUANDO: no último quadro, "EV-1", "SF-1" e "CD-1" não se cobrem, e "EV-1"/"CD-1" ficam fora da caixa da própria peça', () => {
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
        escala={0.05}
        dx={0}
        dy={0}
      />,
    );
    // A caixa de cada rótulo no ÚLTIMO quadro, pelo próprio fillText: a largura do measureText falso
    // (7 px por letra), a altura da fonte e a linha de base em vigor ('top' ou a alfabética de antes).
    const caixaDoRotulo = (texto: string) => {
      const i = chamadas.map((c) => c.metodo === 'fillText' && c.args[0] === texto).lastIndexOf(true);
      expect(i, `rótulo ${texto} não desenhado`).toBeGreaterThan(0);
      const c = chamadas[i];
      const [, x, y] = c.args as [string, number, number];
      const h = Number(/(\d+)px/.exec(String(c.fonte))?.[1] ?? 11);
      const w = texto.length * 7;
      return c.base === 'top' ? { x0: x, y0: y, x1: x + w, y1: y + h } : { x0: x, y0: y - h, x1: x + w, y1: y };
    };
    const ev = caixaDoRotulo('EV-1');
    const sf = caixaDoRotulo('SF-1');
    const cd = caixaDoRotulo('CD-1');
    const cruza = (a: typeof ev, b: typeof ev) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    expect(cruza(ev, sf)).toBe(false);
    expect(cruza(ev, cd)).toBe(false);
    expect(cruza(sf, cd)).toBe(false);

    // O centro de cada símbolo de climatização na tela: os dois últimos `translate` (um por peça) do quadro.
    const translates = chamadas.filter((c) => c.metodo === 'translate').map((c) => c.args as number[]);
    const [cEv, cCd] = translates.slice(-2);
    const pxPorMm = Math.abs(cCd[1] - cEv[1]) / 700;
    expect(pxPorMm).toBeGreaterThan(0);
    const caixaDaPeca = (c: number[], l: number, p: number) => ({ x0: c[0] - (l / 2) * pxPorMm, y0: c[1] - (p / 2) * pxPorMm, x1: c[0] + (l / 2) * pxPorMm, y1: c[1] + (p / 2) * pxPorMm });
    expect(cruza(ev, caixaDaPeca(cEv, 900, 220))).toBe(false);
    expect(cruza(cd, caixaDaPeca(cCd, 850, 330))).toBe(false);
  });
});
