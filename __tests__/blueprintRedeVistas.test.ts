/**
 * A instalação nas vistas de ELEVAÇÃO e de CORTE (09/09/2026).
 *
 * ⚠️ Antes disto, desenhar um cano e abrir o corte mostrava a casa sem ele — e o
 * corte é justamente a vista em que uma instalação precisa aparecer: é onde se
 * vê que o eletroduto passa por cima da viga, ou não passa.
 *
 * ─── O CASO QUE QUEBRA UMA IMPLEMENTAÇÃO INGÊNUA ────────────────────────────
 *
 * A PRUMADA. Reusar a pegada de parede resolve o trecho horizontal, mas a
 * prumada tem as duas pontas no MESMO ponto em planta: a pegada degenera, e a
 * peça mais comum de uma instalação sumiria do corte sem erro nenhum.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { projetarElevacao } from '../utils/blueprintElevation';
import { projetarCorte } from '../utils/blueprintCorte';

const H = 2800;

/** Uma sala de 8 × 5 m no térreo. O corte e a elevação saem daqui. */
function sala(): { model: BlueprintModel; nivel: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: t,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 200,
    heightMm: H,
  });
  return {
    model: applyBatch(base, [
      p(0, 0, 8000, 0),
      p(8000, 0, 8000, 5000),
      p(8000, 5000, 0, 5000),
      p(0, 5000, 0, 0),
    ]).model,
    nivel: t,
  };
}

const comTrecho = (m: BlueprintModel, nivel: string, c: Partial<Command> & Record<string, unknown>) =>
  applyCommand(m, {
    type: 'AddTrecho',
    levelId: nivel,
    disciplina: 'ELETRICA',
    bitolaMm: 100,
    ...c,
  } as Command).model;

/** Um corte horizontal em y = 2500, olhando para o fundo. */
const comCorte = (m: BlueprintModel) =>
  applyCommand(m, {
    type: 'AddCorte',
    a: point(-1000, 2500),
    b: point(9000, 2500),
    olharPara: 'DIREITA',
  }).model;

describe('⚠️ o CORTE: a prumada é o caso difícil', () => {
  it('a PRUMADA aparece, indo de uma cota à outra', () => {
    // As duas pontas no mesmo ponto em planta. Uma pegada de parede aqui
    // degenera, e o trecho sumiria.
    const { model, nivel } = sala();
    let m = comTrecho(model, nivel, {
      a: point(4000, 2500),
      b: point(4000, 2500),
      cotaAMm: 300,
      cotaBMm: 2500,
    });
    m = comCorte(m);

    const proj = projetarCorte(m, { corte: m.sections[0] });
    const rede = proj.cortados.filter((c) => c.familia === 'REDE');
    expect(rede).toHaveLength(1);

    const vs = rede[0].pontos.map((p) => p.v);
    expect(Math.min(...vs)).toBeCloseTo(300, 3);
    expect(Math.max(...vs)).toBeCloseTo(2500, 3);
    // E a largura é a BITOLA — o cano visto de frente.
    const us = rede[0].pontos.map((p) => p.u);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(100, 3);
  });

  it('⚠️ a prumada LONGE do plano não aparece — o alcance é meia bitola', () => {
    const { model, nivel } = sala();
    let m = comTrecho(model, nivel, {
      a: point(4000, 2000),
      b: point(4000, 2000),
      cotaAMm: 300,
      cotaBMm: 2500,
    });
    m = comCorte(m);
    expect(
      projetarCorte(m, { corte: m.sections[0] }).cortados.filter((c) => c.familia === 'REDE'),
    ).toEqual([]);
  });

  it('o trecho horizontal que cruza o plano vira uma face na cota dele', () => {
    const { model, nivel } = sala();
    let m = comTrecho(model, nivel, {
      a: point(4000, 0),
      b: point(4000, 5000),
      cotaAMm: 2400,
      cotaBMm: 2400,
    });
    m = comCorte(m);
    const [face] = projetarCorte(m, { corte: m.sections[0] }).cortados.filter(
      (c) => c.familia === 'REDE',
    );
    expect(face).toBeDefined();
    const vs = face.pontos.map((p) => p.v);
    // Centrada na cota, com meia bitola para cada lado.
    expect(Math.min(...vs)).toBeCloseTo(2350, 3);
    expect(Math.max(...vs)).toBeCloseTo(2450, 3);
  });

  it('⚠️ com CAIMENTO, a cota é INTERPOLADA no ponto do cruzamento', () => {
    // Um esgoto que desce 400 mm ao longo de 5 m, cortado na METADE, está 200
    // mm abaixo da ponta de cima. Usar `cotaAMm` o desenharia 200 mm acima do
    // lugar — plausivelmente, que é o pior.
    const { model, nivel } = sala();
    let m = comTrecho(model, nivel, {
      disciplina: 'ESGOTO',
      a: point(4000, 0),
      b: point(4000, 5000),
      cotaAMm: 0,
      cotaBMm: -400,
    });
    m = comCorte(m);
    const [face] = projetarCorte(m, { corte: m.sections[0] }).cortados.filter(
      (c) => c.familia === 'REDE',
    );
    const centro =
      (Math.min(...face.pontos.map((p) => p.v)) + Math.max(...face.pontos.map((p) => p.v))) / 2;
    expect(centro).toBeCloseTo(-200, 0);
  });

  it('o trecho que o plano ATRAVESSA não aparece duas vezes', () => {
    // Uma vez como face cortada e outra como linha, no mesmo ponto.
    const { model, nivel } = sala();
    let m = comTrecho(model, nivel, {
      a: point(4000, 0),
      b: point(4000, 5000),
      cotaAMm: 2400,
      cotaBMm: 2400,
    });
    m = comCorte(m);
    const proj = projetarCorte(m, { corte: m.sections[0] });
    expect(proj.cortados.filter((c) => c.familia === 'REDE')).toHaveLength(1);
    expect(proj.redes).toEqual([]);
  });
});

