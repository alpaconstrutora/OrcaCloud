/**
 * Fase 6: o muro de arrimo no CORTE — ao sair do platô para trás de um muro,
 * a linha do platô desce (ou sobe) na vertical até o terreno, em vez do talude.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { projetarCorte } from '../utils/blueprintCorte';
import { PARAMETROS_PADRAO } from '../utils/blueprintTopografiaAnalises';

function modeloComLote() {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const levelId = base.model.levels[0].id;
  const cantos = [point(0, 0), point(40000, 0), point(40000, 40000), point(0, 40000)];
  const lados: Command[] = cantos.map((c, i) => ({
    type: 'AddBoundary' as const,
    levelId,
    a: c,
    b: cantos[(i + 1) % 4],
    kind: 'TERRENO' as const,
  }));
  let model = applyBatch(base.model, lados).model;
  // Corte horizontal em y = 20 m, de oeste a leste.
  model = applyCommand(model, { type: 'AddCorte', a: point(-2000, 20000), b: point(42000, 20000) }).model;
  return { model, levelId };
}

const PLATO = [point(10000, 10000), point(30000, 10000), point(30000, 30000), point(10000, 30000)];

describe('muro de arrimo no corte', () => {
  it('com muro a leste, o platô cai na vertical no x = 30 m e não há talude além dele', () => {
    const { model, levelId } = modeloComLote();
    const corte = model.sections[0];
    const terreno = {
      cotaEmM: () => 104,
      cotaZeroM: 100,
      vertices: [point(0, 0), point(40000, 0), point(40000, 40000), point(0, 40000)],
    };
    const semMuro = projetarCorte(model, {
      corte,
      levelIds: [levelId],
      terreno: { ...terreno, plato: { cotaM: 100, anel: PLATO, taludeCorteH: 1.5, taludeAterroH: 1.5, parametros: PARAMETROS_PADRAO } },
    });
    const comMuro = projetarCorte(model, {
      corte,
      levelIds: [levelId],
      terreno: {
        ...terreno,
        plato: {
          cotaM: 100,
          anel: PLATO,
          taludeCorteH: 1.5,
          taludeAterroH: 1.5,
          parametros: { ...PARAMETROS_PADRAO, taludePorAresta: [null, { muro: true }, null, null] },
        },
      },
    });
    const todos = (p: { platoNoCorte?: { u: number; v: number }[][] }) => (p.platoNoCorte ?? []).flat();
    // u cresce com x (corte de oeste a leste). Sem muro há pontos do talude além de x = 30 m.
    expect(todos(semMuro).some((q) => q.u > 31000)).toBe(true);
    // Com muro: nada além de 30 m e um degrau vertical: dois pontos no mesmo u com v 0 e 4000.
    const pontos = todos(comMuro);
    expect(pontos.some((q) => q.u > 30500)).toBe(false);
    const noMuro = pontos.filter((q) => q.u >= 29500 && q.u <= 30500);
    expect(noMuro.some((q) => q.v === 0)).toBe(true);
    expect(noMuro.some((q) => q.v === 4000)).toBe(true);
    // O talude a oeste continua (pontos antes de x = 10 m).
    expect(pontos.some((q) => q.u < 9000)).toBe(true);
  });
});
