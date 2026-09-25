/**
 * SUB-REGIÕES DO TERRENO (21/09/2026, backlog P2 — P2.19, kernel 0.53.0):
 * polígono com material de superfície; quadro por material, taxa de
 * permeabilidade desenhada contra a zona (regra), medida de orçamento;
 * canônico ida e volta; RemoveLevel leva junto.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, FICHA_DO_MATERIAL_DE_SUB_REGIAO, KERNEL_VERSION, MATERIAIS_DE_SUB_REGIAO, modelFromCanonicalPayload, parseCanonicalPayload, point, rotuloCurto, type Command } from '../utils/blueprintKernel';
import { avisosDeSobreposicao, medirSubRegioes, quadroDeSubRegioes, variaveisDePermeabilidade } from '../utils/blueprintSubRegioes';
import { alvosDoEscopo, avaliarRegras, REGRAS_SEMENTE, VARIAVEIS_DO_ESCOPO } from '../utils/blueprintRegras';
import { MEDIDAS } from '../utils/blueprintBudget';

function lote() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 20000, 0, 'FRENTE'), d(20000, 0, 20000, 30000, 'LATERAL_DIREITA'), d(20000, 30000, 0, 30000, 'FUNDOS'), d(0, 30000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  return { m, t };
}
const ret = (x0: number, y0: number, x1: number, y1: number) => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];

describe('sub-regiões do terreno (P2.19)', () => {
  it('catálogo de materiais com permeabilidade; Add/Set/Move/Delete; invariantes; RemoveLevel', () => {
    expect(MATERIAIS_DE_SUB_REGIAO).toHaveLength(9);
    expect(MATERIAIS_DE_SUB_REGIAO.filter((m) => FICHA_DO_MATERIAL_DE_SUB_REGIAO[m].permeavel)).toEqual(['GRAMA', 'JARDIM', 'BRITA', 'PISO_DRENANTE']);
    const { m, t } = lote();
    let r = applyCommand(m, { type: 'AddSubRegiao', levelId: t, material: 'GRAMA', pontos: ret(0, 20000, 20000, 30000), nome: 'Quintal' }).model;
    const g = r.subRegioes[0];
    expect(g).toMatchObject({ material: 'GRAMA', nome: 'Quintal' });
    expect(rotuloCurto(g.uid, 'subRegiao')).toMatch(/^J-/);
    r = applyCommand(r, { type: 'SetSubRegiaoProps', subRegiaoId: g.id, material: 'JARDIM', nome: '' }).model;
    expect(r.subRegioes[0]).toMatchObject({ material: 'JARDIM', nome: null });
    r = applyCommand(r, { type: 'MoveSubRegiaoVertex', subRegiaoId: g.id, index: 2, to: point(20000, 28000) }).model;
    expect(r.subRegioes[0].pontos[2]).toEqual(point(20000, 28000));
    expect(() => applyCommand(r, { type: 'AddSubRegiao', levelId: t, material: 'GRAMA', pontos: [point(0, 0), point(1, 1)] })).toThrow(/BAD_SUBREGION|3 vértices/);
    expect(() => applyCommand(r, { type: 'SetSubRegiaoProps', subRegiaoId: g.id, material: 'LAVA' as never })).toThrow(/BAD_SUBREGION|desconhecido/);
    const semNivel = applyCommand(r, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 2800 }).model;
    expect(applyCommand(semNivel, { type: 'RemoveLevel', levelId: t }).model.subRegioes).toHaveLength(0);
    expect(applyCommand(r, { type: 'DeleteSubRegiao', subRegiaoId: g.id }).model.subRegioes).toHaveLength(0);
  });

  it('quadro: áreas por material, permeável × impermeável, taxa contra o lote; variáveis e regra da zona; medida de orçamento; canônico', () => {
    const { m, t } = lote();
    const r = applyBatch(m, [
      { type: 'AddSubRegiao', levelId: t, material: 'GRAMA', pontos: ret(0, 20000, 20000, 30000), nome: 'Quintal' }, // 200 m²
      { type: 'AddSubRegiao', levelId: t, material: 'INTERTRAVADO', pontos: ret(0, 0, 5000, 6000) }, // 30 m²
      { type: 'AddSubRegiao', levelId: t, material: 'JARDIM', pontos: ret(15000, 0, 20000, 4000) }, // 20 m²
    ]).model;
    const linhas = medirSubRegioes(r);
    expect(linhas.map((l) => [l.nome, l.areaM2, l.permeavel])).toEqual([['Quintal', 200, true], ['Piso intertravado', 30, false], ['Jardim / canteiro', 20, true]]);
    const q = quadroDeSubRegioes(r, 20000 * 30000);
    expect(q.areaPermeavelM2).toBe(220);
    expect(q.areaImpermeavelM2).toBe(30);
    expect(q.taxaPermeabilidadePct).toBe(36.7); // 220 / 600
    expect(q.coberturaPct).toBe(41.7);
    expect(q.porMaterial.map((x) => [x.material, x.areaM2, x.quantidade])).toEqual([['GRAMA', 200, 1], ['JARDIM', 20, 1], ['INTERTRAVADO', 30, 1]]);
    expect(avisosDeSobreposicao(r)).toEqual([]);
    const sobre = applyCommand(r, { type: 'AddSubRegiao', levelId: t, material: 'CONCRETO', pontos: ret(2000, 2000, 8000, 4000) }).model;
    expect(avisosDeSobreposicao(sobre)).toHaveLength(1);
    // Sem sub-região não se afirma nada; com, as três variáveis do LOTE.
    expect(variaveisDePermeabilidade(m, 600)).toEqual({});
    expect(variaveisDePermeabilidade(r, 600)).toEqual({ area_permeavel: 220, area_impermeavel: 30, taxa_permeabilidade: 36.7 });
    expect(VARIAVEIS_DO_ESCOPO.LOTE.map((v) => v.nome)).toEqual(expect.arrayContaining(['area_permeavel', 'taxa_permeabilidade']));
    const ctxLote = { lote: { areaM2: 600, perimetroM: 100, testadaM: 20 }, zona: { taxaPermeabilidadeMin: 30 } } as never;
    expect(alvosDoEscopo(r, 'LOTE', ctxLote)[0].vars.taxa_permeabilidade).toBe(36.7);
    const estado = (model: typeof r, ctx: never) => avaliarRegras(model, REGRAS_SEMENTE, ctx).find((x) => x.regra.id === 'sem-lote-permeabilidade')!.estado;
    expect(estado(r, ctxLote)).toBe('CONFORME');
    expect(estado(r, { lote: { areaM2: 600, perimetroM: 100, testadaM: 20 }, zona: { taxaPermeabilidadeMin: 40 } } as never)).toBe('VIOLADA');
    expect(estado(m, ctxLote)).toBe('NAO_AVALIADA'); // sem sub-região
    // Orçamento: a medida existe no escopo TERRENO.
    expect(MEDIDAS.find((x) => x.id === 'AREA_SUBREGIAO')).toMatchObject({ escopo: 'TERRENO', dimensao: 'M2' });
    // Canônico.
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.58.0');
    expect(parseCanonicalPayload(canonicalPayload(m)).subRegioes).toBeUndefined();
    const payload = parseCanonicalPayload(canonicalPayload(r));
    expect(payload.subRegioes).toHaveLength(3);
    expect(payload.subRegioes![0]).toMatchObject({ level: 0, material: 'INTERTRAVADO', nome: null });
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(canonicalPayload(r));
    expect(volta.subRegioes.find((s) => s.nome === 'Quintal')!.levelId).toBe(volta.levels[0].id);
  });
});
