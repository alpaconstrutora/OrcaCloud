/**
 * Guarda-corpo e corrimão (19/09/2026, E7.3): comandos e invariantes (kernel
 * 0.44.0), canônico ida e volta, quantitativo 1.12.0 (metros, área, por
 * material), orçamento (de-para em m/m² e linha direta por item), conferência
 * NBR 14718/9050, sugestão automática (borda livre de laje em pavimento
 * elevado, corrimão dos dois lados da escada; idempotente) e IFC (IfcRailing).
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  computeQuantities,
  emptyModel,
  KERNEL_VERSION,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  POLITICA_PADRAO,
  rotuloCurto,
  snapshotHash,
  type Command,
} from '../utils/blueprintKernel';
import { gerarLancamentos, gerarLancamentosDeGuardaCorpos, MEDIDA_POR_ID, type MapeamentoOrcamento } from '../utils/blueprintBudget';
import { gerarIfc } from '../utils/blueprintIfc';
import { conferirGuardaCorpo, resumirGuardaCorpos, sugerirGuardaCorpos } from '../utils/blueprintGuardaCorpo';
import type { SinapiItem } from '../types';

function doisPavimentos() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
  const [t, sup] = m.levels.map((l) => l.id);
  return { m, t, sup };
}

describe('guarda-corpo e corrimão (E7.3)', () => {
  it('comandos: altura padrão por tipo, trocar o tipo puxa a altura padrão nova, mover desloca e confirma, apagar; invariantes recusam < 2 vértices, trecho nulo, material inválido, altura ≤ 0', () => {
    expect(KERNEL_VERSION).toMatch(/^blueprint-kernel-ts-0\.(4[4-9]|[5-9][0-9])\.\d+$/);
    const { m, t } = doisPavimentos();
    let r = applyCommand(m, { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(0, 0), point(3000, 0), point(3000, 2000)], sugerido: true });
    const g = r.model.guardaCorpos[0];
    expect(g).toMatchObject({ tipo: 'GUARDA_CORPO', alturaMm: 1100, material: 'METALICO', itemCode: '', descricao: '', rotulo: null, sugerido: true });
    expect(rotuloCurto(g.uid, 'guardaCorpo')).toMatch(/^B-/);
    r = applyCommand(r.model, { type: 'SetGuardaCorpoProps', guardaCorpoId: g.id, tipo: 'CORRIMAO' });
    expect(r.model.guardaCorpos[0].alturaMm).toBe(920); // era a padrão do guarda-corpo → vira a padrão do corrimão
    r = applyCommand(r.model, { type: 'SetGuardaCorpoProps', guardaCorpoId: g.id, alturaMm: 1000, material: 'VIDRO', itemCode: 'VD', descricao: 'Vidro laminado', rotulo: 'x'.repeat(60) });
    expect(r.model.guardaCorpos[0]).toMatchObject({ alturaMm: 1000, material: 'VIDRO', itemCode: 'VD' });
    expect(r.model.guardaCorpos[0].rotulo).toHaveLength(40);
    r = applyCommand(r.model, { type: 'SetGuardaCorpoProps', guardaCorpoId: g.id, tipo: 'GUARDA_CORPO' });
    expect(r.model.guardaCorpos[0].alturaMm).toBe(1000); // altura editada não é a padrão → fica
    r = applyCommand(r.model, { type: 'MoveGuardaCorpo', guardaCorpoId: g.id, dx: 100, dy: -50 });
    expect(r.model.guardaCorpos[0].pontos).toEqual([point(100, -50), point(3100, -50), point(3100, 1950)]);
    expect(r.model.guardaCorpos[0].sugerido).toBeUndefined();
    r = applyCommand(r.model, { type: 'DeleteGuardaCorpo', guardaCorpoId: g.id });
    expect(r.model.guardaCorpos).toEqual([]);
    expect(() => applyCommand(m, { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(0, 0)] })).toThrow(/2 vértices/);
    expect(() => applyCommand(m, { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(0, 0), point(0, 0)] })).toThrow(/comprimento zero/);
    expect(() => applyCommand(m, { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(0, 0), point(1000, 0)], material: 'OURO' as never })).toThrow(/material desconhecido/);
    expect(() => applyCommand(m, { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(0, 0), point(1000, 0)], alturaMm: 0 })).toThrow(/altura/);
    expect(() => applyCommand(m, { type: 'AddGuardaCorpo', levelId: 'lvl_x', tipo: 'GUARDA_CORPO', pontos: [point(0, 0), point(1000, 0)] })).toThrow();
    // RemoveLevel leva junto.
    const com = applyCommand(m, { type: 'AddGuardaCorpo', levelId: t, tipo: 'CORRIMAO', pontos: [point(0, 0), point(1000, 0)] }).model;
    expect(applyCommand(com, { type: 'RemoveLevel', levelId: t }).model.guardaCorpos).toEqual([]);
  });

  it('canônico: chave só com peça; ida e volta preserva polilinha, altura, material, item e sugerido; hash estável', () => {
    const { m, t } = doisPavimentos();
    expect(JSON.parse(canonicalPayload(m)).guardaCorpos).toBeUndefined();
    expect(JSON.parse(canonicalPayload(m)).identity.guardaCorpos).toEqual([]);
    const com = applyBatch(m, [
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(5000, 0), point(5000, 4000)], material: 'VIDRO', itemCode: 'VD', descricao: 'Vidro', rotulo: 'Varanda' },
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'CORRIMAO', pontos: [point(0, 0), point(3000, 0)], alturaMm: 900, sugerido: true },
    ]).model;
    const payload = JSON.parse(canonicalPayload(com));
    expect(payload.guardaCorpos.map((g: { tipo: string }) => g.tipo)).toEqual(['CORRIMAO', 'GUARDA_CORPO']); // ordenado por x do 1º ponto
    expect(payload.guardaCorpos[1]).toMatchObject({ level: 0, pontos: [{ x: 5000, y: 0 }, { x: 5000, y: 4000 }], alturaMm: 1100, tipo: 'GUARDA_CORPO', material: 'VIDRO', itemCode: 'VD', descricao: 'Vidro', rotulo: 'Varanda' });
    expect(payload.guardaCorpos[0].sugerido).toBe(true);
    expect(payload.guardaCorpos[1].sugerido).toBeUndefined();
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(com)));
    expect(snapshotHash(volta)).toBe(snapshotHash(com));
    expect(volta.guardaCorpos.map((g) => g.uid).sort()).toEqual(com.guardaCorpos.map((g) => g.uid).sort());
  });

  it('quantitativo 1.12.0 + orçamento: metros por tipo, área = comprimento × altura, porGuardaCorpo; de-para M/M2; linha direta por item (M leva metros, M2 leva área, UN é divergência)', () => {
    expect(POLITICA_PADRAO.version).toBe('quant-1.16.0');
    const { m, t } = doisPavimentos();
    const com = applyBatch(m, [
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(0, 0), point(3000, 0), point(3000, 4000)], material: 'VIDRO', itemCode: 'VD', descricao: 'Vidro' },
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(0, 0), point(0, 2000)], material: 'VIDRO', itemCode: 'VD', descricao: 'Vidro' },
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'CORRIMAO', pontos: [point(0, 0), point(2500, 0)], itemCode: 'CR', descricao: 'Corrimão inox', material: 'INOX' },
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'CORRIMAO', pontos: [point(0, 0), point(1000, 0)], itemCode: 'UN', descricao: 'Item por unidade' },
    ]).model;
    const q = computeQuantities(com, POLITICA_PADRAO);
    expect(q.guardaCorpos).toHaveLength(4);
    expect(q.guardaCorpos[0]).toMatchObject({ tipo: 'GUARDA_CORPO', comprimentoM: 7, alturaM: 1.1, trechos: 2 });
    expect(q.guardaCorpos[0].areaM2).toBeCloseTo(7.7, 6);
    expect(q.totais.comprimentoGuardaCorpoM).toBe(9);
    expect(q.totais.comprimentoCorrimaoM).toBe(3.5);
    expect(q.totais.porGuardaCorpo.map((g) => [g.tipo, g.material, g.itemCode, g.comprimentoM, +g.areaM2.toFixed(2), g.pecas])).toEqual([
      ['CORRIMAO', 'INOX', 'CR', 2.5, 2.3, 1],
      ['CORRIMAO', 'METALICO', 'UN', 1, 0.92, 1],
      ['GUARDA_CORPO', 'VIDRO', 'VD', 9, 9.9, 2],
    ]);
    // De-para.
    expect(MEDIDA_POR_ID.get('COMPRIMENTO_GUARDA_CORPO')?.dimensao).toBe('M');
    const item = (code: string, unit: string): SinapiItem => ({ code, description: code, unit, price: 10, source: 'SINAPI' } as unknown as SinapiItem);
    const CTX = { studyId: 'std', studyName: 'T', snapshotId: 'snp', snapshotHash: 'h'.repeat(20), revision: 1 };
    const mapa = (medida: string, unit: string): { mapeamento: MapeamentoOrcamento; item: SinapiItem } => ({
      mapeamento: { id: `m-${medida}`, organization_id: 'org', medida, item_code: 'X', phase: '', budget_group: '', agrupamento: 'TOTAL', filtro: null, active: true, created_at: '', updated_at: '' } as unknown as MapeamentoOrcamento,
      item: item('X', unit),
    });
    expect(gerarLancamentos(q, [mapa('COMPRIMENTO_GUARDA_CORPO', 'M')], CTX).entries.map((e) => +e.quantity.toFixed(2))).toEqual([9]);
    expect(gerarLancamentos(q, [mapa('AREA_GUARDA_CORPO', 'M2')], CTX).entries.map((e) => +e.quantity.toFixed(2))).toEqual([9.9]);
    expect(gerarLancamentos(q, [mapa('COMPRIMENTO_CORRIMAO', 'M')], CTX).entries.map((e) => +e.quantity.toFixed(2))).toEqual([3.5]);
    // Trava de unidade: metros num item por m² é divergência, não linha.
    expect(gerarLancamentos(q, [mapa('COMPRIMENTO_CORRIMAO', 'M2')], CTX).entries).toEqual([]);
    // Linha direta por item.
    const r = gerarLancamentosDeGuardaCorpos(q, new Map([['VD', item('VD', 'M2')], ['CR', item('CR', 'M')], ['UN', item('UN', 'UN')]]), CTX);
    expect(r.entries.map((e) => [e.id, +e.quantity.toFixed(2)])).toEqual([
      ['bp:std:guarda-corpo:CORRIMAO:INOX:CR', 2.5],
      ['bp:std:guarda-corpo:GUARDA_CORPO:VIDRO:VD', 9.9],
    ]);
    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0].motivo).toMatch(/cotado em "UN"/);
  });

  it('conferência: guarda-corpo < 1,10 m é ERRO (NBR 14718); corrimão fora de 0,80–0,92 é AVISO (NBR 9050); vidro sem item avisa; resumo conta', () => {
    const { m, t } = doisPavimentos();
    const com = applyBatch(m, [
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(0, 0), point(2000, 0)], alturaMm: 900 },
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'CORRIMAO', pontos: [point(0, 0), point(2000, 0)], alturaMm: 1000 },
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(0, 0), point(2000, 0)], material: 'VIDRO' },
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'CORRIMAO', pontos: [point(0, 0), point(2000, 0)], sugerido: true },
    ]).model;
    const [baixo, corrimaoAlto, vidro, ok] = com.guardaCorpos;
    expect(conferirGuardaCorpo(baixo)).toMatchObject([{ gravidade: 'ERRO', norma: 'NBR 14718' }]);
    expect(conferirGuardaCorpo(corrimaoAlto)).toMatchObject([{ gravidade: 'AVISO', norma: 'NBR 9050 6.9.4' }]);
    expect(conferirGuardaCorpo(vidro)).toMatchObject([{ gravidade: 'AVISO', norma: 'NBR 7199' }]);
    expect(conferirGuardaCorpo(ok)).toEqual([]);
    expect(resumirGuardaCorpos(com, t)).toEqual({ pecas: 4, guardaCorpoM: 4, corrimaoM: 4, sugeridos: 1, semMaterial: 4, avisos: 2, erros: 1 });
  });

  it('sugestão: borda de laje sem parede no pavimento elevado vira guarda-corpo (a borda com parede não); corrimão dos dois lados da escada; térreo não sugere laje; idempotente após lançar', () => {
    const { m, t, sup } = doisPavimentos();
    // Superior: laje 8 × 6; paredes fecham um ambiente 8 × 4 na metade de cima (y 2000–6000); a faixa y 0–2000 é varanda sem parede na borda sul e nas laterais.
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: sup, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    let model = applyBatch(m, [
      { type: 'AddStructural', levelId: sup, kind: 'LAJE', pontos: [point(0, 0), point(8000, 0), point(8000, 6000), point(0, 6000)], larguraMm: 0, profundidadeMm: 0, alturaMm: 120, rotulo: 'L2' },
      w(0, 2000, 8000, 2000), w(8000, 2000, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 2000),
      // Escada no térreo: eixo reto de 4 m, largura 1,20.
      { type: 'AddEscada', levelId: t, tipo: 'ESCADA', pontos: [point(1000, 1000), point(5000, 1000)], larguraMm: 1200, alvoEspelhoMm: 175 },
      // Laje do térreo (no chão): não deve sugerir.
      { type: 'AddStructural', levelId: t, kind: 'LAJE', pontos: [point(0, 0), point(8000, 0), point(8000, 6000), point(0, 6000)], larguraMm: 0, profundidadeMm: 0, alturaMm: 120 },
    ]).model;
    const rSup = sugerirGuardaCorpos(model, sup);
    // Bordas da laje: sul (y=0) livre; leste x=8000 tem parede só de y 2000–6000 → amostras em y<2000 livres → a aresta inteira não é "toda livre"; idem oeste; norte (y=6000) tem parede.
    expect(rSup.sugestoes.map((s) => [s.origem, s.comando.tipo, s.comprimentoMm])).toEqual([['LAJE', 'GUARDA_CORPO', 8000]]);
    expect(rSup.sugestoes[0].comando.alturaMm).toBe(1100);
    expect(rSup.sugestoes[0].comando.sugerido).toBe(true);
    const rT = sugerirGuardaCorpos(model, t);
    expect(rT.sugestoes.map((s) => [s.origem, s.comando.tipo, s.comprimentoMm])).toEqual([
      ['ESCADA', 'CORRIMAO', 4000],
      ['ESCADA', 'CORRIMAO', 4000],
    ]);
    expect(rT.sugestoes.map((s) => s.comando.pontos[0].y).sort((a, b) => a - b)).toEqual([400, 1600]); // ± 600 mm do eixo
    expect(rT.motivos.join(' ')).toMatch(/pavimento mais baixo/);
    // Um lado só.
    expect(sugerirGuardaCorpos(model, t, { folgaDaParedeMm: 100, bordaMinimaMm: 600, alturaGuardaCorpoMm: 1100, alturaCorrimaoMm: 920, corrimaoNosDoisLados: false }).sugestoes).toHaveLength(1);
    // Lançar e sugerir de novo: nada novo, "já cobertas".
    model = applyBatch(model, [...rSup.sugestoes, ...rT.sugestoes].map((s) => s.comando)).model;
    expect(model.guardaCorpos).toHaveLength(3);
    expect(sugerirGuardaCorpos(model, sup).sugestoes).toEqual([]);
    expect(sugerirGuardaCorpos(model, sup).jaExistentes).toBe(1);
    expect(sugerirGuardaCorpos(model, t).sugestoes).toEqual([]);
  });

  it('IFC: IfcRailing .GUARDRAIL./.HANDRAIL. com um sólido por trecho, Qto_RailingBaseQuantities.Length e Pset_OpuraGuardaCorpo', () => {
    const { m, t } = doisPavimentos();
    const com = applyBatch(m, [
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'GUARDA_CORPO', pontos: [point(0, 0), point(3000, 0), point(3000, 4000)], material: 'VIDRO', rotulo: 'Varanda' },
      { type: 'AddGuardaCorpo', levelId: t, tipo: 'CORRIMAO', pontos: [point(0, 0), point(2500, 0)] },
    ]).model;
    const ifc = gerarIfc(com, { titulo: 'T', revisao: 1, hash: 'h', data: new Date('2026-09-19T12:00:00Z') });
    expect(ifc).toMatch(/IFCRAILING\(.*'Varanda',\$,'VIDRO',.*\.GUARDRAIL\.\);/);
    expect(ifc).toMatch(/IFCRAILING\(.*,'METALICO',.*\.HANDRAIL\.\);/);
    expect(ifc).toMatch(/IFCSHAPEREPRESENTATION\(#\d+,'Body','SweptSolid',\(#\d+,#\d+\)\)/); // dois trechos, dois sólidos
    expect(ifc).toMatch(/IFCQUANTITYLENGTH\('Length',\$,\$,7000\./);
    expect(ifc).toMatch(/'Pset_OpuraGuardaCorpo'/);
    expect(ifc).toMatch(/IFCRECTANGLEPROFILEDEF\(\.AREA\.,\$,#\d+,4000\.,50\.\)/);
  });
});