describe('a ELEVAÇÃO', () => {
  it('o caimento aparece como INCLINAÇÃO, e a prumada como traço vertical', () => {
    const { model, nivel } = sala();
    let m = comTrecho(model, nivel, {
      disciplina: 'ESGOTO',
      a: point(0, 1000),
      b: point(8000, 1000),
      cotaAMm: 0,
      cotaBMm: -400,
    });
    m = comTrecho(m, nivel, {
      a: point(2000, 1000),
      b: point(2000, 1000),
      cotaAMm: 300,
      cotaBMm: 2500,
    });

    const proj = projetarElevacao(m, { direcao: 'FRENTE' });
    expect(proj.redes).toHaveLength(2);

    const inclinado = proj.redes.find((r) => r.disciplina === 'ESGOTO')!;
    expect(inclinado.a.v).not.toBe(inclinado.b.v);
    expect(inclinado.a.u).not.toBe(inclinado.b.u);

    const prumada = proj.redes.find((r) => r.disciplina === 'ELETRICA')!;
    expect(prumada.a.u).toBeCloseTo(prumada.b.u, 6);
    expect(prumada.b.v - prumada.a.v).toBeCloseTo(2200, 6);
    // ⚠️ E ela NÃO é degenerada: some em `u` e não em `v`. Marcá-la assim a
    // esconderia — e é o traço mais importante de uma instalação.
    expect(prumada.degenerada).toBe(false);
  });

  it('a cota do PAVIMENTO entra no v — senão o andar de cima cai no térreo', () => {
    const { model } = sala();
    const comSuperior = applyCommand(model, {
      type: 'AddLevel',
      name: 'Superior',
      elevationMm: 2800,
      defaultHeightMm: H,
    }).model;
    const superior = comSuperior.levels[1].id;
    const m = comTrecho(comSuperior, superior, {
      a: point(0, 1000),
      b: point(4000, 1000),
      cotaAMm: 500,
      cotaBMm: 500,
    });
    const [r] = projetarElevacao(m, { direcao: 'FRENTE' }).redes;
    expect(r.a.v).toBe(3300);
  });

  it('desenho sem instalação devolve a lista vazia, não indefinida', () => {
    const { model } = sala();
    expect(projetarElevacao(model, { direcao: 'FRENTE' }).redes).toEqual([]);
  });
});
