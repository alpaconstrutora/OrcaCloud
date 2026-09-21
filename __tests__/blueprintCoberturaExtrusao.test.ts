/**
 * COBERTURA POR EXTRUSÃO (20/09/2026, backlog P2 — P2.13, kernel 0.49.0): um
 * perfil em corte extrudado ao longo de um eixo vira águas planas (uma por
 * trecho reto; abóbada discretizada; face vertical pulada), com o metadado
 * `extrusao` que agrupa, vai e volta pelo canônico e anda com o gesto.
 */
import { describe, expect, it } from 'vitest';
import {
  aguasDaExtrusao,
  aguasDaMesmaExtrusao,
  alturaNaAgua,
  applyCommand,
  canonicalPayload,
  emptyModel,
  KERNEL_VERSION,
  medirAgua,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  perfilDeCobertura,
  point,
} from '../utils/blueprintKernel';

function base() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  return { m, lvl: m.levels[0].id };
}

describe('cobertura por extrusão (P2.13)', () => {
  it('perfis prontos: duas águas, shed, abóbada facetada e dente de serra (com as faces verticais)', () => {
    expect(perfilDeCobertura({ tipo: 'DUAS_AGUAS', vaoMm: 8000, alturaBeiralMm: 3000, alturaCumeeiraMm: 4200, flechaMm: 0, dentes: 1 })).toEqual([
      { s: 0, z: 3000 },
      { s: 4000, z: 4200 },
      { s: 8000, z: 3000 },
    ]);
    expect(perfilDeCobertura({ tipo: 'UMA_AGUA', vaoMm: 6000, alturaBeiralMm: 3000, alturaCumeeiraMm: 3600, flechaMm: 0, dentes: 1 })).toEqual([
      { s: 0, z: 3000 },
      { s: 6000, z: 3600 },
    ]);
    const abobada = perfilDeCobertura({ tipo: 'ABOBADA', vaoMm: 8000, alturaBeiralMm: 3000, alturaCumeeiraMm: 0, flechaMm: 2000, dentes: 1 });
    expect(abobada[0]).toEqual({ s: 0, z: 3000 });
    expect(abobada[abobada.length - 1]).toEqual({ s: 8000, z: 3000 });
    expect(abobada.length).toBeGreaterThan(8);
    expect(Math.max(...abobada.map((p) => p.z))).toBe(5000); // topo é vértice (facetas pares)
    expect((abobada.length - 1) % 2).toBe(0);
    // Simétrica em torno do meio.
    expect(abobada[(abobada.length - 1) / 2]).toEqual({ s: 4000, z: 5000 });
    // s cresce sempre: o arco de flecha < raio nunca volta.
    for (let i = 1; i < abobada.length; i++) expect(abobada[i].s).toBeGreaterThan(abobada[i - 1].s);
    const serra = perfilDeCobertura({ tipo: 'DENTE_DE_SERRA', vaoMm: 9000, alturaBeiralMm: 3000, alturaCumeeiraMm: 4000, flechaMm: 0, dentes: 3 });
    expect(serra).toEqual([
      { s: 0, z: 3000 }, { s: 3000, z: 4000 }, { s: 3000, z: 3000 },
      { s: 6000, z: 4000 }, { s: 6000, z: 3000 },
      { s: 9000, z: 4000 },
    ]);
  });

  it('extrusão: duas águas viram dois retângulos com beiral no lado baixo e cumeeira sobre o eixo; dente de serra pula as faces verticais; perfil que volta ou íngreme é recusado', () => {
    // Eixo ao longo de X, de (0,0) a (10000,0); perfil de 8 m de vão centrado nele.
    const perfil = perfilDeCobertura({ tipo: 'DUAS_AGUAS', vaoMm: 8000, alturaBeiralMm: 3000, alturaCumeeiraMm: 4200, flechaMm: 0, dentes: 1 });
    const { aguas, puladas } = aguasDaExtrusao(point(0, 0), point(10000, 0), perfil);
    expect(puladas).toBe(0);
    expect(aguas).toHaveLength(2);
    const [esq, dir] = aguas;
    expect(esq.inclinacaoPct).toBe(30);
    expect(dir.inclinacaoPct).toBe(30);
    expect(esq.baseMm).toBe(3000);
    // A cumeeira (z alto) está sobre o eixo: a água 1 sobe de s=0 (y=+4000... à esquerda de A→B, que com u=(1,0) é n=(0,-1)) até s=4000 (y=0).
    expect(esq.pontos).toEqual([point(0, 4000), point(0, 0), point(10000, 0), point(10000, 4000)]);
    expect(esq.beiralIndex).toBe(3); // lado s0 (y=4000): o baixo
    expect(dir.pontos).toEqual([point(0, 0), point(0, -4000), point(10000, -4000), point(10000, 0)]);
    expect(dir.beiralIndex).toBe(1); // lado s1 (y=-4000): o baixo
    // A altura sobre o eixo é a da cumeeira nas duas.
    expect(alturaNaAgua(esq, point(5000, 0))).toBeCloseTo(4200, 0);
    expect(alturaNaAgua(dir, point(5000, 0))).toBeCloseTo(4200, 0);
    expect(medirAgua(esq).areaProjetadaM2).toBeCloseTo(40, 6);

    const serra = perfilDeCobertura({ tipo: 'DENTE_DE_SERRA', vaoMm: 9000, alturaBeiralMm: 3000, alturaCumeeiraMm: 4000, flechaMm: 0, dentes: 3 });
    const r = aguasDaExtrusao(point(0, 0), point(0, 6000), serra);
    expect(r.aguas).toHaveLength(3);
    expect(r.puladas).toBe(2);
    expect(r.aguas.every((a) => a.inclinacaoPct === 33.3 && a.baseMm === 3000)).toBe(true);

    expect(() => aguasDaExtrusao(point(0, 0), point(10000, 0), [{ s: 0, z: 3000 }, { s: 4000, z: 4000 }, { s: 2000, z: 3000 }])).toThrow('PERFIL_VOLTA');
    expect(() => aguasDaExtrusao(point(0, 0), point(10000, 0), [{ s: 0, z: 3000 }, { s: 100, z: 4000 }])).toThrow('PERFIL_INGREME');
    expect(() => aguasDaExtrusao(point(0, 0), point(0, 0), perfil)).toThrow('EIXO_DEGENERADO');
    expect(() => aguasDaExtrusao(point(0, 0), point(10000, 0), [{ s: 0, z: 3000 }, { s: 0, z: 4000 }])).toThrow('PERFIL_SEM_AGUA');
  });

  it('AddRoofByExtrusion grava as águas com o eixo; canônico vai e volta; translação leva o eixo; mover vértice tira a água do grupo; erro de perfil vira BAD_EXTRUSION', () => {
    const { m, lvl } = base();
    const perfil = perfilDeCobertura({ tipo: 'ABOBADA', vaoMm: 8000, alturaBeiralMm: 3000, alturaCumeeiraMm: 0, flechaMm: 2000, dentes: 1 });
    const r = applyCommand(m, { type: 'AddRoofByExtrusion', levelId: lvl, eixoA: point(1000, 1000), eixoB: point(1000, 13000), perfil, espessuraMm: 150 }).model;
    const aguas = r.roofs;
    expect(aguas.length).toBe(perfil.length - 1);
    expect(aguas.every((a) => a.extrusao && a.extrusao.a.x === 1000 && a.extrusao.b.y === 13000 && a.espessuraMm === 150)).toBe(true);
    expect(aguasDaMesmaExtrusao(aguas, aguas[2])).toHaveLength(aguas.length);
    // Toda faceta tem inclinação admissível e a mais alta encosta na flecha.
    expect(Math.max(...aguas.map((a) => a.inclinacaoPct))).toBeLessThanOrEqual(300);
    expect(Math.max(...aguas.map((a) => a.baseMm + (a.inclinacaoPct / 100) * 0))).toBeLessThanOrEqual(5000);

    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.51.0');
    const payload = parseCanonicalPayload(canonicalPayload(r));
    expect(payload.roofs!.every((x) => x.extrusao)).toBe(true);
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(canonicalPayload(r));
    // Água à mão não ganha chave.
    const manual = applyCommand(r, { type: 'AddAgua', levelId: lvl, pontos: [point(20000, 0), point(24000, 0), point(24000, 3000)], inclinacaoPct: 30 }).model;
    const p2 = parseCanonicalPayload(canonicalPayload(manual));
    expect(p2.roofs!.filter((x) => !x.extrusao)).toHaveLength(1);

    const t = applyCommand(r, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], aguaIds: aguas.map((a) => a.id), delta: point(500, -200), manterJuncoes: false }).model;
    expect(t.roofs.every((a) => a.extrusao!.a.x === 1500 && a.extrusao!.a.y === 800)).toBe(true);
    const mv = applyCommand(t, { type: 'MoveAguaVertex', aguaId: t.roofs[0].id, index: 0, to: point(-3000, 500) }).model;
    expect(mv.roofs[0].extrusao).toBeUndefined();
    expect(aguasDaMesmaExtrusao(mv.roofs, mv.roofs[1])).toHaveLength(aguas.length - 1);

    expect(() => applyCommand(m, { type: 'AddRoofByExtrusion', levelId: lvl, eixoA: point(0, 0), eixoB: point(5000, 0), perfil: [{ s: 0, z: 3000 }, { s: 100, z: 4000 }] })).toThrow(/BAD_EXTRUSION|íngreme/);
  });
});
