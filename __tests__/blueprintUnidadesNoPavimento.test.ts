/**
 * AS UNIDADES DE CADA PAVIMENTO NA MASSA (27/10/2026): *"implemente também a identificação além do pavimento … de
 * cada unidade em cada pavimento"*. O contorno do bloco fatiado na proporção da área privativa de cada unidade do
 * Empreendimento — identificação, não projeto. Puro.
 */
import { describe, expect, it } from 'vitest';
import { arrumarUnidades, fatiasPorArea } from '../utils/blueprintUnidadesNoPavimento';

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

/** O centro de uma fatia, para saber em que fileira (de que lado do corredor) ela caiu. */
const centro = (anel: { x: number; y: number }[]) => ({ x: anel.reduce((s, p) => s + p.x, 0) / anel.length, y: anel.reduce((s, p) => s + p.y, 0) / anel.length });

describe('fatiasPorArea — fileiras equilibradas (ordem automática, 27/10/2026)', () => {
  it('Torre A do Garden (101=127, 102=127, 103=81, 104=81): 101+103 numa fileira, 102+104 na outra, metade do andar cada', () => {
    const f = fatiasPorArea(TORRE, [127, 127, 81, 81], 'EQUILIBRADAS');
    const as = f.map(area);
    expect(as[0] + as[2]).toBeCloseTo(88, 0);
    expect(as[1] + as[3]).toBeCloseTo(88, 0);
    // 101 e 103 do mesmo lado (x < 5,5 m na torre de 11 × 16 m), 102 e 104 do outro.
    const lado = (k: number) => centro(f[k]).x < 5500;
    expect(lado(0)).toBe(lado(2));
    expect(lado(1)).toBe(lado(3));
    expect(lado(0)).not.toBe(lado(1));
    expect(as[0] / as[2]).toBeCloseTo(127 / 81, 1);
  });

  it('a fatia k continua sendo a unidade k (a ordem de entrada não muda)', () => {
    const f = fatiasPorArea(TORRE, [50, 100, 50, 100], 'EQUILIBRADAS');
    expect(f.map(area).map((a) => Math.round(a))).toEqual([29, 59, 29, 59]);
  });

  it('cinco unidades: 3 numa fileira e 2 na outra, como na ordem', () => {
    const f = fatiasPorArea(TORRE, [1, 1, 1, 1, 1], 'EQUILIBRADAS');
    const ladoA = f.filter((a) => centro(a).x < 5500).length;
    expect([2, 3]).toContain(ladoA);
    expect(f.map(area).reduce((s, a) => s + a, 0)).toBeCloseTo(176, 0);
  });

  it('na ORDEM (o padrão), a 1ª metade numa fileira e a 2ª na outra — o que a pessoa arrumou no Empreendimento', () => {
    const f = fatiasPorArea(TORRE, [127, 127, 81, 81]);
    const lado = (k: number) => centro(f[k]).x < 5500;
    expect(lado(0)).toBe(lado(1));
    expect(lado(2)).toBe(lado(3));
    expect(lado(0)).not.toBe(lado(2));
  });
});

describe('arrumarUnidades', () => {
  const und = (nome: string) => ({ nome });
  it('AUTOMATICA: pelo número, fileiras equilibradas', () => {
    const r = arrumarUnidades(['303', '204', '201', '202'].map(und), 'AUTOMATICA');
    expect(r.unidades.map((x) => x.nome)).toEqual(['201', '202', '303', '204']);
    expect(r.fileiras).toBe('EQUILIBRADAS');
  });
  it('EMPREENDIMENTO: a ordem recebida, fileiras pela ordem', () => {
    const r = arrumarUnidades(['303', '204', '201', '202'].map(und), 'EMPREENDIMENTO');
    expect(r.unidades.map((x) => x.nome)).toEqual(['303', '204', '201', '202']);
    expect(r.fileiras).toBe('ORDEM');
  });
});
