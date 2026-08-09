/**
 * Golden files do kernel geométrico (PRD §20.1).
 *
 * ⚠️ Hashes revisados DUAS vezes, e as duas por mudança de FORMATO, nunca de
 * geometria. Nas duas, a contagem de ambientes dos seis casos seguiu idêntica — é
 * essa asserção, e não o hash, que prova que o desenho não mudou. As duas vieram
 * acompanhadas de bump de `KERNEL_VERSION`.
 *
 *   0.1.0 → 0.2.0 (08/08/2026): o payload passou a referenciar nível e parede por
 *   índice em vez de `levelId`/`wallId`, para parar de vazar identificador volátil.
 *
 *   0.2.0 → 0.3.0 (09/08/2026): entraram as etiquetas de ambiente (`labels`). São
 *   conteúdo, não decoração — renomear um ambiente muda o desenho de forma
 *   observável e precisa mudar o hash, senão publicar depois de renomear seria
 *   idempotente e o nome nunca chegaria ao snapshot.
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
    labels: [],
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
    hash: 'e207714dd479df85310adaf81a8263dff719318adc2fc8dde4e201235253c06d',
  },
  grid7: {
    walls: grid(7),
    spaces: 49,
    hash: 'a9e3d13793e4794e3f5ba03f8ad0ae38097e27d5ad5e5c073391f047879df34c',
  },
  grid12: {
    walls: grid(12),
    spaces: 144,
    hash: 'aa86f76c5f299e5fc67c72a1ba8128d7bbc5c21458cbf80a05a448a5d9e626c9',
  },

  // Três anéis encaixados sem se tocarem: exercita contenção entre componentes
  // desconexos, que é onde a heurística "a maior área é a face externa" quebrava.
  ilhaAninhada: {
    walls: [...grid(1, 24000), ...grid(1, 12000, 6000, 6000), ...grid(1, 4000, 10000, 10000)],
    spaces: 3,
    hash: '16203ab4161ca7097c3d4edb682d4ee874befcc1a75089357ff9d3129846fef6',
  },

  // 14 retas oblíquas em posição geral. O deslocamento quadrático na ponta superior
  // é deliberado: com deslocamento linear nas duas pontas as retas ficam
  // CONCORRENTES num único ponto, um feixe que não tem face limitada nenhuma.
  // As 78 faces são exatamente (n−1)(n−2)/2 para n = 14.
  obliquos: {
    walls: Array.from({ length: 14 }, (_, i) => line(i * 700, 0, 9000 - i * i * 40, 9000)),
    spaces: 78,
    hash: 'db2d7a0f2b4d3acba8ed3ec265d6c8fd564d63997644663d57a148a7dafdc5ad',
  },

  // Verticais a 0 / 4000 / 4003 / 8000 / 8004 mm: pares dentro e fora da tolerância
  // de 5 mm no mesmo desenho.
  quaseTolerancia: {
    walls: [
      ...[0, 4000, 4003, 8000, 8004].map((x) => line(x, 0, x, 6000)),
      ...[0, 3000, 6000].map((y) => line(0, y, 8004, y)),
    ],
    spaces: 4,
    hash: 'a7ec9297c06bee707e56e9e7527037d548ecb2107ead91f21fbc3b036fa9ec1d',
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
