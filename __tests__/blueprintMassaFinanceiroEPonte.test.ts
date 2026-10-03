/**
 * ESTUDO DE MASSA, fase M3 (02/10/2026): o financeiro do cenário e a ponte
 * com o Empreendimento pelo motor de sync compartilhado (origem `massa`).
 *
 * Contas (torre 24 × 30 × 10 pav + subsolo de garagem 20 × 15 × 2, produto
 * residencial médio: 40 × 58 m² a R$ 8.500 e 40 × 75 m² a R$ 8.800; CUB R$ 2.000
 * + 25 % de acréscimos = R$ 2.500/m²):
 *   VGV   = 40·58·8.500 + 40·75·8.800 = 19.720.000 + 26.400.000 = 46.120.000
 *   obra  = 7.200·2.500 + 600·2.500·1,3 = 18.000.000 + 1.950.000 = 19.950.000
 *   desp. = 6 % + 4 % + 5 % do VGV = 2.767.200 + 1.844.800 + 2.306.000
 *   total = 19.950.000 + 3.000.000 (terreno) + 6.918.000 = 29.868.000
 *   resultado 16.252.000 · margem 35,2 % · VGV/custo 1,54 · obra/m² privativo 3.750
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoDaColuna, produtoSemente, type Produto } from '../utils/blueprintProduto';
import { financeiroDaMassa } from '../utils/blueprintFinanceiroMassa';
import { ladoDaMassa, nomeDaUnidadeDaMassa } from '../services/sync/massaAdapter';
import { buildPlan } from '../services/sync/planner';
import { cubEstimado, COLUNA_DO_PADRAO_CUB } from '../services/cubService';
import { PADROES_DO_PRODUTO } from '../utils/blueprintProduto';
import type { Empreendimento, EmpreendimentoTower, EmpreendimentoUnit } from '../types/empreendimento';

const ret = (x0: number, y0: number, x1: number, y1: number): Point[] => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];

function estudo(): BlueprintModel {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 30000, 0, 'FRENTE'), d(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), d(30000, 40000, 0, 40000, 'FUNDOS'), d(0, 40000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  return applyBatch(m, [
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos: ret(3000, 6000, 27000, 36000), pavimentos: 10 },
    { type: 'AddBloco', levelId: t, nome: 'Subsolo', pontos: ret(5000, 12500, 25000, 27500), cotaBaseMm: -6000, pavimentos: 2, uso: 'GARAGEM' },
  ]).model;
}

const produto = (): Produto => ({ ...produtoSemente('RESIDENCIAL_MEDIO'), financeiro: { ...produtoSemente('RESIDENCIAL_MEDIO').financeiro, terrenoR$: 3_000_000 } });
const CUB = { valorM2: 2000, fonte: 'TABELA' as const, referencia: '12/2025 · Com Desoneração' };

function medir(m: BlueprintModel, p: Produto) {
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: { FRENTE: 0, FUNDOS: 0, LATERAL_DIREITA: 0, LATERAL_ESQUERDA: 0 }, zona: ZONA_DA_MASSA_VAZIA });
  return { massa, dist: distribuirProduto(m, massa, p) };
}

describe('financeiro da massa', () => {
  it('VGV, obra por natureza, despesas, resultado e margem', () => {
    const m = estudo();
    const p = produto();
    const { massa, dist } = medir(m, p);
    const f = financeiroDaMassa(massa, p, dist, CUB);
    expect(f.vgv).toBe(46_120_000);
    expect(f.custoM2Base).toBe(2500);
    expect(f.origemDoCusto).toBe('CUB');
    expect(f.linhasDeObra.map((l) => [l.rotulo, l.areaM2, l.custoM2, l.valor])).toEqual([
      ['Edificação', 7200, 2500, 18_000_000],
      ['Subsolo', 600, 3250, 1_950_000],
    ]);
    expect(f.custoObra).toBe(19_950_000);
    expect([f.despesasComerciais, f.impostos, f.outrasDespesas]).toEqual([2_767_200, 1_844_800, 2_306_000]);
    expect(f.custoTotal).toBe(29_868_000);
    expect(f.resultado).toBe(16_252_000);
    expect(f.margemPct).toBe(35.2);
    expect(f.vgvSobreCusto).toBe(1.54);
    expect(f.custoPorM2Privativo).toBe(3750);
    expect(f.avisos).toEqual([]);
  });

  it('custo digitado vence o CUB; sem CUB não inventa; CUB estimado avisa; tipologia sem preço fica fora', () => {
    const m = estudo();
    const p = produto();
    const { massa, dist } = medir(m, p);
    const manual = financeiroDaMassa(massa, { ...p, financeiro: { ...p.financeiro, custoM2Manual: 3000 } }, dist, CUB);
    expect(manual).toMatchObject({ origemDoCusto: 'MANUAL', custoM2Base: 3000 });
    const sem = financeiroDaMassa(massa, p, dist, null);
    expect(sem).toMatchObject({ origemDoCusto: 'SEM_DADO', custoObra: null, custoTotal: null, resultado: null, margemPct: null });
    expect(sem.avisos.join(' ')).toMatch(/Sem custo de obra/);
    const est = financeiroDaMassa(massa, p, dist, cubEstimado('MG', 'R8-N'));
    expect(est.origemDoCusto).toBe('CUB_ESTIMADO');
    expect(est.avisos.join(' ')).toMatch(/não encontrado na tabela/);
    const semPreco = financeiroDaMassa(massa, { ...p, tipologias: p.tipologias.map((t) => (t.id === '3q' ? { ...t, precoM2: 0 } : t)) }, dist, CUB);
    expect(semPreco.vgv).toBe(19_720_000);
    expect(semPreco.semPreco).toEqual(['3 dorm. (1 suíte)']);
  });

  it('o produto gravado antes da M3 ganha as hipóteses financeiras padrão; o mapa do CUB cobre todo padrão', () => {
    const antigo = produtoDaColuna({ nome: 'X', padrao: 'R8-N', tipologias: [{ id: 'a', nome: 'A', uso: 'RESIDENCIAL', areaPrivativaM2: 60, proporcaoPct: 100 }] });
    expect(antigo.tipologias[0].precoM2).toBe(0);
    expect(antigo.financeiro).toMatchObject({ uf: 'MG', custoM2Manual: null, acrescimosSobreCubPct: 25 });
    for (const padrao of PADROES_DO_PRODUTO) expect(COLUNA_DO_PADRAO_CUB[padrao]).toBeTruthy();
    // A coluna do "prédio popular" é pp_4_n — montar o nome pela chave ("pp_n") erraria.
    expect(COLUNA_DO_PADRAO_CUB['PP-N']).toBe('pp_4_n');
  });
});

describe('ponte massa → Empreendimento', () => {
  const emp = { id: 'emp_1', organization_id: 'org_1', name: 'Residencial', blueprint_study_id: 'est_1' } as unknown as Empreendimento;

  it('o bloco vira torre com pavimentos, un/pav e R$/m²; cada unidade do produto vira unidade com nome, andar e preço-semente', () => {
    const m = estudo();
    const lado = ladoDaMassa(emp, m, produto(), CUB);
    expect(lado.origin).toBe('massa');
    expect(lado.towers).toHaveLength(1);
    const t = lado.towers[0];
    expect(t.matchName).toBe('Torre');
    expect(t.fields).toEqual({ floors_count: 10, units_per_floor: 8, construction_cost_sqm: 2500, sales_price_sqm: 8669.17 });
    expect(t.createOnly).toMatchObject({ name: 'Torre', blueprint_bloco_uid: m.blocos!.find((b) => b.nome === 'Torre')!.uid });
    expect(t.units).toHaveLength(80);
    expect(t.units.slice(0, 2).map((u) => u.fields.name)).toEqual(['T01', 'T02']);
    expect(t.units.find((u) => u.fields.name === '101')).toBeTruthy();
    expect(t.units.find((u) => u.fields.name === '908')).toBeTruthy();
    const u = t.units[0];
    expect(u.fields).toMatchObject({ floor: 0, typology: '2 dorm.', private_area: 58, bedrooms: 2 });
    // Comum do bloco (7.200 − 5.320 = 1.880) rateado pela privativa.
    expect(u.fields.common_area).toBeCloseTo((1880 * 58) / 5320, 2);
    expect(u.createOnly).toMatchObject({ price: 493_000, status: 'DISPONIVEL', floor_tipo: 'TERREO', is_vendavel: true });
    expect(new Set(t.units.map((x) => x.sourceId)).size).toBe(80);
    expect(lado.warnings.join(' ')).toMatch(/"Subsolo" é garagem: não vira torre/);
    expect(nomeDaUnidadeDaMassa(4, 12)).toBe('312');
  });

  it('M6a: a divisão do pavimento tipo semeia posição e sol de cada unidade (createOnly — o cadastro pode corrigir)', () => {
    // Torre 24 × 30 m com o eixo maior norte–sul: as fachadas das unidades olham para leste e oeste,
    // e a rua fica ao sul — as unidades são LATERAIS em relação a ela.
    const lado = ladoDaMassa(emp, estudo(), produto(), CUB);
    const doTipo = lado.towers[0].units.filter((u) => /^1\d\d$/.test(String(u.fields.name)));
    expect(doTipo).toHaveLength(8);
    for (const u of doTipo) {
      expect(['LESTE', 'OESTE']).toContain(u.createOnly!.sun_orientation);
      expect(u.createOnly!.position_type).toBe('LATERAL');
      // Semente, não campo sincronizado: o envio seguinte não sobrescreve o que o cadastro corrigir.
      expect(u.fields).not.toHaveProperty('sun_orientation');
    }
    expect(new Set(doTipo.map((u) => u.createOnly!.sun_orientation)).size).toBe(2);
  });

  it('cadastro vazio: cria 1 torre com 80 unidades; o mesmo envio de novo não muda nada (idempotente)', () => {
    const m = estudo();
    const lado = ladoDaMassa(emp, m, produto(), CUB);
    const vazio = buildPlan(lado, { towers: [], units: [], commonAreas: [] });
    expect(vazio.towerCreates).toHaveLength(1);
    expect(vazio.towerCreates[0].units).toHaveLength(80);
    // Simula o que o applier gravou.
    const torre = { id: 'tw_1', empreendimento_id: 'emp_1', ...vazio.towerCreates[0].insert } as unknown as EmpreendimentoTower;
    const unidades = vazio.towerCreates[0].units.map((x, i) => ({ id: `un_${i}`, tower_id: 'tw_1', ...x }) as unknown as EmpreendimentoUnit);
    expect(torre.blueprint_bloco_uid).toBe(lado.towers[0].sourceId);
    expect(unidades[0].blueprint_massa_chave).toBe(lado.towers[0].units[0].sourceId);
    const denovo = buildPlan(lado, { towers: [torre], units: unidades, commonAreas: [] });
    expect(denovo.towerCreates).toHaveLength(0);
    expect(denovo.unitCreates).toHaveLength(0);
    expect(denovo.fills).toHaveLength(0);
    expect(denovo.conflicts).toHaveLength(0);
    expect(denovo.orphanUnits).toHaveLength(0);
    // Mais pavimentos no desenho → unidades novas; tirar pavimentos → órfãs reportadas, nunca apagadas.
    const menor = applyBatch(m, [{ type: 'SetBlocoProps', blocoId: m.blocos!.find((b) => b.nome === 'Torre')!.id, pavimentos: 9 }]).model;
    const encolheu = buildPlan(ladoDaMassa(emp, menor, produto(), CUB), { towers: [torre], units: unidades, commonAreas: [] });
    expect(encolheu.orphanUnits).toHaveLength(8);
    expect(encolheu.conflicts.map((c) => c.field)).toContain('floors_count');
  });

  it('torre criada à mão com o mesmo nome é ADOTADA, não duplicada', () => {
    const m = estudo();
    const lado = ladoDaMassa(emp, m, produto(), CUB);
    const aMao = { id: 'tw_9', empreendimento_id: 'emp_1', name: 'Torre', floors_count: null, units_per_floor: null } as unknown as EmpreendimentoTower;
    const plano = buildPlan(lado, { towers: [aMao], units: [], commonAreas: [] });
    expect(plano.towerCreates).toHaveLength(0);
    expect(plano.adoptions).toEqual([{ entity: 'tower', existingId: 'tw_9', sourceId: lado.towers[0].sourceId }]);
    expect(plano.unitCreates).toHaveLength(80);
  });
});
