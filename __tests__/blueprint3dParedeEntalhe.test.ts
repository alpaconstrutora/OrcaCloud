/**
 * A PAREDE NO 3D cede o volume à viga embutida no topo (16/09/2026).
 *
 * Print do usuário: "ainda existe sobreposição alvenaria × viga". A viga
 * (2400..2800 numa parede de 2800) caía como FURO encostado na borda, que o
 * `ExtrudeGeometry` ignora — a parede saía inteira, coplanar com a viga. Agora
 * o perfil da parede é FATIADO e a fatia sob a viga tem só a altura que sobra.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyBatch, applyCommand, emptyModel } from '../utils/blueprintKernel';
import { geometriaDaParede } from '../components/blueprint/Blueprint3DViewer';

function cena(opts: { viga?: boolean; porta?: boolean; pilarBaixo?: boolean } = {}) {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  let m = applyBatch(nivel.model, [
    { type: 'AddWall', levelId: t, a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, thicknessMm: 150, heightMm: 2800 },
  ]).model;
  const wallId = m.walls[0].id;
  if (opts.porta) m = applyCommand(m, { type: 'AddOpening', wallId, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 }).model;
  if (opts.viga) {
    m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [{ x: 0, y: 0 }, { x: 6000, y: 0 }], larguraMm: 150, alturaMm: 400, baseMm: 2400 }).model;
  }
  if (opts.pilarBaixo) {
    // Peça mais baixa que a parede, no meio: NÃO encosta em borda nenhuma → furo.
    m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 3000, y: 0 }], larguraMm: 400, profundidadeMm: 150, alturaMm: 1000, baseMm: 800 }).model;
  }
  m = applyCommand(m, { type: 'SetCedeSobreposicao', id: wallId, cede: true }).model;
  return { m, wall: m.walls[0] };
}

const topo = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!.max.y;
};

describe('geometriaDaParede — o entalhe da viga', () => {
  it('parede que cede com viga no topo: a malha termina na BASE da viga (2,40 m), não nos 2,80', () => {
    const { m, wall } = cena({ viga: true });
    const pecas = geometriaDaParede(m, wall);
    expect(pecas.length).toBeGreaterThan(0);
    for (const p of pecas) expect(topo(p.geom)).toBeCloseTo(2.4, 3);
  });

  it('sem ceder, a parede vai até o topo (2,80 m)', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    let m = applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, thicknessMm: 150, heightMm: 2800 },
    ]).model;
    m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [{ x: 0, y: 0 }, { x: 6000, y: 0 }], larguraMm: 150, alturaMm: 400, baseMm: 2400 }).model;
    const pecas = geometriaDaParede(m, m.walls[0]);
    expect(pecas.map((p) => +topo(p.geom).toFixed(3))).toEqual([2.8]);
  });

  it('a porta continua sendo furo dentro da fatia rebaixada', () => {
    const { m, wall } = cena({ viga: true, porta: true });
    const [comPorta] = geometriaDaParede(m, wall);
    const { m: m2, wall: w2 } = cena({ viga: true });
    const [semPorta] = geometriaDaParede(m2, w2);
    // Furo = mais vértices na malha; o topo segue em 2,40.
    expect(comPorta.geom.attributes.position.count).toBeGreaterThan(semPorta.geom.attributes.position.count);
    expect(topo(comPorta.geom)).toBeCloseTo(2.4, 3);
  });

  it('viga que cobre só parte da parede: fatias — a de baixo da viga rebaixada, as outras inteiras', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    let m = applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, thicknessMm: 150, heightMm: 2800 },
    ]).model;
    m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [{ x: 2000, y: 0 }, { x: 4000, y: 0 }], larguraMm: 150, alturaMm: 400, baseMm: 2400 }).model;
    m = applyCommand(m, { type: 'SetCedeSobreposicao', id: m.walls[0].id, cede: true }).model;
    const topos = geometriaDaParede(m, m.walls[0]).map((p) => +topo(p.geom).toFixed(2)).sort();
    expect(topos).toEqual([2.4, 2.8, 2.8]);
  });

  it('peça mais baixa no MEIO da altura continua furo (uma peça só, topo em 2,80)', () => {
    const { m, wall } = cena({ pilarBaixo: true });
    const pecas = geometriaDaParede(m, wall);
    expect(pecas).toHaveLength(1);
    expect(topo(pecas[0].geom)).toBeCloseTo(2.8, 3);
  });
});
