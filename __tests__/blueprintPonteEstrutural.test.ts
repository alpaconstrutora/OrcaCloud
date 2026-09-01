/**
 * A PONTE ESTRUTURAL — o concreto fechando o anel onde a parede foi cortada.
 *
 * Pedido do usuário (01/09/2026), depois de ver a sobreposição resolvida só no
 * número e no 3D: *"A parede tem de ser cortada de verdade"*. Apresentado o
 * preço medido — partir a parede zera o ambiente —, ele escolheu *"Cortar de
 * verdade, e o pilar fecha o anel"*.
 *
 * O caso de referência é a sala de 4 × 3 m: **12,00 m² de área de eixo**. Ela
 * tem de continuar valendo 12,00 m² depois do corte, senão a ponte não serviu
 * para nada — e é exatamente isso que o primeiro teste afirma.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  emptyModel,
  pontasEncurtadasPorEstrutura,
  sobreposicoesDoModelo,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';

function sala(): { model: BlueprintModel; levelId: string } {
  const base = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
  ]).model;
  return { model: base, levelId: base.levels[0].id };
}

function parede(levelId: string, ax: number, ay: number, bx: number, by: number): Command {
  return {
    type: 'AddWall',
    levelId,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thicknessMm: 150,
    heightMm: 2800,
  };
}

/** Pilar 30 × 30 cm centrado em (x, y), do piso ao teto. */
function pilar(levelId: string, x: number, y: number): Command {
  return {
    type: 'AddStructural',
    levelId,
    kind: 'PILAR',
    pontos: [{ x, y }],
    larguraMm: 300,
    profundidadeMm: 300,
    alturaMm: 2800,
  };
}

describe('ponte estrutural · a sala sobrevive ao corte', () => {
  it('sala fechada = 1 ambiente de 12,00 m² (a referência)', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 0, 0, 4000, 0),
      parede(levelId, 4000, 0, 4000, 3000),
      parede(levelId, 4000, 3000, 0, 3000),
      parede(levelId, 0, 3000, 0, 0),
    ]).model;

    expect(m.spaces).toHaveLength(1);
    expect(m.spaces[0].areaMm2 / 1e6).toBeCloseTo(12, 6);
  });

  it('parede partida SEM pilar: o anel abre e o ambiente some', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 0, 0, 1850, 0),
      parede(levelId, 2150, 0, 4000, 0),
      parede(levelId, 4000, 0, 4000, 3000),
      parede(levelId, 4000, 3000, 0, 3000),
      parede(levelId, 0, 3000, 0, 0),
    ]).model;

    // É o preço que foi medido e apresentado ao usuário antes de decidir.
    expect(m.spaces).toHaveLength(0);
  });

  it('parede partida COM o pilar no vão: 1 ambiente, e os MESMOS 12,00 m²', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 0, 0, 1850, 0),
      parede(levelId, 2150, 0, 4000, 0),
      parede(levelId, 4000, 0, 4000, 3000),
      parede(levelId, 4000, 3000, 0, 3000),
      parede(levelId, 0, 3000, 0, 0),
      // Centro em (2000, 0) e 30 cm de lado: a pegada vai de 1850 a 2150, então
      // as duas pontas cortadas caem DENTRO dela.
      pilar(levelId, 2000, 0),
    ]).model;

    expect(m.spaces).toHaveLength(1);
    // A ponte é uma estrela pelo CENTRO, e as duas pontas são colineares com o
    // eixo removido — então ela recompõe exatamente o que foi tirado. Área
    // idêntica à da sala inteira não é coincidência: é o critério do projeto.
    expect(m.spaces[0].areaMm2 / 1e6).toBeCloseTo(12, 6);
  });

  it('pilar no CANTO reconstrói a quina', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 0, 0, 3850, 0),
      parede(levelId, 4000, 150, 4000, 3000),
      parede(levelId, 4000, 3000, 0, 3000),
      parede(levelId, 0, 3000, 0, 0),
      pilar(levelId, 4000, 0),
    ]).model;

    expect(m.spaces).toHaveLength(1);
    expect(m.spaces[0].areaMm2 / 1e6).toBeCloseTo(12, 6);
  });
});

