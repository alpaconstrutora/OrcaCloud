/**
 * O talude no CORTE (fase 3): a linha do projeto continua além da borda do
 * platô, subindo a 1:h até encontrar o terreno.
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

describe('corte · talude', () => {
  it('terreno 3 m acima do platô: a linha sobe da borda a 1:1,5 e para a 4,5 m', () => {
    const { model, corte } = soCorte();
    const proj = projetarCorte(model, {
      corte,
      terreno: {
        cotaEmM: () => 103,
        cotaZeroM: 100,
        plato: { cotaM: 100, anel: PLATO, taludeCorteH: 1.5, taludeAterroH: 1.5 },
      },
    });
    const linha = proj.platoNoCorte!.flat();
    const us = linha.map((p) => p.u);
    // Além da borda (5000) por até 4,5 m; a 5,5 m já encontrou o terreno.
    expect(Math.max(...us)).toBeGreaterThanOrEqual(9000);
    expect(Math.max(...us)).toBeLessThan(10000);
    // Dentro do platô v = 0; a 3 m da borda, v = 3 / 1,5 = 2 m.
    const a3m = linha.find((p) => p.u === 8000)!;
    expect(a3m.v).toBe(2000);
    expect(linha.find((p) => p.u === 3000)!.v).toBe(0);
  });

  it('sem taludes, a linha termina na borda como na fase 2', () => {
    const { model, corte } = soCorte();
    const proj = projetarCorte(model, {
      corte,
      terreno: { cotaEmM: () => 103, cotaZeroM: 100, plato: { cotaM: 100, anel: PLATO } },
    });
    expect(Math.max(...proj.platoNoCorte!.flat().map((p) => p.u))).toBeLessThanOrEqual(5000);
  });
});
