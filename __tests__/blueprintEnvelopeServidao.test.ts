/**
 * Servidão no meio do lote (20/09/2026, backlog P2 — P2.11): o envelope se
 * divide em peças; "cabe?" exige a edificação inteira numa peça; a área fora é
 * a da peça que mais a contém; APP na divisa segue recortando por semiplano.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, polygonArea, type Command } from '../utils/blueprintKernel';
import { divisasDoLote, envelopeConstrutivo, medirTerreno } from '../utils/blueprintTerreno';
import { envelopeVertical } from '../utils/blueprintEnvelope3d';

const RECUOS = { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
const ZONA = { afastamentoProgressivo: null, gabaritoAlturaMaxM: null, gabaritoPavimentos: null };

function lote() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 20000, 0, 'FRENTE'), d(20000, 0, 20000, 30000, 'LATERAL_DIREITA'), d(20000, 30000, 0, 30000, 'FUNDOS'), d(0, 30000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  // Servidão de 3 m atravessando o lote em y = 15000 (faixa 15000..18000).
  m = applyCommand(m, { type: 'AddBoundary', levelId: t, a: point(0, 15000), b: point(20000, 15000), kind: 'RESTRICAO', restricao: { tipo: 'SERVIDAO' } }).model;
  return { m, t };
}

describe('envelope com servidão no meio (P2.11)', () => {
  it('duas peças (aquém e além da faixa), anel = a maior, área = soma; a APP na divisa continua recortando as duas', () => {
    const { m, t } = lote();
    const terreno = medirTerreno(divisasDoLote(m.boundaries))!;
    const env = envelopeConstrutivo(terreno, m.boundaries, RECUOS);
    expect(env.valido).toBe(true);
    expect(env.pecas).toHaveLength(2);
    const areas = env.pecas!.map((p) => Math.abs(polygonArea(p))).sort((a, b) => a - b);
    // Aquém: y 5000..15000 (10 m); além: y 18000..27000 (9 m); largura 17 m.
    expect(areas).toEqual([17000 * 9000, 17000 * 10000]);
    expect(env.areaMm2).toBe(17000 * 19000);
    expect(Math.abs(polygonArea(env.anel))).toBe(17000 * 10000);
    expect(env.restricoesNaoRecortadas).toBe(1);
    // APP de 5 m nos fundos: a peça de trás encolhe (18000..25000), a da frente não muda.
    const comApp = applyCommand(m, { type: 'AddBoundary', levelId: t, a: point(20000, 30000), b: point(0, 30000), kind: 'RESTRICAO', restricao: { tipo: 'APP', faixaMm: 5000 } }).model;
    const env2 = envelopeConstrutivo(terreno, comApp.boundaries, RECUOS);
    expect(env2.pecas!.map((p) => Math.abs(polygonArea(p))).sort((a, b) => a - b)).toEqual([17000 * 7000, 17000 * 10000]);
  });

  it('cabe? por peça: casa na peça da frente cabe; casa atravessando a servidão não cabe e a área fora é a que sobra da peça que mais a contém', () => {
    const { m, t } = lote();
    const terreno = medirTerreno(divisasDoLote(m.boundaries))!;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 3000 });
    const naFrente = applyBatch(m, [w(4000, 6000, 16000, 6000), w(16000, 6000, 16000, 14000), w(16000, 14000, 4000, 14000), w(4000, 14000, 4000, 6000)]).model;
    const p1 = envelopeVertical(naFrente, terreno, naFrente.boundaries, RECUOS, ZONA)!.prismas[0];
    expect(p1.pecas).toHaveLength(2);
    expect(p1.cabe).toBe(true);
    expect(p1.areaForaMm2).toBe(0);
    // Casa de y 10000 a 20000: atravessa a servidão (15000..18000).
    const atravessa = applyBatch(m, [w(4000, 10000, 16000, 10000), w(16000, 10000, 16000, 20000), w(16000, 20000, 4000, 20000), w(4000, 20000, 4000, 10000)]).model;
    const p2 = envelopeVertical(atravessa, terreno, atravessa.boundaries, RECUOS, ZONA)!.prismas[0];
    expect(p2.cabe).toBe(false);
    // Pela face (P2.8): 12,2 m de largura × o que sai da peça da frente (y 15000..20100 = 5,1 m).
    expect(p2.areaForaMm2).toBe(12200 * 5100);
  });
});
