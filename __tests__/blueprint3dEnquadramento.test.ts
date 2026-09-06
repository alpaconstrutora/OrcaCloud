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
  ENQUADRAMENTO_VAZIO,
  ESCALA_3D,
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
