/**
 * Estudo de Massa — as VAGAS REAIS da garagem (pendências de 03/10/2026): o bloco de garagem vira pavimentos com o
 * contorno e as vagas confirmadas do lançador da E2.5; o número lançado é o que a M2 conta; girado dá o mesmo;
 * todas dentro do contorno; não lança duas vezes; bloco que não é de garagem é recusado com o motivo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, contornoDaVaga, emptyModel, point, pointInPolygon, type BlueprintModel, type Point } from '../utils/blueprintKernel';
import { garagemLancada, lancarGaragem } from '../utils/blueprintGaragemDaMassa';
import { vagasQueCabem } from '../utils/blueprintProduto';

/** Lote com uma garagem 30 × 40 m de 2 subsolos; `girar` roda o contorno em torno da origem. */
function comGaragem(girar = 0, uso: 'GARAGEM' | 'RESIDENCIAL' = 'GARAGEM'): BlueprintModel {
  const a = (girar * Math.PI) / 180;
  const g = (p: Point) => point(Math.round(p.x * Math.cos(a) - p.y * Math.sin(a)), Math.round(p.x * Math.sin(a) + p.y * Math.cos(a)));
  const m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  return applyBatch(m, [
    { type: 'AddBloco', levelId: m.levels[0].id, nome: 'Subsolo', pontos: [g({ x: 0, y: 0 }), g({ x: 30000, y: 0 }), g({ x: 30000, y: 40000 }), g({ x: 0, y: 40000 })], cotaBaseMm: -6000, pavimentos: 2, peDireitoMm: 3000, uso },
  ]).model;
}

/** A vaga cabe no contorno (com 2 mm de folga para o arredondamento do giro). */
function dentro(anel: Point[], v: Parameters<typeof contornoDaVaga>[0]): boolean {
  const cx = anel.reduce((s, p) => s + p.x, 0) / anel.length;
  const cy = anel.reduce((s, p) => s + p.y, 0) / anel.length;
  const folga = anel.map((p) => {
    const d = Math.hypot(p.x - cx, p.y - cy) || 1;
    return { x: p.x + ((p.x - cx) / d) * 2, y: p.y + ((p.y - cy) / d) * 2 };
  });
  return contornoDaVaga(v).every((p) => pointInPolygon(folga, p));
}

describe('lançar a garagem do bloco', () => {
  const m0 = comGaragem();
  const b = m0.blocos![0];
  const r = lancarGaragem(m0, b);

  it('um pavimento por pavimento do bloco (1º subsolo em −3 m, 2º em −6 m), com as 4 paredes do contorno', () => {
    expect(r.pisos.map((p) => [p.nome, p.elevacaoMm])).toEqual([
      ['Subsolo · 2º subsolo', -6000],
      ['Subsolo · 1º subsolo', -3000],
    ]);
    for (const l of garagemLancada(r.model, b)) expect(r.model.walls.filter((w) => w.levelId === l.id)).toHaveLength(4);
  });

  it('as vagas lançadas são as que a M2 conta, confirmadas, com PCD e idoso, e todas dentro do contorno', () => {
    const conta = vagasQueCabem(b.pontos, 'PERPENDICULAR');
    expect(conta).toBeGreaterThan(30);
    expect(r.pisos.every((p) => p.vagas === conta)).toBe(true);
    expect(r.total).toBe(2 * conta);
    const vagas = r.model.vagas ?? [];
    expect(vagas).toHaveLength(2 * conta);
    expect(vagas.every((v) => !v.sugerida)).toBe(true);
    expect(r.pisos[0].porTipo.PCD).toBeGreaterThanOrEqual(1);
    expect(r.pisos[0].porTipo.IDOSO).toBeGreaterThanOrEqual(1);
    for (const v of vagas) expect(dentro(b.pontos, v)).toBe(true);
    expect(vagas.filter((v) => v.numero?.startsWith('S1-')).length).toBe(conta);
  });

  it('a lista de uma vez dá o mesmo modelo; lançar de novo é recusado; bloco que não é de garagem também', () => {
    const deUmaVez = applyBatch(m0, r.comandos).model;
    expect([deUmaVez.levels.length, deUmaVez.walls.length, (deUmaVez.vagas ?? []).length]).toEqual([r.model.levels.length, r.model.walls.length, (r.model.vagas ?? []).length]);
    expect(() => lancarGaragem(r.model, r.model.blocos![0])).toThrow(/já estão lançadas/);
    const res = comGaragem(0, 'RESIDENCIAL');
    expect(() => lancarGaragem(res, res.blocos![0])).toThrow(/não é de garagem/);
  });

  it('garagem GIRADA 30°: o mesmo número de vagas, todas dentro do contorno girado', () => {
    const g = comGaragem(30);
    const bg = g.blocos![0];
    const rg = lancarGaragem(g, bg);
    expect(rg.pisos.map((p) => p.vagas)).toEqual(r.pisos.map((p) => p.vagas));
    for (const v of rg.model.vagas ?? []) expect(dentro(bg.pontos, v)).toBe(true);
  });
});
