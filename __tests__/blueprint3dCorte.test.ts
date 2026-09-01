/**
 * A MALHA da parede quando o concreto a interrompe.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
 *
 * O usuário relatou CINCO vezes que "continua sobreposto", e as cinco
 * verificações anteriores olharam a coisa errada: o payload (que estava certo),
 * o perfil (que estava certo) e prints de cenas SINTÉTICAS com o pilar no meio
 * da parede (onde o defeito não aparece).
 *
 * O defeito estava na malha, e só com o pilar na PONTA: o vão era um
 * `THREE.Path` em `shape.holes`, e furo que encosta na borda do retângulo não é
 * furo — a triangulação do `ExtrudeGeometry` o ignora e a parede sai inteira.
 * Como quase todo pilar fica em canto de parede, o recurso não funcionava
 * justamente onde ele é usado.
 *
 * `ExtrudeGeometry` é JavaScript puro: roda em node, sem WebGL. Não havia
 * desculpa para não ter medido isto antes.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyBatch, emptyModel, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { perfilDaParedeComVaos } from '../utils/blueprintElevation';

/** Reproduz o que `geometriaDaParede` faz, em milímetros do modelo. */
function trechosDaParede(model: BlueprintModel, wall: BlueprintModel['walls'][number]) {
  const perfil = perfilDaParedeComVaos(model, wall);
  const xIni = -perfil.avancoAMm;
  const xFim = perfil.comprimentoMm + perfil.avancoBMm;
  const removidos = perfil.furosEstruturais
    .map((f) => ({ x0: Math.max(xIni, f.x0), x1: Math.min(xFim, f.x1) }))
    .filter((r) => r.x1 > r.x0)
    .sort((a, b) => a.x0 - b.x0);
  const trechos: { x0: number; x1: number }[] = [];
  let cursor = xIni;
  for (const r of removidos) {
    if (r.x0 > cursor) trechos.push({ x0: cursor, x1: r.x0 });
    cursor = Math.max(cursor, r.x1);
  }
  if (cursor < xFim) trechos.push({ x0: cursor, x1: xFim });
  return trechos;
}

function cena(posPilar: { x: number; y: number }, cede: boolean): BlueprintModel {
  const base = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 },
  ]).model;
  const levelId = base.levels[0].id;
  const m = applyBatch(base, [
    {
      type: 'AddWall',
      levelId,
      a: { x: 23425, y: -38080 },
      b: { x: 26945, y: -38080 },
      thicknessMm: 150,
      heightMm: 2800,
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'PILAR',
      pontos: [posPilar],
      larguraMm: 150,
      profundidadeMm: 400,
      alturaMm: 2800,
    },
  ] as Command[]).model;
  return cede
    ? applyBatch(m, [
        { type: 'SetCedeSobreposicao', id: m.walls[0].id, cede: true },
      ] as Command[]).model
    : m;
}

describe('3D · a parede encurta onde o concreto passa', () => {
  it('pilar na PONTA: a parede vira UM trecho, mais curto', () => {
    // As coordenadas do estudo real do usuário.
    const m = cena({ x: 26945, y: -37955 }, true);
    const t = trechosDaParede(m, m.walls[0]);

    expect(t).toHaveLength(1);
    expect(t[0].x0).toBeCloseTo(0, 6);
    // A parede tem 3520 e para em 3445: os últimos 75 mm são do pilar.
    expect(t[0].x1).toBe(3445);
  });

  it('pilar no MEIO: a parede vira DOIS trechos', () => {
    const m = cena({ x: 25000, y: -38080 }, true);
    const t = trechosDaParede(m, m.walls[0]);

    expect(t).toHaveLength(2);
    expect(t[0].x1).toBe(1500);
    expect(t[1].x0).toBe(1650);
  });

  it('sem a marca, a parede continua inteira', () => {
    const m = cena({ x: 26945, y: -37955 }, false);
    const t = trechosDaParede(m, m.walls[0]);
    expect(t).toHaveLength(1);
    expect(t[0].x1).toBe(3520);
  });

  it('⚠️ A MALHA muda de verdade — e como FURO ela não mudava', () => {
    const m = cena({ x: 26945, y: -37955 }, true);
    const perfil = perfilDaParedeComVaos(m, m.walls[0]);
    const A = 2.8;

    // (a) O jeito ANTIGO: retângulo inteiro com o vão como furo na borda.
    const comFuro = new THREE.Shape();
    comFuro.moveTo(0, 0);
    comFuro.lineTo(3.52, 0);
    comFuro.lineTo(3.52, A);
    comFuro.lineTo(0, A);
    comFuro.lineTo(0, 0);
    const f = perfil.furosEstruturais[0];
    const furo = new THREE.Path();
    furo.moveTo(f.x0 / 1000, 0.001);
    furo.lineTo(3.52 - 0.001, 0.001);
    furo.lineTo(3.52 - 0.001, A - 0.001);
    furo.lineTo(f.x0 / 1000, A - 0.001);
    furo.lineTo(f.x0 / 1000, 0.001);
    comFuro.holes.push(furo);
    const geomFuro = new THREE.ExtrudeGeometry(comFuro, { depth: 0.15, bevelEnabled: false });

    // (b) O jeito NOVO: o retângulo já nasce curto.
    const curta = new THREE.Shape();
    curta.moveTo(0, 0);
    curta.lineTo(3.445, 0);
    curta.lineTo(3.445, A);
    curta.lineTo(0, A);
    curta.lineTo(0, 0);
    const geomCurta = new THREE.ExtrudeGeometry(curta, { depth: 0.15, bevelEnabled: false });

    const caixa = (g: THREE.BufferGeometry) => {
      g.computeBoundingBox();
      return g.boundingBox!.max.x;
    };

    // A prova: com o furo na borda, a malha ainda vai até 3,52 m — a parede
    // atravessa o pilar, exatamente o que o usuário via. Encurtando, ela para
    // em 3,445 m, na face do concreto.
    expect(caixa(geomFuro)).toBeCloseTo(3.52, 3);
    expect(caixa(geomCurta)).toBeCloseTo(3.445, 3);
  });
});
