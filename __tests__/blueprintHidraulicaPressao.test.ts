/**
 * E1.1 do roadmap hidrossanitário (28/09/2026): material do tubo e perda
 * distribuída pela fórmula universal (Darcy-Weisbach + Swamee-Jain).
 */
import { describe, expect, it } from 'vitest';
import {
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  assertModelInvariants,
  canonicalPayload,
  computeQuantities,
  emptyModel,
  materialDoTrecho,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type Command,
} from '../utils/blueprintKernel';
import { VISCOSIDADE_60C, diametroInternoMm, fatorDeAtrito, perdaDistribuida } from '../utils/blueprintHidraulicaPressao';

function nivel() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const agua = (levelId: string, x: number, material?: 'PVC_SOLDAVEL' | 'PPR' | 'CPVC' | 'COBRE'): Command => ({
  type: 'AddTrecho', levelId, disciplina: 'AGUA_FRIA', a: point(x, 0), b: point(x + 2000, 0), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25, ...(material ? { material } : {}),
});

describe('material no trecho (kernel 0.63.0)', () => {
  it('ida e volta pelo canônico; ausente = padrão da rede e a chave some do payload', () => {
    const { m, t } = nivel();
    const mm = applyBatch(m, [agua(t, 0, 'PPR'), agua(t, 3000)]).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(mm)));
    expect(volta.trechos!.map((x) => x.material ?? null)).toEqual(['PPR', null]);
    expect(volta.trechos!.map((x) => materialDoTrecho(x))).toEqual(['PPR', 'PVC_SOLDAVEL']);
    expect(canonicalPayload(applyBatch(m, [agua(t, 3000)]).model)).not.toContain('material');
  });

  it('SetTrechoProps troca e `null` volta ao padrão; a invariante recusa material no esgoto e valor inventado', () => {
    const { m, t } = nivel();
    const mm = applyCommand(m, agua(t, 0)).model;
    const id = mm.trechos![0].id;
    const cobre = applyCommand(mm, { type: 'SetTrechoProps', trechoId: id, material: 'COBRE' }).model;
    expect(cobre.trechos![0].material).toBe('COBRE');
    expect(applyCommand(cobre, { type: 'SetTrechoProps', trechoId: id, material: null }).model.trechos![0].material).toBeNull();
    const codigo = (x: unknown) => { try { assertModelInvariants(x as never); return null; } catch (e) { return (e as { code?: string }).code; } };
    expect(codigo({ ...mm, trechos: [{ ...mm.trechos![0], disciplina: 'ESGOTO', material: 'PVC_SOLDAVEL' }] })).toBe('BAD_PIPE_MATERIAL');
    expect(codigo({ ...mm, trechos: [{ ...mm.trechos![0], material: 'BAMBU' }] })).toBe('BAD_PIPE_MATERIAL');
  });

  it('o quantitativo separa PVC e PPR do mesmo DN (quant-1.17.0); esgoto sem material', () => {
    const { m, t } = nivel();
    const mm = applyBatch(m, [
      agua(t, 0), agua(t, 3000, 'PPR'),
      { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(0, 1000), b: point(2000, 1000), cotaAMm: -150, cotaBMm: -170, bitolaMm: 50 },
    ]).model;
    const q = computeQuantities(mm, POLITICA_PADRAO);
    expect(q.totais.porBitola.map((b) => [b.disciplina, b.material, b.bitolaMm])).toEqual([
      ['AGUA_FRIA', 'PPR', 25],
      ['AGUA_FRIA', 'PVC_SOLDAVEL', 25],
      ['ESGOTO', null, 50],
    ]);
  });
});

describe('perda distribuída — Darcy-Weisbach + Swamee-Jain', () => {
  it('bate com Fair-Whipple-Hsiao (a fórmula clássica do PVC) na faixa residencial, a menos de 15 %', () => {
    // FWH para tubo plástico: J = 0,000859 · Q^1,75 · D^-4,75 (Q m³/s, D m).
    const fwh = (qLs: number, dMm: number) => 0.000859 * (qLs / 1000) ** 1.75 * (dMm / 1000) ** -4.75;
    for (const [q, dn] of [[0.2, 20], [0.3, 25], [0.6, 32], [1.2, 40]] as const) {
      const p = perdaDistribuida(q, 'PVC_SOLDAVEL', dn, 1);
      const ref = fwh(q, diametroInternoMm('PVC_SOLDAVEL', dn));
      expect(Math.abs(p.perdaUnitariaMpm - ref) / ref, `Q ${q} DN ${dn}`).toBeLessThan(0.15);
    }
  });

  it('valores conferidos à mão: PVC DN 25, 0,3 L/s → V 0,82 m/s, J ≈ 0,044 m/m; 10 m → 0,44 mca', () => {
    const p = perdaDistribuida(0.3, 'PVC_SOLDAVEL', 25, 10);
    expect(p.velocidadeMs).toBeCloseTo(0.819, 2);
    expect(p.perdaUnitariaMpm).toBeCloseTo(0.0439, 3);
    expect(p.perdaMca).toBeCloseTo(0.439, 2);
  });

  it('laminar: f = 64/Re; vazão zero não perde nada; a água QUENTE (menos viscosa) perde menos', () => {
    expect(fatorDeAtrito(1000, 0.01, 20)).toBeCloseTo(0.064, 6);
    expect(perdaDistribuida(0, 'PVC_SOLDAVEL', 25, 10).perdaMca).toBe(0);
    const fria = perdaDistribuida(0.3, 'CPVC', 22, 10).perdaMca;
    const quente = perdaDistribuida(0.3, 'CPVC', 22, 10, VISCOSIDADE_60C).perdaMca;
    expect(quente).toBeLessThan(fria);
  });

  it('DN fora da tabela usa a razão interno/nominal do DN mais próximo, nunca o nominal cru', () => {
    expect(diametroInternoMm('PVC_SOLDAVEL', 25)).toBe(21.6);
    const d = diametroInternoMm('PVC_SOLDAVEL', 26);
    expect(d).toBeLessThan(26);
    expect(d).toBeCloseTo((26 * 21.6) / 25, 6);
  });
});
