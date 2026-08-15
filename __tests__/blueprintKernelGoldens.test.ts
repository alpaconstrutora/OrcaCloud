/**
 * Golden files do kernel geométrico (PRD §20.1).
 *
 * ⚠️ Hashes revisados TRÊS vezes, e as três por mudança de FORMATO, nunca de
 * geometria. Nas três, a contagem de ambientes dos seis casos seguiu idêntica — é
 * essa asserção, e não o hash, que prova que o desenho não mudou. As três vieram
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
 *   0.3.0 → 0.4.0 (14/08/2026): `Opening` ganhou `hingeAtStart`/`swingReversed`
 *   (girar/espelhar porta). Nenhum dos seis casos abaixo tem abertura — `openings`
 *   continua `[]` nos seis — então o hash só mudou pela versão embutida no
 *   payload, não pelo conteúdo. É exatamente o que este arquivo existe para pegar
 *   se algum dia NÃO fosse esse o motivo.
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
    hash: '6fe1d7c854d48b56ab642622008e22d58e2ea7d9b3228561b0d34735c10e65bc',
  },
  grid7: {
    walls: grid(7),
    spaces: 49,
    hash: '82b97b5ccb1b4ea398c858c09176ebf048b69d78ae4077ee1786f88ca7927f10',
  },
  grid12: {
    walls: grid(12),
    spaces: 144,
    hash: '28f52bc96fea4425a62d0d00c4cd41d5c54332f9d9be11d5e355d35817a68e97',
  },

  // Três anéis encaixados sem se tocarem: exercita contenção entre componentes
  // desconexos, que é onde a heurística "a maior área é a face externa" quebrava.
  ilhaAninhada: {
    walls: [...grid(1, 24000), ...grid(1, 12000, 6000, 6000), ...grid(1, 4000, 10000, 10000)],
    spaces: 3,
    hash: '72220a2d9877d56b7ad31e9c122dbe8939907eac8035d210d6ced82712bceaca',
  },

  // 14 retas oblíquas em posição geral. O deslocamento quadrático na ponta superior
  // é deliberado: com deslocamento linear nas duas pontas as retas ficam
  // CONCORRENTES num único ponto, um feixe que não tem face limitada nenhuma.
  // As 78 faces são exatamente (n−1)(n−2)/2 para n = 14.
  obliquos: {
    walls: Array.from({ length: 14 }, (_, i) => line(i * 700, 0, 9000 - i * i * 40, 9000)),
    spaces: 78,
    hash: 'dcfeecf95df4d4c014ed9537010b318281d95bdd81835bd5abc1263731bd1ca8',
  },

  // Verticais a 0 / 4000 / 4003 / 8000 / 8004 mm: pares dentro e fora da tolerância
  // de 5 mm no mesmo desenho.
  quaseTolerancia: {
    walls: [
      ...[0, 4000, 4003, 8000, 8004].map((x) => line(x, 0, x, 6000)),
      ...[0, 3000, 6000].map((y) => line(0, y, 8004, y)),
    ],
    spaces: 4,
    hash: '1e95593c08306890c4696b869fc9267497bd79906f211d3e058101aaaea1fad3',
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
