/**
 * Projeção em elevação — `utils/blueprintElevation.ts`.
 *
 * Golden por VALOR: as coordenadas projetadas de fixtures fixas. Se um número
 * aqui mudar, a pergunta é "o que na projeção mudou, e era para mudar?".
 *
 * Convenção travada (decisão do usuário 2026-08-29): sem divisa marcada, FRENTE
 * olha +Y com `u = +X`; a divisa `papel: 'FRENTE'` sobrepõe os eixos fixos.
 */

import { describe, expect, it } from 'vitest';
import {
  type BlueprintModel,
  type Command,
  applyBatch,
  applyCommand,
  emptyModel,
  point,
} from '../utils/blueprintKernel';
import { baseDaElevacao, perfilDaParedeComVaos, projetarElevacao } from '../utils/blueprintElevation';

const T = 150;
const H = 2800;

function comTerreo(): { model: BlueprintModel; terreoId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, terreoId: r.model.levels[0].id };
}

function parede(
  levelId: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  heightMm = H,
): Command {
  return { type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: T, heightMm };
}

/** Sala retangular 4000 × 3000, cantos em (0,0) e (4000,3000). */
function salaRetangular(model: BlueprintModel, levelId: string): BlueprintModel {
  return applyBatch(model, [
    parede(levelId, 0, 0, 4000, 0),
    parede(levelId, 4000, 0, 4000, 3000),
    parede(levelId, 4000, 3000, 0, 3000),
    parede(levelId, 0, 3000, 0, 0),
  ]).model;
}

