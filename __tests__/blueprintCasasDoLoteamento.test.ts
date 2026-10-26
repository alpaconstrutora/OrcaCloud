/**
 * CASAS DO LOTEAMENTO (26/10/2026, etapa 2 de docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md): cada lote
 * vira o modelo de uma planta própria (as divisas do lote, com a FRENTE pela via) e o programa comum, com o que a
 * unidade do lote tiver cadastrado.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel } from '../utils/blueprintKernel';
import { lotesParaCasas, modeloDoLote, programaDoLote } from '../utils/blueprintCasasDoLoteamento';
import { motivoParaNaoGerar } from '../utils/blueprintCasaAutomatica';
import { PROGRAMA_CURTO_PADRAO } from '../utils/blueprintPrograma';

/** Quadra A 60 × 30 m, rua ao sul e rua a oeste; lote 1 de esquina, lote 2 no meio, lote 3 remanescente. */
function loteamento(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const n = m.levels[0].id;
  m = applyBatch(m, [
    { type: 'AddQuadra', levelId: n, nome: 'A', pontos: [{ x: 0, y: 0 }, { x: 60000, y: 0 }, { x: 60000, y: 30000 }, { x: 0, y: 30000 }] },
    { type: 'AddVia', levelId: n, nome: 'Rua 1', eixo: [{ x: -20000, y: -6000 }, { x: 70000, y: -6000 }], larguraMm: 12000, calcadaMm: 2000 },
    { type: 'AddVia', levelId: n, nome: 'Rua 2', eixo: [{ x: -6000, y: -20000 }, { x: -6000, y: 40000 }], larguraMm: 12000, calcadaMm: 2000 },
  ]).model;
  const q = m.quadras![0].id;
  const ret = (x0: number, x1: number) => [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: 30000 }, { x: x0, y: 30000 }];
  return applyBatch(m, [
    { type: 'AddLote', levelId: n, quadraId: q, numero: '1', pontos: ret(0, 12000) },
    { type: 'AddLote', levelId: n, quadraId: q, numero: '2', pontos: ret(12000, 24000) },
    { type: 'AddLote', levelId: n, quadraId: q, numero: '3', pontos: ret(24000, 30000), tipo: 'REMANESCENTE' },
  ]).model;
}

describe('lotesParaCasas', () => {
  it('lista os lotes com o rótulo, a área e a unidade ligada; remanescente fica de fora com o motivo', () => {
    const m = loteamento();
    const uid2 = m.lotes!.find((l) => l.numero === '2')!.uid;
    const lista = lotesParaCasas(m, [{ id: 'u2', name: 'Lote 2', blueprint_lote_uid: uid2, bedrooms: 4 }]);
    expect(lista.map((x) => [x.rotulo, x.areaM2, x.elegivel])).toEqual([
      ['Quadra A · Lote 1', 360, true],
      ['Quadra A · Lote 2', 360, true],
      ['Quadra A · Lote 3', 180, false],
    ]);
    expect(lista[2].motivo).toMatch(/remanescente/i);
    expect(lista[1].unidade?.id).toBe('u2');
    expect(lista[0].unidade).toBeNull();
  });
});

describe('modeloDoLote', () => {
  it('o lote do meio vira um pavimento com as 4 divisas, FRENTE para a rua — e a casa pode gerar', () => {
    const m = loteamento();
    const lote = m.lotes!.find((l) => l.numero === '2')!;
    const r = modeloDoLote(m, lote);
    if ('problema' in r) throw new Error(r.problema);
    const divisas = r.model.boundaries.filter((b) => b.kind === 'TERRENO');
    expect(divisas).toHaveLength(4);
    const frentes = divisas.filter((b) => b.papel === 'FRENTE');
    expect(frentes).toHaveLength(1);
    // A frente é o lado y = 0 (a Rua 1 fica ao sul).
    expect(frentes[0].a.y).toBe(0);
    expect(frentes[0].b.y).toBe(0);
    expect(r.model.levels).toHaveLength(1);
    expect(r.model.levels[0].defaultHeightMm).toBe(3000);
    expect(motivoParaNaoGerar(r.model, r.levelId)).toBeNull();
    // O modelo do lote não leva o loteamento (quadras, outros lotes, vias).
    expect(r.model.lotes ?? []).toHaveLength(0);
    expect(r.model.vias ?? []).toHaveLength(0);
  });

  it('lote de esquina: duas frentes, e a casa ainda pode gerar', () => {
    const m = loteamento();
    const r = modeloDoLote(m, m.lotes!.find((l) => l.numero === '1')!);
    if ('problema' in r) throw new Error(r.problema);
    expect(r.model.boundaries.filter((b) => b.papel === 'FRENTE')).toHaveLength(2);
    expect(motivoParaNaoGerar(r.model, r.levelId)).toBeNull();
  });

  it('as coordenadas são as do loteamento: a georreferência vai junto, igual', () => {
    const m0 = loteamento();
    const m = applyCommand(m0, { type: 'SetGeorreferencia', georreferencia: { latitude: -19.9, longitude: -43.9, rotacaoNorteDeg: 15 } }).model;
    const r = modeloDoLote(m, m.lotes!.find((l) => l.numero === '2')!);
    if ('problema' in r) throw new Error(r.problema);
    expect(r.model.georreferencia).toEqual(m.georreferencia);
  });
});

describe('programaDoLote', () => {
  it('o programa comum, com o que a unidade tiver de dormitórios/suítes/banheiros/vagas; a área da unidade é ignorada', () => {
    const comum = { ...PROGRAMA_CURTO_PADRAO, areaAlvoM2: 120 };
    const r = programaDoLote(comum, { id: 'u', name: 'Lote 2', bedrooms: 4, suites: 2, bathrooms: null, parking_spaces: 3, private_area: 360 });
    expect(r.curto).toEqual({ ...comum, dormitorios: 4, suites: 2, vagas: 3 });
    expect(r.avisos.join(' ')).toMatch(/área da unidade.*ignorada/i);
    expect(programaDoLote(comum, null).curto).toEqual(comum);
  });
});
