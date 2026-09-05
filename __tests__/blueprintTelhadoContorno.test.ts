/**
 * "Gerar do contorno do pavimento" — `utils/blueprintTelhadoContorno.ts`.
 *
 * O que interessa provar:
 *  1. o polígono sai pela FACE externa mais o beiral, e não pelo eixo;
 *  2. cada lado usa a meia espessura DA SUA parede — uma casa com fachada grossa
 *     e um lado fino não pode usar uma meia espessura só;
 *  3. beiral zero (platibanda) dá exatamente a face;
 *  4. duas construções soltas dão dois contornos;
 *  5. lado sem parede (divisa) cai na mediana, não em zero.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  polygonArea,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { contornosParaTelhado, meiaEspessuraPorLado } from '../utils/blueprintTelhadoContorno';

function comNivel(): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

const parede = (
  levelId: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t = 150,
): Command => ({
  type: 'AddWall',
  levelId,
  a: point(ax, ay),
  b: point(bx, by),
  thicknessMm: t,
  heightMm: 2800,
});

const xs = (pts: { x: number }[]) => pts.map((p) => p.x);
const ys = (pts: { y: number }[]) => pts.map((p) => p.y);

describe('telhado do contorno', () => {
  it('sai pela FACE mais o beiral: casa 6×4 de 150 mm com beiral 500 vira 7,15 × 5,15', () => {
    // Eixo: 0..6000 × 0..4000. Face externa: −75..6075 × −75..4075.
    // Com beiral 500: −575..6575 × −575..4575 → 7150 × 5150.
    const { model, levelId } = comNivel();
    const casa = applyBatch(model, [
      parede(levelId, 0, 0, 6000, 0),
      parede(levelId, 6000, 0, 6000, 4000),
      parede(levelId, 6000, 4000, 0, 4000),
      parede(levelId, 0, 4000, 0, 0),
    ]).model;

    const [c] = contornosParaTelhado(casa, casa.levels[0], 500);
    expect(c.valido).toBe(true);
    expect(c.pontos).toHaveLength(4);
    expect(Math.min(...xs(c.pontos))).toBe(-575);
    expect(Math.max(...xs(c.pontos))).toBe(6575);
    expect(Math.min(...ys(c.pontos))).toBe(-575);
    expect(Math.max(...ys(c.pontos))).toBe(4575);
    expect(polygonArea(c.pontos)).toBe(7150 * 5150);
  });

  it('cada lado usa a meia espessura DA SUA parede', () => {
    // Fachada de baixo com 250 mm, o resto com 150: o lado de baixo recua 125,
    // os outros 75. Sem isto, o beiral de baixo sairia 5 cm mais curto.
    const { model, levelId } = comNivel();
    const casa = applyBatch(model, [
      parede(levelId, 0, 0, 6000, 0, 250),
      parede(levelId, 6000, 0, 6000, 4000),
      parede(levelId, 6000, 4000, 0, 4000),
      parede(levelId, 0, 4000, 0, 0),
    ]).model;

    const [c] = contornosParaTelhado(casa, casa.levels[0], 0);
    expect(Math.min(...ys(c.pontos))).toBe(-125);
    expect(Math.max(...ys(c.pontos))).toBe(4075);
    expect(Math.min(...xs(c.pontos))).toBe(-75);
    expect(Math.max(...xs(c.pontos))).toBe(6075);
  });

  it('beiral ZERO é a face exata — platibanda', () => {
    const { model, levelId } = comNivel();
    const casa = applyBatch(model, [
      parede(levelId, 0, 0, 6000, 0),
      parede(levelId, 6000, 0, 6000, 4000),
      parede(levelId, 6000, 4000, 0, 4000),
      parede(levelId, 0, 4000, 0, 0),
    ]).model;
    const [c] = contornosParaTelhado(casa, casa.levels[0], 0);
    expect(polygonArea(c.pontos)).toBe(6150 * 4150);
  });

  it('duas construções soltas dão DOIS contornos', () => {
    const { model, levelId } = comNivel();
    const duas = applyBatch(model, [
      parede(levelId, 0, 0, 4000, 0),
      parede(levelId, 4000, 0, 4000, 3000),
      parede(levelId, 4000, 3000, 0, 3000),
      parede(levelId, 0, 3000, 0, 0),
      parede(levelId, 10000, 0, 13000, 0),
      parede(levelId, 13000, 0, 13000, 3000),
      parede(levelId, 13000, 3000, 10000, 3000),
      parede(levelId, 10000, 3000, 10000, 0),
    ]).model;
    const cs = contornosParaTelhado(duas, duas.levels[0], 300);
    expect(cs).toHaveLength(2);
    expect(cs.every((c) => c.valido)).toBe(true);
  });

  it('lado sem parede cai na MEDIANA das espessuras, não em zero', () => {
    const anel = [point(0, 0), point(6000, 0), point(6000, 4000), point(0, 4000)];
    const paredes = [
      { id: 'a', uid: 'x', levelId: 'l', a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { id: 'b', uid: 'y', levelId: 'l', a: point(6000, 0), b: point(6000, 4000), thicknessMm: 250, heightMm: 2800 },
      { id: 'c', uid: 'z', levelId: 'l', a: point(6000, 4000), b: point(0, 4000), thicknessMm: 150, heightMm: 2800 },
    ];
    // O lado 3 (0,4000)→(0,0) não tem parede: mediana de [150, 250, 150] = 150 → 75.
    expect(meiaEspessuraPorLado(anel, paredes)).toEqual([75, 125, 75, 75]);
  });

  it('nível sem parede não devolve contorno nenhum', () => {
    const { model } = comNivel();
    expect(contornosParaTelhado(model, model.levels[0], 500)).toEqual([]);
  });
});
