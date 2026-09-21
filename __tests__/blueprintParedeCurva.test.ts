/**
 * PAREDE CURVA (20/09/2026, backlog P2 — P2.12, kernel 0.48.0): arco por três
 * pontos discretizado em facetas com o metadado `arco` = {centro, raioMm};
 * o metadado vai e volta pelo canônico, anda rígido em translação/giro/espelho
 * e é RETIRADO quando uma ponta sai do círculo (MoveVertex).
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  arcoConsistente,
  canonicalPayload,
  circuloPorTresPontos,
  discretizarArco,
  emptyModel,
  facetasDoArco,
  FLECHA_MAX_DO_ARCO_MM,
  KERNEL_VERSION,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  polygonArea,
  segmentosDoMesmoArco,
  TOLERANCIA_DO_ARCO_MM,
  type Command,
} from '../utils/blueprintKernel';

function base() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, lvl: m.levels[0].id };
}

describe('parede curva (P2.12)', () => {
  it('círculo por três pontos, facetas dentro da flecha e vértices sobre o círculo; colineares não formam arco', () => {
    const c = circuloPorTresPontos(point(0, 0), point(3000, 3000), point(6000, 0))!;
    expect(c.centro.x).toBeCloseTo(3000, 6);
    expect(c.centro.y).toBeCloseTo(0, 6);
    expect(c.raioMm).toBeCloseTo(3000, 6);
    expect(circuloPorTresPontos(point(0, 0), point(1000, 0), point(2000, 0))).toBeNull();

    const arco = discretizarArco(point(0, 0), point(6000, 0), point(3000, 3000))!;
    expect(arco.raioMm).toBe(3000);
    expect(arco.centro).toEqual({ x: 3000, y: 0 });
    // Meia-volta a r = 3 m: a FLECHA (≤ 10 mm) manda, não o passo de 15° — 20 facetas, 21 vértices, pontas exatas.
    const n = facetasDoArco(3000, Math.PI);
    expect(n).toBe(20);
    expect(arco.vertices).toHaveLength(n + 1);
    expect(arco.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(arco.vertices[n]).toEqual({ x: 6000, y: 0 });
    for (const v of arco.vertices) {
      expect(Number.isInteger(v.x) && Number.isInteger(v.y)).toBe(true);
      expect(Math.abs(Math.hypot(v.x - 3000, v.y) - 3000)).toBeLessThanOrEqual(1);
      // passa pelo lado do ponto do meio (y ≥ 0), nunca pelo outro
      expect(v.y).toBeGreaterThanOrEqual(0);
    }
    // Flecha de cada faceta abaixo do limite.
    for (let i = 1; i < arco.vertices.length; i++) {
      const p = arco.vertices[i - 1];
      const q = arco.vertices[i];
      const meio = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const flecha = 3000 - Math.hypot(meio.x - 3000, meio.y);
      expect(flecha).toBeLessThanOrEqual(FLECHA_MAX_DO_ARCO_MM + 1.5); // + arredondamento ao mm
    }
    // Raio pequeno (300 mm): o passo de 15° manda (flecha de 15° a r=300 é 2,6 mm) — 12 facetas na meia-volta.
    const pequeno = discretizarArco(point(0, 0), point(600, 0), point(300, 300))!;
    expect(pequeno.vertices).toHaveLength(13);
    // Raio enorme: o teto de facetas segura.
    expect(facetasDoArco(1_000_000, Math.PI)).toBe(90);
    // O outro lado: passando por baixo, a curva vai por baixo.
    const baixo = discretizarArco(point(0, 0), point(6000, 0), point(3000, -3000))!;
    expect(baixo.vertices.every((v) => v.y <= 0)).toBe(true);
    // Os dois sentidos: a varredura de um é a oposta da do outro.
    expect(Math.sign(baixo.varreduraRad)).toBe(-Math.sign(arco.varreduraRad));
    expect(Math.abs(baixo.varreduraRad)).toBeCloseTo(Math.PI, 9);
  });

  it('AddCurvedWall grava N facetas com o mesmo arco; fecha ambiente com área próxima da real; canônico vai e volta; retas não ganham chave', () => {
    const { m, lvl } = base();
    // Um "D": três retas e uma curva de meia-volta (raio 3 m) — área = 6×4 + π·3²/2.
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: lvl, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    const r = applyBatch(m, [
      w(0, 0, 0, 4000),
      w(0, 4000, 6000, 4000),
      w(6000, 4000, 6000, 0),
      { type: 'AddCurvedWall', levelId: lvl, a: point(6000, 0), b: point(0, 0), passandoPor: point(3000, -3000), thicknessMm: 150, heightMm: 2800 },
    ]);
    const facetas = r.model.walls.filter((x) => x.arco);
    expect(facetas).toHaveLength(20);
    expect(r.model.walls).toHaveLength(23);
    for (const f of facetas) {
      expect(f.arco).toEqual({ centro: { x: 3000, y: 0 }, raioMm: 3000 });
      expect(arcoConsistente(f)).toBe(true);
    }
    expect(segmentosDoMesmoArco(r.model.walls, facetas[3])).toHaveLength(20);
    // O ambiente fecha e a área de eixo se aproxima de 24 + 14,14 m² (facetas por dentro do arco: um pouco menor).
    expect(r.model.spaces).toHaveLength(1);
    const areaM2 = polygonArea(r.model.spaces[0].ring) / 1e6;
    expect(areaM2).toBeGreaterThan(37.5);
    expect(areaM2).toBeLessThan(38.2);

    // Canônico: só as facetas levam `arco`; ida e volta idêntica.
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.54.0');
    const payload = parseCanonicalPayload(canonicalPayload(r.model));
    expect(payload.walls.filter((x) => x.arco)).toHaveLength(20);
    expect(payload.walls.filter((x) => !x.arco)).toHaveLength(3);
    expect(payload.walls.some((x) => 'arco' in x && x.arco === undefined)).toBe(false);
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(canonicalPayload(r.model));
    expect(volta.walls.filter((x) => x.arco)).toHaveLength(20);

    // Colineares: recusa.
    expect(() => applyCommand(m, { type: 'AddCurvedWall', levelId: lvl, a: point(0, 0), b: point(6000, 0), passandoPor: point(3000, 0), thicknessMm: 150, heightMm: 2800 })).toThrow(/DEGENERATE_ARC|arco/);
  });

  it('translação leva o centro junto; espelho e giro preservam o arco; MoveVertex tira o metadado da faceta que saiu do círculo', () => {
    const { m, lvl } = base();
    const r = applyCommand(m, { type: 'AddCurvedWall', levelId: lvl, a: point(0, 0), b: point(6000, 0), passandoPor: point(3000, 3000), thicknessMm: 150, heightMm: 2800 }).model;
    const ids = r.walls.map((x) => x.id);
    const t = applyCommand(r, { type: 'TranslateEntities', wallIds: ids, boundaryIds: [], structuralIds: [], delta: point(1000, 500), manterJuncoes: false }).model;
    expect(t.walls.every((x) => x.arco && x.arco.centro.x === 4000 && x.arco.centro.y === 500 && arcoConsistente(x))).toBe(true);

    const e = applyCommand(t, { type: 'MirrorEntities', wallIds: ids, boundaryIds: [], structuralIds: [], eixo: 'VERTICAL', em: 0 }).model;
    expect(e.walls.every((x) => x.arco && x.arco.centro.x === -4000 && arcoConsistente(x))).toBe(true);

    const g = applyCommand(t, { type: 'RotateEntities', wallIds: ids, boundaryIds: [], structuralIds: [], centro: point(0, 0), anguloGraus: 90 }).model;
    expect(g.walls.every((x) => x.arco && x.arco.centro.x === -500 && x.arco.centro.y === 4000 && arcoConsistente(x))).toBe(true);

    // Mover uma ponta para fora do círculo: só ESSA faceta vira reta; as outras seguem curvas.
    const alvo = t.walls[5];
    const mv = applyCommand(t, { type: 'MoveVertex', wallId: alvo.id, end: 'b', to: point(alvo.b.x + 200, alvo.b.y + 200) }).model;
    expect(mv.walls.find((x) => x.id === alvo.id)!.arco).toBeUndefined();
    expect(mv.walls.filter((x) => x.arco)).toHaveLength(19);
    // A tolerância é pequena: 3 mm.
    expect(TOLERANCIA_DO_ARCO_MM).toBe(3);
  });
});
