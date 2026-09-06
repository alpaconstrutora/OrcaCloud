/**
 * O enquadramento da vista 3D.
 *
 * ─── O CASO QUE FALTAVA ─────────────────────────────────────────────────────
 *
 * Um estudo SÓ COM ESTRUTURA. Até 05/09/2026 a conta olhava paredes, telhado e
 * lote; estrutura e escada ficavam de fora. Ninguém notou enquanto todo desenho
 * tinha paredes — e o defeito só apareceu quando a importação de IFC passou a
 * trazer centenas de peças estruturais: a lista de pontos ficava vazia, a câmera
 * caía no padrão (origem, alcance 20) e o modelo, a vinte metros dali, não
 * aparecia. O relato foi "o IFC não aparece na planta 3D".
 *
 * Estes casos existem para que acrescentar uma família ao kernel e esquecer o
 * enquadramento pare de ser silencioso.
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
  DIRECAO_DA_CAMERA,
  ENQUADRAMENTO_VAZIO,
  ESCALA_3D,
  distanciaParaCaber,
  enquadramentoDoModelo,
  saiuDoQuadro,
} from '../utils/blueprint3dEnquadramento';

const H = 2800;

function comNivel(elevationMm = 0): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

/** Um pilar 20×40 a dez metros da origem — a escala do que o IFC importa. */
function soEstrutura(): BlueprintModel {
  const { model, levelId } = comNivel();
  return applyCommand(model, {
    type: 'AddStructural',
    levelId,
    kind: 'PILAR',
    pontos: [point(10000, 20000)],
    larguraMm: 200,
    profundidadeMm: 400,
    alturaMm: 3000,
    baseMm: 0,
  }).model;
}

describe('enquadramento 3d · o caso que faltava', () => {
  it('um estudo SÓ com estrutura é enquadrado na estrutura, não na origem', () => {
    // Sem isto a câmera olhava para (0,0,0) com alcance 20, e o pilar a 10 m em
    // X e 20 m em Z ficava fora do quadro.
    const e = enquadramentoDoModelo(soEstrutura(), false);
    expect(e.temConteudo).toBe(true);
    expect(e.centro[0]).toBeCloseTo(10, 1);
    // O plano do kernel (y) vira o Z do mundo, sem troca de sinal aqui.
    expect(e.centro[2]).toBeCloseTo(20, 1);
    expect(e.alturaTopo).toBeCloseTo(3, 2);
  });

  it('modelo vazio devolve o padrão nomeado, e diz que está vazio', () => {
    expect(enquadramentoDoModelo(comNivel().model, false)).toEqual(ENQUADRAMENTO_VAZIO);
    expect(ENQUADRAMENTO_VAZIO.temConteudo).toBe(false);
  });

  it('a ESCADA entra na caixa', () => {
    const { model, levelId } = comNivel();
    const comEscada = applyCommand(model, {
      type: 'AddEscada',
      levelId,
      pontos: [point(30000, 0), point(34600, 0)],
      larguraMm: 1200,
    }).model;
    const e = enquadramentoDoModelo(comEscada, false);
    expect(e.temConteudo).toBe(true);
    // O lance vai de x=30 m a x=34,6 m: o centro cai no meio dele.
    expect(e.centro[0]).toBeCloseTo(32.3, 1);
  });

  it('a FUNDAÇÃO abaixo do zero entra, e o olhar desce com ela', () => {
    // Estaca de −1,5 m a +1,5 m. Centrar em `topo / 2` deixava a fundação fora.
    const { model, levelId } = comNivel();
    const comEstaca = applyCommand(model, {
      type: 'AddStructural',
      levelId,
      kind: 'ESTACA',
      pontos: [point(0, 0)],
      larguraMm: 250,
      profundidadeMm: 250,
      alturaMm: 3000,
      baseMm: -1500,
      circular: true,
    }).model;
    const e = enquadramentoDoModelo(comEstaca, false);
    // ⚠️ `topo` tem PISO de 3 m, herdado do código original: uma cena rasa não
    // pode gerar uma caixa degenerada. Então topo = 3 (e não 1,5) e
    // fundo = −1,5 → centro vertical em 0,75. O que este caso trava é o
    // `fundo`: sem ele o centro seria 1,5 e a estaca sairia do quadro.
    expect(e.centro[1]).toBeCloseTo(0.75, 2);
    expect(e.alturaTopo).toBeCloseTo(3, 2);
    // A altura total considerada vai de −1,5 a 3.
    expect(e.spread).toBeGreaterThanOrEqual(4.5);
  });

  it('parede continua enquadrada como antes — nada regrediu', () => {
    const { model, levelId } = comNivel();
    const casa = applyBatch(model, [
      {
        type: 'AddWall',
        levelId,
        a: point(0, 0),
        b: point(6000, 0),
        thicknessMm: 150,
        heightMm: H,
      } as Command,
    ]).model;
    const e = enquadramentoDoModelo(casa, false);
    expect(e.centro[0]).toBeCloseTo(3, 2);
    // A parede tem 2,8 m, e o PISO de 3 m prevalece — comportamento de sempre.
    expect(H * ESCALA_3D).toBeLessThan(3);
    expect(e.alturaTopo).toBeCloseTo(3, 3);
    // Sem fundação, `fundo` é 0 e o centro vertical continua metade do topo.
    expect(e.centro[1]).toBeCloseTo(1.5, 3);
  });
});

