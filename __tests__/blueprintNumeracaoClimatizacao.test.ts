/**
 * CLIMATIZAÇÃO E3.4 (04/10/2026): a numeração DERIVADA da climatização (EV-1,
 * CD-1, DF-3…) pelo mesmo laço do incêndio — e o laço extraído
 * (`blueprintNumeracaoDerivada.ts`) continua dando ao incêndio o que dava.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { numeracaoDeClimatizacao } from '../utils/blueprintNumeracaoClimatizacao';
import { numeracaoDeIncendio } from '../utils/blueprintNumeracaoIncendio';

function predio(): { m: BlueprintModel; t: string; s: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id, s: m.levels[1].id };
}
const peca = (levelId: string, disciplina: string, tipoHidraulico: string, x: number, y: number, rotulo?: string): Command =>
  ({ type: 'AddTerminal', levelId, disciplina, tipo: tipoHidraulico, at: point(x, y), cotaMm: 2200, tipoHidraulico, ...(rotulo ? { rotulo } : {}) }) as Command;
const porPosicao = (m: BlueprintModel, n: Map<string, { numero: string }>) =>
  Object.fromEntries([...n].map(([id, v]) => { const t = m.terminais!.find((x) => x.id === id)!; return [`${t.at.x}@${m.levels.findIndex((l) => l.id === t.levelId)}`, v.numero]; }));

describe('climatização E3.4 · numeração derivada', () => {
  it('evaporadoras dividem a série EV seja qual for o tipo; condensadoras a CD; de baixo para cima, de cima para baixo, da esquerda para a direita', () => {
    const { m, t, s } = predio();
    const mm = applyBatch(m, [
      peca(s, 'FRIGORIGENA', 'EVAPORADORA_CASSETE', 0, 5000),
      peca(t, 'FRIGORIGENA', 'EVAPORADORA_HI_WALL', 9000, 0),
      peca(t, 'FRIGORIGENA', 'EVAPORADORA_PISO_TETO', 1000, 5000),
      peca(t, 'FRIGORIGENA', 'EVAPORADORA_HI_WALL', 0, 0),
      peca(t, 'FRIGORIGENA', 'CONDENSADORA_SPLIT', 12000, 0),
      peca(t, 'MECANICA', 'DIFUSOR', 500, 500),
    ]).model;
    const n = porPosicao(mm, numeracaoDeClimatizacao(mm));
    expect(n).toEqual({ '1000@0': 'EV-1', '0@0': 'EV-2', '9000@0': 'EV-3', '0@1': 'EV-4', '12000@0': 'CD-1', '500@0': 'DF-1' });
  });

  it('o rótulo declarado vence e reserva o número; a peça sem tipo não entra', () => {
    const { m, t } = predio();
    const mm = applyBatch(m, [
      peca(t, 'FRIGORIGENA', 'EVAPORADORA_HI_WALL', 0, 0, 'EV-1'),
      peca(t, 'FRIGORIGENA', 'EVAPORADORA_HI_WALL', 5000, 0),
      peca(t, 'FRIGORIGENA', 'EVAPORADORA_HI_WALL', 2000, 0),
      { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', at: point(9000, 0), cotaMm: 2600 } as Command,
    ]).model;
    const n = numeracaoDeClimatizacao(mm);
    const porX = porPosicao(mm, n);
    expect(porX).toEqual({ '0@0': 'EV-1', '2000@0': 'EV-2', '5000@0': 'EV-3' });
    expect([...n.values()].filter((v) => v.origem === 'DECLARADO')).toHaveLength(1);
    expect(n.size).toBe(3);
  });

  it('o incêndio segue numerando igual pelo laço extraído (H-1, H-2 e o declarado)', () => {
    const { m, t } = predio();
    const mm = applyBatch(m, [
      peca(t, 'INCENDIO', 'HIDRANTE_SIMPLES', 0, 0, 'H-2'),
      peca(t, 'INCENDIO', 'HIDRANTE_SIMPLES', 5000, 0),
      peca(t, 'INCENDIO', 'HIDRANTE_DUPLO', 2000, 0),
      peca(t, 'FRIGORIGENA', 'EVAPORADORA_HI_WALL', 2000, 500),
    ]).model;
    expect(porPosicao(mm, numeracaoDeIncendio(mm))).toEqual({ '0@0': 'H-2', '2000@0': 'H-1', '5000@0': 'H-3' });
    expect(numeracaoDeIncendio(mm).size).toBe(3);
  });
});