describe('ponte estrutural · o que NÃO ganha ponte', () => {
  it('pilar no meio da sala não parte nem fecha nada', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 0, 0, 4000, 0),
      parede(levelId, 4000, 0, 4000, 3000),
      parede(levelId, 4000, 3000, 0, 3000),
      parede(levelId, 0, 3000, 0, 0),
      pilar(levelId, 2000, 1500),
    ]).model;

    // A regra de 0.9.0 continua de pé: pilar solto no meio do cômodo não toca o
    // arranjo planar. Nenhuma ponta de parede cai dentro dele.
    expect(m.spaces).toHaveLength(1);
    expect(m.spaces[0].areaMm2 / 1e6).toBeCloseTo(12, 6);
  });

  it('VIGA não fecha anel — ela passa por cima da alvenaria', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 0, 0, 1850, 0),
      parede(levelId, 2150, 0, 4000, 0),
      parede(levelId, 4000, 0, 4000, 3000),
      parede(levelId, 4000, 3000, 0, 3000),
      parede(levelId, 0, 3000, 0, 0),
      {
        type: 'AddStructural',
        levelId,
        kind: 'VIGA',
        pontos: [{ x: 1500, y: 0 }, { x: 2500, y: 0 }],
        larguraMm: 300,
        profundidadeMm: 0,
        alturaMm: 500,
        baseMm: 2300,
      },
    ] as Command[]).model;

    expect(m.spaces).toHaveLength(0);
  });

  it('ESTACA enterrada não fecha anel', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 0, 0, 1850, 0),
      parede(levelId, 2150, 0, 4000, 0),
      parede(levelId, 4000, 0, 4000, 3000),
      parede(levelId, 4000, 3000, 0, 3000),
      parede(levelId, 0, 3000, 0, 0),
      {
        type: 'AddStructural',
        levelId,
        kind: 'ESTACA',
        pontos: [{ x: 2000, y: 0 }],
        larguraMm: 400,
        profundidadeMm: 400,
        alturaMm: 8000,
        baseMm: -9100,
        circular: true,
      },
    ] as Command[]).model;

    // Ela está sob o piso: não é ela que substitui a alvenaria.
    expect(m.spaces).toHaveLength(0);
  });
});

/**
 * ─── O CORTE (Fase 2) ───────────────────────────────────────────────────────
 *
 * `CutWallAtStructural` tira da parede o pedaço que o concreto ocupa. É o que o
 * usuário pediu com todas as letras: *"A parede tem de ser cortada de verdade"*.
 */
function comParedeEPilar(
  x: number,
  comprimento = 4000,
): { model: BlueprintModel; levelId: string } {
  const { model, levelId } = sala();
  const m = applyBatch(model, [
    parede(levelId, 0, 0, comprimento, 0),
    pilar(levelId, x, 0),
  ]).model;
  return { model: m, levelId };
}

describe('corte · a parede deixa de atravessar o concreto', () => {
  it('pilar no MEIO: vira duas paredes, com o vão do pilar entre elas', () => {
    const { model } = comParedeEPilar(2000);
    const m = applyBatch(model, [
      { type: 'CutWallAtStructural', wallId: model.walls[0].id, structuralId: model.structures[0].id },
    ] as Command[]).model;

    expect(m.walls).toHaveLength(2);
    const [um, dois] = [...m.walls].sort((p, q) => p.a.x - q.a.x);
    expect(um.a).toEqual({ x: 0, y: 0 });
    expect(um.b).toEqual({ x: 1850, y: 0 });
    expect(dois.a).toEqual({ x: 2150, y: 0 });
    expect(dois.b).toEqual({ x: 4000, y: 0 });
  });

  it('pilar na PONTA: a parede encurta, e continua sendo a mesma parede', () => {
    const { model } = comParedeEPilar(0);
    const idAntes = model.walls[0].id;
    const m = applyBatch(model, [
      { type: 'CutWallAtStructural', wallId: idAntes, structuralId: model.structures[0].id },
    ] as Command[]).model;

    expect(m.walls).toHaveLength(1);
    // Id preservado: encurtar não é criar peça nova, e trocar o id perderia o
    // que estiver pendurado nela.
    expect(m.walls[0].id).toBe(idAntes);
    expect(m.walls[0].a).toEqual({ x: 150, y: 0 });
    expect(m.walls[0].b).toEqual({ x: 4000, y: 0 });
  });

  it('pilar COBRINDO a parede inteira: ela é removida', () => {
    const { model } = comParedeEPilar(100, 200);
    const m = applyBatch(model, [
      { type: 'CutWallAtStructural', wallId: model.walls[0].id, structuralId: model.structures[0].id },
    ] as Command[]).model;

    expect(m.walls).toHaveLength(0);
  });

  it('as aberturas vão para o trecho certo, com o offset recalculado', () => {
    const { model } = comParedeEPilar(2000);
    const comPorta = applyBatch(model, [
      {
        type: 'AddOpening',
        wallId: model.walls[0].id,
        kind: 'door',
        offsetMm: 3000,
        widthMm: 900,
        heightMm: 2100,
        sillMm: 0,
      },
    ] as Command[]).model;

    const cortado = applyBatch(comPorta, [
      { type: 'CutWallAtStructural', wallId: comPorta.walls[0].id, structuralId: comPorta.structures[0].id },
    ] as Command[]).model;

    expect(cortado.openings).toHaveLength(1);
    const segundo = cortado.walls.find((w) => w.a.x === 2150)!;
    expect(cortado.openings[0].wallId).toBe(segundo.id);
    // Estava a 3,00 m do início da parede inteira; o segundo trecho começa em
    // 2,15 m, então ela passa a 0,85 m do início DELE.
    expect(cortado.openings[0].offsetMm).toBe(850);
  });

  it('RECUSA quando o corte partiria uma abertura', () => {
    const { model } = comParedeEPilar(2000);
    const comPorta = applyBatch(model, [
      {
        type: 'AddOpening',
        wallId: model.walls[0].id,
        kind: 'door',
        offsetMm: 1700,
        widthMm: 900,
        heightMm: 2100,
        sillMm: 0,
      },
    ] as Command[]).model;

    // Sumir com a porta em silêncio seria pior do que não cortar: o desenho
    // continuaria parecendo certo e o orçamento perderia uma esquadria.
    expect(() =>
      applyBatch(comPorta, [
        { type: 'CutWallAtStructural', wallId: comPorta.walls[0].id, structuralId: comPorta.structures[0].id },
      ] as Command[]),
    ).toThrow(/abertura/i);
  });

  it('RECUSA quando a peça não atravessa a parede', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 0, 0, 4000, 0),
      pilar(levelId, 2000, 3000),
    ]).model;

    expect(() =>
      applyBatch(m, [
        { type: 'CutWallAtStructural', wallId: m.walls[0].id, structuralId: m.structures[0].id },
      ] as Command[]),
    ).toThrow(/não atravessa/i);
  });
});

