// @vitest-environment jsdom
/**
 * 10/10/2026 (teste do usuário no app real): o TEXTO da marca de verificação
 * era pintado ANTES das peças, e a evaporadora, o "AC" e o "2345 VA" ficavam por
 * cima dele — "sem dre… de dreno". Agora o texto sai num passe próprio, depois
 * das peças, e desce para baixo da peça-alvo. Contexto 2D falso por Proxy que
 * grava as chamadas (molde: `BlueprintCanvasIncendio.test.tsx`).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';
import type { MarcaDeVerificacao } from '../../utils/blueprintVerificacaoRede';

function cena(): { m: BlueprintModel; marca: MarcaDeVerificacao } {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m0.levels[0].id;
  const m = applyBatch(m0, [
    { type: 'AddTerminal', levelId: l, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(2000, 2000), cotaMm: 2200, larguraMm: 900, profundidadeMm: 220, alturaMm: 300 } as Command,
    { type: 'AddTerminal', levelId: l, disciplina: 'ELETRICA', tipo: 'Ar-condicionado', tipoEletrico: 'AR_CONDICIONADO', at: point(2000, 2000), cotaMm: 2200, potenciaW: 2345 } as Command,
  ]).model;
  const ev = m.terminais!.find((t) => t.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
  return { m, marca: { chave: 'x', tipo: 'CLIMA_SEM_DRENO', levelId: l, at: { x: 2000, y: 2000 }, texto: 'sem dreno até um ponto de dreno', severidade: 'AVISO', alvoId: ev.id, disciplina: 'DRENO_AC' } };
}

describe('BlueprintCanvas · o texto da marca por cima das peças', () => {
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

  it('⚠️ PRONTO QUANDO: o texto da marca é pintado DEPOIS do "2345 VA" da peça e ABAIXO dele', () => {
    const { m, marca } = cena();
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
        marcasDoCalculo={[marca]}
      />,
    );
    const textos = chamadas.map((c, i) => ({ i, c })).filter(({ c }) => c.metodo === 'fillText');
    const daMarca = textos.filter(({ c }) => c.args[0] === marca.texto);
    const daPotencia = textos.filter(({ c }) => String(c.args[0]).includes('2345'));
    expect(daMarca.length).toBeGreaterThan(0);
    expect(daPotencia.length).toBeGreaterThan(0);
    // A ordem, no ÚLTIMO quadro desenhado (o canvas pinta mais de uma vez): o texto da marca
    // vem depois do texto da peça — fica por cima.
    expect(Math.max(...daMarca.map((x) => x.i))).toBeGreaterThan(Math.max(...daPotencia.map((x) => x.i)));
    // E abaixo dele: o y do texto da marca é maior que o do "2345 VA".
    expect(Math.min(...daMarca.map((x) => Number(x.c.args[2])))).toBeGreaterThan(Math.max(...daPotencia.map((x) => Number(x.c.args[2]))));
    // E PERTO: uma linha abaixo do "2345 VA", sem encostar (12 a 22 px). Na meia diagonal da peça
    // (a primeira versão) eram 28 px — "excessivamente afastado", no teste do usuário.
    const folga = Math.max(...daMarca.map((x) => Number(x.c.args[2]))) - Math.max(...daPotencia.map((x) => Number(x.c.args[2])));
    expect(folga).toBeGreaterThanOrEqual(12);
    expect(folga).toBeLessThanOrEqual(22);
  });
});
