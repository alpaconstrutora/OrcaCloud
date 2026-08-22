/**
 * O LOTE derivado das divisas (`utils/blueprintTerreno.ts`).
 *
 * O caso central deste arquivo é o quarto: **a área do lote é diferente de
 * `Space.areaMm2` quando há casa dentro**. É o erro que o módulo existe para não
 * cometer, e sem um teste que o exercite ele voltaria na primeira "simplificação"
 * que trocasse a conta pelo ambiente derivado, já pronto ali ao lado.
 *
 * Pedido de 21/08/2026 — `docs/planos/2026-08-21-planta-inteligente-terreno.md`.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  ModelHistory,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  areaEmM2,
  anelDoTerreno,
  calcularAproveitamento,
  divergente,
  divisasDoLote,
  envelopeConstrutivo,
  linhasDoQuadro,
  medidasPorPapel,
  medirTerreno,
  papeisSugeridos,
  RECUOS_ZERO,
} from '../utils/blueprintTerreno';

const H = 2800;

function comNivel(): { model: BlueprintModel; levelId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: base.model, levelId: base.model.levels[0].id };
}

/** Divisas de TERRENO ligando os cantos na ordem dada. `fechar` liga o último ao primeiro. */
function divisas(levelId: string, cantos: { x: number; y: number }[], fechar = true): Command[] {
  const lados: Command[] = [];
  const n = cantos.length;
  for (let i = 0; i < (fechar ? n : n - 1); i++) {
    lados.push({
      type: 'AddBoundary',
      levelId,
      a: point(cantos[i].x, cantos[i].y),
      b: point(cantos[(i + 1) % n].x, cantos[(i + 1) % n].y),
      kind: 'TERRENO',
    });
  }
  return lados;
}

/** Lote retangular de 20 m × 30 m = 600 m². */
const LOTE_20x30 = [
  { x: 0, y: 0 },
  { x: 20_000, y: 0 },
  { x: 20_000, y: 30_000 },
  { x: 0, y: 30_000 },
];