describe('corte · a sala inteira, do jeito que o usuário desenha', () => {
  it('cortar a parede no pilar NÃO tira o ambiente nem muda a área', () => {
    const { model, levelId } = sala();
    const desenhada = applyBatch(model, [
      parede(levelId, 0, 0, 4000, 0),
      parede(levelId, 4000, 0, 4000, 3000),
      parede(levelId, 4000, 3000, 0, 3000),
      parede(levelId, 0, 3000, 0, 0),
      pilar(levelId, 2000, 0),
    ]).model;

    expect(desenhada.spaces).toHaveLength(1);
    const areaAntes = desenhada.spaces[0].areaMm2;

    const cortada = applyBatch(desenhada, [
      {
        type: 'CutWallAtStructural',
        wallId: desenhada.walls[0].id,
        structuralId: desenhada.structures[0].id,
      },
    ] as Command[]).model;

    // É o teste que resume o pedido inteiro: a parede foi cortada de verdade
    // (são 5 paredes agora), e mesmo assim o ambiente continua lá, com a MESMA
    // área — porque o pilar fechou o anel.
    expect(cortada.walls).toHaveLength(5);
    expect(cortada.spaces).toHaveLength(1);
    expect(cortada.spaces[0].areaMm2).toBe(areaAntes);
  });
});

/**
 * ─── A GEOMETRIA REAL DO USUÁRIO ────────────────────────────────────────────
 *
 * Coordenadas tiradas do `draft_payload` do estudo aberto em 01/09/2026 (branch
 * `99d7a8be`), depois do terceiro relato de "continua sobrepondo". O pilar é
 * 15 × 40 cm no encontro de duas paredes de 15 cm — o canto do print.
 *
 * Este caso existe porque as três primeiras rodadas foram verificadas em
 * geometria SINTÉTICA, e ela não reproduzia o que o usuário via.
 */
