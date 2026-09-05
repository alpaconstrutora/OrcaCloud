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
 *   0.9.0 → 0.10.0 (01/09/2026): `cedeSobreposicao` entrou em `Wall` e em
 *   `Structural` — a decisão de quem abre mão do volume que dois componentes
 *   dividem. É um campo BOOLEANO em família que já existia, e o canônico o emite
 *   só quando `true`: nenhuma das seis geometrias abaixo tem estrutura, quanto
 *   mais um pilar embutido, então nenhuma delas ganha a chave.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string trocada de
 *   volta para 0.9.0, os SETE testes deste arquivo passaram sem nenhuma outra
 *   alteração — o que só acontece se os seis payloads voltarem byte a byte ao
 *   golden anterior, e portanto se a chave nova de fato não aparece em parede
 *   que não cede nada. As contagens (9/49/144/3/78/4) foram afirmadas na linha
 *   ANTES do hash e não falharam em momento nenhum.
 *
 *   0.10.0 → 0.11.0 (01/09/2026): a PAREDE VIROU MULTICAMADA — `Wall` ganhou
 *   `camadas`, uma lista de faixas com espessura, função e código de catálogo.
 *   As seis geometrias abaixo são todas construídas como `Wall` cru, homogêneas,
 *   sem o campo, e o canônico emite `camadas` só quando ela existe — então
 *   nenhuma delas ganha a chave.
 *
 *   Esta entrada tinha um segundo risco, que as anteriores não tinham: junto do
 *   campo entrou um desempate NOVO na ordenação canônica das paredes, por
 *   assinatura de camadas. Desempate mal escrito reordena o array e muda o
 *   payload sem nenhum campo novo aparecer — um jeito de quebrar o acervo que a
 *   prova de reverter a versão pega e mais nada pegaria. Em parede homogênea a
 *   assinatura é `''` para todas, então o desempate é neutro por construção; é
 *   isso que a prova abaixo confirma na prática.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string trocada de
 *   volta para 0.10.0, os SETE testes deste arquivo passaram sem nenhuma outra
 *   alteração — o que só acontece se os seis payloads voltarem byte a byte ao
 *   golden anterior, e portanto se nem a chave `camadas` aparece em parede
 *   homogênea nem o desempate novo reordenou coisa alguma. As contagens
 *   (9/49/144/3/78/4) foram afirmadas na linha ANTES do hash e não falharam em
 *   momento nenhum: as seis falhas foram todas de hash, nenhuma de geometria.
 *
 *   0.11.0 -> 0.12.0 (04/09/2026): o TELHADO entrou no modelo -- `roofs`, a
 *   familia da AGUA (plano inclinado de cobertura). E a segunda familia nova
 *   desde `structures`, e vale a mesma cautela: uma familia emitida como `[]`
 *   teria mudado a forma canonica de TODO desenho do acervo, e o hash teria
 *   mudado pelo motivo errado -- indistinguivel daqui. O canonico emite `roofs`
 *   so quando ha alguma agua.
 *
 *   (!) Mesma prova, refeita antes de tocar num hash: com a string em 0.11.0 e
 *   todo o resto do telhado JA no lugar -- entidade, comandos, canonico,
 *   quantitativo --, os SETE testes deste arquivo passaram sem nenhuma
 *   alteracao. So acontece se os seis payloads continuarem byte a byte iguais,
 *   e portanto se a chave `roofs` de fato nao aparece em desenho sem cobertura.
 *   As contagens (9/49/144/3/78/4) foram afirmadas na linha ANTES do hash e nao
 *   falharam em momento nenhum: as seis falhas foram todas de hash.
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
    hash: '2154c14ddeda970c7fde33f1c17e2a38519f66c5291f9a22a282aef952442abc',
  },
  grid7: {
    walls: grid(7),
    spaces: 49,
    hash: '053fe29de350b1da2098176dbc634a71267e4ca7caf5f339432e2ee42f849189',
  },
  grid12: {
    walls: grid(12),
    spaces: 144,
    hash: '56dd2f5819d62217afc164305c5096bf67aae841884d63b407aff4b2cdaaa263',
  },

  // Três anéis encaixados sem se tocarem: exercita contenção entre componentes
  // desconexos, que é onde a heurística "a maior área é a face externa" quebrava.
  ilhaAninhada: {
    walls: [...grid(1, 24000), ...grid(1, 12000, 6000, 6000), ...grid(1, 4000, 10000, 10000)],
    spaces: 3,
    hash: 'f8487ab2bc57b12583c3248c96c8d23ac4987f9618819c2f27337a85b7b881e4',
  },

  // 14 retas oblíquas em posição geral. O deslocamento quadrático na ponta superior
  // é deliberado: com deslocamento linear nas duas pontas as retas ficam
  // CONCORRENTES num único ponto, um feixe que não tem face limitada nenhuma.
  // As 78 faces são exatamente (n−1)(n−2)/2 para n = 14.
  obliquos: {
    walls: Array.from({ length: 14 }, (_, i) => line(i * 700, 0, 9000 - i * i * 40, 9000)),
    spaces: 78,
    hash: '2e0ba7c56624f0a2dfe069865c929dca27dce01ce0b7fa50839fc72b58f83515',
  },

  // Verticais a 0 / 4000 / 4003 / 8000 / 8004 mm: pares dentro e fora da tolerância
  // de 5 mm no mesmo desenho.
  quaseTolerancia: {
    walls: [
      ...[0, 4000, 4003, 8000, 8004].map((x) => line(x, 0, x, 6000)),
      ...[0, 3000, 6000].map((y) => line(0, y, 8004, y)),
    ],
    spaces: 4,
    hash: '76e6df96e1e5ff6211225f24c6ae8008cf4737256486a9c4b7b020c5d83f7e1e',
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
