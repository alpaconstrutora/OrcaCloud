/**
 * AS UNIDADES DE CADA PAVIMENTO NA MASSA (27/10/2026): *"implemente também a identificação além do pavimento … de
 * cada unidade em cada pavimento"*. O contorno do bloco fatiado na proporção da área privativa de cada unidade do
 * Empreendimento — identificação, não projeto. Puro.
 */
import { describe, expect, it } from 'vitest';
import { fatiasPorArea } from '../utils/blueprintUnidadesNoPavimento';

const area = (anel: { x: number; y: number }[]) => Math.abs(anel.reduce((s, p, i) => { const q = anel[(i + 1) % anel.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2) / 1e6;
/** Torre A do Garden: 11 × 16 m. */
const TORRE = [{ x: 0, y: 0 }, { x: 11000, y: 0 }, { x: 11000, y: 16000 }, { x: 0, y: 16000 }];

describe('fatiasPorArea', () => {
  it('uma unidade: o contorno inteiro', () => {
    const f = fatiasPorArea(TORRE, [127]);
    expect(f).toHaveLength(1);
    expect(area(f[0])).toBeCloseTo(176, 0);
  });

  it('duas unidades (térreo 127 + 81 m²): uma fileira, áreas na proporção', () => {
    const f = fatiasPorArea(TORRE, [127, 81]);
    expect(f.map(area).map((a) => Math.round(a))).toEqual([Math.round((176 * 127) / 208), Math.round((176 * 81) / 208)]);
  });

  it('quatro unidades (tipo 127, 127, 81, 81): duas fileiras, cada fatia na proporção, somando o andar', () => {
    const f = fatiasPorArea(TORRE, [127, 127, 81, 81]);
    expect(f).toHaveLength(4);
    const as = f.map(area);
    expect(as.reduce((s, a) => s + a, 0)).toBeCloseTo(176, 0);
    expect(as[0] / as[2]).toBeCloseTo(127 / 81, 1);
    // As fatias não se sobrepõem: nenhuma passa da metade do andar na fileira.
    for (const a of as) expect(a).toBeLessThan(176 / 2);
  });

  it('peso nulo ou zero vale a média dos outros', () => {
    const f = fatiasPorArea(TORRE, [100, 0, 100]);
    expect(f.map(area).map((a) => Math.round(a))).toEqual([59, 59, 59]);
  });

  it('contorno girado (o bloco não está no eixo): fatias ao longo do lado maior', () => {
    const r = (p: { x: number; y: number }) => ({ x: Math.round(p.x * Math.cos(0.5) - p.y * Math.sin(0.5)), y: Math.round(p.x * Math.sin(0.5) + p.y * Math.cos(0.5)) });
    const f = fatiasPorArea(TORRE.map(r), [1, 1]);
    expect(f.map(area).map((a) => Math.round(a))).toEqual([88, 88]);
  });

  it('sem unidade: nada', () => {
    expect(fatiasPorArea(TORRE, [])).toEqual([]);
  });
});
