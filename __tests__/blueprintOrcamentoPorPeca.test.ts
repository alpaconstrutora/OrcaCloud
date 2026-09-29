/**
 * E8.2 — INSUMO POR PEÇA (29/09/2026): a peça hidrossanitária com código vira
 * linha de orçamento direto (UN para peça, M para tubo e calha), a unidade
 * errada é divergência, e o tubo pluvial e a calha ganham medida no de-para.
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import { MEDIDAS, gerarLancamentosDeInstalacoes, resumoDasMedidas } from '../utils/blueprintBudget';
import type { SinapiItem } from '../types';

const item = (code: string, unit: string): SinapiItem => ({ code, description: code, unit, price: 10, source: 'SINAPI' }) as unknown as SinapiItem;
const CTX = { studyId: 'std', studyName: 'Casa', snapshotId: 'snp', snapshotHash: 'h'.repeat(20), revision: 1 };

/** Duas caixas sifonadas com código, uma sem; um tubo de esgoto DN 100 com código; uma calha e um condutor pluvial. */
const modelo = (): BlueprintModel => {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m0.levels[0].id;
  return applyBatch(m0, [
    { type: 'AddTerminal', levelId: l, disciplina: 'ESGOTO', tipo: 'CS', at: point(0, 0), cotaMm: 0, tipoHidraulico: 'CAIXA_SIFONADA', itemCode: '89707' },
    { type: 'AddTerminal', levelId: l, disciplina: 'ESGOTO', tipo: 'CS', at: point(3000, 0), cotaMm: 0, tipoHidraulico: 'CAIXA_SIFONADA', itemCode: '89707' },
    { type: 'AddTerminal', levelId: l, disciplina: 'ESGOTO', tipo: 'CS', at: point(6000, 0), cotaMm: 0, tipoHidraulico: 'CAIXA_SIFONADA' },
    { type: 'AddTrecho', levelId: l, disciplina: 'ESGOTO', a: point(0, 1000), b: point(4000, 1000), cotaAMm: -200, cotaBMm: -240, bitolaMm: 100, itemCode: '89714' },
    { type: 'AddTrecho', levelId: l, disciplina: 'PLUVIAL', a: point(0, 5000), b: point(10000, 5000), cotaAMm: 2775, cotaBMm: 2725, bitolaMm: 150, rotulo: 'Calha', secaoCalha: 'SEMICIRCULAR', itemCode: 'CALHA150' },
    { type: 'AddTrecho', levelId: l, disciplina: 'PLUVIAL', a: point(10000, 5000), b: point(10000, 5000), cotaAMm: 2725, cotaBMm: -300, bitolaMm: 75 },
  ] as never).model;
};
const quant = (m = modelo()) => computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION);

describe('E8.2 — lançamentos por peça', () => {
  it('peça com código: UN pela contagem; tubo e calha com código: M pelo comprimento; sem código fica para o de-para', () => {
    const r = gerarLancamentosDeInstalacoes(quant(), new Map([['89707', item('89707', 'UN')], ['89714', item('89714', 'M')], ['CALHA150', item('CALHA150', 'M')]]), CTX);
    expect(r.divergencias).toEqual([]);
    expect(r.entries.map((e) => [e.id, e.quantity, e.group])).toEqual([
      ['bp:std:instalacao:peca:ESGOTO:CAIXA_SIFONADA:89707', 2, 'Instalações hidrossanitárias — peças · Esgoto'],
      ['bp:std:instalacao:tubo:ESGOTO:::100:89714', expect.closeTo(Math.hypot(4000, 40) / 1000, 6), 'Instalações hidrossanitárias — tubos · Esgoto'],
      ['bp:std:instalacao:tubo:PLUVIAL::SEMICIRCULAR:150:CALHA150', expect.closeTo(Math.hypot(10000, 50) / 1000, 6), 'Instalações hidrossanitárias — calhas · Águas pluviais'],
    ]);
    expect(r.entries[0].calculationMemory.formula).toBe('contagem das peças com este código');
  });

  it('unidade errada ou código fora do catálogo: divergência, nenhuma linha', () => {
    const r = gerarLancamentosDeInstalacoes(quant(), new Map([['89707', item('89707', 'M')], ['89714', item('89714', 'M')]]), CTX);
    expect(r.entries.map((e) => e.sinapiItem.code)).toEqual(['89714']);
    expect(r.divergencias.map((d) => d.motivo)).toEqual([
      'A peça "Caixa sifonada" produz UN, mas o item 89707 é cotado em "M". Nenhuma linha foi gerada.',
      'Item CALHA150 não encontrado no catálogo (SINAPI nem base própria).',
    ]);
  });
});

describe('E8.2 — as medidas pluviais do de-para', () => {
  it('o catálogo tem o tubo pluvial e a calha; o tubo não leva a calha e a calha tem nome de calha', () => {
    const ids = MEDIDAS.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['COMPRIMENTO_TUBO_PLUVIAL', 'COMPRIMENTO_CALHA']));
    const medidas = resumoDasMedidas(quant());
    const tubo = medidas.find((x) => x.medidaId === 'COMPRIMENTO_TUBO_PLUVIAL')!;
    const calha = medidas.find((x) => x.medidaId === 'COMPRIMENTO_CALHA')!;
    // O condutor vertical de 2,725 → −0,300 (3,025 m); a calha fica na medida dela.
    expect(tubo).toMatchObject({ elementos: 1 });
    expect(tubo.quantidade).toBeCloseTo(3.025, 6);
    expect(calha).toMatchObject({ elementos: 1 });
    expect(calha.quantidade).toBeCloseTo(Math.hypot(10000, 50) / 1000, 6);
  });
});
