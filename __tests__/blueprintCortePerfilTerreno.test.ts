/**
 * O perfil do terreno natural no CORTE (`utils/blueprintCorte.ts`).
 *
 * O que estes casos protegem:
 * 1. sem terreno, a projeção é EXATAMENTE a de antes — o campo é opcional e
 *    `linhaDoSolo` continua sendo o piso;
 * 2. o `u` do perfil é ABSOLUTO, como o das paredes (armadilha nº 1 do plano
 *    de 05/09) — num plano inclinado conhecido, `v(u)` bate com a conta à mão;
 * 3. `nodata` quebra a polilinha em pedaços em vez de interpolar;
 * 4. a caixa cresce para caber o terreno.
 *
 * Pedido de 10/09/2026 — `docs/planos/2026-09-10-planta-inteligente-topografia.md`.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
  type Corte,
  type Point,
} from '../utils/blueprintKernel';
import { projetarCorte } from '../utils/blueprintCorte';

const H = 2800;

function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;
  const parede = (a: Point, b: Point): Command => ({
    type: 'AddWall',
    levelId,
    a,
    b,
    thicknessMm: 150,
    heightMm: H,
  });
  return applyBatch(base.model, [
    parede(point(0, 0), point(6000, 0)),
    parede(point(6000, 0), point(6000, 4000)),
    parede(point(6000, 4000), point(0, 4000)),
    parede(point(0, 4000), point(0, 0)),
  ]).model;
}

/** Corte horizontal em y = 2000: `u` cai sobre o próprio x. */
function corteHorizontal(m: BlueprintModel): { model: BlueprintModel; corte: Corte } {
  const r = applyCommand(m, { type: 'AddCorte', a: point(-1000, 2000), b: point(7000, 2000) });
  return { model: r.model, corte: r.model.sections[0] };
}

/** Terreno que sobe 10 cm por metro em X, com o zero do desenho na cota 100 m. */
const RAMPA = {
  cotaEmM: (p: Point) => 100 + (p.x / 1000) * 0.1,
  cotaZeroM: 100,
};

describe('corte · perfil do terreno', () => {
  it('sem terreno nada muda: a projeção é a de antes, sem o campo', () => {
    const { model, corte } = corteHorizontal(casa());
    const semNada = projetarCorte(model, { corte });
    const semTerreno = projetarCorte(model, { corte, terreno: null });
    expect(semTerreno).toEqual(semNada);
    expect(semNada.perfilDoTerreno).toBeUndefined();
  });

  it('num plano inclinado, v(u) é a conta à mão — e u é absoluto', () => {
    const { model, corte } = corteHorizontal(casa());
    const proj = projetarCorte(model, { corte, terreno: RAMPA });
    const perfil = proj.perfilDoTerreno!;
    expect(perfil).toHaveLength(1);
    for (const p of perfil[0]) {
      // cota = 100 + u/1000 · 0,1 → v = (cota − 100) · 1000 = u · 0,1, ao mm.
      expect(Math.abs(p.v - p.u * 0.1)).toBeLessThanOrEqual(0.5);
    }
    // Passa além das paredes, com folga dos dois lados.
    const us = perfil[0].map((p) => p.u);
    expect(Math.min(...us)).toBeLessThan(-75);
    expect(Math.max(...us)).toBeGreaterThan(6075);
    // O piso continua sendo o piso.
    expect(proj.linhaDoSolo.v).toBe(0);
  });

  it('nodata quebra a linha em pedaços, nunca interpola por cima do buraco', () => {
    const { model, corte } = corteHorizontal(casa());
    const comBuraco = {
      cotaEmM: (p: Point) => (p.x > 2000 && p.x < 4000 ? null : 100),
      cotaZeroM: 100,
    };
    const proj = projetarCorte(model, { corte, terreno: comBuraco });
    const perfil = proj.perfilDoTerreno!;
    expect(perfil).toHaveLength(2);
    expect(Math.max(...perfil[0].map((p) => p.u))).toBeLessThanOrEqual(2000);
    expect(Math.min(...perfil[1].map((p) => p.u))).toBeGreaterThanOrEqual(4000);
  });

  it('a caixa cresce para caber um terreno acima do pé-direito', () => {
    const { model, corte } = corteHorizontal(casa());
    const morro = { cotaEmM: (p: Point) => 100 + (p.x > 5000 ? 5 : 0), cotaZeroM: 100 };
    const sem = projetarCorte(model, { corte });
    const com = projetarCorte(model, { corte, terreno: morro });
    expect(com.bbox.vMax).toBeGreaterThanOrEqual(5000);
    expect(com.bbox.vMax).toBeGreaterThan(sem.bbox.vMax);
    expect(com.bbox.vMin).toBe(sem.bbox.vMin);
  });

  it('o vértice do lote entra na amostragem, para a quebra cair exata', () => {
    const { model, corte } = corteHorizontal(casa());
    const proj = projetarCorte(model, {
      corte,
      terreno: { ...RAMPA, passoMm: 1000, vertices: [point(1234, 2000)] },
    });
    expect(proj.perfilDoTerreno![0].some((p) => p.u === 1234)).toBe(true);
  });
});
