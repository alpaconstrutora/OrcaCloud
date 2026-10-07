/**
 * CLIMATIZAÇÃO E7.1 (05/10/2026, kernel 0.93.0): o DUTO RETANGULAR
 * (`Trecho.alturaDutoMm`, a largura é a bitola), a VAZÃO do terminal de ar
 * (`Terminal.vazaoM3h`) e os materiais de duto. Invariantes, canônico, conflito
 * com a estrutura pelo volume retangular (meia altura na vertical, meia largura em
 * planta) e o quantitativo que separa 600×300 de 600×400 e do Ø600.
 */
import { describe, expect, it } from 'vitest';
import {
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  canonicalPayload,
  computeQuantities,
  conflitosDoModelo,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';

function nivel(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const duto = (t: string, extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(-2000, 370), b: point(2000, 370), cotaAMm: 2000, cotaBMm: 2000, bitolaMm: 600, ...extra }) as Command;

describe('climatização E7.1 · duto retangular e vazão no kernel', () => {
  it('a altura só no duto da mecânica, inteira > 0, e não no flexível; o material de duto só na mecânica', () => {
    const { m, t } = nivel();
    expect(applyCommand(m, duto(t, { alturaDutoMm: 300 })).model.trechos![0]).toMatchObject({ bitolaMm: 600, alturaDutoMm: 300 });
    expect(() => applyCommand(m, duto(t, { disciplina: 'AGUA_FRIA', bitolaMm: 25, alturaDutoMm: 300 }))).toThrow(/Duto retangular fora da mecânica/);
    expect(() => applyCommand(m, duto(t, { alturaDutoMm: 0 }))).toThrow(/Altura do duto inválida/);
    expect(() => applyCommand(m, duto(t, { alturaDutoMm: 300, material: 'DUTO_FLEXIVEL' }))).toThrow(/flexível não é retangular/);
    expect(applyCommand(m, duto(t, { material: 'PAINEL_PREISOLADO', alturaDutoMm: 300 })).model.trechos![0].material).toBe('PAINEL_PREISOLADO');
    expect(() => applyCommand(m, duto(t, { disciplina: 'AGUA_FRIA', bitolaMm: 25, material: 'CHAPA_GALVANIZADA' }))).toThrow();
  });

  it('SetTrechoProps troca para retangular e volta a redondo; o canônico leva e traz e omite no redondo', () => {
    const { m, t } = nivel();
    const um = applyCommand(m, duto(t)).model;
    const p0 = JSON.parse(canonicalPayload(um)) as { trechos: Record<string, unknown>[] };
    expect('alturaDutoMm' in p0.trechos[0]).toBe(false);
    const ret = applyCommand(um, { type: 'SetTrechoProps', trechoId: um.trechos![0].id, alturaDutoMm: 299.6 }).model;
    expect(ret.trechos![0].alturaDutoMm).toBe(300);
    expect(modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(ret))).trechos![0].alturaDutoMm).toBe(300);
    const redondo = applyCommand(ret, { type: 'SetTrechoProps', trechoId: um.trechos![0].id, alturaDutoMm: null }).model;
    expect(redondo.trechos![0].alturaDutoMm ?? null).toBeNull();
  });

  it('a vazão só nos tipos de ar; trocar o tipo para um sem vazão a limpa; o canônico leva e traz', () => {
    const { m, t } = nivel();
    const dif = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', tipoHidraulico: 'DIFUSOR', at: point(0, 0), cotaMm: 2600, vazaoM3h: 300.4 } as Command).model;
    expect(dif.terminais![0].vazaoM3h).toBe(300);
    expect(modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(dif))).terminais![0].vazaoM3h).toBe(300);
    expect(() => applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Lav', tipoHidraulico: 'LAVATORIO', at: point(0, 0), cotaMm: 600, vazaoM3h: 100 } as Command)).toThrow(/não tem vazão de ar/);
    const virou = applyCommand(dif, { type: 'SetTerminalProps', terminalId: dif.terminais![0].id, tipoHidraulico: 'DAMPER' }).model;
    expect(virou.terminais![0].vazaoM3h ?? null).toBeNull();
    // A evaporadora dutada também é da rede de ar (E7).
    expect(() => applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_DUTADA', at: point(0, 0), cotaMm: 2600, vazaoM3h: 1200 } as Command)).not.toThrow();
  });
});

describe('climatização E7.1 · o volume retangular no conflito e no quantitativo', () => {
  it('pilar a 27 cm do eixo, de lado: o 600×300 pega (meia largura 30 cm); o redondo de mesmo diâmetro equivalente (Ø457) não', () => {
    const { m, t } = nivel();
    const comPilar = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(0, 0)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, baseMm: 0 } as Command).model;
    const ret = applyCommand(comPilar, duto(t, { alturaDutoMm: 300 })).model;
    const red = applyCommand(comPilar, duto(t, { bitolaMm: 457 })).model;
    expect(conflitosDoModelo(ret).filter((c) => c.classe === 'ESTRUTURA')).toHaveLength(1);
    expect(conflitosDoModelo(red).filter((c) => c.classe === 'ESTRUTURA')).toEqual([]);
  });

  it('viga com o fundo a 20 cm acima do eixo: o 600×300 passa por baixo (meia altura 15 cm); o Ø457 bate (falso conflito do cilindro)', () => {
    const { m, t } = nivel();
    const comViga = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(0, -2000), point(0, 2000)], larguraMm: 150, profundidadeMm: 400, alturaMm: 400, baseMm: 2400 } as Command).model;
    const ret = applyCommand(comViga, duto(t, { alturaDutoMm: 300, cotaAMm: 2200, cotaBMm: 2200 })).model;
    const red = applyCommand(comViga, duto(t, { bitolaMm: 457, cotaAMm: 2200, cotaBMm: 2200 })).model;
    expect(conflitosDoModelo(ret).filter((c) => c.classe === 'ESTRUTURA')).toEqual([]);
    expect(conflitosDoModelo(red).filter((c) => c.classe === 'ESTRUTURA')).toHaveLength(1);
  });

  it('o quantitativo separa 600×300, 600×400 e Ø600; o redondo não ganha a chave (saída dos desenhos antigos igual)', () => {
    const { m, t } = nivel();
    const tres = applyBatch(m, [
      duto(t, { alturaDutoMm: 300 }),
      duto(t, { alturaDutoMm: 400, a: point(-2000, 2000), b: point(2000, 2000) }),
      duto(t, { a: point(-2000, 4000), b: point(2000, 4000) }),
    ]).model;
    const porBitola = computeQuantities(tres, POLITICA_PADRAO).totais.porBitola!.filter((b) => b.disciplina === 'MECANICA');
    expect(porBitola).toHaveLength(3);
    expect(porBitola.map((b) => b.alturaDutoMm ?? null).sort()).toEqual([300, 400, null]);
    const redondo = porBitola.find((b) => b.alturaDutoMm == null)!;
    expect('alturaDutoMm' in redondo).toBe(false);
  });
});