describe('medirTerreno', () => {
  it('lote retangular fechado: área, perímetro e nenhum erro de fechamento', () => {
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30)).model;

    const terreno = medirTerreno(built.boundaries)!;
    expect(terreno.fechado).toBe(true);
    expect(terreno.erroFechamentoMm).toBe(0);
    expect(areaEmM2(terreno)).toBe(600);
    expect(terreno.perimetroMm).toBe(100_000);
    expect(terreno.anel).toHaveLength(4);
    expect(terreno.ladosIds).toHaveLength(4);
  });

  it('lote de 5 lados desiguais — o caso que a ferramenta Polígono não desenhava', () => {
    // A ferramenta Polígono do editor faz polígono REGULAR (lados iguais); um
    // lote não tem lados iguais, e era por isso que não dava para desenhá-lo.
    const { model, levelId } = comNivel();
    const cantos = [
      { x: 0, y: 0 },
      { x: 12_000, y: 0 },
      { x: 15_000, y: 8000 },
      { x: 6000, y: 14_000 },
      { x: 0, y: 9000 },
    ];
    const built = applyBatch(model, divisas(levelId, cantos)).model;

    const terreno = medirTerreno(built.boundaries)!;
    expect(terreno.fechado).toBe(true);
    expect(terreno.anel).toHaveLength(5);
    // Laço do agrimensor sobre os cinco vértices, termo a termo:
    //   (0,0)→(12000,0)          0·0      − 12000·0     =           0
    //   (12000,0)→(15000,8000)   12000·8000 − 15000·0   =  96.000.000
    //   (15000,8000)→(6000,14000) 15000·14000 − 6000·8000 = 162.000.000
    //   (6000,14000)→(0,9000)    6000·9000 − 0·14000    =  54.000.000
    //   (0,9000)→(0,0)           0·0 − 0·9000           =           0
    //   soma 312.000.000, dividido por 2 → 156.000.000 mm² = 156 m²
    expect(terreno.areaMm2).toBe(156_000_000);
    expect(areaEmM2(terreno)).toBe(156);
  });

  it('contorno ABERTO acusa o erro de fechamento em mm, em vez de fechar calado', () => {
    // Todo levantamento tem erro de fechamento — os lados medidos em campo nunca
    // voltam exatamente ao ponto de partida. O número tem de aparecer.
    const { model, levelId } = comNivel();
    const abertos = divisas(levelId, LOTE_20x30, false); // 3 lados, sem o de volta
    const built = applyBatch(model, abertos).model;

    const terreno = medirTerreno(built.boundaries)!;
    expect(terreno.fechado).toBe(false);
    // Do último vértice (0, 30000) de volta ao primeiro (0, 0).
    expect(terreno.erroFechamentoMm).toBe(30_000);
    // A área ainda sai, fechando em reta — e é por isso que o erro vem junto.
    expect(areaEmM2(terreno)).toBe(600);
  });

  it('⚠️ a área do LOTE não sai de Space nenhum — nem existe Space do lote', () => {
    // Este teste guarda DUAS decisões, e as duas custaram uma descoberta:
    //
    // 1. O contorno de TERRENO fica fora do arranjo planar, senão o anel em
    //    volta da casa fecharia uma face e `computeQuantities` derivaria PISO
    //    dela — 900 m² de piso num lote de 30×30 com uma casa de 18 m² dentro.
    // 2. Mesmo que voltasse a fechar face, `Space.areaMm2` é `área − buracos`:
    //    daria a área do QUINTAL, não a do lote. Quanto maior a construção,
    //    menor o "terreno" — e esse número iria para a taxa de ocupação.
    //
    // Por isso a área vem do anel, aqui, e de nenhum outro lugar.
    const { model, levelId } = comNivel();
    const comLote = applyBatch(model, divisas(levelId, LOTE_20x30)).model;

    // Casa de 10 m × 10 m no meio do lote.
    const casa: Command[] = [
      [5000, 5000, 15_000, 5000],
      [15_000, 5000, 15_000, 15_000],
      [15_000, 15_000, 5000, 15_000],
      [5000, 15_000, 5000, 5000],
    ].map(([ax, ay, bx, by]) => ({
      type: 'AddWall',
      levelId,
      a: point(ax, ay),
      b: point(bx, by),
      thicknessMm: 150,
      heightMm: H,
    }));
    const built = applyBatch(comLote, casa).model;

    const terreno = medirTerreno(built.boundaries)!;
    expect(areaEmM2(terreno)).toBe(600); // o lote inteiro, como na matrícula

    // O ÚNICO ambiente derivado é a casa — o lote não gera nenhum.
    expect(built.spaces).toHaveLength(1);
    expect(built.spaces[0].areaMm2).toBe(100_000_000); // 10 m × 10 m, eixo a eixo
    // E nenhum ambiente tem a área do lote, nem hoje nem por acidente amanhã.
    expect(built.spaces.some((s) => s.areaMm2 === terreno.areaMm2)).toBe(false);
  });

  it('limite solto (DIVISA) não entra no lote', () => {
    const { model, levelId } = comNivel();
    const comLote = applyBatch(model, divisas(levelId, LOTE_20x30)).model;
    const comSolto = applyCommand(comLote, {
      type: 'AddBoundary',
      levelId,
      a: point(2000, 2000),
      b: point(8000, 2000),
      // Sem `kind` — o padrão é DIVISA, e ela não pode mexer na área do lote.
    }).model;

    expect(divisasDoLote(comSolto.boundaries)).toHaveLength(4);
    const terreno = medirTerreno(comSolto.boundaries)!;
    expect(areaEmM2(terreno)).toBe(600);
    expect(terreno.fechado).toBe(true);
  });

  it('sem divisa de terreno nenhuma, devolve null em vez de um lote vazio', () => {
    const { model, levelId } = comNivel();
    const soSolto = applyCommand(model, {
      type: 'AddBoundary',
      levelId,
      a: point(0, 0),
      b: point(1000, 0),
    }).model;
    expect(medirTerreno(soSolto.boundaries)).toBeNull();
    expect(anelDoTerreno(soSolto.boundaries)).toEqual([]);
  });

  it('a ordem em que as divisas foram desenhadas não muda o anel nem a área', () => {
    // O anel é caminhado pela topologia, não pela ordem de criação — desenhar o
    // lote em zigue-zague tem de dar o mesmo lote.
    const { model, levelId } = comNivel();
    const lados = divisas(levelId, LOTE_20x30);
    const naOrdem = applyBatch(model, lados).model;
    const embaralhado = applyBatch(model, [lados[2], lados[0], lados[3], lados[1]]).model;

    const a = medirTerreno(naOrdem.boundaries)!;
    const b = medirTerreno(embaralhado.boundaries)!;
    expect(b.fechado).toBe(true);
    expect(b.areaMm2).toBe(a.areaMm2);
    expect(b.anel).toHaveLength(4);
  });

  it('divisa desenhada no sentido inverso não vira área negativa', () => {
    // `polygonArea` é assinada: o sentido do contorno decide o sinal. Área
    // negativa de terreno num orçamento seria absurdo saindo calado.
    const { model, levelId } = comNivel();
    const horario = [...LOTE_20x30].reverse();
    const built = applyBatch(model, divisas(levelId, horario)).model;

    const terreno = medirTerreno(built.boundaries)!;
    expect(terreno.areaMm2).toBeGreaterThan(0);
    expect(areaEmM2(terreno)).toBe(600);
  });
});

