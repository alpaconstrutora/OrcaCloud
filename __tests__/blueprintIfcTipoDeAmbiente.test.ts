/**
 * O TIPO do ambiente vai ao IFC (13/09/2026) — item 3 da lista de pendências.
 *
 * Classificamos banheiro/cozinha/sala no kernel (fatia 1, 10/09) e o
 * `IfcSpace` saía sem nada disso: quem recebia o modelo não via. Agora:
 *
 *   · `IfcSpace.ObjectType` = a classe (BANHEIRO, COZINHA_SERVICO, …);
 *   · `Pset_SpaceCommon.Reference` = a mesma classe;
 *   · `Pset_OpuraPlanta.SpaceKind` + `SpaceKindLabel` ("Banheiro").
 *
 * ⚠️ Ambiente SEM tipo não recebe nenhum dos três — "a classificar" não vira
 * valor inventado. E o `PredefinedType` continua `.INTERNAL.`.
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
import { gerarIfc } from '../utils/blueprintIfc';

const OPC = { titulo: 'Tipo do ambiente', revisao: 1, hash: 't'.repeat(64), data: new Date('2026-09-13T12:00:00Z') };

function sala(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  return applyBatch(base, [p(0, 0, 4000, 0), p(4000, 0, 4000, 3000), p(4000, 3000, 0, 3000), p(0, 3000, 0, 0)]).model;
}

const linhas = (ifc: string, tipo: string) =>
  ifc.split('\n').filter((l) => l.startsWith('#') && l.slice(l.indexOf('=') + 1).trimStart().startsWith(tipo + '('));

describe('IfcSpace · o tipo do ambiente', () => {
  it('classificado: ObjectType, Pset_SpaceCommon.Reference e Pset_OpuraPlanta.SpaceKind', () => {
    const m = applyCommand(sala(), { type: 'NameSpace', spaceId: sala().spaces[0].id, name: 'Banho', tipoDeAmbiente: 'BANHEIRO' }).model;
    const ifc = gerarIfc(m, OPC);
    const [espaco] = linhas(ifc, 'IFCSPACE');
    expect(espaco).toContain("'Banho',$,'BANHEIRO',");
    expect(espaco).toContain('.ELEMENT.,.INTERNAL.,$)');
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('Reference',$,IFCIDENTIFIER('BANHEIRO'),$)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('SpaceKind',$,IFCLABEL('BANHEIRO'),$)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('SpaceKindLabel',$,IFCLABEL('Banheiro'),$)");
  });

  it('⚠️ sem tipo: ObjectType $ e NENHUMA das propriedades — a classificar não vira valor', () => {
    const m = applyCommand(sala(), { type: 'NameSpace', spaceId: sala().spaces[0].id, name: 'Sala' }).model;
    const ifc = gerarIfc(m, OPC);
    const [espaco] = linhas(ifc, 'IFCSPACE');
    expect(espaco).toContain("'Sala',$,$,");
    expect(ifc).not.toContain("'Reference'");
    expect(ifc).not.toContain("'SpaceKind'");
  });

  it('o atributo continua no lugar certo: o web-ifc lê ObjectType = BANHEIRO', async () => {
    const tipos = (await import('web-ifc')) as unknown as Record<string, number>;
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    usarCaminhoDoWasm('');
    const api = (await obterApi()) as unknown as Record<string, (...a: unknown[]) => unknown>;
    const m = applyCommand(sala(), { type: 'NameSpace', spaceId: sala().spaces[0].id, name: 'Banho', tipoDeAmbiente: 'BANHEIRO' }).model;
    const id = (api.OpenModel as (d: Uint8Array) => number)(new TextEncoder().encode(gerarIfc(m, OPC)));
    const ids = (api.GetLineIDsWithType as (mm: number, t: number) => { size(): number; get(i: number): number })(id, tipos.IFCSPACE);
    expect(ids.size()).toBe(1);
    const linha = (api.GetLine as (mm: number, e: number) => Record<string, { value?: string }>)(id, ids.get(0));
    expect(linha.Name?.value).toBe('Banho');
    expect(linha.ObjectType?.value).toBe('BANHEIRO');
    expect(String(linha.PredefinedType?.value)).toBe('INTERNAL');
  });
});
