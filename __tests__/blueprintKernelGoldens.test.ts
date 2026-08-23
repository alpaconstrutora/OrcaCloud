/**
 * Golden files do kernel geométrico (PRD §20.1).
 *
 * ⚠️ Hashes revisados CINCO vezes, e as cinco por mudança de FORMATO, nunca de
 * geometria. Nas cinco, a contagem de ambientes dos seis casos seguiu idêntica — é
 * essa asserção, e não o hash, que prova que o desenho não mudou. As cinco vieram
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
 *   0.4.0 → 0.5.0 (21/08/2026): `Boundary` ganhou `kind` (TERRENO/DIVISA) e
 *   `papel`, para a ferramenta de terreno. Nenhum dos seis casos abaixo tem
 *   limite — `boundaries` continua `[]` nos seis — então, de novo, só a versão
 *   embutida mudou.
 *
 *   ⚠️ E isso foi PROVADO, não suposto: com a string de versão trocada de volta
 *   para 0.4.0, o payload dos seis casos volta a bater BYTE A BYTE com o golden
 *   anterior, e as contagens de ambientes (9/49/144/3/78/4) seguiram idênticas.
 *   Atualizar golden sem essa conferência é o jeito mais fácil de carimbar uma
 *   regressão de geometria como "mudança de formato".
 *
 *   0.6.0 → 0.7.0 (23/08/2026): a PORTA DE CORRER entrou no modelo — `Opening`
 *   ganhou o tipo `sliding` e o campo `embutida`. Nenhum dos seis casos tem
 *   abertura de espécie nenhuma, e `embutida` é emitida SÓ em abertura de
 *   correr — então, de novo, só a versão embutida no payload mudou.
 *
 *   ⚠️ Mesma prova, refeita: com a string trocada de volta para 0.6.0, os seis
 *   voltaram a bater byte a byte e os sete testes deste arquivo passaram. As
 *   contagens de ambientes (9/49/144/3/78/4) seguiram idênticas — elas são
 *   afirmadas ANTES do hash, e nenhuma delas falhou em momento algum.
 *
 *   0.5.0 → 0.6.0 (21/08/2026): a escritura entrou no modelo — `Boundary` ganhou
 *   `medidaEscrituraMm`/`confrontante` e o modelo ganhou `areaEscrituraMm2`. De
 *   novo nenhum dos seis casos tem limite, e a área de escritura é emitida como
 *   `undefined` quando não informada (some do payload), justamente para que
 *   desenho sem lote não ganhe chave nova. Mesma prova, refeita: com a versão
 *   trocada de volta para 0.5.0, os seis voltam a bater byte a byte, e as
 *   contagens seguiram 9/49/144/3/78/4.
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
    hash: '17edabe87021f231f253482139869a899f42586f89ddc7ff7354c2d7e579f3b6',
  },
  grid7: {
    walls: grid(7),
    spaces: 49,
    hash: 'ee7c508a4593b3377109c2e4378ff3259bf6205bae53b3ed387e2802346f3e46',
  },
  grid12: {
    walls: grid(12),
    spaces: 144,
    hash: 'c5b6c9029da3359e5453497526d839e857b8e7d05742b011fadbb60e987e1287',
  },

  // Três anéis encaixados sem se tocarem: exercita contenção entre componentes
  // desconexos, que é onde a heurística "a maior área é a face externa" quebrava.
  ilhaAninhada: {
    walls: [...grid(1, 24000), ...grid(1, 12000, 6000, 6000), ...grid(1, 4000, 10000, 10000)],
    spaces: 3,
    hash: '11e1f309cb833069d0aa4fb39b9731a3c480d48982c4f17bda1e646a15bc4145',
  },

  // 14 retas oblíquas em posição geral. O deslocamento quadrático na ponta superior
  // é deliberado: com deslocamento linear nas duas pontas as retas ficam
  // CONCORRENTES num único ponto, um feixe que não tem face limitada nenhuma.
  // As 78 faces são exatamente (n−1)(n−2)/2 para n = 14.
  obliquos: {
    walls: Array.from({ length: 14 }, (_, i) => line(i * 700, 0, 9000 - i * i * 40, 9000)),
    spaces: 78,
    hash: '3a336d1422968237ee32543e1614082fca62059a9469a1f1d077177c3472158b',
  },

  // Verticais a 0 / 4000 / 4003 / 8000 / 8004 mm: pares dentro e fora da tolerância
  // de 5 mm no mesmo desenho.
  quaseTolerancia: {
    walls: [
      ...[0, 4000, 4003, 8000, 8004].map((x) => line(x, 0, x, 6000)),
      ...[0, 3000, 6000].map((y) => line(0, y, 8004, y)),
    ],
    spaces: 4,
    hash: '5128ef36beb3298aa4e1bf12cc1ba9eeebf304c8b4024dd6f87246cb4d6167eb',
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