describe('envelopeConstrutivo — recuos por lado', () => {
  /** Lote 20×30 com os quatro papéis marcados. */
  function loteComPapeis() {
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30)).model;
    // Ordem das divisas: sul (frente), leste (lateral direita), norte (fundos),
    // oeste (lateral esquerda).
    const papeis = ['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA'] as const;
    const comPapel = applyBatch(
      built,
      built.boundaries.map((b, i) => ({
        type: 'SetBoundaryPapel' as const,
        boundaryId: b.id,
        papel: papeis[i],
      })),
    ).model;
    return comPapel;
  }

  it('recuos DIFERENTES por lado fecham os cantos e dão a área certa', () => {
    // É o caso que `plantaAiEngine.calculateEnvelope` não sabe fazer: lá o
    // terreno é `frontage × depth`, e recuo por lado só existe em retângulo.
    const model = loteComPapeis();
    const terreno = medirTerreno(model.boundaries)!;

    const env = envelopeConstrutivo(terreno, model.boundaries, {
      FRENTE: 5000,
      FUNDOS: 3000,
      LATERAL_DIREITA: 1500,
      LATERAL_ESQUERDA: 1500,
    });

    expect(env.valido).toBe(true);
    expect(env.anel).toHaveLength(4);
    // Sobra 17 m × 22 m = 374 m² dentro de um lote de 20 × 30.
    expect(env.areaMm2).toBe(374_000_000);
  });

  it('divisa SEM papel não recua — recuo inventado é pior que recuo faltando', () => {
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30)).model;
    // Só a frente marcada; as outras três ficam sem papel.
    const comUmPapel = applyCommand(built, {
      type: 'SetBoundaryPapel',
      boundaryId: built.boundaries[0].id,
      papel: 'FRENTE',
    }).model;
    const terreno = medirTerreno(comUmPapel.boundaries)!;

    const env = envelopeConstrutivo(terreno, comUmPapel.boundaries, {
      ...RECUOS_ZERO,
      FRENTE: 5000,
      FUNDOS: 9999,
      LATERAL_DIREITA: 9999,
      LATERAL_ESQUERDA: 9999,
    });

    expect(env.valido).toBe(true);
    // Só o lado da frente andou: 20 m × 25 m = 500 m².
    expect(env.areaMm2).toBe(500_000_000);
  });

  it('sem recuo nenhum, o envelope É o lote — e não "não cabe"', () => {
    const model = loteComPapeis();
    const terreno = medirTerreno(model.boundaries)!;
    const env = envelopeConstrutivo(terreno, model.boundaries, RECUOS_ZERO);
    expect(env.valido).toBe(true);
    expect(env.areaMm2).toBe(terreno.areaMm2);
  });

  it('recuo maior que o lote responde "não cabe" em vez de desenhar o impossível', () => {
    // Recuos que se cruzam produzem um anel invertido, com área positiva que não
    // significa nada. Devolver esse número seria pior que devolver nada.
    const model = loteComPapeis();
    const terreno = medirTerreno(model.boundaries)!;

    const env = envelopeConstrutivo(terreno, model.boundaries, {
      FRENTE: 20_000,
      FUNDOS: 20_000,
      LATERAL_DIREITA: 20_000,
      LATERAL_ESQUERDA: 20_000,
    });

    expect(env.valido).toBe(false);
    expect(env.anel).toEqual([]);
    expect(env.areaMm2).toBe(0);
  });
});

