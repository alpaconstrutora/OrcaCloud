/**
 * CLASH de instalação (Etapa 6, fatia 3 — 08/09/2026).
 *
 * ─── A PROVA QUE O PLANO PEDIU ──────────────────────────────────────────────
 *
 * "Um cano atravessando uma viga aparece como conflito **e** o volume de
 * concreto da viga NÃO muda."
 *
 * As duas metades importam. A primeira é o recurso; a segunda é a armadilha:
 * `sobreposicao.ts` já existe e a saída dele vira DESCONTO no quantitativo,
 * porque parede × pilar é problema de dinheiro. Cano × viga é problema de
 * COORDENAÇÃO, e reusar aquele caminho faria a tubulação comer concreto da
 * estrutura — o erro que `sobreposicao.ts` existe para impedir, de cabeça para
 * baixo.
 */
import { describe, expect, it } from 'vitest';
import {
  KERNEL_VERSION,
  POLITICA_PADRAO,
  applyCommand,
  computeQuantities,
  conflitosDoModelo,
  distanciaEntreEixos3D,
  emptyModel,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';

/** Um térreo com uma VIGA de 200 × 400 atravessando de x=0 a x=6000, em y=2000. */
function comViga(): { model: BlueprintModel; nivel: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const nivel = base.levels[0].id;
  const model = applyCommand(base, {
    type: 'AddStructural',
    levelId: nivel,
    kind: 'VIGA',
    pontos: [point(0, 2000), point(6000, 2000)],
    larguraMm: 200,
    // A viga fica logo abaixo da laje: base em 2400, 400 de altura.
    alturaMm: 400,
    baseMm: 2400,
  }).model;
  return { model, nivel };
}

const trecho = (
  m: BlueprintModel,
  nivel: string,
  campos: {
    a: [number, number];
    b: [number, number];
    cotaAMm: number;
    cotaBMm: number;
    bitolaMm?: number;
    disciplina?: 'ELETRICA' | 'AGUA_FRIA' | 'AGUA_QUENTE' | 'ESGOTO';
  },
): BlueprintModel =>
  applyCommand(m, {
    type: 'AddTrecho',
    levelId: nivel,
    disciplina: campos.disciplina ?? 'ELETRICA',
    a: point(campos.a[0], campos.a[1]),
    b: point(campos.b[0], campos.b[1]),
    cotaAMm: campos.cotaAMm,
    cotaBMm: campos.cotaBMm,
    bitolaMm: campos.bitolaMm ?? 25,
  }).model;

describe('⚠️ a prova do plano: acusa, e NÃO desconta', () => {
  it('o cano que atravessa a viga aparece como conflito', () => {
    const { model, nivel } = comViga();
    // Cruzando a viga perpendicularmente, na altura dela (2600 está entre 2400
    // e 2800).
    const m = trecho(model, nivel, {
      a: [3000, 0],
      b: [3000, 4000],
      cotaAMm: 2600,
      cotaBMm: 2600,
    });

    const conflitos = conflitosDoModelo(m);
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].classe).toBe('ESTRUTURA');
    // A viga tem 200 mm de largura, e o cano a cruza de lado a lado.
    expect(conflitos[0].comprimentoDentroMm).toBeCloseTo(200, 3);
  });

  it('⚠️ e o VOLUME DE CONCRETO da viga não muda por causa dele', () => {
    // É a metade que protege o orçamento. Se o clash caísse no caminho da
    // sobreposição, a viga passaria a ser paga a menos porque um eletroduto
    // passou por dentro.
    const { model, nivel } = comViga();
    const antes = computeQuantities(model, POLITICA_PADRAO, KERNEL_VERSION);
    const m = trecho(model, nivel, {
      a: [3000, 0],
      b: [3000, 4000],
      cotaAMm: 2600,
      cotaBMm: 2600,
    });
    const depois = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION);

    expect(depois.totais.volumeConcretoVigaM3).toBeCloseTo(
      antes.totais.volumeConcretoVigaM3,
      9,
    );
    expect(depois.estruturas[0].volumeConcretoM3).toBeCloseTo(antes.estruturas[0].volumeConcretoM3, 9);
    // E a lista de sobreposições — a que vira desconto — continua vazia.
    expect(depois.sobreposicoes).toEqual([]);
  });
});

