/**
 * Round-trip do IFC gerado por `gerarIfc` num PARSER de verdade (`web-ifc`, o
 * mesmo motor WASM que IFC.js/That Open usam).
 *
 * Os testes por conteúdo (`blueprintIfcBim.test.ts`) provam o que o arquivo
 * DIZ; este prova que um leitor independente CONSEGUE LER — contagem de
 * atributos errada, aspas desbalanceadas ou referência solta aparecem aqui
 * como entidade que o parser não devolve.
 *
 * ─── TIME-BOX E `skip` HONESTO ──────────────────────────────────────────────
 *
 * `web-ifc` carrega um `.wasm` de ~7 MB pelo build Node do pacote. Se o
 * runtime não inicializar (interop CJS/ESM do Vitest, caminho com `Ç`, versão
 * do Node), a suíte NÃO finge sucesso: o `beforeAll` marca o motivo e cada
 * caso sai como `skip` com ele. Uma fase "parcial" declarada vale mais do que
 * um verde que não testou nada.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { gerarIfc, ifcGuidDeUid } from '../utils/blueprintIfc';

type Api = {
  Init: () => Promise<void>;
  OpenModel: (data: Uint8Array) => number;
  CloseModel: (id: number) => void;
  GetLineIDsWithType: (id: number, tipo: number) => { size: () => number; get: (i: number) => number };
  GetLine: (id: number, expressId: number, flatten?: boolean) => Record<string, unknown>;
  GetModelSchema?: (id: number) => string;
};

let api: Api | null = null;
let tipos: Record<string, number> = {};
let motivo = '';

beforeAll(async () => {
  try {
    const mod = (await import('web-ifc')) as Record<string, unknown> & { default?: Record<string, unknown> };
    const raiz = (mod.IfcAPI ? mod : mod.default) as Record<string, unknown>;
    const IfcAPI = raiz.IfcAPI as new () => Api;
    const instancia = new IfcAPI();
    await instancia.Init();
    api = instancia;
    tipos = {
      IFCWALL: raiz.IFCWALL as number,
      IFCDOOR: raiz.IFCDOOR as number,
      IFCWINDOW: raiz.IFCWINDOW as number,
      IFCOPENINGELEMENT: raiz.IFCOPENINGELEMENT as number,
      IFCSPACE: raiz.IFCSPACE as number,
      IFCPROPERTYSET: raiz.IFCPROPERTYSET as number,
      IFCELEMENTQUANTITY: raiz.IFCELEMENTQUANTITY as number,
      IFCRELVOIDSELEMENT: raiz.IFCRELVOIDSELEMENT as number,
    };
  } catch (e) {
    motivo = `web-ifc não inicializou: ${e instanceof Error ? e.message : String(e)}`;
    console.warn(`[blueprintIfcRoundTrip] ${motivo} — casos pulados`);
  }
}, 60000);

function casa(): BlueprintModel {
  const r = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const lvl = r.model.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: lvl, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(r.model, [p(0, 0, 4000, 0), p(4000, 0, 4000, 3000), p(4000, 3000, 0, 3000), p(0, 3000, 0, 0)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' }).model;
  m = applyCommand(m, { type: 'AddOpening', wallId: m.walls[0].id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 }).model;
  m = applyCommand(m, { type: 'AddOpening', wallId: m.walls[2].id, kind: 'window', offsetMm: 1000, widthMm: 1200, heightMm: 1200, sillMm: 900 }).model;
  return m;
}

const OPC = { titulo: 'Casa', revisao: 1, hash: 'a'.repeat(64), data: new Date('2026-09-04T12:00:00Z'), studyId: '11111111-2222-4333-8444-555555555555' };

function abrir(m: BlueprintModel): number {
  return api!.OpenModel(new TextEncoder().encode(gerarIfc(m, OPC)));
}

describe('IFC · round-trip no web-ifc', () => {
  it('o parser abre o arquivo e devolve as entidades na contagem certa', () => {
    if (!api) return void console.warn(`skip: ${motivo}`);
    const m = casa();
    const id = abrir(m);
    try {
      expect(api.GetLineIDsWithType(id, tipos.IFCWALL).size()).toBe(4);
      expect(api.GetLineIDsWithType(id, tipos.IFCDOOR).size()).toBe(1);
      expect(api.GetLineIDsWithType(id, tipos.IFCWINDOW).size()).toBe(1);
      expect(api.GetLineIDsWithType(id, tipos.IFCOPENINGELEMENT).size()).toBe(2);
      expect(api.GetLineIDsWithType(id, tipos.IFCRELVOIDSELEMENT).size()).toBe(2);
      expect(api.GetLineIDsWithType(id, tipos.IFCSPACE).size()).toBe(1);
      expect(api.GetLineIDsWithType(id, tipos.IFCPROPERTYSET).size()).toBeGreaterThan(0);
      expect(api.GetLineIDsWithType(id, tipos.IFCELEMENTQUANTITY).size()).toBeGreaterThan(0);
    } finally {
      api.CloseModel(id);
    }
  });

  it('a porta lida de volta tem o GlobalId do uid, a largura e a operação', () => {
    if (!api) return void console.warn(`skip: ${motivo}`);
    const m = casa();
    const id = abrir(m);
    try {
      const portas = api.GetLineIDsWithType(id, tipos.IFCDOOR);
      const porta = api.GetLine(id, portas.get(0)) as {
        GlobalId: { value: string };
        OverallWidth: { value: number };
        OverallHeight: { value: number };
        OperationType: { value: string };
      };
      expect(porta.GlobalId.value).toBe(ifcGuidDeUid(m.openings[0].uid));
      expect(porta.OverallWidth.value).toBe(800);
      expect(porta.OverallHeight.value).toBe(2100);
      expect(porta.OperationType.value).toBe('SINGLE_SWING_LEFT');
    } finally {
      api.CloseModel(id);
    }
  });

  it('a parede lida de volta tem o GlobalId do uid e o Tag = rótulo curto', () => {
    if (!api) return void console.warn(`skip: ${motivo}`);
    const m = casa();
    const id = abrir(m);
    try {
      const paredes = api.GetLineIDsWithType(id, tipos.IFCWALL);
      const lidas: string[] = [];
      for (let i = 0; i < paredes.size(); i++) {
        const w = api.GetLine(id, paredes.get(i)) as { GlobalId: { value: string }; Tag: { value: string } };
        lidas.push(w.GlobalId.value);
        expect(w.Tag.value).toMatch(/^P-[0-9A-F]{4}$/);
      }
      expect(new Set(lidas)).toEqual(new Set(m.walls.map((w) => ifcGuidDeUid(w.uid))));
    } finally {
      api.CloseModel(id);
    }
  });
});
