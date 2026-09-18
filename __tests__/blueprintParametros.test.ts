/**
 * Parâmetros personalizados no kernel (18/09/2026, E1.2): `SetParametros`,
 * invariantes, canônico de ida e volta e o hash.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  snapshotHash,
  type BlueprintModel,
} from '../utils/blueprintKernel';

function cena(): { m: BlueprintModel; wallId: string; doorId: string; pilarId: string } {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  let r = applyCommand(nivel.model, { type: 'AddWall', levelId: t, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 });
  const wallId = r.diff.created[0];
  r = applyCommand(r.model, { type: 'AddOpening', wallId, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 });
  const doorId = r.diff.created[0];
  r = applyCommand(r.model, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(3000, 2000)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 });
  return { m: r.model, wallId, doorId, pilarId: r.diff.created[0] };
}

describe('SetParametros', () => {
  it('grava, mescla, apaga com null e some quando esvazia; o texto é aparado', () => {
    const { m, doorId } = cena();
    let x = applyCommand(m, { type: 'SetParametros', familia: 'opening', id: doorId, valores: { fabricante: '  Pormade ', acessivel: true } }).model;
    expect(x.openings[0].parametros).toEqual({ fabricante: 'Pormade', acessivel: true });
    x = applyCommand(x, { type: 'SetParametros', familia: 'opening', id: doorId, valores: { custo_brl: 850.5 } }).model;
    expect(x.openings[0].parametros).toEqual({ fabricante: 'Pormade', acessivel: true, custo_brl: 850.5 });
    x = applyCommand(x, { type: 'SetParametros', familia: 'opening', id: doorId, valores: { fabricante: null, acessivel: null, custo_brl: null } }).model;
    expect(x.openings[0].parametros).toBeUndefined();
    // O modelo anterior não foi tocado (objeto novo, não mutação).
    expect(m.openings[0].parametros).toBeUndefined();
  });

  it('recusa chave fora do formato, texto longo, número não finito e peça inexistente', () => {
    const { m, wallId } = cena();
    const set = (valores: Record<string, unknown>) =>
      applyCommand(m, { type: 'SetParametros', familia: 'wall', id: wallId, valores: valores as Record<string, string | number | boolean | null> });
    expect(() => set({ Fabricante: 'x' })).toThrow(/chave de parâmetro inválida/);
    expect(() => set({ 'cor-da-parede': 'x' })).toThrow(/chave de parâmetro inválida/);
    expect(() => set({ obs: 'a'.repeat(201) })).toThrow(/valor inválido/);
    expect(() => set({ n: Number.NaN })).toThrow(/valor inválido/);
    expect(() => applyCommand(m, { type: 'SetParametros', familia: 'wall', id: 'wal_9999', valores: { a: 1 } })).toThrow(/não encontrada/);
  });

  it('vale para as oito famílias pela chave da família', () => {
    const { m, wallId, doorId, pilarId } = cena();
    const x = applyBatch(m, [
      { type: 'SetParametros', familia: 'wall', id: wallId, valores: { acabamento: 'pintura' } },
      { type: 'SetParametros', familia: 'opening', id: doorId, valores: { codigo: 'P-01' } },
      { type: 'SetParametros', familia: 'structural', id: pilarId, valores: { fck_mpa: 30 } },
    ]).model;
    expect(x.walls[0].parametros).toEqual({ acabamento: 'pintura' });
    expect(x.openings[0].parametros).toEqual({ codigo: 'P-01' });
    expect(x.structures[0].parametros).toEqual({ fck_mpa: 30 });
  });
});

describe('canônico e hash', () => {
  it('parâmetro é conteúdo: muda o hash; sem parâmetro a chave não aparece no payload', () => {
    const { m, pilarId } = cena();
    const antes = snapshotHash(m);
    expect(canonicalPayload(m)).not.toContain('"parametros"');
    const x = applyCommand(m, { type: 'SetParametros', familia: 'structural', id: pilarId, valores: { fck_mpa: 30, rotulo_calculista: 'P1' } }).model;
    expect(snapshotHash(x)).not.toBe(antes);
    const json = canonicalPayload(x);
    expect(json).toContain('"parametros":{"fck_mpa":30,"rotulo_calculista":"P1"}');
    // Ida e volta byte a byte.
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(json));
    expect(volta.structures[0].parametros).toEqual({ fck_mpa: 30, rotulo_calculista: 'P1' });
    expect(canonicalPayload(volta)).toBe(json);
    // A ordem de gravação não muda o hash (chaves ordenadas no payload).
    const y = applyCommand(m, { type: 'SetParametros', familia: 'structural', id: pilarId, valores: { rotulo_calculista: 'P1', fck_mpa: 30 } }).model;
    expect(snapshotHash(y)).toBe(snapshotHash(x));
  });
});

describe('saídas: IFC e planilha', () => {
  it('a peça com parâmetros ganha Pset_OpuraPersonalizado (número, sim/não, texto) e a planilha ganha a aba Parâmetros', async () => {
    const { gerarIfc } = await import('../utils/blueprintIfc');
    const { abasDoQuantitativo, linhasDeParametros } = await import('../utils/blueprintPlanilha');
    const { computeQuantities, POLITICA_PADRAO, KERNEL_VERSION } = await import('../utils/blueprintKernel');
    const { m, pilarId, doorId } = cena();
    const x = applyBatch(m, [
      { type: 'SetParametros', familia: 'structural', id: pilarId, valores: { fck_mpa: 30, protendido: false } },
      { type: 'SetParametros', familia: 'opening', id: doorId, valores: { fabricante: 'Pormade' } },
    ]).model;
    const ifc = gerarIfc(x, { titulo: 'x', revisao: 1, hash: 'h', kernelVersion: KERNEL_VERSION } as never);
    expect(ifc).toContain("IFCPROPERTYSET(");
    expect(ifc).toMatch(/IFCPROPERTYSET\([^\n]*'Pset_OpuraPersonalizado'/);
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('fck_mpa',$,IFCREAL(30.),$)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('protendido',$,IFCBOOLEAN(.F.),$)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('fabricante',$,IFCLABEL('Pormade'),$)");
    // Sem parâmetro, sem Pset.
    // (a cobertura no cabeçalho do arquivo cita o Pset; o que não pode haver é o Pset em si)
    expect(gerarIfc(m, { titulo: 'x', revisao: 1, hash: 'h', kernelVersion: KERNEL_VERSION } as never)).not.toMatch(/IFCPROPERTYSET\([^\n]*'Pset_OpuraPersonalizado'/);

    const linhas = linhasDeParametros(x);
    expect(linhas.map((l) => `${l.familia}|${l.chave}|${l.valor}`)).toEqual(['Porta|fabricante|Pormade', 'Pilar|fck_mpa|30', 'Pilar|protendido|false']);
    const quant = computeQuantities(x, POLITICA_PADRAO, KERNEL_VERSION);
    const abas = abasDoQuantitativo(quant, { titulo: 'x', revisao: 1, hash: 'h', kernelVersion: KERNEL_VERSION }, null, linhas);
    const aba = abas.find((a) => a.nome === 'Parâmetros')!;
    expect(aba.linhas[0]).toEqual(['Peça', 'Família', 'Chave', 'Valor', 'Origem']);
    expect(aba.linhas.some((l) => l[1] === 'Pilar' && l[2] === 'protendido' && l[3] === 'não')).toBe(true);
    expect(abasDoQuantitativo(quant, { titulo: 'x', revisao: 1, hash: 'h', kernelVersion: KERNEL_VERSION }, null, []).some((a) => a.nome === 'Parâmetros')).toBe(false);
  });
});
