/**
 * A conexão trecho ↔ peça se mantém ao MOVER a peça (10/09/2026).
 *
 * *"quando um trecho elétrico estiver conectado a um componente, essa conexão
 * deve ser mantida ao mover esse componente, então deve ser movido junto"*
 *
 * Antes, mover uma tomada deixava o eletroduto apontando para onde ela ESTAVA:
 * a ponta no ar, a 30 cm da peça, e nada na tela dizendo — o clash não acusa
 * cano solto, e o quantitativo conta o mesmo comprimento.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  emptyModel,
  point,
  pontasPresasAsPecas,
  type BlueprintModel,
} from '../utils/blueprintKernel';

/** QDC em (0,0), tomada em (3000,0), eletroduto ligando os dois. */
function cena(): BlueprintModel {
  let m = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(0, 0), cotaMm: 1600 })
    .model;
  m = applyCommand(m, {
    type: 'AddTerminal',
    levelId,
    disciplina: 'ELETRICA',
    tipo: 'TUG',
    at: point(3000, 0),
    cotaMm: 300,
    tipoEletrico: 'TUG',
  }).model;
  return applyCommand(m, {
    type: 'AddTrecho',
    levelId,
    disciplina: 'ELETRICA',
    a: point(0, 0),
    b: point(3000, 0),
    cotaAMm: 1600,
    cotaBMm: 300,
    bitolaMm: 25,
  }).model;
}

const mover = (m: BlueprintModel, alvo: Partial<Record<'terminalIds' | 'quadroIds' | 'trechoIds', string[]>>, dx: number, dy: number) =>
  applyCommand(m, {
    type: 'TranslateEntities',
    wallIds: [],
    boundaryIds: [],
    structuralIds: [],
    delta: point(dx, dy),
    manterJuncoes: false,
    ...alvo,
  }).model;

describe('conexão mantida · quem está preso a quem', () => {
  it('a ponta que está NA peça está presa; a outra não', () => {
    const m = cena();
    const presas = pontasPresasAsPecas(m, [m.terminais[0].id], []);
    expect(presas.get(m.trechos[0].id)).toEqual({ a: false, b: true });
  });

  it('o QUADRO prende a ponta de saída', () => {
    const m = cena();
    expect(pontasPresasAsPecas(m, [], [m.quadros[0].id]).get(m.trechos[0].id)).toEqual({
      a: true,
      b: false,
    });
  });

  it('⚠️ "perto" NÃO é conexão — só o ponto exato', () => {
    // Um trecho que termina a 40 mm da tomada foi desenhado assim. Arrastá-lo
    // junto seria decidir pelo projetista que aquilo era um erro dele.
    const m = cena();
    const solto = applyCommand(m, {
      type: 'AddTrecho',
      levelId: m.levels[0].id,
      disciplina: 'ELETRICA',
      a: point(3040, 0),
      b: point(5000, 0),
      cotaAMm: 300,
      cotaBMm: 300,
      bitolaMm: 25,
    }).model;
    expect(pontasPresasAsPecas(solto, [solto.terminais[0].id], []).has(solto.trechos[1].id)).toBe(
      false,
    );
  });

  it('⚠️ disciplina diferente não se prende — água não segue tomada', () => {
    const m = cena();
    const agua = applyCommand(m, {
      type: 'AddTrecho',
      levelId: m.levels[0].id,
      disciplina: 'AGUA_FRIA',
      a: point(3000, 0),
      b: point(3000, 2000),
      cotaAMm: 0,
      cotaBMm: 0,
      bitolaMm: 25,
    }).model;
    expect(pontasPresasAsPecas(agua, [agua.terminais[0].id], []).has(agua.trechos[1].id)).toBe(
      false,
    );
  });
});

describe('conexão mantida · ao mover', () => {
  it('⚠️ mover a TOMADA leva a ponta do eletroduto junto', () => {
    const m = cena();
    const depois = mover(m, { terminalIds: [m.terminais[0].id] }, 500, 700);
    expect(depois.terminais[0].at).toEqual({ x: 3500, y: 700 });
    expect(depois.trechos[0].b).toEqual({ x: 3500, y: 700 });
    // A outra ponta, presa ao quadro que NÃO andou, fica.
    expect(depois.trechos[0].a).toEqual({ x: 0, y: 0 });
  });

  it('mover o QUADRO leva a ponta de saída', () => {
    const m = cena();
    const depois = mover(m, { quadroIds: [m.quadros[0].id] }, -200, 300);
    expect(depois.trechos[0].a).toEqual({ x: -200, y: 300 });
    expect(depois.trechos[0].b).toEqual({ x: 3000, y: 0 });
  });

  it('⚠️ as COTAS não mudam — arrastar em planta é x e y', () => {
    const m = cena();
    const depois = mover(m, { terminalIds: [m.terminais[0].id] }, 500, 0);
    expect(depois.trechos[0].cotaBMm).toBe(300);
    expect(depois.trechos[0].cotaAMm).toBe(1600);
  });

  it('⚠️ peça E trecho selecionados juntos: o trecho anda UMA vez, não duas', () => {
    // O trecho selecionado já foi rígido. Somar o delta de novo na ponta presa
    // o esticaria pelo dobro — e a tomada e a ponta se separariam justamente
    // no gesto que deveria mantê-las juntas.
    const m = cena();
    const depois = mover(
      m,
      { terminalIds: [m.terminais[0].id], trechoIds: [m.trechos[0].id] },
      500,
      0,
    );
    expect(depois.trechos[0].b).toEqual({ x: 3500, y: 0 });
    expect(depois.trechos[0].a).toEqual({ x: 500, y: 0 });
  });

  it('mover as DUAS peças leva o trecho inteiro', () => {
    const m = cena();
    const depois = mover(
      m,
      { terminalIds: [m.terminais[0].id], quadroIds: [m.quadros[0].id] },
      100,
      100,
    );
    expect(depois.trechos[0].a).toEqual({ x: 100, y: 100 });
    expect(depois.trechos[0].b).toEqual({ x: 3100, y: 100 });
  });
});
