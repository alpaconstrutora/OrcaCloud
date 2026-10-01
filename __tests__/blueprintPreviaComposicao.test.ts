/**
 * INCÊNDIO E9.2 (01/10/2026): a PRÉVIA do orçamento pelo caminho real do
 * serviço (`preverLancamentos`), com o banco simulado — o snapshot publicado,
 * as composições da organização e o catálogo que só responde ao que lhe é
 * PEDIDO.
 *
 * ⚠️ É o teste que faltava: os do gerador passam o mapa de itens pronto, e por
 * isso nunca viram que a prévia não pedia ao catálogo os códigos de peça, tubo
 * e esquadria — toda peça com código caía em "não encontrado no catálogo".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, point, KERNEL_VERSION, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import type { ComposicaoDePeca } from '../utils/blueprintBudget';

const pedidos: string[][] = [];
const ITENS = new Set(['HIDCOD', 'ABRIGO', 'VALV', 'MANG', 'ESG', 'ADAPT', 'CHAVE', 'PLACA']);
let modelo: BlueprintModel;
let composicoes: ComposicaoDePeca[] = [];

vi.mock('../services/sinapiService', () => ({
  sinapiService: {
    getItemsByCodes: async (codes: string[]) => {
      pedidos.push(codes);
      return codes.filter((c) => ITENS.has(c)).map((c) => ({ code: c, description: c, unit: 'UN', price: 10, source: 'SINAPI' }));
    },
  },
}));
vi.mock('../services/blueprintService', () => ({
  getSnapshot: async () => ({ id: 'snp', study_id: 'std', organization_id: 'org', payload: JSON.parse(canonicalPayload(modelo)), kernel_version: KERNEL_VERSION, hash: 'h'.repeat(64), revision: 1 }),
  getStudy: async () => ({ id: 'std', name: 'Prédio de prova', organization_id: 'org' }),
  recordAudit: async () => undefined,
}));
vi.mock('../services/blueprintComposicaoService', () => ({ listarComposicoes: async () => composicoes }));
vi.mock('../services/blueprintArmaduraService', () => ({ blueprintArmaduraService: { get: async () => null } }));
vi.mock('../services/blueprintMaterialService', () => ({ blueprintMaterialService: { byCodigos: async () => [] } }));
// O supabase: toda consulta (de-para, base própria) volta vazia.
vi.mock('../lib/supabase', () => {
  const vazio = { data: [], error: null };
  const cadeia: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit']) cadeia[m] = () => cadeia;
  cadeia.then = (ok: (v: typeof vazio) => unknown) => Promise.resolve(vazio).then(ok);
  return { supabase: cadeia };
});

import { preverLancamentos } from '../services/blueprintBudgetService';

/** 2 hidrantes sem código e 1 com código. */
function predio(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const p = (x: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'HIDRANTE_SIMPLES', tipoHidraulico: 'HIDRANTE_SIMPLES', at: point(x, 0), cotaMm: 1300, ...extra }) as Command;
  return applyBatch(m, [p(0), p(5000), p(10000, { itemCode: 'HIDCOD' })]).model;
}
const HIDRANTE: ComposicaoDePeca = {
  id: 'c1',
  disciplina: 'INCENDIO',
  tipo: 'HIDRANTE_SIMPLES',
  especificacao: null,
  itens: ['ABRIGO', 'VALV', 'MANG', 'ESG', 'ADAPT', 'CHAVE', 'PLACA'].map((codigo) => ({ codigo, quantidade: codigo === 'MANG' ? 2 : 1 })),
};

beforeEach(() => {
  pedidos.length = 0;
  modelo = predio();
  composicoes = [];
});

describe('E9.2 · a prévia pelo serviço', () => {
  it('⚠️ PRONTO QUANDO: com a composição da organização, o hidrante lança as 7 linhas — e a peça com código, a sua', async () => {
    composicoes = [HIDRANTE];
    const p = await preverLancamentos('snp');
    expect(pedidos.flat()).toEqual(expect.arrayContaining(['HIDCOD', 'ABRIGO', 'MANG', 'PLACA']));
    const comp = p.entries.filter((e) => e.id.includes(':instalacao:composicao:'));
    expect(comp).toHaveLength(7);
    expect(comp.find((e) => e.sinapiItem.code === 'MANG')!.quantity).toBe(4);
    expect(p.entries.filter((e) => e.sinapiItem.code === 'HIDCOD').map((e) => e.quantity)).toEqual([1]);
    expect(p.divergencias.filter((d) => d.medida === 'INSTALACAO')).toEqual([]);
  });

  it('sem composição: a peça com código sai (antes da E9.2 ela caía em "não encontrado no catálogo")', async () => {
    const p = await preverLancamentos('snp');
    expect(pedidos.flat()).toContain('HIDCOD');
    expect(p.entries.map((e) => e.sinapiItem.code)).toEqual(['HIDCOD']);
    expect(p.divergencias.filter((d) => d.medida === 'INSTALACAO')).toEqual([]);
  });
});
