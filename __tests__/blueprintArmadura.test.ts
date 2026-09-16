/**
 * ARMADURA ESQUEMÁTICA (16/09/2026) — ver `utils/blueprintArmadura.ts`.
 *
 * O que se prova: o esquema de cada peça segue os mínimos da NBR 6118 (As,min,
 * nº mínimo de barras, espaçamento de estribo/malha); o kg sai do peso linear
 * NBR 7480 com a perda; o piso da taxa vence quando é maior e a linha diz de
 * onde veio; fck e CAA mexem onde devem; totais por família e por aço;
 * a coluna do estudo completa com o padrão.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, computeQuantities, emptyModel, POLITICA_PADRAO, type Command, type Structural } from '../utils/blueprintKernel';
import {
  HIPOTESES_ARMADURA_PADRAO,
  armaduraDaPeca,
  armaduraDoModelo,
  hipotesesDeArmaduraDaColuna,
  pesoLinearKgM,
  rhoMinDeFlexao,
  tipoDeAco,
  type HipotesesDeArmadura,
} from '../utils/blueprintArmadura';

const H = HIPOTESES_ARMADURA_PADRAO;
const semPiso: HipotesesDeArmadura = { ...H, taxaPilarKgM3: 0, taxaVigaKgM3: 0, taxaLajeKgM3: 0, taxaBlocoKgM3: 0, taxaEstacaKgM3: 0, perdaPct: 0 };

function peca(over: Partial<Structural>): Structural {
  return {
    id: 'str_1', uid: 'u1', levelId: 'lvl', kind: 'PILAR', pontos: [{ x: 0, y: 0 }],
    larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, baseMm: 0, circular: false, rotacaoDeg: 0, rotulo: 'P1',
    ...over,
  };
}
const quantDe = (s: Structural) => {
  const forma = s.kind === 'LAJE' ? 'AREA' : s.kind === 'VIGA' || s.kind === 'VIGA_FUNDACAO' ? 'LINHA' : 'PONTO';
  const comprimentoM = forma === 'LINHA' ? Math.hypot(s.pontos[1].x - s.pontos[0].x, s.pontos[1].y - s.pontos[0].y) / 1000 : forma === 'PONTO' ? s.alturaMm / 1000 : 0;
  const areaPlantaM2 = forma === 'AREA' ? 12 : 0;
  const volumeConcretoM3 =
    forma === 'AREA' ? (areaPlantaM2 * s.alturaMm) / 1000
      : forma === 'LINHA' ? (comprimentoM * s.larguraMm * s.alturaMm) / 1e6
        : s.circular ? (Math.PI * (s.larguraMm / 2000) ** 2 * s.alturaMm) / 1000
          : (s.larguraMm * s.profundidadeMm * s.alturaMm) / 1e9;
  return { comprimentoM, areaPlantaM2, volumeConcretoM3 };
};

describe('peso linear, tipo de aço, ρmin', () => {
  it('NBR 7480: Ø 12,5 → 0,963 kg/m; Ø 5,0 é CA-60, Ø 6,3 é CA-50; ρmin 0,15 % até fck 30, 0,23 % em fck 40', () => {
    expect(pesoLinearKgM(12.5)).toBeCloseTo(0.963, 3);
    expect(pesoLinearKgM(10)).toBeCloseTo(0.617, 3);
    expect(tipoDeAco(5)).toBe('CA-60');
    expect(tipoDeAco(6.3)).toBe('CA-50');
    expect(rhoMinDeFlexao(25)).toBe(0.0015);
    expect(rhoMinDeFlexao(40)).toBeCloseTo(0.0023, 6);
  });
});

describe('armaduraDaPeca — pilar', () => {
  it('19 × 19 × 280, fck 25, Ø 12,5: As,min 0,4 % = 1,444 cm² → 4 Ø 12,5 (mínimo); estribos Ø 5,0 c/15 (12 Øl); kg = barras + estribos', () => {
    const s = peca({});
    const a = armaduraDaPeca(s, quantDe(s), semPiso);
    const long = a.camadas.find((c) => c.papel === 'longitudinal')!;
    const est = a.camadas.find((c) => c.papel === 'estribo')!;
    expect(long).toMatchObject({ n: 4, bitolaMm: 12.5, aco: 'CA-50' });
    expect(long.comprimentoUnitM).toBeCloseTo(2.8 + 0.5, 3); // altura + 40 Ø
    expect(est).toMatchObject({ bitolaMm: 5, aco: 'CA-60', espacamentoCm: 15 });
    expect(est.n).toBe(Math.floor(280 / 15) + 1);
    // Perímetro: 2(19+19) − 8×3 (CAA II) = 52 cm + 2 ganchos de 7,5 → 0,67 m.
    expect(est.comprimentoUnitM).toBeCloseTo(0.67, 3);
    expect(a.kg).toBeCloseTo(4 * 3.3 * 0.963 + est.n * 0.67 * pesoLinearKgM(5), 1);
    expect(a.origem).toBe('ESQUEMA');
    expect(a.descricao).toBe('4 Ø 12,5 + estribos Ø 5,0 c/15');
    expect(a.kgCa60).toBeGreaterThan(0);
    expect(a.kgCa50 + a.kgCa60).toBeCloseTo(a.kg, 1);
  });

  it('pilar grande 60 × 60: As,min 14,4 cm² → 12 Ø 12,5; circular Ø 40 → ≥ 6 barras', () => {
    const g = peca({ larguraMm: 600, profundidadeMm: 600 });
    expect(armaduraDaPeca(g, quantDe(g), semPiso).camadas[0].n).toBe(12);
    const c = peca({ circular: true, larguraMm: 400, profundidadeMm: 400 });
    expect(armaduraDaPeca(c, quantDe(c), semPiso).camadas[0].n).toBeGreaterThanOrEqual(6);
  });

  it('CAA IV sobe o cobrimento (5 cm) e encurta o estribo; perda 10 % multiplica o esquema', () => {
    const s = peca({});
    const ii = armaduraDaPeca(s, quantDe(s), semPiso).camadas[1].comprimentoUnitM;
    const iv = armaduraDaPeca(s, quantDe(s), { ...semPiso, caa: 'IV' }).camadas[1].comprimentoUnitM;
    expect(iv).toBeLessThan(ii);
    const semPerda = armaduraDaPeca(s, quantDe(s), semPiso).kg;
    const comPerda = armaduraDaPeca(s, quantDe(s), { ...semPiso, perdaPct: 10 }).kg;
    expect(comPerda).toBeCloseTo(semPerda * 1.1, 1);
  });

  it('o piso da taxa vence quando é maior: pilar 60 × 60 com taxa 100 kg/m³ → origem TAXA e aviso; taxa 0 desliga; no 19 × 19 o mínimo já passa do piso', () => {
    const g = peca({ larguraMm: 600, profundidadeMm: 600 });
    const com = armaduraDaPeca(g, quantDe(g), H);
    // volume 1,008 m³ × 100 = 100,8 kg; o esquema mínimo (12 Ø 12,5 + estribos) dá ~50 kg.
    expect(com.kgPiso).toBeCloseTo(100.8, 1);
    expect(com.kgEsquema).toBeLessThan(com.kgPiso);
    expect(com.origem).toBe('TAXA');
    expect(com.kg).toBe(com.kgPiso);
    expect(com.avisos[0]).toMatch(/piso da taxa/);
    expect(com.taxaEfetivaKgM3).toBeCloseTo(100, 0);
    expect(armaduraDaPeca(g, quantDe(g), { ...H, taxaPilarKgM3: 0 }).origem).toBe('ESQUEMA');
    // Pilar pequeno: o mínimo normativo já rende ~145 kg/m³ — o esquema manda.
    const p = peca({});
    expect(armaduraDaPeca(p, quantDe(p), H).origem).toBe('ESQUEMA');
  });
});

describe('armaduraDaPeca — viga e baldrame', () => {
  const viga = peca({ kind: 'VIGA', pontos: [{ x: 0, y: 0 }, { x: 6000, y: 0 }], larguraMm: 150, alturaMm: 400, baseMm: 2400, rotulo: 'V1' });
  it('15 × 40 × 6 m, fck 25, Ø 10: ρmin 0,15 % → 0,9 cm² → 2 Ø 10 inf. + 2 porta-estribos; estribos c/ ≤ 0,6 d; barra = L + 2×30 Ø', () => {
    const a = armaduraDaPeca(viga, quantDe(viga), semPiso);
    const [inf, sup, est] = a.camadas;
    expect(inf).toMatchObject({ papel: 'longitudinal', n: 2, bitolaMm: 10 });
    expect(inf.comprimentoUnitM).toBeCloseTo(6 + 0.6, 3);
    expect(sup).toMatchObject({ papel: 'superior', n: 2 });
    // d = 40 − 3 − 0,5 − 0,5 = 36 → 0,6 d = 21,6 → s ≤ 21; a taxa mínima permite mais que isso.
    expect(est.espacamentoCm).toBe(21);
    expect(est.n).toBe(Math.floor(600 / 21) + 1);
    expect(a.descricao).toBe('2 Ø 10,0 inf. + 2 Ø 10,0 sup. + estribos Ø 5,0 c/21');
  });
  it('fck 40 sobe ρmin e a viga larga (30 × 60) pede mais barras que a estreita', () => {
    const larga = peca({ ...viga, larguraMm: 300, alturaMm: 600 });
    const n25 = armaduraDaPeca(larga, quantDe(larga), semPiso).camadas[0].n;
    const n40 = armaduraDaPeca(larga, quantDe(larga), { ...semPiso, fckMpa: 40 }).camadas[0].n;
    expect(n25).toBeGreaterThanOrEqual(4); // 0,15 % × 30 × 60 = 2,7 cm² → 4 Ø 10
    expect(n40).toBeGreaterThan(n25);
  });
  it('baldrame: a armadura superior é espelho da inferior (mín. As,min), não só porta-estribos', () => {
    const b = peca({ ...viga, kind: 'VIGA_FUNDACAO', larguraMm: 300, alturaMm: 500, baseMm: -500 });
    const a = armaduraDaPeca(b, quantDe(b), semPiso);
    expect(a.camadas[1].n).toBe(a.camadas[0].n);
    expect(a.camadas[0].n).toBeGreaterThanOrEqual(3); // 0,15 % × 30 × 50 = 2,25 → 3 Ø 10
  });
});

describe('armaduraDaPeca — laje, bloco, estaca', () => {
  it('laje 10 cm, 12 m²: 1,5 cm²/m por direção → Ø 8 c/20 nas duas direções; aviso dos negativos', () => {
    const l = peca({ kind: 'LAJE', pontos: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }], alturaMm: 100, baseMm: 2800, rotulo: 'L1' });
    const a = armaduraDaPeca(l, quantDe(l), semPiso);
    const malha = a.camadas[0];
    // Aφ8 = 0,503 cm² → 100 × 0,503 / 1,5 = 33 cm, mas s ≤ min(20, 2h = 20) → 20.
    expect(malha).toMatchObject({ papel: 'malha', bitolaMm: 8, espacamentoCm: 20, n: 2 });
    expect(malha.comprimentoUnitM).toBeCloseTo((12 * 100) / 20, 3);
    expect(a.kg).toBeCloseTo(2 * 60 * pesoLinearKgM(8), 1);
    expect(a.avisos.some((x) => /negativos/.test(x))).toBe(true);
  });
  it('bloco 60 × 60 × 60: malha ≥ 3 + 3 Ø 12,5 com ganchos + estribos Ø 8 c/20; cobrimento de fundação (3,5 cm)', () => {
    const b = peca({ kind: 'BLOCO_COROAMENTO', larguraMm: 600, profundidadeMm: 600, alturaMm: 600, baseMm: -1100, rotulo: 'B1' });
    const a = armaduraDaPeca(b, quantDe(b), semPiso);
    const [m1, m2, est] = a.camadas;
    // 0,15 % × 60 × 60 = 5,4 cm² / 1,227 = 4,4 → 5 barras por direção.
    expect(m1.n).toBe(5);
    expect(m2.n).toBe(5);
    // 60 − 2×3,5 + 2×12,5 = 78 cm.
    expect(m1.comprimentoUnitM).toBeCloseTo(0.78, 3);
    expect(est).toMatchObject({ bitolaMm: 8, espacamentoCm: 20 });
    expect(a.descricao).toBe('malha inferior 5 + 5 Ø 12,5 + estribos Ø 8,0 c/20');
  });
  it('estaca Ø 30 × 8 m, trecho armado 6 m: 0,5 % Ac = 3,53 cm² → 6 Ø 10 (mínimo) de 6,4 m + espiral Ø 5 passo 20; trecho TOTAL arma os 8 m', () => {
    const e = peca({ kind: 'ESTACA', circular: true, larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, rotulo: 'E1' });
    const a = armaduraDaPeca(e, quantDe(e), semPiso);
    const [long, esp] = a.camadas;
    expect(long).toMatchObject({ n: 6, bitolaMm: 10 });
    expect(long.comprimentoUnitM).toBeCloseTo(6.4, 3);
    expect(esp).toMatchObject({ papel: 'espiral', bitolaMm: 5, espacamentoCm: 20 });
    expect(esp.n).toBe(Math.floor(600 / 20) + 1);
    // π (30 − 7) = 72,3 cm.
    expect(esp.comprimentoUnitM).toBeCloseTo(0.723, 3);
    const total = armaduraDaPeca(e, quantDe(e), { ...semPiso, trechoArmadoDaEstacaM: null });
    expect(total.camadas[0].comprimentoUnitM).toBeCloseTo(8.4, 3);
    expect(total.kg).toBeGreaterThan(a.kg);
  });
});

describe('armaduraDoModelo — totais', () => {
  it('casa com pilar, viga, laje, bloco e estaca: kg por família, CA-50 × CA-60 fecham no total, taxas efetivas; determinístico', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, thicknessMm: 150, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: { x: 6000, y: 0 }, b: { x: 6000, y: 4000 }, thicknessMm: 150, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: { x: 6000, y: 4000 }, b: { x: 0, y: 4000 }, thicknessMm: 150, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: { x: 0, y: 4000 }, b: { x: 0, y: 0 }, thicknessMm: 150, heightMm: 2800 },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 3000, y: 2000 }], larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, rotulo: 'P1' },
      { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [{ x: 0, y: 2000 }, { x: 6000, y: 2000 }], larguraMm: 150, alturaMm: 400, baseMm: 2400, rotulo: 'V1' },
      { type: 'AddStructural', levelId: t, kind: 'LAJE', pontos: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }], alturaMm: 100, baseMm: 2800, rotulo: 'L1' },
      { type: 'AddStructural', levelId: t, kind: 'BLOCO_COROAMENTO', pontos: [{ x: 3000, y: 2000 }], larguraMm: 600, profundidadeMm: 600, alturaMm: 600, baseMm: -1100, rotulo: 'B1' },
      { type: 'AddStructural', levelId: t, kind: 'ESTACA', pontos: [{ x: 3000, y: 2000 }], larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true, rotulo: 'E1' },
    ] as Command[]).model;
    const quant = computeQuantities(m, POLITICA_PADRAO);
    const a = armaduraDoModelo(m, quant, H);
    expect(a.pecas.map((p) => p.rotulo)).toEqual(['P1', 'V1', 'L1', 'B1', 'E1']);
    const t0 = a.totais;
    expect(t0.pilarKg).toBeGreaterThan(0);
    expect(t0.vigaKg).toBeGreaterThan(0);
    expect(t0.lajeKg).toBeGreaterThan(0);
    expect(t0.fundacaoKg).toBeCloseTo(a.pecas[3].kg + a.pecas[4].kg, 2);
    expect(t0.totalKg).toBeCloseTo(t0.pilarKg + t0.vigaKg + t0.lajeKg + t0.fundacaoKg, 2);
    expect(t0.ca50Kg + t0.ca60Kg).toBeCloseTo(t0.totalKg, 1);
    expect(t0.taxaLajeKgM3).toBeGreaterThanOrEqual(70); // piso da laje
    expect(JSON.stringify(armaduraDoModelo(m, quant, H))).toBe(JSON.stringify(a));
    // Peça que o quantitativo não tem (id órfão) não quebra.
    expect(armaduraDoModelo(m, { estruturas: [{ ...quant.estruturas[0], structuralId: 'str_nope' }] }, H).pecas).toEqual([]);
  });
});

describe('armadura MANUAL por peça (16/09/2026)', () => {
  it('pilar com 8 Ø 16 e estribo Ø 6,3 c/10: origem MANUAL, camadas do lançamento, piso da taxa não se aplica; abaixo do mínimo avisa', () => {
    const s = peca({ larguraMm: 600, profundidadeMm: 600 });
    const manual = { ...H, porPeca: { u1: { nLongitudinal: 8, bitolaLongitudinalMm: 16, bitolaTransversalMm: 6.3, espacamentoTransversalCm: 10 } } };
    const a = armaduraDaPeca(s, quantDe(s), manual);
    expect(a.origem).toBe('MANUAL');
    expect(a.camadas[0]).toMatchObject({ n: 8, bitolaMm: 16 });
    expect(a.camadas[1]).toMatchObject({ bitolaMm: 6.3, espacamentoCm: 10, aco: 'CA-50' });
    expect(a.kg).toBe(a.kgEsquema); // sem piso
    expect(a.descricao).toBe('8 Ø 16,0 + estribos Ø 6,3 c/10');
    expect(a.avisos.some((x) => /abaixo do mínimo/.test(x))).toBe(false);
    // Abaixo do mínimo (0,4 % × 3600 = 14,4 cm²): 4 Ø 10 = 3,14 cm² → aviso; estribo c/30 acima do máximo (20) → aviso.
    const pouco = armaduraDaPeca(s, quantDe(s), { ...H, porPeca: { u1: { nLongitudinal: 4, bitolaLongitudinalMm: 10, bitolaTransversalMm: 5, espacamentoTransversalCm: 30 } } });
    expect(pouco.avisos.some((x) => /armadura longitudinal abaixo do mínimo/.test(x))).toBe(true);
    expect(pouco.avisos.some((x) => /acima do máximo/.test(x))).toBe(true);
    // Outra peça (uid diferente) segue automática.
    const outra = armaduraDaPeca({ ...s, uid: 'u2' }, quantDe(s), manual);
    expect(outra.origem).not.toBe('MANUAL');
  });

  it('viga manual com superiores próprias; laje manual muda a malha; bloco manual as duas direções; estaca manual barras e passo', () => {
    const viga = peca({ kind: 'VIGA', pontos: [{ x: 0, y: 0 }, { x: 6000, y: 0 }], larguraMm: 150, alturaMm: 400, baseMm: 2400 });
    const av = armaduraDaPeca(viga, quantDe(viga), { ...H, porPeca: { u1: { nLongitudinal: 3, bitolaLongitudinalMm: 12.5, nSuperior: 2, bitolaSuperiorMm: 8, bitolaTransversalMm: 5, espacamentoTransversalCm: 15 } } });
    expect(av.descricao).toBe('3 Ø 12,5 inf. + 2 Ø 8,0 sup. + estribos Ø 5,0 c/15');
    const laje = peca({ kind: 'LAJE', pontos: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }], alturaMm: 100, baseMm: 2800 });
    const al = armaduraDaPeca(laje, quantDe(laje), { ...H, porPeca: { u1: { nLongitudinal: 1, bitolaLongitudinalMm: 6.3, bitolaTransversalMm: 6.3, espacamentoTransversalCm: 15 } } });
    expect(al.descricao).toBe('malha inferior Ø 6,3 c/15 nas duas direções');
    expect(al.camadas[0].comprimentoUnitM).toBeCloseTo((12 * 100) / 15, 3);
    const bloco = peca({ kind: 'BLOCO_COROAMENTO', larguraMm: 600, profundidadeMm: 600, alturaMm: 600, baseMm: -1100 });
    const ab = armaduraDaPeca(bloco, quantDe(bloco), { ...H, porPeca: { u1: { nLongitudinal: 6, nSuperior: 4, bitolaLongitudinalMm: 10, bitolaTransversalMm: 6.3, espacamentoTransversalCm: 15 } } });
    expect(ab.descricao).toBe('malha inferior 6 + 4 Ø 10,0 + estribos Ø 6,3 c/15');
    const estaca = peca({ kind: 'ESTACA', circular: true, larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100 });
    const ae = armaduraDaPeca(estaca, quantDe(estaca), { ...H, porPeca: { u1: { nLongitudinal: 8, bitolaLongitudinalMm: 12.5, bitolaTransversalMm: 6.3, espacamentoTransversalCm: 15 } } });
    expect(ae.descricao).toBe('8 Ø 12,5 no trecho armado de 6,0 m + espiral Ø 6,3 passo 15');
    expect(ae.camadas[1].n).toBe(Math.floor(600 / 15) + 1);
  });
});

describe('hipotesesDeArmaduraDaColuna', () => {
  it('completa JSON parcial com o padrão e rejeita valores fora das listas; null no trecho = total', () => {
    expect(hipotesesDeArmaduraDaColuna(null)).toEqual(H);
    expect(hipotesesDeArmaduraDaColuna({ fckMpa: 30, caa: 'IV', bitolaPilarMm: 16, taxaPilarKgM3: 120 })).toMatchObject({ fckMpa: 30, caa: 'IV', bitolaPilarMm: 16, taxaPilarKgM3: 120, bitolaVigaMm: 10 });
    expect(hipotesesDeArmaduraDaColuna({ fckMpa: 27, caa: 'V', bitolaEstriboMm: 8, perdaPct: -3 })).toMatchObject({ fckMpa: 25, caa: 'II', bitolaEstriboMm: 5, perdaPct: 10 });
    expect(hipotesesDeArmaduraDaColuna({ trechoArmadoDaEstacaM: null }).trechoArmadoDaEstacaM).toBeNull();
    expect(hipotesesDeArmaduraDaColuna({ trechoArmadoDaEstacaM: 4 }).trechoArmadoDaEstacaM).toBe(4);
  });
  it('porPeca: entradas válidas passam, inválidas caem, vazio some', () => {
    const h = hipotesesDeArmaduraDaColuna({
      porPeca: {
        a: { nLongitudinal: 6, bitolaLongitudinalMm: 12.5, bitolaTransversalMm: 5, espacamentoTransversalCm: 12, nSuperior: 2 },
        b: { nLongitudinal: 'x', bitolaLongitudinalMm: 10 },
        c: null,
      },
    });
    expect(h.porPeca).toEqual({ a: { nLongitudinal: 6, bitolaLongitudinalMm: 12.5, bitolaTransversalMm: 5, espacamentoTransversalCm: 12, nSuperior: 2 } });
    expect(hipotesesDeArmaduraDaColuna({ porPeca: { b: {} } }).porPeca).toBeUndefined();
  });
});
