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

describe('geometriaDaParede — lasca no canto', () => {
  it('pilar 14 × 40 no canto de paredes de 15: não sobra trecho de 5 mm entre o pilar e a mitra', () => {
    // A cena do print (16/09/2026): parede vertical em x = 4275, horizontal em
    // y = −525, pilar 400 × 140 (0°) empurrado para dentro só em x. No sentido
    // da parede vertical o pilar cobre y ∈ [−595, −455]; a mitra da parede vai a
    // −600 → sobrava um filete de 5 mm.
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    let m = applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: { x: 4275, y: -525 }, b: { x: 4275, y: 6525 }, thicknessMm: 150, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: { x: 4275, y: -525 }, b: { x: 18325, y: -525 }, thicknessMm: 150, heightMm: 2800 },
    ]).model;
    m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 4400, y: -525 }], larguraMm: 400, profundidadeMm: 140, alturaMm: 2800, rotacaoDeg: 0 }).model;
    m = applyBatch(m, m.walls.map((w) => ({ type: 'SetCedeSobreposicao' as const, id: w.id, cede: true }))).model;
    for (const w of m.walls) {
      const larguras = geometriaDaParede(m, w).map((p) => { p.geom.computeBoundingBox(); const b = p.geom.boundingBox!; return b.max.x - b.min.x; });
      expect(larguras.length).toBeGreaterThan(0);
      expect(Math.min(...larguras)).toBeGreaterThan(0.02);
    }
  });
});

describe('geometriaDaParede — lasca do entalhe', () => {
  it('viga de 15 atravessando uma parede com pilar de 14 embutido: não sobra fatia de 5 mm ao lado do corte', () => {
    // A planta do usuário (16/09/2026): parede vertical com pilar 400 × 140 no T
    // e a viga da parede interna (150 de largura) atravessando — o entalhe da
    // viga sobrava 5 mm de cada lado do corte do pilar.
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    let m = applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: { x: 4275, y: -525 }, b: { x: 4275, y: 6525 }, thicknessMm: 150, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: { x: 4275, y: 3075 }, b: { x: 11725, y: 3075 }, thicknessMm: 150, heightMm: 2800 },
    ]).model;
    m = applyBatch(m, [
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 4400, y: 3075 }], larguraMm: 400, profundidadeMm: 140, alturaMm: 2800, rotacaoDeg: 0 },
      { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [{ x: 4275, y: 3075 }, { x: 11725, y: 3075 }], larguraMm: 150, alturaMm: 400, baseMm: 2400 },
    ]).model;
    m = applyBatch(m, m.walls.map((w) => ({ type: 'SetCedeSobreposicao' as const, id: w.id, cede: true }))).model;
    const vertical = m.walls[0];
    const larguras = geometriaDaParede(m, vertical).map((p) => { p.geom.computeBoundingBox(); const b = p.geom.boundingBox!; return b.max.x - b.min.x; });
    expect(Math.min(...larguras)).toBeGreaterThan(0.02);
  });
});
