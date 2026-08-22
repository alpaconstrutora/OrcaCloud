import { describe, expect, it } from 'vitest';
import {
  gerarParedes,
  histogramaEspessura,
  juntarColineares,
  mmPorPt,
  paraPixelSemRotacao,
  parearFaces,
  ptParaModelo,
  type ParaPixel,
  type SegmentoVetor,
} from '../utils/blueprintVetor';
import type { Underlay } from '../utils/blueprintUnderlay';

/** 1 pt de papel = 35,278 mm reais (escala 1:100 a 150 dpi). */
const MM_POR_PT = (25.4 / 72) * 100;

const seg = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  larguraPt = 0.6,
): SegmentoVetor => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, larguraPt });

describe('histogramaEspessura', () => {
  it('ordena por comprimento total, não por contagem', () => {
    // Muitos traços curtos de cota contra poucos traços longos de parede: é
    // exatamente a distribuição da prancha real, e quem ordenar por CONTAGEM
    // oferece a cota como primeira candidata a parede.
    const segs = [
      ...Array.from({ length: 50 }, (_, i) => seg(i, 0, i + 0.5, 0, 0.12)),
      seg(0, 10, 100, 10, 0.6),
      seg(0, 20, 100, 20, 0.6),
    ];
    const h = histogramaEspessura(segs);
    expect(h[0].larguraPt).toBe(0.6);
    expect(h[0].n).toBe(2);
    expect(h[1].larguraPt).toBe(0.12);
  });

  it('ignora segmento de comprimento zero', () => {
    expect(histogramaEspessura([seg(5, 5, 5, 5)])).toHaveLength(0);
  });
});

describe('juntarColineares', () => {
  it('junta pedaços encostados da mesma face', () => {
    const faces = juntarColineares([seg(0, 0, 10, 0), seg(10, 0, 25, 0)]);
    expect(faces).toHaveLength(1);
    expect(faces[0].u1 - faces[0].u0).toBeCloseTo(25, 5);
  });

  it('NÃO atravessa o vão de uma porta', () => {
    // 0,9 m de vão a 1:100 = 25,5 pt. Juntar aqui devolveria parede onde há
    // passagem — o erro que derrubou a rodada 3 do Spike C.
    const faces = juntarColineares([seg(0, 0, 10, 0), seg(35.5, 0, 60, 0)]);
    expect(faces).toHaveLength(2);
  });

  it('trata a mesma face desenhada ao contrário como uma só', () => {
    const faces = juntarColineares([seg(0, 0, 10, 0), seg(25, 0, 10, 0)]);
    expect(faces).toHaveLength(1);
  });

  it('não junta faces paralelas de offsets diferentes', () => {
    const faces = juntarColineares([seg(0, 0, 10, 0), seg(0, 5, 10, 5)]);
    expect(faces).toHaveLength(2);
  });
});

