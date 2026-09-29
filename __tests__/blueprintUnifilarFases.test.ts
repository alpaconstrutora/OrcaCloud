/**
 * UNIFILAR · FASES (29/09/2026, E0.4 do roadmap elétrico).
 *
 * O unifilar de um quadro trifásico não dizia de qual fase saía cada circuito
 * F-N, e a folha do quadro de cargas na prancha não tinha a coluna. Agora a
 * letra (R/S/T) fica sobre o nó do ramal, o rodapé a explica só quando ela
 * aparece, e a prancha ganha a coluna Fase.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import { DesenhistaDeProva } from '../utils/blueprintExport';
import { desenharUnifilar, montarUnifilar, rodapeDoUnifilar } from '../utils/blueprintUnifilar';

/** QGBT trifásico 220 V com C1 (F-N, fase S) e C2 (F-N, sem fase), uma tomada de 600 VA em cada. */
function predio(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  let m = applyCommand(base, { type: 'AddQuadro', levelId: t, nome: 'QGBT', at: point(0, 0), cotaMm: 1500, ligacao: 'FFF', tensaoV: 220, alimentadorM: 10 }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1 — TUG', tensaoV: 127, ligacao: 'FN', fase: 'S', secaoMm2: 2.5, disjuntorA: 16 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C2 — TUG', tensaoV: 127, ligacao: 'FN', secaoMm2: 2.5, disjuntorA: 16 }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  for (const [x, circuitoId] of [[1000, c1], [2000, c2]] as const) {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(x, 0), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600 }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId }).model;
  }
  return m;
}

describe('unifilar · fases R/S/T (E0.4)', () => {
  it('o ramal leva a fase declarada; sem fase, null; o diagrama sabe que há fases', () => {
    const [dg] = montarUnifilar(predio());
    expect(dg.ramais.map((r) => r.fase)).toEqual(['S', null]);
    expect(dg.comFases).toBe(true);
  });

  it('o traçado escreve a letra da fase sobre o nó do ramal, e só ela', () => {
    const [dg] = montarUnifilar(predio());
    const d = new DesenhistaDeProva();
    desenharUnifilar(d, dg, 0, 0, 1);
    const textos = d.textos();
    expect(textos.filter((x) => x === 'S')).toHaveLength(1);
    expect(textos).not.toContain('R');
    expect(textos).not.toContain('T');
  });

  it('o rodapé explica R / S / T só quando alguma fase aparece', () => {
    const [dg] = montarUnifilar(predio());
    expect(rodapeDoUnifilar([dg]).some((l) => l.startsWith('R / S / T'))).toBe(true);
    expect(rodapeDoUnifilar([{ ...dg, comFases: false }]).some((l) => l.startsWith('R / S / T'))).toBe(false);
  });
});
