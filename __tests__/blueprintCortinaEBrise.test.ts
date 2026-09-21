/**
 * CORTINA DE VIDRO E BRISE (21/09/2026, backlog P2 — P2.20, kernel 0.54.0,
 * quant-1.15.0): a parede marcada como cortina vira m² de painel e metros de
 * montante sem alvenaria; o brise dá m² de fachada e nº de lâminas; canônico
 * ida e volta; IFC emite IfcCurtainWall; medidas de orçamento.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, computeQuantities, emptyModel, KERNEL_VERSION, modelFromCanonicalPayload, parseCanonicalPayload, point, POLITICA_PADRAO, type Command } from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';
import { MEDIDAS } from '../utils/blueprintBudget';

function casa() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 });
  m = applyBatch(m, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
  return { m, t };
}

describe('cortina de vidro e brise (P2.20)', () => {
  it('SetWallCortina/SetWallBrise, invariantes, quantitativo (painéis, montantes, lâminas, sem alvenaria) e totais', () => {
    const { m } = casa();
    const frente = m.walls[0];
    let r = applyCommand(m, { type: 'SetWallCortina', wallId: frente.id, cortina: { moduloMm: 1200, montanteMm: 60, painel: 'VIDRO' } }).model;
    r = applyCommand(r, { type: 'SetWallBrise', wallId: r.walls[1].id, brise: { orientacao: 'HORIZONTAL', laminaMm: 150, passoMm: 300, afastamentoMm: 300, lado: 'DIREITA' } }).model;
    expect(() => applyCommand(r, { type: 'SetWallCortina', wallId: frente.id, cortina: { moduloMm: 200, montanteMm: 60, painel: 'VIDRO' } })).toThrow(/BAD_CURTAIN|módulo/);
    expect(() => applyCommand(r, { type: 'SetWallCortina', wallId: frente.id, cortina: { moduloMm: 1200, montanteMm: 1300, painel: 'VIDRO' } })).toThrow(/BAD_CURTAIN|montante/);
    expect(() => applyCommand(r, { type: 'SetWallBrise', wallId: frente.id, brise: { orientacao: 'VERTICAL', laminaMm: 150, passoMm: 100, afastamentoMm: 0, lado: 'DIREITA' } })).toThrow(/BAD_BRISE|passo/);
    const q = computeQuantities(r, POLITICA_PADRAO, KERNEL_VERSION);
    expect(POLITICA_PADRAO.version).toBe('quant-1.16.0');
    const qc = q.paredes.find((p) => p.wallId === frente.id)!;
    expect(qc.volumeM3).toBe(0);
    expect(qc.camadas).toEqual([]);
    expect(qc.cortina).toEqual({ painel: 'VIDRO', areaM2: 18, paineis: 5, montantesM: 30 }); // 6 m / 1,2 = 5 painéis; (5+1)×3 + 2×6 = 30 m
    const qb = q.paredes.find((p) => p.wallId === r.walls[1].id)!;
    expect(qb.brise).toEqual({ orientacao: 'HORIZONTAL', areaM2: 12, laminas: 10, comprimentoLaminasM: 40 }); // 3 m / 0,3 = 10 lâminas de 4 m
    expect(qb.volumeM3).toBeGreaterThan(0); // brise não tira a alvenaria
    expect(q.totais.areaCortinaM2).toBe(18);
    expect(q.totais.comprimentoMontantesM).toBe(30);
    expect(q.totais.porCortina).toEqual([{ painel: 'VIDRO', areaM2: 18, paineis: 5, montantesM: 30, paredes: 1 }]);
    expect(q.totais.areaBriseM2).toBe(12);
    expect(q.totais.laminasDeBrise).toBe(10);
    // A alvenaria total NÃO inclui a cortina.
    const qSem = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION);
    expect(q.totais.volumeAlvenariaM3).toBeCloseTo(qSem.totais.volumeAlvenariaM3 - qSem.paredes[0].volumeM3, 6);
    // Tirar: volta a parede opaca.
    const volta = applyCommand(r, { type: 'SetWallCortina', wallId: frente.id, cortina: null }).model;
    expect(volta.walls[0].cortina).toBeUndefined();
    // Unir paredes com pele diferente é recusado.
    const duas = applyBatch(m, [{ type: 'SplitWall', wallId: frente.id, at: point(3000, 0) }]).model;
    const [p1, p2] = duas.walls.filter((w) => w.a.y === 0 && w.b.y === 0);
    const comPele = applyCommand(duas, { type: 'SetWallCortina', wallId: p1.id, cortina: { moduloMm: 1000, montanteMm: 50, painel: 'ACM' } }).model;
    expect(() => applyCommand(comPele, { type: 'MergeWalls', firstId: p1.id, secondId: p2.id })).toThrow(/MERGE_SKIN_MISMATCH|Cortina/);
    // Medidas de orçamento.
    expect(MEDIDAS.filter((x) => ['AREA_CORTINA', 'COMPRIMENTO_MONTANTE', 'AREA_BRISE'].includes(x.id))).toHaveLength(3);
  });

  it('canônico só nas paredes com pele; ida e volta; IFC emite IfcCurtainWall para a cortina', () => {
    const { m } = casa();
    let r = applyCommand(m, { type: 'SetWallCortina', wallId: m.walls[0].id, cortina: { moduloMm: 1500, montanteMm: 80, painel: 'POLICARBONATO' } }).model;
    r = applyCommand(r, { type: 'SetWallBrise', wallId: m.walls[2].id, brise: { orientacao: 'VERTICAL', laminaMm: 100, passoMm: 250, afastamentoMm: 200, lado: 'ESQUERDA' } }).model;
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.56.0');
    const payload = parseCanonicalPayload(canonicalPayload(r));
    expect(payload.walls.filter((w) => w.cortina)).toHaveLength(1);
    expect(payload.walls.filter((w) => w.brise)).toHaveLength(1);
    expect(payload.walls.filter((w) => !w.cortina && !w.brise && !('cortina' in w) && !('brise' in w))).toHaveLength(2);
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(canonicalPayload(r));
    expect(volta.walls.find((w) => w.cortina)!.cortina).toEqual({ moduloMm: 1500, montanteMm: 80, painel: 'POLICARBONATO' });
    const ifc = gerarIfc(r, { titulo: 'T', revisao: 1, hash: 'h' });
    expect((ifc.match(/IFCCURTAINWALL\(/g) ?? []).length).toBe(1);
    expect((ifc.match(/IFCWALL\(/g) ?? []).length).toBe(3);
    expect(ifc).toMatch(/Cortina de policarbonato/);
  });
});
