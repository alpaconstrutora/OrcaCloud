/**
 * O platô de terraplenagem no CORTE (fase 2, 10/09/2026).
 *
 * A linha do platô só existe onde o plano de corte atravessa o anel do platô,
 * na cota do platô convertida ao eixo `v` — e entra na caixa, como o perfil.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type Point } from '../utils/blueprintKernel';
import { projetarCorte } from '../utils/blueprintCorte';

function soCorte() {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 });
  const r = applyCommand(base.model, { type: 'AddCorte', a: point(-1000, 2000), b: point(7000, 2000) });
  return { model: r.model, corte: r.model.sections[0] };
}

const PLATO: Point[] = [point(1000, 0), point(5000, 0), point(5000, 4000), point(1000, 4000)];

describe('corte · platô', () => {
  it('a linha do platô cobre só o trecho em que o corte atravessa o anel, na cota certa', () => {
    const { model, corte } = soCorte();
    const proj = projetarCorte(model, {
      corte,
      terreno: { cotaEmM: () => 100, cotaZeroM: 100, plato: { cotaM: 101.5, anel: PLATO } },
    });
    const plato = proj.platoNoCorte!;
    expect(plato).toHaveLength(1);
    const us = plato[0].map((p) => p.u);
    expect(Math.min(...us)).toBeGreaterThanOrEqual(1000);
    expect(Math.max(...us)).toBeLessThanOrEqual(5000);
    for (const p of plato[0]) expect(p.v).toBe(1500);
    expect(proj.bbox.vMax).toBeGreaterThanOrEqual(1500);
  });

  it('sem platô, o campo não existe', () => {
    const { model, corte } = soCorte();
    const proj = projetarCorte(model, { corte, terreno: { cotaEmM: () => 100, cotaZeroM: 100 } });
    expect(proj.platoNoCorte).toBeUndefined();
  });
});
