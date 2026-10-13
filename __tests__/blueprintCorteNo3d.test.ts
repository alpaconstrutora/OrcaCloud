/**
 * Ver o corte no 3D (13/10/2026): o plano de recorte guarda o MESMO lado que o
 * corte 2D mostra, e a câmera fica na frente dele olhando para dentro.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { classificarNoCorte, baseDoCorte } from '../utils/blueprintCorte';
import { corteNo3d, ELEVACAO_GRAUS, GIRO_GRAUS } from '../utils/blueprintCorteNo3d';

function casa(corte: { a: [number, number]; b: [number, number] }) {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 });
  const levelId = base.model.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let model = applyBatch(base.model, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
  model = applyCommand(model, { type: 'AddCorte', a: point(...corte.a), b: point(...corte.b) }).model;
  return { model, corte: model.sections[0] };
}

/** O lado do plano em que um ponto da PLANTA (mm) fica, pela conta do 3D (espaço do desenho). */
const ladoNo3d = (c: ReturnType<typeof corteNo3d>, x: number, y: number) =>
  c.plano.normal[0] * (x / 1000) + c.plano.normal[2] * (y / 1000) + c.plano.constante;

describe('o corte no 3D', () => {
  it('o plano guarda o que fica ATRÁS da linha — o mesmo lado que o corte 2D desenha', () => {
    const { model, corte } = casa({ a: [-1000, 2000], b: [7000, 2000] });
    const c = corteNo3d(model, corte);
    const base = baseDoCorte(corte);
    // A parede dos fundos (y = 4000) e a da frente (y = 0): uma fica, a outra some.
    const fundos = [point(0, 4000), point(6000, 4000)];
    const frente = [point(0, 0), point(6000, 0)];
    const atras = classificarNoCorte(fundos, base, corte.a) === 'ATRAS' ? fundos : frente;
    const naFrente = atras === fundos ? frente : fundos;
    expect(ladoNo3d(c, atras[0].x, atras[0].y)).toBeGreaterThan(0);
    expect(ladoNo3d(c, naFrente[0].x, naFrente[0].y)).toBeLessThan(0);
    // Sobre a linha: zero.
    expect(ladoNo3d(c, 3000, 2000)).toBeCloseTo(0, 9);
  });

  it('inverter o lado inverte o que fica', () => {
    const { model, corte } = casa({ a: [-1000, 2000], b: [7000, 2000] });
    const esq = corteNo3d(model, { ...corte, olharPara: 'ESQUERDA' });
    const dir = corteNo3d(model, { ...corte, olharPara: 'DIREITA' });
    expect(Math.sign(ladoNo3d(esq, 3000, 4000))).toBe(-Math.sign(ladoNo3d(dir, 3000, 4000)));
    expect(esq.chave).not.toBe(dir.chave);
  });

  it('corte INCLINADO: o plano segue a linha desenhada, não os eixos', () => {
    const { model, corte } = casa({ a: [0, 0], b: [6000, 4000] });
    const c = corteNo3d(model, corte);
    // Os dois extremos da linha ficam no plano; os cantos opostos da casa, um de cada lado.
    expect(ladoNo3d(c, 0, 0)).toBeCloseTo(0, 9);
    expect(ladoNo3d(c, 6000, 4000)).toBeCloseTo(0, 9);
    expect(Math.sign(ladoNo3d(c, 6000, 0))).toBe(-Math.sign(ladoNo3d(c, 0, 4000)));
    expect(c.plano.normal[1]).toBe(0);
  });

  it('a câmera fica na FRENTE do plano, olhando para dentro, e mira o meio do desenho do corte', () => {
    const { model, corte } = casa({ a: [-1000, 2000], b: [7000, 2000] });
    const c = corteNo3d(model, corte);
    const { posicao, alvo } = c.pontoDeVista;
    // Olho do lado que some (negativo); alvo sobre o plano.
    expect(c.plano.normal[0] * posicao[0] + c.plano.normal[2] * posicao[2] + c.plano.constante).toBeLessThan(0);
    expect(c.plano.normal[0] * alvo[0] + c.plano.normal[2] * alvo[2] + c.plano.constante).toBeCloseTo(0, 9);
    // Olha PARA DENTRO do plano, de lado e de cima nos ângulos declarados.
    const dx = alvo[0] - posicao[0];
    const dy = alvo[1] - posicao[1];
    const dz = alvo[2] - posicao[2];
    const noChao = Math.hypot(dx, dz);
    const n = Math.hypot(noChao, dy);
    const cosGiro = (dx * c.plano.normal[0] + dz * c.plano.normal[2]) / noChao;
    expect(Math.acos(cosGiro) * (180 / Math.PI)).toBeCloseTo(GIRO_GRAUS, 6);
    expect(Math.atan2(-dy, noChao) * (180 / Math.PI)).toBeCloseTo(ELEVACAO_GRAUS, 6);
    // A casa tem 6 m: o meio é x = 3 m; a altura do alvo é o meio do pé-direito (1,40 m).
    expect(alvo[0]).toBeCloseTo(3, 1);
    expect(alvo[1]).toBeCloseTo(1.4, 1);
    // Enquadra 6 m × 2,8 m a 35 mm numa tela 2:1: a largura manda (~6,8 m com a folga).
    expect(n).toBeGreaterThan(5.5);
    expect(n).toBeLessThan(12);
  });
});