describe('projetarElevacao · sala retangular com porta e janela', () => {
  function fixture(): { model: BlueprintModel; terreoId: string; paredeBaixaId: string } {
    const { model, terreoId } = comTerreo();
    let m = salaRetangular(model, terreoId);
    const paredeBaixaId = m.walls[0].id;
    m = applyBatch(m, [
      { type: 'AddOpening', wallId: paredeBaixaId, kind: 'door', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: paredeBaixaId, kind: 'window', offsetMm: 2000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
    ]).model;
    return { model: m, terreoId, paredeBaixaId };
  }

  it('FRENTE (eixos fixos): parede da fachada e recortes na cota certa', () => {
    const { model, paredeBaixaId } = fixture();
    const proj = projetarElevacao(model, { direcao: 'FRENTE' });

    expect(proj.base.origem).toBe('EIXOS_FIXOS');
    expect(proj.base.u).toEqual({ x: 1, y: 0 });
    expect(proj.base.d).toEqual({ x: 0, y: 1 });

    expect(proj.paredes).toHaveLength(4);
    expect(proj.aberturas).toHaveLength(2);

    const fachada = proj.paredes.find((p) => p.wallId === paredeBaixaId)!;
    expect(fachada).toMatchObject({ uMin: 0, uMax: 4000, vMin: 0, vMax: 2800, profundidade: 0, degenerada: false });

    const porta = proj.aberturas.find((o) => o.kind === 'door')!;
    expect(porta).toMatchObject({ uMin: 500, uMax: 1400, vMin: 0, vMax: 2100 });
    const janela = proj.aberturas.find((o) => o.kind === 'window')!;
    expect(janela).toMatchObject({ uMin: 2000, uMax: 3200, vMin: 1000, vMax: 2200 });

    expect(proj.linhaDoSolo.v).toBe(0);
    expect(proj.bbox).toEqual({ uMin: -75, uMax: 4075, vMin: 0, vMax: 2800 });

    // Fundo → frente: a primeira é a mais funda.
    expect(proj.paredes[0].profundidade).toBeGreaterThanOrEqual(
      proj.paredes[proj.paredes.length - 1].profundidade,
    );
    // A parede do topo (y = 3000) é a mais funda.
    expect(proj.paredes[0].profundidade).toBe(3000);
  });

  it('FUNDOS: a fachada aparece espelhada em u', () => {
    const { model, paredeBaixaId } = fixture();
    const proj = projetarElevacao(model, { direcao: 'FUNDOS' });
    expect(proj.base.d).toEqual({ x: 0, y: -1 });
    expect(proj.base.u).toEqual({ x: -1, y: 0 });

    const fachada = proj.paredes.find((p) => p.wallId === paredeBaixaId)!;
    expect(fachada).toMatchObject({ uMin: -4000, uMax: 0 });
    const porta = proj.aberturas.find((o) => o.kind === 'door')!;
    expect(porta).toMatchObject({ uMin: -1400, uMax: -500, vMin: 0, vMax: 2100 });
  });

  it('LATERAL_DIREITA: olha -X, u = -Y', () => {
    const { model } = fixture();
    const proj = projetarElevacao(model, { direcao: 'LATERAL_DIREITA' });
    expect(proj.base.d).toEqual({ x: -1, y: 0 });
    expect(proj.base.u).toEqual({ x: 0, y: 1 });
    // A parede esquerda (x = 0) é a mais funda para quem olha de +X.
    expect(proj.paredes[0].profundidade).toBe(0);
  });
});

describe('projetarElevacao · dois pavimentos empilhados', () => {
  function fixture() {
    const { model, terreoId } = comTerreo();
    let m = applyCommand(model, parede(terreoId, 0, 0, 4000, 0)).model;
    m = applyCommand(m, { type: 'AddLevel', name: 'Pav 1', elevationMm: 2800, defaultHeightMm: H }).model;
    const pav1Id = m.levels[1].id;
    m = applyCommand(m, parede(pav1Id, 0, 0, 4000, 0)).model;
    return { model: m, terreoId, pav1Id };
  }

  it('sem filtro: as duas paredes empilham pela elevationMm', () => {
    const { model } = fixture();
    const proj = projetarElevacao(model, { direcao: 'FRENTE' });
    expect(proj.paredes).toHaveLength(2);
    const cotas = proj.paredes.map((p) => [p.vMin, p.vMax]).sort((a, b) => a[0] - b[0]);
    expect(cotas).toEqual([
      [0, 2800],
      [2800, 5600],
    ]);
    expect(proj.linhaDoSolo.v).toBe(0);
    expect(proj.bbox.vMax).toBe(5600);
  });

  it('com levelIds: só o nível pedido é projetado', () => {
    const { model, terreoId } = fixture();
    const proj = projetarElevacao(model, { direcao: 'FRENTE', levelIds: [terreoId] });
    expect(proj.paredes).toHaveLength(1);
    expect(proj.bbox.vMax).toBe(2800);
  });
});

describe('baseDaElevacao · divisa FRENTE sobrepõe os eixos fixos', () => {
  function comTerreno() {
    const { model, terreoId } = comTerreo();
    // Retângulo de terreno 10000 × 8000.
    const cantos: [number, number][] = [
      [0, 0],
      [10000, 0],
      [10000, 8000],
      [0, 8000],
    ];
    let m = model;
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const a = cantos[i];
      const b = cantos[(i + 1) % 4];
      const r = applyCommand(m, {
        type: 'AddBoundary',
        levelId: terreoId,
        a: point(a[0], a[1]),
        b: point(b[0], b[1]),
        kind: 'TERRENO',
      });
      m = r.model;
      ids.push(r.diff.created[0]);
    }
    // Lado (10000,8000) → (0,8000): o TOPO, marcado como FRENTE.
    m = applyCommand(m, { type: 'SetBoundaryPapel', boundaryId: ids[2], papel: 'FRENTE' }).model;
    m = applyCommand(m, parede(terreoId, 1000, 1000, 9000, 1000)).model;
    return m;
  }

  it('a normal interna do topo aponta para -Y, e FUNDOS é o oposto', () => {
    const model = comTerreno();
    const frente = baseDaElevacao(model, 'FRENTE');
    expect(frente.origem).toBe('DIVISA_FRENTE');
    expect(Math.abs(frente.d.x)).toBeLessThan(1e-9);
    expect(frente.d.y).toBeCloseTo(-1, 9);

    const fundos = baseDaElevacao(model, 'FUNDOS');
    expect(fundos.d.y).toBeCloseTo(1, 9);

    // As laterais são perpendiculares à frente.
    const dir = baseDaElevacao(model, 'LATERAL_DIREITA');
    expect(Math.abs(frente.d.x * dir.d.x + frente.d.y * dir.d.y)).toBeLessThan(1e-9);
  });

  it('sem divisa marcada, cai para eixos fixos', () => {
    const { model, terreoId } = comTerreo();
    const m = applyCommand(model, parede(terreoId, 0, 0, 3000, 0)).model;
    expect(baseDaElevacao(m, 'FRENTE').origem).toBe('EIXOS_FIXOS');
  });
});

describe('perfilDaParedeComVaos', () => {
  it('devolve o retângulo da parede e os furos em coordenada local, recortados', () => {
    const { model, terreoId } = comTerreo();
    let m = applyCommand(model, parede(terreoId, 0, 0, 4000, 0)).model;
    const paredeId = m.walls[0].id;
    m = applyCommand(m, {
      type: 'AddOpening',
      wallId: paredeId,
      kind: 'window',
      offsetMm: 1000,
      widthMm: 1500,
      heightMm: 1200,
      sillMm: 900,
    }).model;

    const perfil = perfilDaParedeComVaos(m, m.walls[0]);
    expect(perfil).toMatchObject({
      comprimentoMm: 4000,
      alturaMm: 2800,
      espessuraMm: T,
      elevacaoBaseMm: 0,
    });
    expect(perfil.furos).toHaveLength(1);
    expect(perfil.furos[0]).toMatchObject({ x0: 1000, x1: 2500, y0: 900, y1: 2100, kind: 'window' });
  });
});
