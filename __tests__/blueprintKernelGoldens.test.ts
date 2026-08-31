/**
 * Golden files do kernel geométrico (PRD §20.1).
 *
 * ⚠️ Hashes revisados SEIS vezes, e as seis por mudança de FORMATO, nunca de
 * geometria. Nas seis, a contagem de ambientes dos seis casos seguiu idêntica — é
 * essa asserção, e não o hash, que prova que o desenho não mudou. As seis vieram
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
 *   0.7.0 → 0.8.0 (30/08/2026): `Wall` ganhou `alinhamento` — de que lado do eixo
 *   estava o traço clicado, para que mudar a espessura depois não arraste a face
 *   que o usuário apontou. Nenhum dos seis casos abaixo é traçado pela face (são
 *   todos construídos como `Wall` cru, sem o campo), e o canônico só EMITE a
 *   chave quando ela difere de `'EIXO'` — então, de novo, só a versão embutida no
 *   payload mudou.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string trocada de
 *   volta para 0.7.0, os SETE testes deste arquivo passaram sem nenhuma outra
 *   alteração, o que só acontece se os seis payloads voltarem byte a byte ao
 *   golden anterior. As contagens (9/49/144/3/78/4) foram afirmadas na linha
 *   ANTES do hash e não falharam em momento nenhum, nem antes nem depois.
 *
 *   0.8.0 → 0.9.0 (30/08/2026): a ESTRUTURA entrou no modelo — `structures`, uma
 *   família nova com seis tipos e três formas geométricas. Nenhum dos seis casos
 *   abaixo tem peça estrutural, e o canônico EMITE a chave `structures` só
 *   quando há alguma (`undefined` quando o array está vazio, para a chave sumir
 *   do payload). Então, mais uma vez, só a versão embutida no payload mudou.
 *
 *   É a primeira família nova desde `Boundary`, e por isso a prova importava
 *   mais do que nas últimas: uma família que fosse emitida como `[]` teria
 *   mudado a forma canônica de TODO desenho do acervo, e o hash teria mudado
 *   pelo motivo errado — indistinguível daqui.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string trocada de
 *   volta para 0.8.0, os SETE testes deste arquivo passaram sem nenhuma outra
 *   alteração — o que só acontece se os seis payloads voltarem byte a byte ao
 *   golden anterior, e portanto se a chave `structures` de fato não aparece em
 *   desenho sem estrutura. As contagens (9/49/144/3/78/4) foram afirmadas na
 *   linha ANTES do hash e não falharam em momento nenhum: as seis falhas foram
 *   todas de hash, nenhuma de geometria.
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
    hash: '786a39eef5b8c30ceffd8462cd5c25f1fc3f9a9bf65e5967523ce0fe51dcca67',
  },
  grid7: {
    walls: grid(7),
    spaces: 49,
    hash: 'cafbe094b1bad4c27438ff285960b6c97928950dd76f1d70a0d84d9c6303d5d2',
  },
  grid12: {
    walls: grid(12),
    spaces: 144,
    hash: '877f17a128b2f4ba550bf2a9da01eb0a1c78f89c9535f579de3d3fdf2253042d',
  },

  // Três anéis encaixados sem se tocarem: exercita contenção entre componentes
  // desconexos, que é onde a heurística "a maior área é a face externa" quebrava.
  ilhaAninhada: {
    walls: [...grid(1, 24000), ...grid(1, 12000, 6000, 6000), ...grid(1, 4000, 10000, 10000)],
    spaces: 3,
    hash: 'a66329eb60a71abd507684b878f7d7ce841cfa3cdefb0e4e0c1246834311de47',
  },

  // 14 retas oblíquas em posição geral. O deslocamento quadrático na ponta superior
  // é deliberado: com deslocamento linear nas duas pontas as retas ficam
  // CONCORRENTES num único ponto, um feixe que não tem face limitada nenhuma.
  // As 78 faces são exatamente (n−1)(n−2)/2 para n = 14.
  obliquos: {
    walls: Array.from({ length: 14 }, (_, i) => line(i * 700, 0, 9000 - i * i * 40, 9000)),
    spaces: 78,
    hash: 'c5774bddcd233b517c809a41052985a5d1c6e4b31402cc2e444347734afae509',
  },

  // Verticais a 0 / 4000 / 4003 / 8000 / 8004 mm: pares dentro e fora da tolerância
  // de 5 mm no mesmo desenho.
  quaseTolerancia: {
    walls: [
      ...[0, 4000, 4003, 8000, 8004].map((x) => line(x, 0, x, 6000)),
      ...[0, 3000, 6000].map((y) => line(0, y, 8004, y)),
    ],
    spaces: 4,
    hash: '8cb24f4ae69c733b7e905b861d55b34b9a943385ea5c75149227c6f70b9751fe',
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