describe('corte · o canto do estudo real', () => {
  it('o pilar atravessa DUAS paredes; depois do corte, nenhuma o atravessa', () => {
    const { model, levelId } = sala();
    const desenhado = applyBatch(model, [
      // As duas paredes que o pilar atravessa, nas coordenadas do estudo.
      parede(levelId, 23425, -38080, 26945, -38080),
      parede(levelId, 26945, -32285, 26945, -38080),
      {
        type: 'AddStructural',
        levelId,
        kind: 'PILAR',
        pontos: [{ x: 26947, y: -37954 }],
        larguraMm: 150,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
    ] as Command[]).model;

    const peca = desenhado.structures[0];

    // ANTES: duas disputas, uma com cada parede. É o que a detecção via, e o
    // que o usuário via no 3D.
    expect(sobreposicoesDoModelo(desenhado)).toHaveLength(2);

    const cortado = applyBatch(
      desenhado,
      desenhado.walls.map(
        (w) => ({ type: 'CutWallAtStructural', wallId: w.id, structuralId: peca.id }) as const,
      ) as Command[],
    ).model;

    // DEPOIS: nenhuma. É a afirmação direta do pedido — nenhuma parede passa
    // por dentro do concreto. As pontas param NA FACE do pilar, que é onde elas
    // devem parar (a primeira versão deste teste reprovava justamente por
    // contar a face como "dentro").
    expect(sobreposicoesDoModelo(cortado)).toHaveLength(0);
    // O pilar está na PONTA das duas: elas encurtam em vez de partir.
    expect(cortado.walls).toHaveLength(2);
  });
});

/**
 * ─── A EMENDA (o estrago do corte destrutivo) ───────────────────────────────
 *
 * Relato do usuário em 01/09/2026, com print: *"o recorte acontece no momento
 * que o pilar é inserido, mas muitas vezes o pilar precisa de reajuste de
 * posição com snap, e o recorte acaba ficando no local errado. E como o recorte
 * é destrutivo fica um vão onde não deveria e ainda com sobreposição"*.
 *
 * Os números vêm do estudo dele: a parede terminou em x = 26770, e a face do
 * pilar está em 26870 — **100 mm de vão sem nada**.
 */
describe('emenda · a ponta volta para onde o corte a tirou', () => {
  it('acha a ponta curta e diz quanto falta', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 23425, -38080, 26770, -38080),
      {
        type: 'AddStructural',
        levelId,
        kind: 'PILAR',
        pontos: [{ x: 26945, y: -37955 }],
        larguraMm: 150,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
    ] as Command[]).model;

    const curtas = pontasEncurtadasPorEstrutura(m.walls, m.structures[0]);
    expect(curtas).toHaveLength(1);
    expect(curtas[0].end).toBe('b');
    // A ponta volta para a projeção do CENTRO sobre o eixo — 26945, que é
    // exatamente de onde o corte a tirou.
    expect(curtas[0].ate).toEqual({ x: 26945, y: -38080 });
    expect(curtas[0].faltaMm).toBe(175);
  });

  it('emendada, a parede volta a atravessar a peça — e o vão some', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 23425, -38080, 26770, -38080),
      {
        type: 'AddStructural',
        levelId,
        kind: 'PILAR',
        pontos: [{ x: 26945, y: -37955 }],
        larguraMm: 150,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
    ] as Command[]).model;

    // Antes: nenhuma disputa, porque a parede nem chega no pilar. É o estado
    // enganoso — parece resolvido e é só um buraco.
    expect(sobreposicoesDoModelo(m)).toHaveLength(0);

    const curta = pontasEncurtadasPorEstrutura(m.walls, m.structures[0])[0];
    const emendado = applyBatch(m, [
      { type: 'MoveVertex', wallId: curta.wallId, end: curta.end, to: curta.ate },
    ] as Command[]).model;

    expect(emendado.walls[0].b).toEqual({ x: 26945, y: -38080 });
    // Depois: a parede encosta no concreto de novo, e a disputa volta a ser
    // visível — para ser resolvida pelo caminho que NÃO destrói geometria.
    expect(sobreposicoesDoModelo(emendado)).toHaveLength(1);
  });

  it('parede que já chega na peça NÃO é oferecida para emenda', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 23425, -38080, 26945, -38080),
      {
        type: 'AddStructural',
        levelId,
        kind: 'PILAR',
        pontos: [{ x: 26945, y: -37955 }],
        larguraMm: 150,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
    ] as Command[]).model;

    expect(pontasEncurtadasPorEstrutura(m.walls, m.structures[0])).toHaveLength(0);
  });

  it('parede longe da peça não é confundida com ponta curta', () => {
    const { model, levelId } = sala();
    const m = applyBatch(model, [
      parede(levelId, 0, -38080, 3000, -38080),
      {
        type: 'AddStructural',
        levelId,
        kind: 'PILAR',
        pontos: [{ x: 26945, y: -37955 }],
        larguraMm: 150,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
    ] as Command[]).model;

    // 24 metros de distância: o alcance da emenda é 1 m, e existe justamente
    // para não "consertar" uma parede que nunca teve nada com esta peça.
    expect(pontasEncurtadasPorEstrutura(m.walls, m.structures[0])).toHaveLength(0);
  });
});
