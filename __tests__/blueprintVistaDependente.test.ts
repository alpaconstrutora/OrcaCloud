/**
 * VISTA DEPENDENTE (21/09/2026, backlog P2 — P2.17, kernel 0.51.0): recorte
 * nomeado de uma planta com escala própria — comandos, invariantes, canônico
 * ida e volta, RemoveLevel leva junto, e a prancha no conjunto.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, KERNEL_VERSION, modelFromCanonicalPayload, parseCanonicalPayload, point, rotuloCurto, type Command } from '../utils/blueprintKernel';
import { planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO } from '../utils/blueprintPranchas';

function casa() {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 2800 },
  ]).model;
  const [t0, t1] = m.levels.map((l) => l.id);
  const w = (lvl: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: lvl, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 });
  m = applyBatch(m, [w(t0, 0, 0, 20000, 0), w(t0, 20000, 0, 20000, 8000), w(t0, 20000, 8000, 0, 8000), w(t0, 0, 8000, 0, 0), w(t1, 0, 0, 5000, 0)]).model;
  return { m, t0, t1 };
}

describe('vista dependente (P2.17)', () => {
  it('Add/Set/Delete, recorte normalizado, invariantes, RemoveLevel leva as vistas do pavimento', () => {
    const { m, t0, t1 } = casa();
    let r = applyCommand(m, { type: 'AddVistaDependente', levelId: t0, nome: 'Ala esquerda', recorte: { minX: 10500, minY: 8500, maxX: -500, maxY: -500 }, denominador: 50 }).model;
    const v = r.vistasDependentes[0];
    expect(v.recorte).toEqual({ minX: -500, minY: -500, maxX: 10500, maxY: 8500 }); // min/max na ordem certa
    expect(v.denominador).toBe(50);
    expect(rotuloCurto(v.uid, 'vistaDependente')).toMatch(/^D-/);
    r = applyCommand(r, { type: 'AddVistaDependente', levelId: t0, nome: 'Ala direita', recorte: { minX: 9500, minY: -500, maxX: 20500, maxY: 8500 } }).model;
    r = applyCommand(r, { type: 'AddVistaDependente', levelId: t1, nome: 'Superior', recorte: { minX: 0, minY: 0, maxX: 5000, maxY: 2000 }, denominador: 25 }).model;
    expect(r.vistasDependentes).toHaveLength(3);
    r = applyCommand(r, { type: 'SetVistaDependenteProps', vistaId: v.id, nome: 'Ala oeste', denominador: 25 }).model;
    expect(r.vistasDependentes[0]).toMatchObject({ nome: 'Ala oeste', denominador: 25 });
    expect(() => applyCommand(r, { type: 'SetVistaDependenteProps', vistaId: v.id, recorte: { minX: 0, minY: 0, maxX: 0, maxY: 100 } })).toThrow(/BAD_DEPENDENT_VIEW|degenerado/);
    expect(() => applyCommand(r, { type: 'AddVistaDependente', levelId: 'lvl_x', nome: 'x', recorte: { minX: 0, minY: 0, maxX: 1, maxY: 1 } })).toThrow();
    const semNivel = applyCommand(r, { type: 'RemoveLevel', levelId: t1 }).model;
    expect(semNivel.vistasDependentes.map((x) => x.nome)).toEqual(['Ala oeste', 'Ala direita']);
    const del = applyCommand(r, { type: 'DeleteVistaDependente', vistaId: v.id }).model;
    expect(del.vistasDependentes.map((x) => x.nome)).toEqual(['Ala direita', 'Superior']);
  });

  it('canônico: só quando há vista; ida e volta com o pavimento por índice; o conjunto de pranchas ganha uma AMPLIAÇÃO por vista na escala dela', () => {
    const { m, t0 } = casa();
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.54.0');
    expect(parseCanonicalPayload(canonicalPayload(m)).vistasDependentes).toBeUndefined();
    const r = applyBatch(m, [
      { type: 'AddVistaDependente', levelId: t0, nome: 'Ala esquerda', recorte: { minX: -500, minY: -500, maxX: 10500, maxY: 8500 }, denominador: 50 },
      { type: 'AddVistaDependente', levelId: t0, nome: 'Ala direita', recorte: { minX: 9500, minY: -500, maxX: 20500, maxY: 8500 }, denominador: 50 },
    ]).model;
    const payload = parseCanonicalPayload(canonicalPayload(r));
    expect(payload.vistasDependentes).toHaveLength(2);
    expect(payload.vistasDependentes![0]).toEqual({ level: 0, nome: 'Ala esquerda', recorte: { minX: -500, minY: -500, maxX: 10500, maxY: 8500 }, denominador: 50 });
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(canonicalPayload(r));
    expect(volta.vistasDependentes[1].levelId).toBe(volta.levels[0].id);
    // Pranchas: duas ampliações a mais, com o recorte e a escala da vista.
    const antes = planejarConjunto(m, TEMPLATE_DE_PRANCHA_PADRAO);
    const depois = planejarConjunto(r, TEMPLATE_DE_PRANCHA_PADRAO);
    expect(depois.length).toBe(antes.length + 2);
    const daVista = depois.filter((p) => p.vistaDependenteId);
    expect(daVista.map((p) => p.titulo)).toEqual(['Ala esquerda (Térreo)', 'Ala direita (Térreo)']);
    expect(daVista[0]).toMatchObject({ tipo: 'AMPLIACAO', denominador: 50, recorte: { minX: -500, maxX: 10500 } });
    // Sem ampliações no template, a vista não entra (é a mesma chave).
    expect(planejarConjunto(r, { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, ampliacoes: false } }).some((p) => p.vistaDependenteId)).toBe(false);
  });
});