describe('calcularAproveitamento', () => {
  it('taxa de ocupação = área construída ÷ área do lote', () => {
    const { model, levelId } = comNivel();
    const comLote = applyBatch(model, divisas(levelId, LOTE_20x30)).model;

    // Casa de 10 m × 10 m — eixo a eixo, é o que o kernel deriva.
    const casa: Command[] = [
      [5000, 5000, 15_000, 5000],
      [15_000, 5000, 15_000, 15_000],
      [15_000, 15_000, 5000, 15_000],
      [5000, 15_000, 5000, 5000],
    ].map(([ax, ay, bx, by]) => ({
      type: 'AddWall',
      levelId,
      a: point(ax, ay),
      b: point(bx, by),
      thicknessMm: 150,
      heightMm: H,
    }));
    const built = applyBatch(comLote, casa).model;

    const terreno = medirTerreno(built.boundaries)!;
    const ap = calcularAproveitamento(terreno, built.spaces)!;

    expect(ap.areaProjetadaM2).toBe(100);
    // 100 m² em 600 m² de lote.
    expect(ap.taxaOcupacao).toBeCloseTo(100 / 600, 6);
  });

  it('lote sem área devolve null, em vez de dividir por zero', () => {
    const { model, levelId } = comNivel();
    const soUmLado = applyCommand(model, {
      type: 'AddBoundary',
      levelId,
      a: point(0, 0),
      b: point(5000, 0),
      kind: 'TERRENO',
    }).model;
    const terreno = medirTerreno(soUmLado.boundaries)!;
    expect(calcularAproveitamento(terreno, soUmLado.spaces)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Papéis derivados da frente — pedido de 21/08/2026 (compatibilizar com a escritura)
// ─────────────────────────────────────────────────────────────────────────────

/** Papéis de um lote, indexados pela ORDEM do lado no contorno (1-based). */
function papeisPorOrdem(terreno: ReturnType<typeof medirTerreno>, frenteId: string) {
  const mapa = papeisSugeridos(terreno!, frenteId)!;
  return terreno!.ladosIds.map((id) => mapa.get(id) ?? null);
}

describe('papeisSugeridos', () => {
  // ⚠️ OS TRÊS PRIMEIROS CASOS SÃO O QUE DISCRIMINA. Um teste só, com a frente ao
  // sul, passaria com o sinal de `direita` trocado em metade das convenções
  // possíveis. Virando a frente de rumo, a lateral direita tem que ACOMPANHAR — é
  // isso que prova que a conta é "a direita de quem está na rua olhando o lote", e
  // não "o lado leste", que é o que um espelho de sinal produziria.
  it('frente ao SUL: a lateral direita é a leste', () => {
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30)).model;
    const terreno = medirTerreno(built.boundaries)!;

    // Lado 1 do anel é (0,0)→(20000,0), o sul.
    const papeis = papeisPorOrdem(terreno, terreno.ladosIds[0]);
    expect(papeis).toEqual(['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA']);
  });

  it('frente ao NORTE: a direita vira a oeste — o mesmo lote, a rua do outro lado', () => {
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30)).model;
    const terreno = medirTerreno(built.boundaries)!;

    // Lado 3 é (20000,30000)→(0,30000), o norte.
    const papeis = papeisPorOrdem(terreno, terreno.ladosIds[2]);
    expect(papeis).toEqual(['FUNDOS', 'LATERAL_ESQUERDA', 'FRENTE', 'LATERAL_DIREITA']);
  });

  it('frente a LESTE: as laterais giram junto', () => {
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30)).model;
    const terreno = medirTerreno(built.boundaries)!;

    // Lado 2 é (20000,0)→(20000,30000), o leste.
    const papeis = papeisPorOrdem(terreno, terreno.ladosIds[1]);
    expect(papeis).toEqual(['LATERAL_ESQUERDA', 'FRENTE', 'LATERAL_DIREITA', 'FUNDOS']);
  });

  it('lote desenhado no sentido HORÁRIO dá o mesmo resultado', () => {
    // O usuário desenha no sentido que quiser, e a escritura não muda por causa
    // disso. Sem tratar a orientação do anel, a normal interna aponta para FORA
    // do lote e as duas laterais saem trocadas.
    const { model, levelId } = comNivel();
    const horario = [...LOTE_20x30].reverse();
    const built = applyBatch(model, divisas(levelId, horario)).model;
    const terreno = medirTerreno(built.boundaries)!;

    // No anel invertido, o lado sul é (20000,0)→(0,0) — o último.
    const sul = terreno.ladosIds[terreno.anel.findIndex((p) => p.x === 20_000 && p.y === 0)];
    const mapa = papeisSugeridos(terreno, sul)!;
    const papelDoLado = (x: number, y: number) =>
      mapa.get(terreno.ladosIds[terreno.anel.findIndex((p) => p.x === x && p.y === y)]);

    expect(papelDoLado(20_000, 0)).toBe('FRENTE');
    // Saindo do canto sudeste para o sudoeste, o lado que começa em (0,0) é o
    // oeste — que, para quem olha o lote do sul, fica à ESQUERDA.
    expect(papelDoLado(0, 0)).toBe('LATERAL_ESQUERDA');
    expect(papelDoLado(20_000, 30_000)).toBe('LATERAL_DIREITA');
    expect(papelDoLado(0, 30_000)).toBe('FUNDOS');
  });

  it('lote de 5 lados: cada lateral fica CONTÍGUA, sem pular de lado', () => {
    const { model, levelId } = comNivel();
    // Frente ao sul; o lado oeste é quebrado em dois trechos.
    const cantos = [
      { x: 0, y: 0 },
      { x: 20_000, y: 0 },
      { x: 20_000, y: 30_000 },
      { x: 0, y: 30_000 },
      { x: -3000, y: 15_000 },
    ];
    const built = applyBatch(model, divisas(levelId, cantos)).model;
    const terreno = medirTerreno(built.boundaries)!;

    const papeis = papeisPorOrdem(terreno, terreno.ladosIds[0]);
    expect(papeis).toEqual([
      'FRENTE',
      'LATERAL_DIREITA',
      'FUNDOS',
      'LATERAL_ESQUERDA',
      'LATERAL_ESQUERDA',
    ]);
  });

  it('lote ESTREITO E PROFUNDO: a lateral longa não rouba o papel de fundos', () => {
    // 10 × 40. Cada lateral tem 40 m contra os 10 m do fundo — por comprimento,
    // ou por comprimento × afastamento, a lateral ganha. O que a exclui é a
    // primeira etapa: a normal dela é PERPENDICULAR à da frente, não oposta.
    // É o formato de lote mais comum que existe; errar aqui erraria em quase tudo.
    const { model, levelId } = comNivel();
    const cantos = [
      { x: 0, y: 0 },
      { x: 10_000, y: 0 },
      { x: 10_000, y: 40_000 },
      { x: 0, y: 40_000 },
    ];
    const built = applyBatch(model, divisas(levelId, cantos)).model;
    const terreno = medirTerreno(built.boundaries)!;

    const papeis = papeisPorOrdem(terreno, terreno.ladosIds[0]);
    expect(papeis).toEqual(['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA']);
  });

  it('lado CURTO mais afastado não rouba o papel do lado longo oposto', () => {
    // ⚠️ Caso pego OLHANDO O DESENHO, não no código: neste pentágono o lado
    // noroeste (6,71 m) tem o ponto médio 500 mm mais afastado da frente que o
    // lado nordeste (9,85 m). Por "mais afastado" puro — o critério que este
    // módulo teve primeiro — o FUNDOS caía no ladinho curto, e quem olhava a
    // planta via o rótulo no lugar errado. O peso (afastamento × comprimento)
    // é o que põe o papel no lado que forma o grosso da divisa oposta.
    const { model, levelId } = comNivel();
    const cantos = [
      { x: 0, y: 0 },
      { x: 12_000, y: 0 },
      { x: 15_000, y: 6000 },
      { x: 6000, y: 10_000 }, // começa aqui o lado curto do noroeste
      { x: 0, y: 7000 },
    ];
    const built = applyBatch(model, divisas(levelId, cantos)).model;
    const terreno = medirTerreno(built.boundaries)!;

    const mapa = papeisSugeridos(terreno, terreno.ladosIds[0])!;
    const papelDoLadoQueComecaEm = (x: number, y: number) =>
      mapa.get(terreno.ladosIds[terreno.anel.findIndex((p) => p.x === x && p.y === y)]);

    expect(papelDoLadoQueComecaEm(15_000, 6000)).toBe('FUNDOS'); // o de 9,85 m
    expect(papelDoLadoQueComecaEm(6000, 10_000)).not.toBe('FUNDOS'); // o de 6,71 m
  });

  it('fundo partido em dois trechos DA MESMA RETA: os dois viram FUNDOS', () => {
    // O vértice no meio da divisa dos fundos marca onde termina o lote do vizinho
    // e o lado continua reto. Sem a extensão por colinearidade, o trecho de trás
    // vira "lateral", o recuo de fundos não se aplica a ele, e a medida que vai
    // para a ficha do empreendimento sai pela metade.
    const { model, levelId } = comNivel();
    const cantos = [
      { x: 0, y: 0 },
      { x: 20_000, y: 0 },
      { x: 20_000, y: 30_000 },
      { x: 10_000, y: 30_000 }, // vértice no MEIO do fundo, sem dobrar
      { x: 0, y: 30_000 },
    ];
    const built = applyBatch(model, divisas(levelId, cantos)).model;
    const terreno = medirTerreno(built.boundaries)!;

    const papeis = papeisPorOrdem(terreno, terreno.ladosIds[0]);
    expect(papeis).toEqual([
      'FRENTE',
      'LATERAL_DIREITA',
      'FUNDOS',
      'FUNDOS',
      'LATERAL_ESQUERDA',
    ]);
  });

  it('contorno aberto não recebe sugestão — o fundo poderia ser o vão que falta', () => {
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30, false)).model;
    const terreno = medirTerreno(built.boundaries)!;

    expect(terreno.fechado).toBe(false);
    expect(papeisSugeridos(terreno, terreno.ladosIds[0])).toBeNull();
  });

  it('a classificação inteira sai num ÚNICO passo de histórico', () => {
    // O editor aplica os papéis com `runBatch`. Se fossem comandos soltos, um
    // Ctrl+Z desfaria um lado só e deixaria o lote metade classificado — estado
    // que o usuário não pediu e não sabe nomear.
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30)).model;
    const terreno = medirTerreno(built.boundaries)!;
    const papeis = papeisSugeridos(terreno, terreno.ladosIds[0])!;

    const historico = new ModelHistory(built);
    historico.applyMany(
      [...papeis].map(([boundaryId, papel]) => ({
        type: 'SetBoundaryPapel' as const,
        boundaryId,
        papel,
      })),
    );
    expect(historico.current.boundaries.every((b) => b.papel !== null)).toBe(true);

    const desfeito = historico.undo();
    expect(desfeito.boundaries.every((b) => b.papel === null)).toBe(true);
  });

  it('frente que não é lado do lote devolve null, em vez de classificar o resto', () => {
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30)).model;
    const terreno = medirTerreno(built.boundaries)!;

    expect(papeisSugeridos(terreno, 'bnd_9999')).toBeNull();
  });
});

