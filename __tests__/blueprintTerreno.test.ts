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
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  areaEmM2,
  anelDoTerreno,
  calcularAproveitamento,
  divisasDoLote,
  envelopeConstrutivo,
  medirTerreno,
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
