import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type Command, type Point } from '../utils/blueprintKernel';
import { ambienteNoPonto } from '../utils/blueprintAmbienteNoPonto';

const quadrado = (x0: number, y0: number, lado: number): Point[] => [
  { x: x0, y: y0 },
  { x: x0 + lado, y: y0 },
  { x: x0 + lado, y: y0 + lado },
  { x: x0, y: y0 + lado },
];

describe('ambiente sob o ponto (F2)', () => {
  it('acha o ambiente que contém o ponto; fora de todos devolve null', () => {
    const a = { id: 'a', ring: quadrado(0, 0, 3000), holes: [] };
    const b = { id: 'b', ring: quadrado(3000, 0, 3000), holes: [] };
    expect(ambienteNoPonto([a, b], { x: 1000, y: 1000 })?.id).toBe('a');
    expect(ambienteNoPonto([a, b], { x: 4000, y: 1000 })?.id).toBe('b');
    expect(ambienteNoPonto([a, b], { x: 9000, y: 1000 })).toBeNull();
  });

  it('o furo não pertence ao ambiente de fora — o pátio fechado é o outro ambiente', () => {
    const casa = { id: 'casa', ring: quadrado(0, 0, 9000), holes: [quadrado(3000, 3000, 3000)] };
    const patio = { id: 'patio', ring: quadrado(3000, 3000, 3000), holes: [] };
    // A CASA vem primeiro de propósito: sem descontar o furo, ela ganharia.
    expect(ambienteNoPonto([casa, patio], { x: 4500, y: 4500 })?.id).toBe('patio');
    expect(ambienteNoPonto([casa, patio], { x: 1000, y: 1000 })?.id).toBe('casa');
  });

  it('no modelo real: dois cômodos lado a lado viram dois spaces e cada clique acha o seu', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({
      type: 'AddWall', levelId, a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessMm: 150, heightMm: 2800,
    });
    const model = applyBatch(base, [
      w(0, 0, 6000, 0), w(6000, 0, 6000, 3000), w(6000, 3000, 0, 3000), w(0, 3000, 0, 0),
      w(3000, 0, 3000, 3000),
    ]).model;
    expect(model.spaces).toHaveLength(2);
    const esq = ambienteNoPonto(model.spaces, { x: 1500, y: 1500 });
    const dir = ambienteNoPonto(model.spaces, { x: 4500, y: 1500 });
    expect(esq).not.toBeNull();
    expect(dir).not.toBeNull();
    expect(esq!.id).not.toBe(dir!.id);
  });
});