describe('o que NÃO é conflito', () => {
  it('⚠️ cano DENTRO DE PAREDE não entra na lista — é onde ele mora', () => {
    // Eletroduto embutido é rotina de obra. Acusar cada um encheria a lista de
    // linhas normais, e a primeira consequência é ninguém mais olhar.
    const base = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    }).model;
    const nivel = base.levels[0].id;
    const comParede = applyCommand(base, {
      type: 'AddWall',
      levelId: nivel,
      a: point(0, 0),
      b: point(4000, 0),
      thicknessMm: 150,
      heightMm: 2800,
    }).model;
    // Uma prumada exatamente no eixo da parede.
    const m = trecho(comParede, nivel, {
      a: [2000, 0],
      b: [2000, 0],
      cotaAMm: 0,
      cotaBMm: 2500,
    });
    expect(conflitosDoModelo(m)).toEqual([]);
  });

  it('o cano que passa ABAIXO da viga não conflita', () => {
    // A viga vai de 2400 a 2800. Um cano a 2000 passa livre — e é aqui que a
    // COTA prova o seu valor: em planta os dois se cruzam.
    const { model, nivel } = comViga();
    const m = trecho(model, nivel, {
      a: [3000, 0],
      b: [3000, 4000],
      cotaAMm: 2000,
      cotaBMm: 2000,
    });
    expect(conflitosDoModelo(m)).toEqual([]);
  });

  it('⚠️ mas ele conflita se a ESPESSURA alcançar, mesmo com o eixo livre', () => {
    // Cano de 100 mm com o eixo a 2360: o eixo está 40 mm abaixo da face da
    // viga, e o raio é 50. A tubulação não é uma linha.
    const { model, nivel } = comViga();
    const m = trecho(model, nivel, {
      a: [3000, 0],
      b: [3000, 4000],
      cotaAMm: 2360,
      cotaBMm: 2360,
      bitolaMm: 100,
    });
    expect(conflitosDoModelo(m)).toHaveLength(1);

    // E o mesmo cano 60 mm mais abaixo já passa livre.
    const folgado = trecho(model, nivel, {
      a: [3000, 0],
      b: [3000, 4000],
      cotaAMm: 2300,
      cotaBMm: 2300,
      bitolaMm: 100,
    });
    expect(conflitosDoModelo(folgado)).toEqual([]);
  });
});

describe('entre disciplinas', () => {
  it('dois canos no mesmo lugar conflitam; a MESMA disciplina não', () => {
    const { model, nivel } = comViga();
    let m = trecho(model, nivel, {
      a: [0, 500],
      b: [4000, 500],
      cotaAMm: 1000,
      cotaBMm: 1000,
      disciplina: 'AGUA_FRIA',
      bitolaMm: 25,
    });
    // Cruzando no mesmo ponto e na mesma cota, de OUTRA disciplina.
    m = trecho(m, nivel, {
      a: [2000, 0],
      b: [2000, 2000],
      cotaAMm: 1000,
      cotaBMm: 1000,
      disciplina: 'ESGOTO',
      bitolaMm: 100,
    });
    const cruzados = conflitosDoModelo(m).filter((c) => c.classe === 'REDE');
    expect(cruzados).toHaveLength(1);
    expect(cruzados[0].folgaEntreEixosMm).toBeCloseTo(0, 6);

    // Agora o mesmo cruzamento, com as duas de água fria: é uma JUNÇÃO, e a
    // rede funcionando não é pendência.
    let iguais = trecho(model, nivel, {
      a: [0, 500],
      b: [4000, 500],
      cotaAMm: 1000,
      cotaBMm: 1000,
      disciplina: 'AGUA_FRIA',
    });
    iguais = trecho(iguais, nivel, {
      a: [2000, 0],
      b: [2000, 2000],
      cotaAMm: 1000,
      cotaBMm: 1000,
      disciplina: 'AGUA_FRIA',
    });
    expect(conflitosDoModelo(iguais).filter((c) => c.classe === 'REDE')).toEqual([]);
  });

  it('⚠️ cruzar em PLANTA não basta — a cota separa', () => {
    // Dois canos que se cruzam vistos de cima, a um metro um do outro em
    // altura. Medir em planta acusaria conflito em cada cruzamento de traço.
    const { model, nivel } = comViga();
    let m = trecho(model, nivel, {
      a: [0, 500],
      b: [4000, 500],
      cotaAMm: 400,
      cotaBMm: 400,
      disciplina: 'AGUA_FRIA',
    });
    m = trecho(m, nivel, {
      a: [2000, 0],
      b: [2000, 2000],
      cotaAMm: 1400,
      cotaBMm: 1400,
      disciplina: 'ESGOTO',
    });
    expect(conflitosDoModelo(m).filter((c) => c.classe === 'REDE')).toEqual([]);
  });
});

