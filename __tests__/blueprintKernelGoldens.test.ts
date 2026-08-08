/**
 * Golden files do kernel geométrico (PRD §20.1).
 *
 * ⚠️ Hashes revisados uma vez, em 08/08/2026, na virada do kernel 0.1.0 → 0.2.0. A
 * GEOMETRIA não mudou — as contagens de ambientes de todos os seis casos seguiram
 * idênticas. O que mudou foi a serialização: o payload passou a referenciar nível e
 * parede por índice em vez de `levelId`/`wallId`, para parar de vazar identificador
 * volátil. Foi a única revisão legítima até hoje, e ela veio acompanhada de bump de
 * `KERNEL_VERSION`.
 *
 * Trava o payload canônico de seis geometrias. Serve a um propósito específico: o
 * arranjo planar é otimizável de muitas formas — índice espacial, união-busca,
 * rejeição por caixa — e nenhuma delas PODE mudar o resultado. Estes hashes foram
 * capturados da implementação sem nenhum índice e sobreviveram intactos à
 * introdução de todos eles.
 *
 * Se um hash aqui mudar, a pergunta não é "atualizo o golden?". É "o que na
 * geometria mudou, e era para mudar?".
 */

import { describe, expect, it } from 'vitest';
import type { BlueprintModel, Wall } from '../utils/blueprintKernel';
import { recomputeSpaces, snapshotHash } from '../utils/blueprintKernel';

/** Grade k×k de salas quadradas de lado `s`, deslocada por (ox, oy). */
function grid(k: number, s = 3000, ox = 0, oy = 0): Wall[] {
  const walls: Wall[] = [];
  const push = (ax: number, ay: number, bx: number, by: number) => {
    walls.push({
      id: 'tmp',
      levelId: 'lvl_0001',
      a: { x: ox + ax, y: oy + ay },
      b: { x: ox + bx, y: oy + by },
      thicknessMm: 150,
      heightMm: 2800,
    });
  };
  for (let i = 0; i <= k; i++) {
    for (let j = 0; j < k; j++) {
      push(j * s, i * s, (j + 1) * s, i * s);
      push(i * s, j * s, i * s, (j + 1) * s);
    }
  }
  return walls;
}

function model(walls: Wall[]): BlueprintModel {
  return {
    levels: [{ id: 'lvl_0001', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }],
    walls: walls.map((w, i) => ({ ...w, id: `wal_${String(i + 1).padStart(5, '0')}` })),
    openings: [],
    boundaries: [],
    spaces: [],
    seq: {},
  };
}

function line(ax: number, ay: number, bx: number, by: number): Wall {
  return {
    id: 'tmp',
    levelId: 'lvl_0001',
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thicknessMm: 150,
    heightMm: 2800,
  };
}

const CASES: Record<string, { walls: Wall[]; spaces: number; hash: string }> = {
  grid3: {
    walls: grid(3),
    spaces: 9,
    hash: 'b3d98d36a816fbe9b5be08acce7568d1514476165dc926797ad077f5b32a714a',
  },
  grid7: {
    walls: grid(7),
    spaces: 49,
    hash: '7b5bc20492998797669fe7ae0856ca53e8d0a3d5fb775e9e79c6b71ed69e34cd',
  },
  grid12: {
    walls: grid(12),
    spaces: 144,
    hash: '05cf1b0a82b755a247fee63265dd2edc3ee4ff42e54a949509ffe05064ceb18b',
  },

  // Três anéis encaixados sem se tocarem: exercita contenção entre componentes
  // desconexos, que é onde a heurística "a maior área é a face externa" quebrava.
  ilhaAninhada: {
    walls: [...grid(1, 24000), ...grid(1, 12000, 6000, 6000), ...grid(1, 4000, 10000, 10000)],
    spaces: 3,
    hash: '138185a02d034e322ac86d0ed62f92b6c09bc5b61d8554ab10772e8acaeda120',
  },

  // 14 retas oblíquas em posição geral. O deslocamento quadrático na ponta superior
  // é deliberado: com deslocamento linear nas duas pontas as retas ficam
  // CONCORRENTES num único ponto, um feixe que não tem face limitada nenhuma.
  // As 78 faces são exatamente (n−1)(n−2)/2 para n = 14.
  obliquos: {
    walls: Array.from({ length: 14 }, (_, i) => line(i * 700, 0, 9000 - i * i * 40, 9000)),
    spaces: 78,
    hash: '708d3ca49da608dba8333cd7ca31f2d48c1104252d71e1d5c69056d1257e65f8',
  },

  // Verticais a 0 / 4000 / 4003 / 8000 / 8004 mm: pares dentro e fora da tolerância
  // de 5 mm no mesmo desenho.
  quaseTolerancia: {
    walls: [
      ...[0, 4000, 4003, 8000, 8004].map((x) => line(x, 0, x, 6000)),
      ...[0, 3000, 6000].map((y) => line(0, y, 8004, y)),
    ],
    spaces: 4,
    hash: '99e82eeb0503f2f1d800f65ee458f5713bc6787f53c0263df58e8d79453f4194',
  },
};

describe('kernel geométrico · golden files', () => {
  it.each(Object.entries(CASES))('%s mantém o payload canônico', (_name, expected) => {
    const built = recomputeSpaces(model(expected.walls));
    expect(built.spaces).toHaveLength(expected.spaces);
    expect(snapshotHash(built)).toBe(expected.hash);
  });

  it('o mesmo modelo recalculado repetidas vezes não muda de hash', () => {
    const walls = CASES.ilhaAninhada.walls;
    const hashes = Array.from({ length: 4 }, () => snapshotHash(recomputeSpaces(model(walls))));
    expect(new Set(hashes).size).toBe(1);
  });
});
