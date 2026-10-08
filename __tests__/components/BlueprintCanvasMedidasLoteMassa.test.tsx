// @vitest-environment jsdom
/**
 * MEDIDAS DO LOTE E DA MASSA (04/10/2026) — *"veja print. o desenho gerado atraves do menu terreno Lote e massa nao
 * tem medidas"*; e *"as medidas devem estar nas laterais externas da planta e não dentro da planta"*. Com o item
 * "Medidas do lote e da massa" (ligado por padrão): cadeias de cota POR FORA da divisa — cada lado repartido pela
 * massa e o total —, nada escrito dentro do lote. Contexto 2D falso por Proxy que grava as chamadas (molde: `BlueprintCanvasIncendio.test.tsx`).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel } from '../../utils/blueprintKernel';

/** Lote 12 × 30 com os quatro papéis e uma torre 10 × 20 a 1 m das laterais, 4 m da frente e 6 m dos fundos. */
function cena(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA') =>
    ({ type: 'AddBoundary', levelId: l, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel }) as const;
  return applyBatch(m, [
    d(0, 0, 12000, 0, 'FRENTE'),
    d(12000, 0, 12000, 30000, 'LATERAL_DIREITA'),
    d(12000, 30000, 0, 30000, 'FUNDOS'),
    d(0, 30000, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: l, nome: 'Torre', pontos: [point(1000, 4000), point(11000, 4000), point(11000, 24000), point(1000, 24000)], pavimentos: 4 },
  ]).model;
}