describe('a distância entre eixos, sozinha', () => {
  const p = (x: number, y: number, z: number) => ({ x, y, z });

  it('dois segmentos que se cruzam dão zero', () => {
    expect(
      distanciaEntreEixos3D(p(0, 0, 0), p(10, 0, 0), p(5, -5, 0), p(5, 5, 0)),
    ).toBeCloseTo(0, 9);
  });

  it('paralelos dão a distância entre as retas', () => {
    expect(distanciaEntreEixos3D(p(0, 0, 0), p(10, 0, 0), p(0, 3, 4), p(10, 3, 4))).toBeCloseTo(
      5,
      9,
    );
  });

  it('⚠️ quando o mínimo cai FORA do segmento, vale a ponta', () => {
    // Sem travar `s` e `t` em [0,1] e reprojetar, o resultado seria a distância
    // entre as RETAS infinitas — menor que a real, e o clash acusaria encontro
    // onde não há.
    expect(distanciaEntreEixos3D(p(0, 0, 0), p(1, 0, 0), p(10, 0, 0), p(11, 0, 0))).toBeCloseTo(
      9,
      9,
    );
  });
});

describe('a lista', () => {
  it('sem instalação, não há conflito nenhum', () => {
    expect(conflitosDoModelo(comViga().model)).toEqual([]);
  });

  it('cada par aparece UMA vez, e a ordem é estável', () => {
    const { model, nivel } = comViga();
    let m = trecho(model, nivel, {
      a: [1000, 0],
      b: [1000, 4000],
      cotaAMm: 2600,
      cotaBMm: 2600,
    });
    m = trecho(m, nivel, {
      a: [5000, 0],
      b: [5000, 4000],
      cotaAMm: 2600,
      cotaBMm: 2600,
    });
    const um = conflitosDoModelo(m);
    expect(um).toHaveLength(2);
    expect(conflitosDoModelo(m).map((c) => `${c.trechoId}|${c.outroId}`)).toEqual(
      um.map((c) => `${c.trechoId}|${c.outroId}`),
    );
  });

  it('o conflito carrega o UID dos dois lados, não só o id', () => {
    // O id é a posição na ordem canônica DESTE payload; o uid é o elemento.
    // Uma pendência de coordenação sobrevive à publicação, e ancorá-la no id a
    // faria mudar de dono na revisão seguinte.
    const { model, nivel } = comViga();
    const m = trecho(model, nivel, {
      a: [3000, 0],
      b: [3000, 4000],
      cotaAMm: 2600,
      cotaBMm: 2600,
    });
    const [c] = conflitosDoModelo(m);
    expect(c.trechoUid).toBe(m.trechos[0].uid);
    expect(c.outroUid).toBe(m.structures[0].uid);
  });
});
