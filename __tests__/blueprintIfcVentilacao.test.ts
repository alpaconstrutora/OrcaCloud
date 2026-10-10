/**
 * C14 (10/10/2026): a rede de duto SÓ de exaustão — exaustor e nenhum terminal de
 * insuflamento — sai no IFC em sistema próprio `.VENTILATION.`; a rede com difusor
 * continua `.AIRCONDITIONING.`. Antes toda a mecânica era ar-condicionado.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { gerarIfc, idsDaRedeDeExaustao } from '../utils/blueprintIfc';

const OPC = { titulo: 'Ventilação', revisao: 1, hash: 'v'.repeat(64), data: new Date('2026-10-10T12:00:00Z') };

function casa() {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m0.levels[0].id;
  const duto = (a: [number, number], b: [number, number]): Command =>
    ({ type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(...a), b: point(...b), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 150 }) as Command;
  const ponto = (tipo: string, x: number, y: number): Command =>
    ({ type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm: 2600 }) as Command;
  return applyBatch(m0, [
    // A sala: difusor ligado por duto (ar-condicionado).
    duto([0, 0], [3000, 0]),
    ponto('DIFUSOR', 3000, 0),
    ponto('EVAPORADORA_DUTADA', 0, 0),
    // O banheiro: grelha → duto → exaustor (só exaustão).
    duto([6000, 0], [8000, 0]),
    duto([8000, 0], [8000, 2000]),
    ponto('GRELHA_RETORNO', 6000, 0),
    ponto('EXAUSTOR_AR', 8000, 2000),
  ]).model;
}

describe('C14 · o sistema IFC da rede só de exaustão', () => {
  it('acha a rede SÓ de exaustão (trechos e terminais) e deixa de fora a que insufla', () => {
    const m = casa();
    const ids = idsDaRedeDeExaustao(m);
    const exaustao = [...m.trechos!.slice(1), ...m.terminais!.slice(2)].map((x) => x.id);
    const condicionado = [m.trechos![0], ...m.terminais!.slice(0, 2)].map((x) => x.id);
    expect([...ids].sort()).toEqual([...exaustao].sort());
    for (const id of condicionado) expect(ids.has(id)).toBe(false);
  });

  it('o IFC emite os dois sistemas: .AIRCONDITIONING. e .VENTILATION. (com nome legível)', () => {
    const ifc = gerarIfc(casa(), OPC);
    expect(ifc).toMatch(/IFCDISTRIBUTIONSYSTEM\([^)]*'MECANICA',\$,\$,\$,\.AIRCONDITIONING\.\)/);
    expect(ifc).toMatch(/IFCDISTRIBUTIONSYSTEM\([^)]*'MECANICA \(exaust\\X2\\00E3\\X0\\o\)',\$,\$,\$,\.VENTILATION\.\)/);
  });

  it('com o difusor ligado na MESMA rede do exaustor, ela é ar-condicionado (não vira ventilação)', () => {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m0.levels[0].id;
    const m = applyBatch(m0, [
      { type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(0, 0), b: point(3000, 0), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 150 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'DIFUSOR', tipoHidraulico: 'DIFUSOR', at: point(0, 0), cotaMm: 2600 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'EXAUSTOR_AR', tipoHidraulico: 'EXAUSTOR_AR', at: point(3000, 0), cotaMm: 2600 } as Command,
    ]).model;
    expect(idsDaRedeDeExaustao(m).size).toBe(0);
    // A frase de cobertura do cabeçalho cita .VENTILATION.; o que não pode existir é o SISTEMA.
    expect(gerarIfc(m, OPC)).not.toMatch(/IFCDISTRIBUTIONSYSTEM\([^)]*\.VENTILATION\.\)/);
  });
});

describe('C15 · o isolamento do tubo como IfcCovering', () => {
  it('cada trecho isolado ganha um IfcCovering .WRAPPING. que o cobre — lido pelo web-ifc', async () => {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m0.levels[0].id;
    const m = applyBatch(m0, [
      { type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(0, 0), b: point(3000, 0), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, bitolaSuccaoMm: 10, isolamentoMm: 9 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'DRENO_AC', a: point(0, 500), b: point(3000, 500), cotaAMm: 2400, cotaBMm: 2300, bitolaMm: 25 } as Command,
    ]).model;
    const texto = gerarIfc(m, OPC);
    expect((texto.match(/= ?IFCCOVERING\(/g) ?? []).length).toBe(1);
    expect(texto).toMatch(/IFCCOVERING\([^)]*'Isolamento 9 mm'[^)]*\.WRAPPING\.\)/);

    const tipos = (await import('web-ifc')) as unknown as Record<string, number>;
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    usarCaminhoDoWasm('');
    const api = (await obterApi()) as unknown as Record<string, (...a: unknown[]) => unknown>;
    const id = (api.OpenModel as (d: Uint8Array) => number)(new TextEncoder().encode(texto));
    const lista = (tipo: number) => {
      const v = (api.GetLineIDsWithType as (mm: number, t: number) => { size(): number; get(i: number): number })(id, tipo);
      return Array.from({ length: v.size() }, (_, i) => v.get(i));
    };
    const coberturas = lista(tipos.IFCCOVERING);
    expect(coberturas).toHaveLength(1);
    const rels = lista(tipos.IFCRELCOVERSBLDGELEMENTS).map((r) => (api.GetLine as (mm: number, e: number) => Record<string, unknown>)(id, r));
    expect(rels).toHaveLength(1);
    const coberto = (rels[0].RelatingBuildingElement as { value: number }).value;
    const tubo = (api.GetLine as (mm: number, e: number) => { type: number })(id, coberto);
    expect(tubo.type).toBe(tipos.IFCPIPESEGMENT);
    (api.CloseModel as (mm: number) => void)(id);
  });
});

