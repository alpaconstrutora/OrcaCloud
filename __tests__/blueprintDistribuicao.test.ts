/**
 * A DISTRIBUIÇÃO de tomadas (10/09/2026).
 *
 * *"o sistema pode inserir uma tomada no banheiro e o projetista tem o trabalho
 * apenas de mover para o local adequado"*
 *
 * O motor gera posições PROVISÓRIAS: na face da parede, espaçadas
 * uniformemente pelo comprimento livre, fora de portas e janelas, com folga de
 * canto. Quem chama marca como sugeridas; mover é decidir.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { distribuirAoLongo, ladosDePiso } from '../utils/blueprintDistribuicao';

/** Uma sala de 6 × 4 m, paredes de 150. */
function sala(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: t,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 150,
    heightMm: 2800,
  });
  return applyBatch(base, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)])
    .model;
}

const distMin = (p: { x: number; y: number }, segs: { a: { x: number; y: number }; b: { x: number; y: number } }[]) =>
  Math.min(
    ...segs.map((s) => {
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      const c2 = dx * dx + dy * dy;
      let t = c2 ? ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / c2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(s.a.x + t * dx - p.x, s.a.y + t * dy - p.y);
    }),
  );

describe('distribuição · os lados de piso', () => {
  it('⚠️ os lados ficam na FACE da parede, recuados meia espessura do eixo', () => {
    const m = sala();
    const lados = ladosDePiso(m.spaces[0], m.walls);
    expect(lados).toHaveLength(4);
    // A face interna da parede de baixo (eixo y = 0) está em y = 75.
    const ys = lados.flatMap((l) => [l.a.y, l.b.y]);
    expect(Math.min(...ys)).toBe(75);
    expect(Math.max(...ys)).toBe(3925);
    // E cada lado sabe de que parede é.
    expect(lados.every((l) => l.wallId !== null)).toBe(true);
  });
});

describe('distribuição · onde os pontos caem', () => {
  it('n = 1 cai no MEIO do que há de livre', () => {
    const m = sala();
    const lados = ladosDePiso(m.spaces[0], m.walls).slice(0, 1); // só a parede de baixo
    const [p] = distribuirAoLongo(lados, 1, m.walls, m.openings);
    // Face de baixo vai de x = 75 a 5925; o meio é 3000.
    expect(p.at.y).toBe(75);
    expect(p.at.x).toBe(3000);
  });

  it('n pontos ficam uniformemente espaçados', () => {
    const m = sala();
    const lados = ladosDePiso(m.spaces[0], m.walls).slice(0, 1);
    const pts = distribuirAoLongo(lados, 3, m.walls, m.openings, 150);
    expect(pts).toHaveLength(3);
    const xs = pts.map((p) => p.at.x);
    const gaps = [xs[1] - xs[0], xs[2] - xs[1]];
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThanOrEqual(2);
  });

  it('⚠️ NENHUM ponto cai numa porta ou janela', () => {
    // O caso que uma implementação ingênua erra: dividir o comprimento por n e
    // pôr a tomada onde calhar — inclusive no meio do vão da porta.
    const m = sala();
    const parede = m.walls[0]; // a de baixo, 6 m
    const comPorta = applyCommand(m, {
      type: 'AddOpening',
      wallId: parede.id,
      kind: 'door',
      offsetMm: 2500,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;
    const lados = ladosDePiso(comPorta.spaces[0], comPorta.walls).filter((l) => l.wallId === parede.id);
    const pts = distribuirAoLongo(lados, 6, comPorta.walls, comPorta.openings, 150);
    expect(pts).toHaveLength(6);
    for (const p of pts) {
      // A porta ocupa x ∈ [2500, 3400] mais a folga de 150 para cada lado.
      const naPorta = p.at.x > 2500 - 150 && p.at.x < 3400 + 150;
      expect(naPorta, `tomada em x=${p.at.x} caiu na porta`).toBe(false);
    }
  });

  it('a folga de canto é respeitada', () => {
    const m = sala();
    const lados = ladosDePiso(m.spaces[0], m.walls);
    const pts = distribuirAoLongo(lados, 12, m.walls, m.openings, 150);
    const cantos = lados.flatMap((l) => [l.a, l.b]);
    for (const p of pts) {
      const d = Math.min(...cantos.map((c) => Math.hypot(c.x - p.at.x, c.y - p.at.y)));
      expect(d, `tomada a ${d.toFixed(0)} mm do canto`).toBeGreaterThanOrEqual(149);
    }
  });

  it('todos os pontos ficam SOBRE um lado de piso', () => {
    const m = sala();
    const lados = ladosDePiso(m.spaces[0], m.walls);
    for (const p of distribuirAoLongo(lados, 7, m.walls, m.openings)) {
      expect(distMin(p.at, lados)).toBeLessThanOrEqual(1);
    }
  });

  it('⚠️ um lado inteiramente tomado pela porta não recebe ponto — e não empilha', () => {
    const m = sala();
    const parede = m.walls[0];
    // Porta de 5,6 m numa parede de 6 m: sobra só a folga, que é canto.
    const comPortao = applyCommand(m, {
      type: 'AddOpening',
      wallId: parede.id,
      kind: 'door',
      offsetMm: 200,
      widthMm: 5600,
      heightMm: 2100,
      sillMm: 0,
    }).model;
    const lados = ladosDePiso(comPortao.spaces[0], comPortao.walls).filter((l) => l.wallId === parede.id);
    expect(distribuirAoLongo(lados, 3, comPortao.walls, comPortao.openings, 150)).toEqual([]);
  });

  it('n inválido devolve vazio', () => {
    const m = sala();
    const lados = ladosDePiso(m.spaces[0], m.walls);
    expect(distribuirAoLongo(lados, 0, m.walls, m.openings)).toEqual([]);
    expect(distribuirAoLongo(lados, -2, m.walls, m.openings)).toEqual([]);
  });
});
