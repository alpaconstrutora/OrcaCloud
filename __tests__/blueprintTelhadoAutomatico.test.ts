/**
 * Casa automática F5 (15/10/2026): o telhado automático por extrusão (`comandosDoTelhado`).
 * Plano: `docs/planos/2026-10-14-casa-automatica.md`.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type Agua, type BlueprintModel } from '../utils/blueprintKernel';
import { comandosDoTelhado, HIPOTESES_DO_TELHADO_PADRAO, type HipotesesDoTelhado } from '../utils/blueprintTelhadoAutomatico';

const RETO = { ex: { x: 1, y: 0 }, ey: { x: 0, y: 1 } };

function telhado(ret: { x0: number; y0: number; x1: number; y1: number }, hip: Partial<HipotesesDoTelhado> = {}, quadro = RETO) {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const L = base.levels[0].id;
  const t = comandosDoTelhado(L, ret, quadro, 2900, 100, { ...HIPOTESES_DO_TELHADO_PADRAO, ...hip });
  if (!t.ok) throw new Error(t.motivo);
  const m: BlueprintModel = applyBatch(base, t.comandos).model;
  return { t, aguas: m.roofs ?? [] };
}
const beiral = (a: Agua) => [a.pontos[a.beiralIndex], a.pontos[(a.beiralIndex + 1) % a.pontos.length]];
const caixa = (aguas: Agua[]) => {
  const ps = aguas.flatMap((a) => a.pontos);
  return { x0: Math.min(...ps.map((p) => p.x)), x1: Math.max(...ps.map((p) => p.x)), y0: Math.min(...ps.map((p) => p.y)), y1: Math.max(...ps.map((p) => p.y)) };
};

describe('comandosDoTelhado', () => {
  it('casa funda (9 × 16,85): duas águas, cumeeira da frente para os fundos, beiral de 0,60 m além da face', () => {
    const { t, aguas } = telhado({ x0: 0, y0: 0, x1: 9000, y1: 16850 });
    if (!t.ok) return;
    expect(aguas).toHaveLength(2);
    expect(t.resumo.direcao).toBe('da frente para os fundos');
    // além do EIXO: meia parede (100) + beiral (600) = 700 de cada lado
    expect(caixa(aguas)).toEqual({ x0: -700, x1: 9700, y0: -700, y1: 17550 });
    // alturas: topo 2900 na face; a ponta do beiral desce 600 × 30 %; a cumeeira sobe o meio vão × 30 %
    expect(t.resumo.alturaDoBeiralMm).toBe(2720);
    expect(t.resumo.alturaDaCumeeiraMm).toBe(2720 + Math.round(5200 * 0.3));
    for (const a of aguas) {
      expect(a.inclinacaoPct).toBeCloseTo(30, 0);
      expect(a.baseMm).toBe(2720);
      // o beiral de cada água é um lado LONGO, nas laterais (x = −700 ou 9700)
      const [p, q] = beiral(a);
      expect(p.x).toBe(q.x);
      expect([-700, 9700]).toContain(p.x);
    }
    expect(t.resumo.projecaoM2).toBeCloseTo(10.4 * 18.25, 1);
  });

  it('casa larga (14 × 9): a cumeeira vira ao longo da frente', () => {
    const { t, aguas } = telhado({ x0: 0, y0: 0, x1: 14000, y1: 9000 });
    if (!t.ok) return;
    expect(t.resumo.direcao).toBe('ao longo da frente');
    for (const a of aguas) {
      const [p, q] = beiral(a);
      expect(p.y).toBe(q.y);
    }
  });

  it('uma água: cai para os FUNDOS por padrão e para a FRENTE quando pedido', () => {
    const fundos = telhado({ x0: 0, y0: 0, x1: 9000, y1: 12000 }, { tipo: 'UMA_AGUA' }).aguas;
    const frente = telhado({ x0: 0, y0: 0, x1: 9000, y1: 12000 }, { tipo: 'UMA_AGUA', caimentoUmaAgua: 'FRENTE' }).aguas;
    expect(fundos).toHaveLength(1);
    expect(frente).toHaveLength(1);
    expect(beiral(fundos[0]).every((p) => p.y === 12700)).toBe(true);
    expect(beiral(frente[0]).every((p) => p.y === -700)).toBe(true);
  });

  it('F24 — uma água caindo para o LADO (o anexo ao lado na casa em L): o beiral na lateral, a cumeeira na outra', () => {
    const direita = telhado({ x0: 0, y0: 0, x1: 9000, y1: 12000 }, { tipo: 'UMA_AGUA', caimentoUmaAgua: 'DIREITA' }).aguas;
    const esquerda = telhado({ x0: 0, y0: 0, x1: 9000, y1: 12000 }, { tipo: 'UMA_AGUA', caimentoUmaAgua: 'ESQUERDA' }).aguas;
    expect(direita).toHaveLength(1);
    expect(esquerda).toHaveLength(1);
    expect(beiral(direita[0]).every((p) => p.x === 9700)).toBe(true);
    expect(beiral(esquerda[0]).every((p) => p.x === -700)).toBe(true);
  });

  it('quadro girado 30°: as mesmas águas, giradas — a área de cada uma não muda', () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const girado = { ex: { x: c, y: s }, ey: { x: -s, y: c } };
    const reto = telhado({ x0: 1500, y0: 3000, x1: 10500, y1: 19850 });
    const gir = telhado({ x0: 1500, y0: 3000, x1: 10500, y1: 19850 }, {}, girado);
    expect(gir.aguas).toHaveLength(2);
    const area = (a: Agua) => Math.abs(a.pontos.reduce((acc, p, i) => acc + p.x * a.pontos[(i + 1) % 4].y - a.pontos[(i + 1) % 4].x * p.y, 0)) / 2;
    for (let i = 0; i < 2; i++) expect(area(gir.aguas[i]) / area(reto.aguas[i])).toBeCloseTo(1, 3);
  });

  it('recusa com motivo: inclinação zero, beiral negativo', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const L = base.levels[0].id;
    expect(comandosDoTelhado(L, { x0: 0, y0: 0, x1: 9000, y1: 9000 }, RETO, 2900, 100, { ...HIPOTESES_DO_TELHADO_PADRAO, inclinacaoPct: 0 })).toMatchObject({ ok: false });
    expect(comandosDoTelhado(L, { x0: 0, y0: 0, x1: 9000, y1: 9000 }, RETO, 2900, 100, { ...HIPOTESES_DO_TELHADO_PADRAO, beiralMm: -1 })).toMatchObject({ ok: false });
  });
});
