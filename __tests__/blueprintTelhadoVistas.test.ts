/**
 * TELHADO nas VISTAS — elevação (Fase 2 do plano do telhado).
 *
 * O que interessa provar:
 *
 *  1. a água sai como POLÍGONO, com cada vértice na própria cota — não como o
 *     retângulo envolvente;
 *  2. o TOPO do enquadramento sobe até a cumeeira, e as laterais até o beiral —
 *     senão o telhado sai cortado do quadro;
 *  3. a linha do solo NÃO sobe: continua no piso;
 *  4. água vista de topo (paralela à direção de visão) é degenerada, como a
 *     parede;
 *  5. planta sem telhado não ganha nada — `telhados` vazio, bbox igual ao de antes.
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
import { projetarElevacao } from '../utils/blueprintElevation';

const H = 2800;

function comNivel(): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

function parede(levelId: string, ax: number, ay: number, bx: number, by: number): Command {
  return { type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: H };
}

/** Casa 6 × 4 m com uma água de 30% cobrindo-a, beiral na FRENTE (y = 0), a 2,80 m. */
function casaComAgua(): BlueprintModel {
  const { model, levelId } = comNivel();
  return applyBatch(model, [
    parede(levelId, 0, 0, 6000, 0),
    parede(levelId, 6000, 0, 6000, 4000),
    parede(levelId, 6000, 4000, 0, 4000),
    parede(levelId, 0, 4000, 0, 0),
    {
      type: 'AddAgua',
      levelId,
      // Beiral avança 500 mm além das paredes nos três lados livres.
      pontos: [point(-500, -500), point(6500, -500), point(6500, 4000), point(-500, 4000)],
      inclinacaoPct: 30,
      baseMm: H,
    },
  ] as Command[]).model;
}

describe('telhado · elevação', () => {
  it('a água sai como POLÍGONO com a cota de cada vértice', () => {
    const m = casaComAgua();
    const proj = projetarElevacao(m, { direcao: 'LATERAL_DIREITA' });
    expect(proj.telhados).toHaveLength(1);
    const agua = proj.telhados[0];
    expect(agua.pontos).toHaveLength(4);

    // Beiral em y = −500 → cota 2800. Fundo em y = 4000 → d = 4500 →
    // 2800 + 4500 × 0,30 = 4150.
    const cotas = new Set(agua.pontos.map((p) => p.v));
    expect(cotas).toEqual(new Set([2800, 4150]));
    expect(agua.vMin).toBe(2800);
    expect(agua.vMax).toBe(4150);
  });

  it('vista de FRENTE, a água é uma faixa entre 2800 e 4150 — a rampa aparece de lado', () => {
    // De frente (olhando +y), o beiral está à frente e a cumeeira atrás: os
    // quatro vértices projetam em u = ±… e v = 2800 ou 4150. É um retângulo, mas
    // um retângulo que sobe 1,35 m acima da parede.
    const proj = projetarElevacao(casaComAgua(), { direcao: 'FRENTE' });
    const agua = proj.telhados[0];
    expect(agua.vMax - agua.vMin).toBe(1350);
    expect(agua.uMax - agua.uMin).toBe(7000);
  });

  it('o TOPO do bbox sobe até a cumeeira, as LATERAIS até o beiral, e o SOLO fica', () => {
    const { model, levelId } = comNivel();
    const so = applyBatch(model, [
      parede(levelId, 0, 0, 6000, 0),
      parede(levelId, 6000, 0, 6000, 4000),
      parede(levelId, 6000, 4000, 0, 4000),
      parede(levelId, 0, 4000, 0, 0),
    ]).model;
    const semTelhado = projetarElevacao(so, { direcao: 'FRENTE' });
    const comTelhado = projetarElevacao(casaComAgua(), { direcao: 'FRENTE' });

    expect(semTelhado.bbox.vMax).toBe(H);
    expect(comTelhado.bbox.vMax).toBe(4150);
    // Sem telhado o quadro já vai de −75 a 6075 (o corpo da parede avança meia
    // espessura no canto): 6150. Com o beiral a −500 e 6500, vira 7000 — 850 a
    // mais, e não 1000, porque 150 já estavam lá pelas paredes.
    expect(semTelhado.bbox.uMax - semTelhado.bbox.uMin).toBe(6150);
    expect(comTelhado.bbox.uMin).toBe(-500);
    expect(comTelhado.bbox.uMax).toBe(6500);
    // A linha do solo não sobe.
    expect(comTelhado.linhaDoSolo.v).toBe(semTelhado.linhaDoSolo.v);
    expect(comTelhado.bbox.vMin).toBe(semTelhado.bbox.vMin);
  });

  it('a água entra na ordem de profundidade, como as paredes', () => {
    const proj = projetarElevacao(casaComAgua(), { direcao: 'FRENTE' });
    // Do fundo para a frente: a lista é decrescente em profundidade.
    const profs = proj.telhados.map((a) => a.profundidade);
    expect([...profs].sort((a, b) => b - a)).toEqual(profs);
  });

  it('água vista DE TOPO é degenerada e não entra no enquadramento', () => {
    // Uma faixa de 4 mm em x por 4 m em y, vista de FRENTE (u = x): colapsa em
    // 4 mm, abaixo da tolerância de 5 — o caso patológico que `degenerada`
    // existe para marcar. (De LADO, u = y, e a mesma faixa tem 4 m: não é
    // degenerada — o critério é a largura NA VISTA, não a do polígono.)
    const { model, levelId } = comNivel();
    const m = applyBatch(model, [
      parede(levelId, 0, 0, 6000, 0),
      {
        type: 'AddAgua',
        levelId,
        pontos: [point(0, 0), point(4, 0), point(4, 4000), point(0, 4000)],
        inclinacaoPct: 30,
      },
    ] as Command[]).model;
    const deFrente = projetarElevacao(m, { direcao: 'FRENTE' });
    expect(deFrente.telhados[0].degenerada).toBe(true);
    // O bbox continua o das paredes.
    expect(deFrente.bbox.vMax).toBe(H);

    const deLado = projetarElevacao(m, { direcao: 'LATERAL_DIREITA' });
    expect(deLado.telhados[0].degenerada).toBe(false);
  });

  it('planta sem telhado: `telhados` vazio e tudo o mais igual', () => {
    const { model, levelId } = comNivel();
    const so = applyCommand(model, parede(levelId, 0, 0, 6000, 0)).model;
    const proj = projetarElevacao(so, { direcao: 'FRENTE' });
    expect(proj.telhados).toEqual([]);
    expect(proj.bbox.vMax).toBe(H);
  });
});
