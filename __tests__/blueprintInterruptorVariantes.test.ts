/**
 * As VARIANTES do interruptor — simbologia informada pelo usuário (10/09/2026):
 * uma, duas e três seções; paralelo (three way); intermediário (four way).
 *
 * O campo é fechado, omitido quando ausente, só vale em INTERRUPTOR — e cai
 * sozinho quando o ponto deixa de ser interruptor.
 */
import { describe, expect, it } from 'vitest';
import {
  TIPOS_DE_INTERRUPTOR,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import { ROTULO_DO_INTERRUPTOR, secoesDoInterruptor } from '../utils/blueprintRede';

function nivel(): BlueprintModel {
  return applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 })
    .model;
}

const interruptor = (m: BlueprintModel, variante: (typeof TIPOS_DE_INTERRUPTOR)[number] | null, comando = 'a') =>
  applyCommand(m, {
    type: 'AddTerminal',
    levelId: m.levels[0].id,
    disciplina: 'ELETRICA',
    tipo: 'Interruptor',
    at: point(1000, 75),
    cotaMm: 1100,
    tipoEletrico: 'INTERRUPTOR',
    comando,
    interruptor: variante,
  }).model;

describe('interruptor · as cinco variantes', () => {
  it('são as cinco do print, cada uma com rótulo', () => {
    expect([...TIPOS_DE_INTERRUPTOR]).toEqual(['UMA_SECAO', 'DUAS_SECOES', 'TRES_SECOES', 'PARALELO', 'INTERMEDIARIO']);
    for (const v of TIPOS_DE_INTERRUPTOR) expect(ROTULO_DO_INTERRUPTOR[v]).toBeTruthy();
  });

  it('as seções: 1, 2, 3 — e paralelo/intermediário têm UMA', () => {
    expect(secoesDoInterruptor({ interruptor: 'UMA_SECAO' })).toBe(1);
    expect(secoesDoInterruptor({ interruptor: 'DUAS_SECOES' })).toBe(2);
    expect(secoesDoInterruptor({ interruptor: 'TRES_SECOES' })).toBe(3);
    expect(secoesDoInterruptor({ interruptor: 'PARALELO' })).toBe(1);
    expect(secoesDoInterruptor({ interruptor: 'INTERMEDIARIO' })).toBe(1);
    expect(secoesDoInterruptor({})).toBe(1);
  });
});

describe('interruptor · no kernel', () => {
  it('a variante grava e sobrevive à ida e volta; ausente fica AUSENTE', () => {
    const m = interruptor(nivel(), 'TRES_SECOES', 'abc');
    expect(m.terminais[0].interruptor).toBe('TRES_SECOES');
    const payload = JSON.parse(canonicalPayload(m));
    expect(payload.terminais[0].interruptor).toBe('TRES_SECOES');
    expect(modelFromCanonicalPayload(payload).terminais[0].interruptor).toBe('TRES_SECOES');

    const sem = interruptor(nivel(), null);
    expect('interruptor' in JSON.parse(canonicalPayload(sem)).terminais[0]).toBe(false);
  });

  it('⚠️ variante num ponto que NÃO é interruptor é recusada', () => {
    const m = nivel();
    expect(() =>
      applyCommand(m, {
        type: 'AddTerminal',
        levelId: m.levels[0].id,
        disciplina: 'ELETRICA',
        tipo: 'TUG',
        at: point(1000, 75),
        cotaMm: 300,
        tipoEletrico: 'TUG',
        interruptor: 'PARALELO',
      }),
    ).not.toThrow(); // o AddTerminal ignora a variante fora do interruptor…
    const t = interruptor(nivel(), 'PARALELO');
    // …e o SetTerminalProps que troca o tipo leva a variante junto.
    const virouTomada = applyCommand(t, { type: 'SetTerminalProps', terminalId: t.terminais[0].id, tipoEletrico: 'TUG' }).model;
    expect(virouTomada.terminais[0].interruptor ?? null).toBeNull();
  });

  it('trocar a variante pelo painel é SetTerminalProps', () => {
    const t = interruptor(nivel(), 'UMA_SECAO');
    const depois = applyCommand(t, { type: 'SetTerminalProps', terminalId: t.terminais[0].id, interruptor: 'INTERMEDIARIO' }).model;
    expect(depois.terminais[0].interruptor).toBe('INTERMEDIARIO');
  });
});
