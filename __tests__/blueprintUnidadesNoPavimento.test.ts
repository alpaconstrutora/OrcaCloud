/**
 * AS UNIDADES DE CADA PAVIMENTO NA MASSA (27/10/2026): *"implemente também a identificação além do pavimento … de
 * cada unidade em cada pavimento"*. O contorno do bloco fatiado na proporção da área privativa de cada unidade do
 * Empreendimento — identificação, não projeto. Puro.
 */
import { describe, expect, it } from 'vitest';
import { arrumarUnidades, direcoesDasUnidades, fatiasPorArea, fatiasPorDirecao } from '../utils/blueprintUnidadesNoPavimento';

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

describe('posição e orientação do Empreendimento (28/10/2026)', () => {
  // A torre de 11 × 16 m com a rua em y < 0: a frente "para fora" é (0, -1).
  const RUA_EM_Y_NEGATIVO = { frenteParaFora: { x: 0, y: -1 }, rotacaoNorteDeg: null };
  const und = (nome: string, posicao: string | null, orientacao: string | null = null) => ({ nome, posicao, orientacao });

  it('direções: Frente aponta para a rua, Fundos para o lado oposto; o sol pelo norte do desenho (+Y sem georreferência)', () => {
    const r = direcoesDasUnidades([und('101', 'FRENTE'), und('102', 'FUNDOS'), und('103', null, 'NORTE'), und('104', null, 'LESTE'), und('105', null, null)], RUA_EM_Y_NEGATIVO);
    expect(r.direcoes.slice(0, 4).map((d) => d && { x: Math.round(d.x), y: Math.round(d.y) })).toEqual([{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }]);
    expect(r.direcoes[4]).toBeNull();
  });

  it('posição e sol opostos: avisa a unidade', () => {
    const r = direcoesDasUnidades([und('101', 'FRENTE', 'NORTE')], RUA_EM_Y_NEGATIVO);
    expect(r.avisos).toEqual(['Unidade 101: posição Frente e sol Norte apontam para lados opostos nesta planta — confira o cadastro.']);
  });

  it('sem frente do lote: a posição não vale (aviso), o sol continua', () => {
    const r = direcoesDasUnidades([und('101', 'FRENTE', 'SUL')], { frenteParaFora: null, rotacaoNorteDeg: null });
    expect(r.direcoes[0] && Math.round(r.direcoes[0].y)).toBe(-1);
    expect(r.avisos.join(' ')).toContain('marque a divisa de Frente');
  });

  it('2 de Frente e 2 de Fundos (ordem 101–104): as de Frente ficam do lado da rua nas DUAS fileiras', () => {
    const r = direcoesDasUnidades([und('101', 'FRENTE'), und('102', 'FRENTE'), und('103', 'FUNDOS'), und('104', 'FUNDOS')], RUA_EM_Y_NEGATIVO);
    const f = fatiasPorDirecao(TORRE, [127, 127, 81, 81], r.direcoes);
    const yc = (k: number) => centro(f[k]).y;
    expect(yc(0)).toBeLessThan(8000);
    expect(yc(1)).toBeLessThan(8000);
    expect(yc(2)).toBeGreaterThan(8000);
    expect(yc(3)).toBeGreaterThan(8000);
    // As duas de Frente em fileiras diferentes (lados opostos do corredor).
    expect(centro(f[0]).x < 5500).not.toBe(centro(f[1]).x < 5500);
    // As fatias continuam na proporção da área e somam o andar.
    expect(f.map(area).reduce((s, a) => s + a, 0)).toBeCloseTo(176, 0);
  });

  it('frente no lado comprido: Frente numa fileira, Fundos na outra', () => {
    const ladoX = { frenteParaFora: { x: 1, y: 0 }, rotacaoNorteDeg: null };
    const r = direcoesDasUnidades([und('101', 'FRENTE'), und('102', 'FUNDOS'), und('103', 'FRENTE'), und('104', 'FUNDOS')], ladoX);
    const f = fatiasPorDirecao(TORRE, [1, 1, 1, 1], r.direcoes);
    expect(centro(f[0]).x).toBeGreaterThan(5500);
    expect(centro(f[2]).x).toBeGreaterThan(5500);
    expect(centro(f[1]).x).toBeLessThan(5500);
    expect(centro(f[3]).x).toBeLessThan(5500);
  });

  it('Lateral vai para as pontas da fileira (uma em cada ponta)', () => {
    const r = direcoesDasUnidades([und('101', 'LATERAL'), und('102', null), und('103', 'LATERAL')], { frenteParaFora: { x: 1, y: 0 }, rotacaoNorteDeg: null });
    // Uma fileira (3 unidades): as laterais nas pontas ao longo do lado maior (y), a sem posição no meio.
    const f = fatiasPorDirecao(TORRE, [1, 1, 1], r.direcoes);
    const ys = f.map((a) => centro(a).y);
    expect(Math.min(ys[0], ys[2])).toBeLessThan(ys[1]);
    expect(Math.max(ys[0], ys[2])).toBeGreaterThan(ys[1]);
  });

  it('arrumarUnidades: na Automática com posição/orientação, devolve as direções; na do Empreendimento, não', () => {
    const us = [und('102', 'FUNDOS'), und('101', 'FRENTE')];
    const auto = arrumarUnidades(us, 'AUTOMATICA', RUA_EM_Y_NEGATIVO);
    expect(auto.unidades.map((u) => u.nome)).toEqual(['101', '102']);
    expect(auto.direcoes?.map((d) => d && Math.round(d.y))).toEqual([-1, 1]);
    expect(arrumarUnidades(us, 'EMPREENDIMENTO', RUA_EM_Y_NEGATIVO).direcoes).toBeUndefined();
    // Sem posição nem orientação em nenhuma: a regra de antes (sem direções).
    expect(arrumarUnidades([und('101', null), und('102', null)], 'AUTOMATICA', RUA_EM_Y_NEGATIVO).direcoes).toBeUndefined();
  });
});

describe('Lateral com sol (o Garden, 28/10/2026)', () => {
  it('"Lateral/Norte" e "Lateral/Sul": cada uma do lado que o sol diz, sem aviso de opostos', () => {
    // Rua em y < 0: as laterais são ±x; norte = +Y, então Norte/Sul não decidem — alternam. Com a rua em x > 0, as
    // laterais são ±y e o sol decide.
    const r = direcoesDasUnidades(
      [
        { nome: '103', posicao: 'LATERAL', orientacao: 'SUL' },
        { nome: '104', posicao: 'LATERAL', orientacao: 'NORTE' },
      ],
      { frenteParaFora: { x: 1, y: 0 }, rotacaoNorteDeg: null },
    );
    expect(r.avisos).toEqual([]);
    expect(Math.round(r.direcoes[0]!.y)).toBe(-1);
    expect(Math.round(r.direcoes[1]!.y)).toBe(1);
  });
});
