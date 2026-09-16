/**
 * O PILAR DE CANTO come a mitra da parede (16/09/2026).
 *
 * Print do usuário: "nos quatro cantos a alvenaria e o pilar ainda estão se
 * sobrepondo". Medido na planta dele: paredes de 15 cm, pilar 14 × 40 no canto.
 * O corpo da parede nasce no recuo da mitra (+75 mm) e o bisel o empurra até
 * −75; o vão do pilar, [−70, +70], recortado ao CORPO virava [75, 70] — vazio —
 * e sumia. A parede saía inteira, biselada até o canto, atravessando o pilar.
 * O pilar de T da mesma parede, longe da mitra, era recortado certo.
 *
 * Agora o vão é recortado ao ALCANCE da mitra, o primeiro trecho nasce na face
 * do pilar e a ponta ocupada por concreto perde o bisel.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyBatch, emptyModel } from '../utils/blueprintKernel';
import type { Command } from '../utils/blueprintKernel';
import { geometriaDaParede } from '../components/blueprint/Blueprint3DViewer';

/** L de paredes de 15 cm com o pilar 40 × 14 (eixo maior em x) no vértice (4000, 0). */
function canto(opts: { pilar: boolean; cede?: boolean }) {
  const base = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 },
  ]).model;
  const levelId = base.levels[0].id;
  const cmds: Command[] = [
    { type: 'AddWall', levelId, a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thicknessMm: 150, heightMm: 2800 },
    { type: 'AddWall', levelId, a: { x: 4000, y: 0 }, b: { x: 4000, y: 3000 }, thicknessMm: 150, heightMm: 2800 },
  ];
  if (opts.pilar) {
    cmds.push({
      type: 'AddStructural', levelId, kind: 'PILAR',
      pontos: [{ x: 4000, y: 0 }], larguraMm: 400, profundidadeMm: 140, alturaMm: 2800, rotacaoDeg: 0,
    });
  }
  let m = applyBatch(base, cmds).model;
  if (opts.cede !== false) {
    m = applyBatch(m, m.walls.map((w) => ({ type: 'SetCedeSobreposicao', id: w.id, cede: true }) as const) as Command[]).model;
  }
  return m;
}

const caixa = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe('3D · pilar de canto × mitra da parede', () => {
  it('sem pilar, as pontas do canto são biseladas até o alcance da mitra (controle)', () => {
    const m = canto({ pilar: false });
    const [h, v] = m.walls;
    // Horizontal (0 → 4000): a ponta B chega a 4000 + 75 pela face de fora.
    const maxH = Math.max(...geometriaDaParede(m, h).map((p) => caixa(p.geom).max.x));
    expect(maxH).toBeCloseTo(4.075, 3);
    // Vertical (4000,0 → 4000,3000): a ponta A recua até −75.
    const minV = Math.min(...geometriaDaParede(m, v).map((p) => caixa(p.geom).min.x));
    expect(minV).toBeCloseTo(-0.075, 3);
  });

  it('com pilar 40 × 14 no canto, NENHUMA peça das duas paredes entra na pegada do pilar', () => {
    const m = canto({ pilar: true });
    const [h, v] = m.walls;
    // Pegada do pilar: x ∈ [3800, 4200], y ∈ [−70, 70].
    // Horizontal: a parede morre na face do pilar (x = 3800), sem bisel além dela.
    const pecasH = geometriaDaParede(m, h);
    expect(pecasH.length).toBeGreaterThan(0);
    for (const p of pecasH) expect(caixa(p.geom).max.x).toBeLessThanOrEqual(3.8 + 1e-6);
    // Vertical: começa na face do pilar (y = 70 → x local 0,07), nunca em −75.
    const pecasV = geometriaDaParede(m, v);
    expect(pecasV.length).toBeGreaterThan(0);
    for (const p of pecasV) expect(caixa(p.geom).min.x).toBeGreaterThanOrEqual(0.07 - 1e-6);
  });

  it('a ponta LIVRE da parede com pilar no canto continua sem bisel e inteira', () => {
    const m = canto({ pilar: true });
    const [h, v] = m.walls;
    // Ponta A da horizontal (x = 0) é livre: começa em 0.
    expect(Math.min(...geometriaDaParede(m, h).map((p) => caixa(p.geom).min.x))).toBeCloseTo(0, 3);
    // Ponta B da vertical (y = 3000) é livre: vai até 3,0.
    expect(Math.max(...geometriaDaParede(m, v).map((p) => caixa(p.geom).max.x))).toBeCloseTo(3, 3);
  });

  it('parede que NÃO cede segue inteira e biselada — o 3D acompanha o quantitativo', () => {
    const m = canto({ pilar: true, cede: false });
    const [h, v] = m.walls;
    expect(Math.max(...geometriaDaParede(m, h).map((p) => caixa(p.geom).max.x))).toBeCloseTo(4.075, 3);
    expect(Math.min(...geometriaDaParede(m, v).map((p) => caixa(p.geom).min.x))).toBeCloseTo(-0.075, 3);
  });
});