describe('linhasDoQuadro e medidasPorPapel', () => {
  /** Lote 20×30 com os quatro papéis marcados, frente ao sul. */
  function loteClassificado() {
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30)).model;
    const terreno = medirTerreno(built.boundaries)!;
    const mapa = papeisSugeridos(terreno, terreno.ladosIds[0])!;
    const comPapel = applyBatch(
      built,
      [...mapa].map(([boundaryId, papel]) => ({
        type: 'SetBoundaryPapel' as const,
        boundaryId,
        papel,
      })),
    ).model;
    return { model: comPapel, terreno: medirTerreno(comPapel.boundaries)! };
  }

  it('uma linha por lado, NA ORDEM DO CONTORNO', () => {
    const { model, terreno } = loteClassificado();
    const linhas = linhasDoQuadro(terreno, model.boundaries);

    expect(linhas.map((l) => l.ordem)).toEqual([1, 2, 3, 4]);
    expect(linhas.map((l) => l.papel)).toEqual([
      'FRENTE',
      'LATERAL_DIREITA',
      'FUNDOS',
      'LATERAL_ESQUERDA',
    ]);
    expect(linhas.map((l) => l.desenhadoMm)).toEqual([20_000, 30_000, 20_000, 30_000]);
  });

  it('sem medida de escritura não há divergência — não se compara o que ninguém informou', () => {
    const { model, terreno } = loteClassificado();
    const linhas = linhasDoQuadro(terreno, model.boundaries);

    expect(linhas.every((l) => l.escrituraMm === null)).toBe(true);
    expect(linhas.every((l) => l.divergenciaMm === null)).toBe(true);
    expect(linhas.some(divergente)).toBe(false);
  });

  it('divergência de 20 cm acusa; de 5 mm não — a tolerância é o centímetro da escritura', () => {
    const { model, terreno } = loteClassificado();
    const comEscritura = applyBatch(model, [
      {
        type: 'SetBoundaryEscritura',
        boundaryId: terreno.ladosIds[0],
        medidaMm: 19_800,
        confrontante: 'Rua das Acácias',
      },
      {
        type: 'SetBoundaryEscritura',
        boundaryId: terreno.ladosIds[1],
        medidaMm: 29_995,
        confrontante: 'Lote 03',
      },
    ]).model;

    const linhas = linhasDoQuadro(medirTerreno(comEscritura.boundaries)!, comEscritura.boundaries);
    expect(linhas[0].divergenciaMm).toBe(200);
    expect(divergente(linhas[0])).toBe(true);
    expect(linhas[0].confrontante).toBe('Rua das Acácias');

    expect(linhas[1].divergenciaMm).toBe(5);
    expect(divergente(linhas[1])).toBe(false);
  });

  it('medidasPorPapel SOMA os trechos do mesmo papel', () => {
    const { model, levelId } = comNivel();
    // Fundo quebrado em dois trechos de 10 m, que somam os 20 m da frente.
    const cantos = [
      { x: 0, y: 0 },
      { x: 20_000, y: 0 },
      { x: 20_000, y: 30_000 },
      { x: 10_000, y: 30_000 },
      { x: 0, y: 30_000 },
    ];
    const built = applyBatch(model, divisas(levelId, cantos)).model;
    const terreno = medirTerreno(built.boundaries)!;
    const mapa = papeisSugeridos(terreno, terreno.ladosIds[0])!;
    const comPapel = applyBatch(
      built,
      [...mapa].map(([boundaryId, papel]) => ({
        type: 'SetBoundaryPapel' as const,
        boundaryId,
        papel,
      })),
    ).model;

    const medidas = medidasPorPapel(medirTerreno(comPapel.boundaries)!, comPapel.boundaries);
    expect(medidas.FRENTE).toBe(20_000);
    // O que importa: os dois trechos de fundo entram na MESMA soma.
    expect(medidas.FUNDOS).toBe(20_000);
  });

  it('papel sem nenhum lado fica AUSENTE, não zerado', () => {
    // Zero gravado na ficha apagaria uma medida que alguém digitou à mão.
    const { model, levelId } = comNivel();
    const built = applyBatch(model, divisas(levelId, LOTE_20x30)).model;
    const terreno = medirTerreno(built.boundaries)!;
    const soFrente = applyCommand(built, {
      type: 'SetBoundaryPapel',
      boundaryId: terreno.ladosIds[0],
      papel: 'FRENTE',
    }).model;

    const medidas = medidasPorPapel(medirTerreno(soFrente.boundaries)!, soFrente.boundaries);
    expect(medidas.FRENTE).toBe(20_000);
    expect('FUNDOS' in medidas).toBe(false);
    expect(medidas.LATERAL_DIREITA).toBeUndefined();
  });
});
