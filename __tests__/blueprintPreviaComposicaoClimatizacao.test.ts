/**
 * CLIMATIZAÇÃO E9.2 (07/10/2026): a PRÉVIA do orçamento pelo caminho real do
 * serviço (`preverLancamentos`) com o KIT DO SPLIT — a composição da
 * organização para a evaporadora de 12.000 BTU/h (pela especificação) e a da
 * condensadora (genérica) —, a linha frigorígena com código, e o catálogo que
 * só responde ao que lhe é PEDIDO (molde `blueprintPreviaComposicao.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, point, KERNEL_VERSION, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import type { ComposicaoDePeca } from '../utils/blueprintBudget';

const pedidos: string[][] = [];
const UNIDADE: Record<string, string> = { EVAP12: 'UN', SUPORTE: 'UN', CABO: 'M', CONDENS: 'UN', MAO_FRANCESA: 'UN', COBRE: 'M' };
let modelo: BlueprintModel;
let composicoes: ComposicaoDePeca[] = [];

vi.mock('../services/sinapiService', () => ({
  sinapiService: {
    getItemsByCodes: async (codes: string[]) => {
      pedidos.push(codes);
      return codes.filter((c) => c in UNIDADE).map((c) => ({ code: c, description: c, unit: UNIDADE[c], price: 10, source: 'SINAPI' }));
    },
  },
}));
vi.mock('../services/blueprintService', () => ({
  getSnapshot: async () => ({ id: 'snp', study_id: 'std', organization_id: 'org', payload: JSON.parse(canonicalPayload(modelo)), kernel_version: KERNEL_VERSION, hash: 'h'.repeat(64), revision: 1 }),
  getStudy: async () => ({ id: 'std', name: 'Casa de prova', organization_id: 'org' }),
  recordAudit: async () => undefined,
}));
vi.mock('../services/blueprintComposicaoService', () => ({ listarComposicoes: async () => composicoes }));
vi.mock('../services/blueprintArmaduraService', () => ({ blueprintArmaduraService: { get: async () => null } }));
vi.mock('../services/blueprintMaterialService', () => ({ blueprintMaterialService: { byCodigos: async () => [] } }));
vi.mock('../lib/supabase', () => {
  const vazio = { data: [], error: null };
  const cadeia: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit']) cadeia[m] = () => cadeia;
  cadeia.then = (ok: (v: typeof vazio) => unknown) => Promise.resolve(vazio).then(ok);
  return { supabase: cadeia };
});

import { preverLancamentos } from '../services/blueprintBudgetService';

/** Duas evaporadoras de 12.000 e uma de 9.000 BTU/h (sem código), duas condensadoras, 5 m de linha com código. */
function casa(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const p = (tipo: string, x: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'FRIGORIGENA', tipo, tipoHidraulico: tipo, at: point(x, 0), cotaMm: 2200, ...extra }) as Command;
  return applyBatch(m, [
    p('EVAPORADORA_HI_WALL', 0, { capacidadeBtuH: 12000 }),
    p('EVAPORADORA_HI_WALL', 3000, { capacidadeBtuH: 12000 }),
    p('EVAPORADORA_HI_WALL', 6000, { capacidadeBtuH: 9000 }),
    p('CONDENSADORA_SPLIT', 9000),
    p('CONDENSADORA_SPLIT', 12000),
    { type: 'AddTrecho', levelId: l, disciplina: 'FRIGORIGENA', a: point(0, 2000), b: point(5000, 2000), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, bitolaSuccaoMm: 10, isolamentoMm: 9, itemCode: 'COBRE' } as Command,
  ]).model;
}
const KIT_12K: ComposicaoDePeca = {
  id: 'k12',
  disciplina: 'FRIGORIGENA',
  tipo: 'EVAPORADORA_HI_WALL',
  especificacao: '12.000 BTU/h',
  itens: [
    { codigo: 'EVAP12', quantidade: 1 },
    { codigo: 'SUPORTE', quantidade: 1 },
    { codigo: 'CABO', quantidade: 5 },
  ],
};
const CONDENSADORA: ComposicaoDePeca = { id: 'cd', disciplina: 'FRIGORIGENA', tipo: 'CONDENSADORA_SPLIT', especificacao: null, itens: [{ codigo: 'CONDENS', quantidade: 1 }, { codigo: 'MAO_FRANCESA', quantidade: 2 }] };

beforeEach(() => {
  pedidos.length = 0;
  modelo = casa();
  composicoes = [];
});

describe('climatização E9.2 · a prévia pelo serviço', () => {
  it('⚠️ PRONTO QUANDO: o kit da evaporadora de 12.000 só pega as de 12.000; a condensadora pela genérica; a linha pelo código', async () => {
    composicoes = [KIT_12K, CONDENSADORA];
    const p = await preverLancamentos('snp');
    expect(pedidos.flat()).toEqual(expect.arrayContaining(['EVAP12', 'SUPORTE', 'CABO', 'CONDENS', 'MAO_FRANCESA', 'COBRE']));
    const q = (code: string) => p.entries.filter((e) => e.sinapiItem.code === code).map((e) => e.quantity);
    expect(q('EVAP12')).toEqual([2]);
    expect(q('CABO')).toEqual([10]);
    expect(q('CONDENS')).toEqual([2]);
    expect(q('MAO_FRANCESA')).toEqual([4]);
    expect(q('COBRE')).toEqual([5]);
    const kit = p.entries.filter((e) => e.sinapiItem.code === 'EVAP12')[0];
    expect(kit.group).toBe('Instalações de climatização — composições · Linha frigorígena');
    expect(kit.id).toContain(':instalacao:composicao:FRIGORIGENA:EVAPORADORA_HI_WALL:12.000 BTU/h:EVAP12');
    expect(p.divergencias.filter((d) => d.medida === 'INSTALACAO')).toEqual([]);
  });

  it('sem composição: só a linha com código sai; a evaporadora sem código e sem kit não vira linha', async () => {
    const p = await preverLancamentos('snp');
    expect(p.entries.map((e) => e.sinapiItem.code)).toEqual(['COBRE']);
    expect(p.divergencias.filter((d) => d.medida === 'INSTALACAO')).toEqual([]);
  });
});
