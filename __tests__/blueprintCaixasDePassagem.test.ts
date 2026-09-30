/**
 * CAIXAS DE PASSAGEM (E6.3, 29/09/2026) — a regra isolada.
 *
 * NBR 5410 6.2.11.1.7 (hipótese com fonte): 15 m retilíneos entre caixas, −3 m
 * por curva de 90°, no máximo 270° de curvas; derivação sem caixa ganha uma.
 *
 * ⚠️ O que uma implementação ingênua erra: contar só o comprimento (a curva
 * encurta o limite); contar a curva de "subir ao teto" como zero; e pôr caixa
 * no meio de um trecho vertical (onde ela não cabe na parede do jeito certo).
 */
import { describe, expect, it } from 'vitest';
import { REGRA_DE_CAIXAS_PADRAO, caixasDaRede, type P3, type SegmentoDaRede } from '../utils/blueprintCaixasDePassagem';

const seg = (id: number, a: [number, number, number], b: [number, number, number], fixo = false): SegmentoDaRede => ({
  id, a: { x: a[0], y: a[1], z: a[2] }, b: { x: b[0], y: b[1], z: b[2] }, ...(fixo ? { fixo } : {}),
});
/** Caixas nas posições dadas (os "pontos"); o resto, nó sem caixa. */
const caixasEm = (...ps: [number, number, number][]) => (p: P3) => (ps.some(([x, y, z]) => p.x === x && p.y === y && p.z === z) ? { descidaMm: 0 } : null);

describe('caixas de passagem — a regra', () => {
  it('reto e horizontal: 20 m entre duas caixas → uma caixa a 15 m; 15 m exatos → nenhuma', () => {
    const r = caixasDaRede([seg(0, [0, 0, 2800], [20000, 0, 2800])], caixasEm([0, 0, 2800], [20000, 0, 2800]));
    expect(r.caixas).toEqual([{ at: { x: 15000, y: 0, z: 2800 }, motivo: 'COMPRIMENTO', segmento: 0 }]);
    const exato = caixasDaRede([seg(0, [0, 0, 2800], [15000, 0, 2800])], caixasEm([0, 0, 2800], [15000, 0, 2800]));
    expect(exato.caixas).toEqual([]);
  });

  it('45 m retos → duas caixas (a 15 e a 30 m)', () => {
    const r = caixasDaRede([seg(0, [0, 0, 2800], [45000, 0, 2800])], caixasEm([0, 0, 2800], [45000, 0, 2800]));
    expect(r.caixas.map((c) => c.at.x)).toEqual([15000, 30000]);
  });

  it('⚠️ as curvas encurtam o limite: tomada → sobe 2,5 m → 8 m no teto → desce 2,5 m (2 curvas, 13 m) passa de 15 − 6 = 9 m → caixa no teto', () => {
    const r = caixasDaRede(
      [seg(0, [0, 0, 300], [0, 0, 2800]), seg(1, [0, 0, 2800], [8000, 0, 2800]), seg(2, [8000, 0, 2800], [8000, 0, 300])],
      caixasEm([0, 0, 300], [8000, 0, 300]),
    );
    expect(r.caixas).toHaveLength(1);
    const c = r.caixas[0];
    // Depois de subir (2,5 m) e da 1ª curva (+3 m equivalentes), sobram 15 − 2,5 − 3 = 9,5 m de teto… mas a 2ª curva
    // vem no fim; a caixa entra onde o equivalente chega a 15 m: 2,5 + 3 + x = 15 → x = 9,5 m > 8 m. Então é a
    // DESCIDA (vertical) que estoura: a caixa vai para o nó da 2ª curva, no teto.
    expect(c).toEqual({ at: { x: 8000, y: 0, z: 2800 }, motivo: 'COMPRIMENTO', segmento: null });
    // Sem a regra das curvas (reducao 0), 13 m cabem em 15: nenhuma caixa.
    const semCurva = caixasDaRede(
      [seg(0, [0, 0, 300], [0, 0, 2800]), seg(1, [0, 0, 2800], [8000, 0, 2800]), seg(2, [8000, 0, 2800], [8000, 0, 300])],
      caixasEm([0, 0, 300], [8000, 0, 300]),
      { ...REGRA_DE_CAIXAS_PADRAO, reducaoPorCurvaMm: 0 },
    );
    expect(semCurva.caixas).toEqual([]);
  });

  it('⚠️ mais de 270° de curvas (4 de 90°) num trecho curto → caixa no nó da 4ª curva', () => {
    // Um "zigue-zague" no teto, 1 m cada perna: 4 curvas de 90° entre as caixas das pontas.
    const pts: [number, number, number][] = [[0, 0, 2800], [1000, 0, 2800], [1000, 1000, 2800], [2000, 1000, 2800], [2000, 2000, 2800], [3000, 2000, 2800]];
    const segs = pts.slice(1).map((p, i) => seg(i, pts[i], p));
    const r = caixasDaRede(segs, caixasEm(pts[0], pts[5]), { ...REGRA_DE_CAIXAS_PADRAO, reducaoPorCurvaMm: 0 });
    expect(r.caixas).toEqual([{ at: { x: 2000, y: 2000, z: 2800 }, motivo: 'CURVAS', segmento: null }]);
  });

  it('derivação (3 eletrodutos num nó) sem ponto embaixo → caixa de DERIVAÇÃO; com ponto embaixo, a caixa dele serve', () => {
    const segs = [seg(0, [0, 0, 2800], [2000, 0, 2800]), seg(1, [2000, 0, 2800], [4000, 0, 2800]), seg(2, [2000, 0, 2800], [2000, 2000, 2800])];
    const pontas = caixasEm([0, 0, 2800], [4000, 0, 2800], [2000, 2000, 2800]);
    expect(caixasDaRede(segs, pontas).caixas).toEqual([{ at: { x: 2000, y: 0, z: 2800 }, motivo: 'DERIVACAO', segmento: null }]);
    const comPonto = (p: P3) => (p.x === 2000 && p.y === 0 ? { descidaMm: 2500 } : pontas(p));
    expect(caixasDaRede(segs, comPonto).caixas).toEqual([]);
  });

  it('a descida até o ponto sob a derivação entra na conta: 2,5 m + curva + 11 m de teto passa de 15 → caixa', () => {
    const segs = [seg(0, [0, 0, 2800], [11000, 0, 2800])];
    const sobrePonto = (p: P3) => (p.x === 0 ? { descidaMm: 2500 } : p.x === 11000 ? { descidaMm: 0 } : null);
    const r = caixasDaRede(segs, sobrePonto);
    // 2,5 + 3 (curva) + x = 15 → a caixa a 9,5 m do início, no teto.
    expect(r.caixas).toEqual([{ at: { x: 9500, y: 0, z: 2800 }, motivo: 'COMPRIMENTO', segmento: 0 }]);
  });

  it('trecho que contém eletroduto EXISTENTE não é mexido (quem aceitou decidiu)', () => {
    const r = caixasDaRede([seg(0, [0, 0, 2800], [10000, 0, 2800]), seg(1, [10000, 0, 2800], [20000, 0, 2800], true)], caixasEm([0, 0, 2800], [20000, 0, 2800]));
    expect(r.caixas).toEqual([]);
  });

  it('vertical longo sem onde pôr caixa: avisa em vez de inventar', () => {
    const r = caixasDaRede([seg(0, [0, 0, 0], [0, 0, 20000])], caixasEm([0, 0, 0], [0, 0, 20000]));
    expect(r.caixas).toEqual([]);
    expect(r.avisos[0]).toMatch(/sem lugar para caixa de passagem/);
  });
});