describe('parearFaces', () => {
  it('deriva o eixo entre duas faces opostas', () => {
    // 15 cm de parede = 4,25 pt.
    const faces = juntarColineares([seg(0, 0, 100, 0), seg(0, 4.25, 100, 4.25)]);
    const eixos = parearFaces(faces, { mmPorPt: MM_POR_PT });

    expect(eixos).toHaveLength(1);
    expect(eixos[0].espessuraPt * MM_POR_PT).toBeCloseTo(150, 0);
    expect(eixos[0].comprimentoPt).toBeCloseTo(100, 5);
    // O eixo fica na MEDIANA, não sobre uma das faces.
    expect(eixos[0].a.y).toBeCloseTo(4.25 / 2, 5);
  });

  it('recusa par mais distante que uma parede plausível', () => {
    // Duas paredes em lados opostos de um cômodo de 3 m são paralelas e se
    // sobrepõem. Só a distância as separa do par verdadeiro.
    const faces = juntarColineares([seg(0, 0, 100, 0), seg(0, 85, 100, 85)]);
    expect(parearFaces(faces, { mmPorPt: MM_POR_PT })).toHaveLength(0);
  });

  it('recusa par que só se toca de raspão', () => {
    const faces = juntarColineares([seg(0, 0, 100, 0), seg(99, 4.25, 200, 4.25)]);
    expect(parearFaces(faces, { mmPorPt: MM_POR_PT })).toHaveLength(0);
  });

  it('recusa faces não paralelas', () => {
    const faces = juntarColineares([seg(0, 0, 100, 0), seg(0, 4.25, 100, 30)]);
    expect(parearFaces(faces, { mmPorPt: MM_POR_PT })).toHaveLength(0);
  });

  it('CONSUMO POR TRECHO: uma fachada longa emparelha com DUAS paredes internas', () => {
    // É o caso que a medição na prancha real ensinou. Consumindo a face
    // inteira no primeiro par, a segunda parede fica órfã — foi assim que as
    // verticais sumiam. Este teste falha se o consumo voltar a ser por face.
    const fachada = seg(0, 0, 300, 0);
    const internaA = seg(0, 4.25, 100, 4.25);
    const internaB = seg(200, 4.25, 300, 4.25);

    const faces = juntarColineares([fachada, internaA, internaB]);
    const eixos = parearFaces(faces, { mmPorPt: MM_POR_PT });

    expect(eixos).toHaveLength(2);
    const comprimentos = eixos.map((e) => Math.round(e.comprimentoPt)).sort((a, b) => a - b);
    expect(comprimentos).toEqual([100, 100]);
  });

  it('não devolve o mesmo trecho duas vezes com espessuras diferentes', () => {
    // Três faces paralelas: a do meio poderia parear com as duas. Sem a trava
    // de trecho livre, o mesmo pedaço de parede sairia em duplicata.
    const faces = juntarColineares([
      seg(0, 0, 100, 0),
      seg(0, 4.25, 100, 4.25),
      seg(0, 8.5, 100, 8.5),
    ]);
    const eixos = parearFaces(faces, { mmPorPt: MM_POR_PT });
    expect(eixos).toHaveLength(1);
  });

  it('pareia parede na diagonal', () => {
    const d = 4.25 / Math.SQRT2;
    const faces = juntarColineares([seg(0, 0, 100, 100), seg(d, -d, 100 + d, 100 - d)]);
    const eixos = parearFaces(faces, { mmPorPt: MM_POR_PT });
    expect(eixos).toHaveLength(1);
    expect(eixos[0].espessuraPt * MM_POR_PT).toBeCloseTo(150, 0);
  });
});

describe('ptParaModelo', () => {
  const underlay: Underlay = {
    origemXMm: 0,
    origemYMm: 0,
    mmPorPixel: 10,
    rotacaoMrad: 0,
  };

  it('inverte o Y uma vez pela página e outra pelo modelo', () => {
    const alturaPagina = 800;
    // Um ponto no TOPO da página (y alto em pt) tem py pequeno na imagem, e
    // volta a ser Y alto (menos negativo) no modelo.
    const topo = ptParaModelo(underlay, { x: 0, y: 800 }, paraPixelSemRotacao(alturaPagina));
    const base = ptParaModelo(underlay, { x: 0, y: 0 }, paraPixelSemRotacao(alturaPagina));
    expect(topo.y).toBeGreaterThan(base.y);
  });

  it('a escala sai da aferição do fundo, sem número novo', () => {
    // 1 pt a 150 dpi = 2,0833 px; com 10 mm/px, 20,83 mm.
    const p0 = ptParaModelo(underlay, { x: 0, y: 0 }, paraPixelSemRotacao(100));
    const p1 = ptParaModelo(underlay, { x: 1, y: 0 }, paraPixelSemRotacao(100));
    expect(p1.x - p0.x).toBeCloseTo(10 * (150 / 72), 6);
    expect(mmPorPt(underlay)).toBeCloseTo(10 * (150 / 72), 6);
  });
});