describe('BlueprintCanvas · medidas do lote e da massa', () => {
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

  const desenhar = (m: BlueprintModel, extra: Partial<React.ComponentProps<typeof BlueprintCanvas>> = {}) =>
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
        {...extra}
      />,
    );

  const textos = () => chamadas.filter((c) => c.metodo === 'fillText').map((c) => String(c.args[0]));

  /** Onde cada ocorrência do texto foi ancorada: o último `translate` antes de cada `fillText` dele. */
  function ancorasDe(texto: string): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    chamadas.forEach((c, i) => {
      if (c.metodo !== 'fillText' || c.args[0] !== texto) return;
      for (let k = i; k >= 0; k -= 1) {
        if (chamadas[k].metodo === 'translate') {
          out.push({ x: Number(chamadas[k].args[0]), y: Number(chamadas[k].args[1]) });
          return;
        }
      }
    });
    return out;
  }

  it('por padrão: cotas por fora — cada lado repartido pela torre e o total; nada com "m" dentro do lote', () => {
    desenhar(cena());
    const t = textos();
    // O canvas desenha a cena mais de uma vez ao montar (medida do contêiner): conta-se por desenho.
    const desenhos = t.filter((x) => x === '30,00').length / 2;
    expect(desenhos).toBeGreaterThan(0);
    const porDesenho = (x: string) => t.filter((y) => y === x).length / desenhos;
    expect(porDesenho('12,00')).toBe(2); // totais: frente e fundos
    expect(porDesenho('30,00')).toBe(2); // totais: laterais
    expect(porDesenho('10,00')).toBe(2); // torre na frente e nos fundos
    expect(porDesenho('1,00')).toBe(4); // afastamentos laterais, nas duas cadeias de 12 m
    expect(porDesenho('20,00')).toBe(2); // torre nas laterais
    expect(porDesenho('4,00')).toBe(2); // afastamento da frente, nas duas laterais
    expect(porDesenho('6,00')).toBe(2); // afastamento dos fundos
    // Os rótulos antigos (dentro do lote) não existem mais.
    for (const x of ['frente 12,00 m', '10,00 m', '20,00 m', '1,00 m', '4,00 m', '6,00 m']) expect(t).not.toContain(x);
  });

  it('⚠️ todas as cotas ficam POR FORA do lote (600 × 1500 px na escala 0,05)', () => {
    desenhar(cena());
    const nosLadosCurtos = ['12,00', '10,00', '1,00'].flatMap(ancorasDe); // frente e fundos (horizontais)
    const nosLadosLongos = ['30,00', '20,00', '4,00', '6,00'].flatMap(ancorasDe); // laterais (verticais)
    const todos = [...nosLadosCurtos, ...nosLadosLongos];
    const cx = todos.reduce((s, p) => s + p.x, 0) / todos.length;
    const cy = nosLadosCurtos.reduce((s, p) => s + p.y, 0) / nosLadosCurtos.length;
    const cxl = nosLadosLongos.reduce((s, p) => s + p.x, 0) / nosLadosLongos.length;
    for (const p of nosLadosCurtos) expect(Math.abs(p.y - cy)).toBeGreaterThan(750);
    for (const p of nosLadosLongos) expect(Math.abs(p.x - cxl)).toBeGreaterThan(300);
    expect(Number.isFinite(cx)).toBe(true);
  });

  it('desligado ("Medidas do lote e da massa" e "Medidas das paredes"), nenhuma cota do lote', () => {
    desenhar(cena(), { mostrarMedidasLoteMassa: false, mostrarMedidasParedes: false });
    const t = textos();
    for (const x of ['12,00', '30,00', '10,00', '20,00', '4,00', '6,00', 'frente 12,00 m']) expect(t).not.toContain(x);
  });

  it('só "Medidas das paredes" continua escrevendo o lado do lote, como antes', () => {
    desenhar(cena(), { mostrarMedidasLoteMassa: false, mostrarMedidasParedes: true });
    const t = textos();
    expect(t).toContain('frente 12,00 m');
    expect(t).not.toContain('20,00');
  });

  it('sem lote fechado, a cota vai em volta do próprio bloco', () => {
    const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    const soBloco = applyBatch(m, [{ type: 'AddBloco', levelId: l, nome: 'Torre', pontos: [point(0, 0), point(10000, 0), point(10000, 20000), point(0, 20000)], pavimentos: 4 }]).model;
    desenhar(soBloco);
    expect(textos()).toEqual(expect.arrayContaining(['10,00', '20,00']));
  });

  /**
   * LINHAS DE CHAMADA (07/10/2026) — *"o início e fim das cotas encostam aonde inicia e termina a medida"*. Na escala
   * 0,05 a chamada nasce 4 px fora da divisa e vai 4 px além da linha que usa: até a parcial (10 + 22 px) mede 32 px;
   * até o total (10 + 44 px), 54 px.
   */
  it('cada quebra do lote ganha linha de chamada: 32 px até a parcial, 54 px até o total', () => {
    desenhar(cena());
    const segmentos: number[] = [];
    chamadas.forEach((c, i) => {
      const prox = chamadas[i + 1];
      if (c.metodo !== 'moveTo' || prox?.metodo !== 'lineTo') return;
      const [x1, y1] = c.args as number[];
      const [x2, y2] = prox.args as number[];
      if (Math.abs(x1 - x2) > 1e-6 && Math.abs(y1 - y2) > 1e-6) return; // só as retas (o lote é ortogonal)
      segmentos.push(Math.round(Math.hypot(x2 - x1, y2 - y1) * 100) / 100);
    });
    const desenhos = textos().filter((x) => x === '30,00').length / 2;
    // Parcial: 2 quebras da torre em cada um dos 4 lados. Total: os 2 cantos de cada lado.
    expect(segmentos.filter((l) => l === 32).length / desenhos).toBe(8);
    expect(segmentos.filter((l) => l === 54).length / desenhos).toBe(8);
  });

  /**
   * DETALHES DO LOTE (08/10/2026) — *"existe um recuo que deve ser incluído tanto nas medidas e eixos"*: o envelope
   * recuado (recuo de frente 5 m, fundos 3 m) reparte a cadeia das laterais; com o envelope oculto, não.
   */
  it('o recuo reparte a cota da lateral (5,00 | 22,00 | 3,00); envelope oculto não reparte', () => {
    const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddBoundary', levelId: l, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO' }) as const;
    const lote = applyBatch(m, [d(0, 0, 10000, 0), d(10000, 0, 10000, 30000), d(10000, 30000, 0, 30000), d(0, 30000, 0, 0)]).model;
    const envelope = [point(0, 5000), point(10000, 5000), point(10000, 27000), point(0, 27000)];
    desenhar(lote, { envelope });
    const t = textos();
    for (const x of ['5,00', '22,00', '3,00']) expect(t, x).toContain(x);
    chamadas = [];
    desenhar(lote, { envelope, mostrarEnvelope: false });
    const sem = textos();
    expect(sem).toContain('30,00');
    for (const x of ['5,00', '22,00', '3,00']) expect(sem, x).not.toContain(x);
  });

  /**
   * 08/10/2026 — *"quero sim"*: o número do trecho curto vai para FORA dele (antes só os tiques). Escala 0,01: o recuo
   * de 1,50 m tem 15 px, menos que o texto (10 px no contexto falso) + 10.
   */
  it('trecho curto: o número sai por fora (antes do início no 1º, depois do fim no último)', () => {
    const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddBoundary', levelId: l, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO' }) as const;
    const lote = applyBatch(m, [d(0, 0, 10000, 0), d(10000, 0, 10000, 30000), d(10000, 30000, 0, 30000), d(0, 30000, 0, 0)]).model;
    const envelope = [point(0, 1500), point(10000, 1500), point(10000, 28500), point(0, 28500)];
    desenhar(lote, { envelope, escala: 0.01 });
    const t = textos();
    expect(t).toContain('27,00');
    expect(t).toContain('1,50');
    // Cada lateral tem os dois recuos: 4 rótulos "1,50" por desenho.
    const desenhos = t.filter((x) => x === '30,00').length / 2;
    expect(t.filter((x) => x === '1,50').length / desenhos).toBe(4);
    // E por FORA do trecho: as âncoras dos "1,50" ficam além das pontas do lote (300 px de altura).
    const ys = ancorasDe('1,50').map((p) => p.y);
    const ysLote = ancorasDe('27,00').map((p) => p.y);
    const meio = ysLote.reduce((a, b) => a + b, 0) / ysLote.length;
    for (const y of ys) expect(Math.abs(y - meio)).toBeGreaterThan(150);
  });
});
