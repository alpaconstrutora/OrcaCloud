/**
 * O símbolo de SOBE / DESCE só onde o eletroduto passa de um pavimento para outro (25/10/2026).
 *
 * *"o simbolo de subir se trata somente quando sobe de uma pavimento para outro. para ficar claro no caso do garden a
 * casa tem apenas um pavimento entao os simbolos nao devem aparecer apesar de subir para laje nao devem ter o simbolo
 * por nao se tratar de outro pavimennto."*
 *
 * Antes, todo eletroduto com desnível levava o círculo com a seta — a descida do forro até a tomada, o pedaço vertical
 * do forro rebaixado. Na casa térrea a prancha se enchia de setas que não diziam nada.
 *
 * A passagem é gravada como um trecho em CADA pavimento (o planejador põe o pedaço até o teto no de baixo e o do piso
 * no de cima), então ela é lida pela continuação no pavimento vizinho, no mesmo ponto.
 */
import { describe, expect, it } from 'vitest';
import { point } from '../utils/blueprintKernel';
import { eletrodutosQuePassamDePavimento } from '../utils/blueprintRede';

const TERREO = { id: 'L0', elevationMm: 0, defaultHeightMm: 2800 };
const SUPERIOR = { id: 'L1', elevationMm: 3000, defaultHeightMm: 2800 };

let n = 0;
const trecho = (levelId: string, ax: number, ay: number, cotaA: number, bx: number, by: number, cotaB: number, disciplina: 'ELETRICA' | 'AGUA_FRIA' = 'ELETRICA') => ({
  id: `t${++n}`,
  levelId,
  disciplina,
  a: point(ax, ay),
  b: point(bx, by),
  cotaAMm: cotaA,
  cotaBMm: cotaB,
});

describe('sobe / desce · só entre pavimentos', () => {
  it('⚠️ casa térrea (a Garden): a descida do forro até a tomada e o forro rebaixado não levam o símbolo', () => {
    const descida = trecho('L0', 1000, 0, 2438, 1000, 0, 300);
    const rebaixo = trecho('L0', 1050, 0, 2755, 1050, 0, 2438);
    const naLaje = trecho('L0', 2000, 0, 2800, 2000, 0, 300); // sobe até a laje: ainda é o mesmo pavimento
    const emL = trecho('L0', 0, 0, 300, 4000, 0, 2800);
    const passam = eletrodutosQuePassamDePavimento({ levels: [TERREO], trechos: [descida, rebaixo, naLaje, emL] });
    expect(passam.size).toBe(0);
  });

  it('sobrado: a prumada do quadro que sobe ao pavimento de cima leva o símbolo nos dois lados', () => {
    const doQuadro = trecho('L0', 500, 500, 1600, 500, 500, 2800); // do quadro ao teto do térreo
    const emCima = trecho('L1', 500, 500, 0, 500, 500, 2800); // do piso de cima à rede de cima
    const passam = eletrodutosQuePassamDePavimento({ levels: [TERREO, SUPERIOR], trechos: [doQuadro, emCima] });
    expect([...passam].sort()).toEqual([doQuadro.id, emCima.id].sort());
  });

  it('sobrado: a descida até a tomada do térreo, que vai ao teto mas não continua em cima, não leva', () => {
    const descida = trecho('L0', 1000, 0, 2800, 1000, 0, 300);
    const outroPonto = trecho('L1', 3000, 0, 300, 3000, 0, 2800); // tomada de cima, em outro lugar
    const passam = eletrodutosQuePassamDePavimento({ levels: [TERREO, SUPERIOR], trechos: [descida, outroPonto] });
    expect(passam.size).toBe(0);
  });

  it('a vertical do pavimento de cima que só desce à laje dele, sem nada embaixo, não leva', () => {
    const tomadaDeCima = trecho('L1', 1000, 0, -50, 1000, 0, 300);
    const passam = eletrodutosQuePassamDePavimento({ levels: [TERREO, SUPERIOR], trechos: [tomadaDeCima] });
    expect(passam.size).toBe(0);
  });

  it('o quadro de cima que desce ao térreo: o pedaço de cima e o de baixo levam', () => {
    const doQuadro = trecho('L1', 500, 500, 1600, 500, 500, 0);
    const emBaixo = trecho('L0', 500, 500, 2800, 500, 500, 2755);
    const passam = eletrodutosQuePassamDePavimento({ levels: [SUPERIOR, TERREO], trechos: [doQuadro, emBaixo] });
    expect([...passam].sort()).toEqual([doQuadro.id, emBaixo.id].sort());
  });

  it('desenhado à mão atravessando a laje (a cota passa do piso de cima) leva, e no térreo sozinho não', () => {
    const atravessa = trecho('L0', 500, 500, 300, 500, 500, 3300);
    expect(eletrodutosQuePassamDePavimento({ levels: [TERREO, SUPERIOR], trechos: [atravessa] }).has(atravessa.id)).toBe(true);
    expect(eletrodutosQuePassamDePavimento({ levels: [TERREO], trechos: [atravessa] }).size).toBe(0);
  });

  it('só o eletroduto: a coluna de água entre pavimentos não entra na lista', () => {
    const agua = trecho('L0', 500, 500, 300, 500, 500, 2800, 'AGUA_FRIA');
    const aguaEmCima = trecho('L1', 500, 500, 0, 500, 500, 300, 'AGUA_FRIA');
    expect(eletrodutosQuePassamDePavimento({ levels: [TERREO, SUPERIOR], trechos: [agua, aguaEmCima] }).size).toBe(0);
  });
});