describe('gerarParedes', () => {
  // Aferição que dá 1 pt = 35,278 mm, ou seja 1:100 a 150 dpi.
  const underlay: Underlay = {
    origemXMm: 0,
    origemYMm: 0,
    mmPorPixel: MM_POR_PT / (150 / 72),
    rotacaoMrad: 0,
  };

  it('devolve parede em milímetro inteiro, com espessura de construção', () => {
    const paredes = gerarParedes(
      [seg(0, 400, 100, 400), seg(0, 404.25, 100, 404.25)],
      underlay,
      paraPixelSemRotacao(800),
    );
    expect(paredes).toHaveLength(1);
    expect(paredes[0].espessuraMm).toBe(150);
    expect(Number.isInteger(paredes[0].a.x)).toBe(true);
    expect(Number.isInteger(paredes[0].a.y)).toBe(true);
    expect(paredes[0].comprimentoMm).toBeCloseTo(100 * MM_POR_PT, 0);
  });

  it('recorta pela região, e recusa parede que sai dela pela metade', () => {
    const segmentos = [seg(0, 400, 100, 400), seg(0, 404.25, 100, 404.25)];
    const inteira = gerarParedes(segmentos, underlay, paraPixelSemRotacao(800));
    expect(inteira).toHaveLength(1);

    // Região que corta a parede no meio: ela NÃO deve sair cortada.
    const meio = inteira[0];
    const limites = {
      x0: Math.min(meio.a.x, meio.b.x) - 10,
      x1: (meio.a.x + meio.b.x) / 2,
      y0: Math.min(meio.a.y, meio.b.y) - 10,
      y1: Math.max(meio.a.y, meio.b.y) + 10,
    };
    expect(gerarParedes(segmentos, underlay,
      paraPixelSemRotacao(800), limites)).toHaveLength(0);
  });

  it('encosta a espessura no centímetro — sem precisão falsa', () => {
    // 20,3 cm e 19,7 cm são a MESMA parede de 20 cm; a diferença é onde o CAD
    // pousou o traço. Deixá-las distintas geraria duas linhas de orçamento
    // para a mesma alvenaria.
    const grossa = 203 / MM_POR_PT;
    const fina = 197 / MM_POR_PT;
    const paredes = gerarParedes(
      [
        seg(0, 400, 100, 400),
        seg(0, 400 + grossa, 100, 400 + grossa),
        seg(0, 700, 100, 700),
        seg(0, 700 + fina, 100, 700 + fina),
      ],
      underlay,
      paraPixelSemRotacao(800),
    );
    expect(paredes).toHaveLength(2);
    expect(new Set(paredes.map((p) => p.espessuraMm))).toEqual(new Set([200]));
  });

  it('não confunde 12 cm com 10 cm ao arredondar', () => {
    // Um passo de 5 cm empurraria 12 para 10. Parede de projeto é especificada
    // em centímetro.
    const doze = 120 / MM_POR_PT;
    const paredes = gerarParedes(
      [seg(0, 400, 100, 400), seg(0, 400 + doze, 100, 400 + doze)],
      underlay,
      paraPixelSemRotacao(800),
    );
    expect(paredes[0].espessuraMm).toBe(120);
  });

  it('não devolve parede degenerada', () => {
    // Faces que mal se sobrepõem não podem virar uma parede de 0 mm.
    const paredes = gerarParedes([seg(0, 400, 1, 400), seg(0, 404.25, 1, 404.25)], underlay, paraPixelSemRotacao(800));
    expect(paredes.every((p) => p.comprimentoMm >= 1)).toBe(true);
  });
});