describe('enquadramento 3d · quando reenquadrar sozinho', () => {
  const caixa = (x: number, spread: number) => ({
    centro: [x, 0, 0] as [number, number, number],
    raio: [spread / 2, 1.5, spread / 2] as [number, number, number],
    spread,
    alturaTopo: 3,
    temConteudo: true,
  });

  it('a primeira vez sempre enquadra', () => {
    expect(saiuDoQuadro(null, caixa(0, 10))).toBe(true);
  });

  it('crescer muito reenquadra — é a importação de centenas de peças', () => {
    expect(saiuDoQuadro({ centro: [0, 0, 0], spread: 10 }, caixa(0, 30))).toBe(true);
  });

  it('andar para longe reenquadra', () => {
    expect(saiuDoQuadro({ centro: [0, 0, 0], spread: 10 }, caixa(20, 10))).toBe(true);
  });

  it('mudança pequena NÃO reenquadra — senão a câmera brigaria com quem desenha', () => {
    // Uma parede a mais dentro da casa: o centro anda pouco e o alcance quase
    // não muda. Puxar a câmera aqui seria insuportável a cada clique.
    expect(saiuDoQuadro({ centro: [0, 0, 0], spread: 10 }, caixa(1, 10.5))).toBe(false);
  });
});


/**
 * O "zoom automático" propriamente dito.
 *
 * ─── O QUE ESTES CASOS TRAVAM ───────────────────────────────────────────────
 *
 * Antes a câmera se punha a `spread × 1,7` do centro — um palpite que ignora a
 * abertura da lente e o formato da tela. Numa planta com paredes perto da
 * origem e a estrutura importada de IFC vinte metros adiante, o desenho ocupava
 * pouco mais da metade da largura. O relato foi "a planta 3D não ocupa toda a
 * área disponível".
 *
 * O par CABE/APERTA abaixo é o que faz estes casos discriminarem: sozinho, o
 * "cabe" é satisfeito por qualquer distância grande — inclusive a folga que
 * causou o defeito.
 */
describe('enquadramento 3d · a distância que faz caber', () => {
  /** Reproduz o tronco de visão da câmera e devolve o pior canto. */
  function piorCanto(raio: [number, number, number], d: number, fov: number, aspecto: number) {
    const f = DIRECAO_DA_CAMERA.map((v) => -v) as [number, number, number];
    const nd = Math.hypot(f[2], 0, -f[0]);
    const direita: [number, number, number] = [f[2] / nd, 0, -f[0] / nd];
    const cima: [number, number, number] = [
      direita[1] * f[2] - direita[2] * f[1],
      direita[2] * f[0] - direita[0] * f[2],
      direita[0] * f[1] - direita[1] * f[0],
    ];
    const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
    const tanH = tanV * aspecto;
    let pior = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const rel = [sx * raio[0], sy * raio[1], sz * raio[2]];
          const pf = rel[0] * f[0] + rel[1] * f[1] + rel[2] * f[2] + d;
          const pr = rel[0] * direita[0] + rel[1] * direita[1] + rel[2] * direita[2];
          const pc = rel[0] * cima[0] + rel[1] * cima[1] + rel[2] * cima[2];
          // 1 = encostado na borda; > 1 = fora do quadro.
          pior = Math.max(pior, Math.abs(pr) / (pf * tanH), Math.abs(pc) / (pf * tanV));
        }
      }
    }
    return pior;
  }

  const casos: [string, [number, number, number], number][] = [
    ['casa comum', [4, 1.5, 3], 1.6],
    ['a planta com o IFC longe: larga e rasa', [14, 1.8, 12], 1.7],
    ['tela alta e estreita — aqui é a LARGURA que aperta', [10, 1.5, 8], 0.7],
    ['peça única, quase um ponto', [0.2, 1.5, 0.2], 1.6],
  ];

  for (const [nome, raio, aspecto] of casos) {
    it(`cabe inteiro · ${nome}`, () => {
      const d = distanciaParaCaber(raio, 50, aspecto);
      expect(piorCanto(raio, d, 50, aspecto)).toBeLessThanOrEqual(1);
    });

    it(`e APERTA — não sobra meia tela · ${nome}`, () => {
      // Sem este par o teste de cima passaria com a câmera na lua. A margem é
      // 1,08, então o desenho tem de ocupar pelo menos ~85% do quadro em algum
      // eixo. O palpite antigo (spread × 1,7) rendia ~0,55 no caso do IFC.
      const d = distanciaParaCaber(raio, 50, aspecto);
      const ocupacao = piorCanto(raio, d, 50, aspecto);
      expect(ocupacao).toBeGreaterThan(0.85);
    });
  }

  it('tela mais larga aproxima a câmera; mais estreita afasta', () => {
    const raio: [number, number, number] = [12, 1.5, 10];
    expect(distanciaParaCaber(raio, 50, 2.2)).toBeLessThan(distanciaParaCaber(raio, 50, 0.8));
  });

  it('a caixa do modelo alimenta a conta — `raio` sai do desenho', () => {
    const e = enquadramentoDoModelo(soEstrutura(), false);
    // O pilar é 200×400 mm: meia-dimensão de 0,1 m e 0,2 m.
    expect(e.raio[0]).toBeCloseTo(0.1, 2);
    expect(e.raio[2]).toBeCloseTo(0.2, 2);
  });
});
