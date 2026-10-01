/**
 * INCÊNDIO E4.1 (30/09/2026, kernel 0.82.0): a bomba no modelo — a curva Q×H
 * declarada, o NPSH requerido e a jockey ligada à principal (por índice no
 * canônico, limpa quando a principal some); o tipo salvo leva a curva (o
 * cadastro de bombas).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, assertModelInvariants, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, payloadDoHash, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { assinaturaDoTipo, camposDoTerminal, propriedadesDoTerminal } from '../utils/blueprintTipos';

const CURVA = [
  { vazaoLmin: 0, alturaMm: 60000 },
  { vazaoLmin: 600, alturaMm: 52000 },
  { vazaoLmin: 900, alturaMm: 40000 },
];
const bomba = (l: string, tipo: 'BOMBA_INCENDIO' | 'BOMBA_JOCKEY', x: number, extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: 300, tipoHidraulico: tipo, ...extra }) as Command;

function base(): { m: BlueprintModel; l: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, l: m.levels[0].id };
}

describe('E4.1 · a bomba no kernel', () => {
  it('curva e NPSH entram na bomba, saem do payload quando ausentes, e voltam do canônico', () => {
    const { m, l } = base();
    const sem = applyCommand(m, bomba(l, 'BOMBA_INCENDIO', 0)).model;
    const chaves = Object.keys(JSON.parse(payloadDoHash(sem)).terminais[0]);
    expect(chaves).not.toContain('curvaBomba');
    expect(chaves).not.toContain('npshrMm');
    const com = applyCommand(m, bomba(l, 'BOMBA_INCENDIO', 0, { curvaBomba: CURVA, npshrMm: 3500 })).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(com))).terminais![0];
    expect(volta.curvaBomba).toEqual(CURVA);
    expect(volta.npshrMm).toBe(3500);
  });

  it('⚠️ a invariante recusa curva curta, vazão que não cresce, altura que sobe, e curva fora da bomba', () => {
    const { m, l } = base();
    const b = applyCommand(m, bomba(l, 'BOMBA_INCENDIO', 0, { curvaBomba: CURVA })).model;
    const quebra = (curvaBomba: unknown) => {
      const c = structuredClone(b);
      (c.terminais![0] as { curvaBomba: unknown }).curvaBomba = curvaBomba;
      return () => assertModelInvariants(c);
    };
    expect(quebra(CURVA.slice(0, 2))).toThrow(/3 pontos ou mais/);
    expect(quebra([CURVA[0], CURVA[0], CURVA[2]])).toThrow(/vazão crescente/);
    expect(quebra([CURVA[0], { vazaoLmin: 600, alturaMm: 70000 }, CURVA[2]])).toThrow(/altura que não sobe/);
    const h = applyCommand(m, { type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'H', at: point(0, 0), cotaMm: 1300, tipoHidraulico: 'HIDRANTE_SIMPLES' } as Command).model;
    const errado = structuredClone(h);
    errado.terminais![0].curvaBomba = CURVA;
    expect(() => assertModelInvariants(errado)).toThrow(/não é bomba de incêndio/);
  });

  it('a jockey aponta a principal por ÍNDICE no canônico, e volta ligada', () => {
    const { m, l } = base();
    const comPrincipal = applyCommand(m, bomba(l, 'BOMBA_INCENDIO', 0)).model;
    const principal = comPrincipal.terminais![0].id;
    const ambas = applyCommand(comPrincipal, bomba(l, 'BOMBA_JOCKEY', 2000, { bombaPrincipalId: principal })).model;
    const jockeyNoPayload = JSON.parse(payloadDoHash(ambas)).terminais.find((t: { tipoHidraulico?: string }) => t.tipoHidraulico === 'BOMBA_JOCKEY');
    expect(jockeyNoPayload.principal).toBe(0);
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(ambas)));
    const j = volta.terminais!.find((t) => t.tipoHidraulico === 'BOMBA_JOCKEY')!;
    expect(volta.terminais!.find((t) => t.id === j.bombaPrincipalId)!.tipoHidraulico).toBe('BOMBA_INCENDIO');
  });

  it('apagar a principal solta a jockey (sem quebrar a invariante); trocar o tipo leva curva e principal', () => {
    const { m, l } = base();
    let x = applyCommand(m, bomba(l, 'BOMBA_INCENDIO', 0, { curvaBomba: CURVA })).model;
    const p = x.terminais![0].id;
    x = applyCommand(x, bomba(l, 'BOMBA_JOCKEY', 2000, { bombaPrincipalId: p })).model;
    const sem = applyCommand(x, { type: 'DeleteTerminal', terminalId: p } as Command).model;
    expect(sem.terminais![0].bombaPrincipalId ?? null).toBeNull();
    const trocado = applyCommand(x, { type: 'SetTerminalProps', terminalId: p, tipoHidraulico: 'VGA' } as Command).model;
    expect(trocado.terminais!.find((t) => t.id === p)!.curvaBomba ?? null).toBeNull();
    // A jockey perdeu a principal porque ela deixou de ser bomba.
    expect(trocado.terminais!.find((t) => t.tipoHidraulico === 'BOMBA_JOCKEY')!.bombaPrincipalId ?? null).toBeNull();
  });
});

describe('E4.1 · o cadastro de bombas é o tipo salvo', () => {
  it('o tipo leva a curva e o NPSH; o tipo de outro ponto não ganha as chaves', () => {
    const { m, l } = base();
    const x = applyBatch(m, [bomba(l, 'BOMBA_INCENDIO', 0, { curvaBomba: CURVA, npshrMm: 3500 }), bomba(l, 'BOMBA_JOCKEY', 2000)]).model;
    const p = propriedadesDoTerminal(x.terminais![0]);
    expect(p.curvaBomba).toEqual(CURVA);
    expect(camposDoTerminal(p)).toMatchObject({ curvaBomba: CURVA, npshrMm: 3500 });
    expect(assinaturaDoTipo(propriedadesDoTerminal(x.terminais![1]))).not.toMatch(/curvaBomba|npshrMm/);
  });
});