describe('PÁGINA GIRADA — o defeito que chegou a produção', () => {
  /**
   * A prancha do usuário, medida em 22/08/2026:
   *
   *     page.rotate = 270 · page.view = [0, 0, 2384, 3370]
   *     viewport 150dpi = 7021 × 4967
   *     transform = [0, -2.0833, -2.0833, 0, 7020.83, 4966.67]
   *
   * A MediaBox é RETRATO e o desenho gira 270° para virar paisagem. A versão
   * defeituosa espelhava o Y pela altura do VIEWPORT (2384) e ignorava o giro:
   * as paredes caíam dezenas de metros ACIMA da imagem, o recorte da tela
   * corretamente não achava nenhuma, e o painel dizia "0 paredes na área
   * visível" com a planta bem visível.
   */
  const GIRADA: ParaPixel = [0, -150 / 72, -150 / 72, 0, 3370 * (150 / 72), 2384 * (150 / 72)];
  const underlay: Underlay = {
    origemXMm: 0,
    origemYMm: 0,
    mmPorPixel: MM_POR_PT / (150 / 72),
    rotacaoMrad: 0,
  };

  it('leva o canto do espaço do PDF ao canto certo da imagem', () => {
    // user(2384, 3370) é o canto que a rotação leva ao pixel (0, 0).
    const canto = ptParaModelo(underlay, { x: 2384, y: 3370 }, GIRADA);
    expect(canto.x).toBeCloseTo(0, 3);
    expect(canto.y).toBeCloseTo(0, 3);
  });

  it('TROCA os eixos — é o que o espelho de Y não fazia', () => {
    // Andar em X no espaço do PDF move em Y na imagem, e vice-versa. Um
    // espelho de Y mantinha os eixos, e era esse o erro.
    const o = ptParaModelo(underlay, { x: 0, y: 0 }, GIRADA);
    const emX = ptParaModelo(underlay, { x: 100, y: 0 }, GIRADA);
    const emY = ptParaModelo(underlay, { x: 0, y: 100 }, GIRADA);

    expect(Math.abs(emX.x - o.x)).toBeLessThan(1e-6);
    expect(Math.abs(emX.y - o.y)).toBeGreaterThan(1000);
    expect(Math.abs(emY.y - o.y)).toBeLessThan(1e-6);
    expect(Math.abs(emY.x - o.x)).toBeGreaterThan(1000);
  });

  it('A PAREDE CAI DENTRO DA IMAGEM — a invariante que faltava', () => {
    // É esta a conferência cuja ausência deixou o defeito passar: eu media
    // QUANTAS paredes saíam, nunca ONDE elas caíam. Contagem certa com posição
    // errada passa em tudo — e foi o usuário quem viu.
    const LARGURA_PX = 3370 * (150 / 72);
    const ALTURA_PX = 2384 * (150 / 72);
    const caixa = {
      x0: 0,
      x1: LARGURA_PX * underlay.mmPorPixel,
      y0: -ALTURA_PX * underlay.mmPorPixel,
      y1: 0,
    };

    // Coordenadas REAIS da planta das LOJAS na prancha do usuário: y≈3000, que
    // só existe porque o espaço do PDF é retrato (0..3370). É justamente a
    // faixa y > 2384 que o espelho pela altura do viewport jogava para fora.
    const paredes = gerarParedes(
      [seg(1000, 3000, 1000, 3100), seg(1004.25, 3000, 1004.25, 3100)],
      underlay,
      GIRADA,
    );
    expect(paredes.length).toBeGreaterThan(0);
    for (const p of paredes) {
      for (const v of [p.a, p.b]) {
        expect(v.x).toBeGreaterThanOrEqual(caixa.x0);
        expect(v.x).toBeLessThanOrEqual(caixa.x1);
        expect(v.y).toBeGreaterThanOrEqual(caixa.y0);
        expect(v.y).toBeLessThanOrEqual(caixa.y1);
      }
    }
  });

  it('a versão antiga REPROVA nessa mesma invariante', () => {
    // Contra-caso: sem ele, o teste acima poderia estar aprovando por acaso.
    const ALTURA_PX = 2384 * (150 / 72);
    const antiga = gerarParedes(
      [seg(1000, 3000, 1000, 3100), seg(1004.25, 3000, 1004.25, 3100)],
      underlay,
      paraPixelSemRotacao(2384),
    );
    expect(antiga.length).toBeGreaterThan(0);
    // Y POSITIVO = acima da imagem, que ocupa Y negativo. É exatamente para
    // onde as paredes do usuário foram: dezenas de metros fora do desenho.
    expect(antiga[0].a.y).toBeGreaterThan(0);
    expect(antiga[0].a.y).toBeGreaterThan(0.2 * ALTURA_PX * underlay.mmPorPixel);
  });
});
