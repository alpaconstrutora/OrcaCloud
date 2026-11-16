/**
 * PA10c do prédio automático (16/11/2026): o ENVIO AO EMPREENDIMENTO (`services/sync/massaAdapter.ts`) com o prédio
 * lançado. Decisão do usuário ("unidades do prédio"): o bloco com o pavimento tipo montado e unidades desenhadas manda as
 * unidades DA PLANTA — sem unidade no térreo de uso comum, quantas couberam por andar, o número, a tipologia e a área
 * medida —, e a chave "<bloco>:<ordinal>:<posição>" casa a unidade que existe nos dois com a já enviada pela estimativa.
 * De quebra, o número das unidades dos andares copiados: o térreo do lote e o do bloco estão na mesma cota (o mesmo andar).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../utils/blueprintProduto';
import { planejarPredioDoPedido } from '../utils/blueprintPredioAutomatico';
import { unidadesDoPredio } from '../utils/blueprintUnidadesDoPredio';
import { ordinalDoPavimento } from '../utils/blueprintZonaUrbanistica';
import { ladoDaMassa } from '../services/sync/massaAdapter';
import type { Empreendimento } from '../types/empreendimento';

const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');
const EMP = { id: 'emp_1', organization_id: 'org_1', name: 'Residencial', blueprint_study_id: 'est_1' } as unknown as Empreendimento;

/** Os prédios do marco: lote com a rua ao sul, a torre e (opcional) o subsolo de garagem no retângulo do lote. */
function estudo(lote: [number, number], bloco: [number, number, number, number], pavimentos: number, subsolos = 0): BlueprintModel {
  const [w, d] = lote;
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const div = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  const [x0, y0, x1, y1] = bloco;
  return applyBatch(m, [
    div(0, 0, w, 0, 'FRENTE'), div(w, 0, w, d, 'LATERAL_DIREITA'), div(w, d, 0, d, 'FUNDOS'), div(0, d, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos: [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)], pavimentos },
    ...(subsolos ? [{ type: 'AddBloco', levelId: t, nome: 'Subsolo', pontos: [point(0, 0), point(w, 0), point(w, d), point(0, d)], pavimentos: subsolos, cotaBaseMm: -3000 * subsolos, peDireitoMm: 3000, uso: 'GARAGEM' } as Command] : []),
  ]).model;
}
function lancar(m: BlueprintModel): BlueprintModel {
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const doBloco = distribuirProduto(m, massa, MEDIO).blocos.find((x) => x.blocoId === m.blocos![0].id)!;
  return planejarPredioDoPedido({ original: m, entrada: { blocoId: m.blocos![0].id, produto: MEDIO, doBloco, rotacaoNorteDeg: null }, hip: {} }).resultado;
}
const nomes = (m: BlueprintModel) => ladoDaMassa(EMP, m, MEDIO, null).towers[0].units.map((u) => u.fields.name as string);

describe('o ordinal do pavimento conta cotas (PA10c)', () => {
  it('dois pavimentos na cota 0 são o mesmo andar; o subsolo é 0', () => {
    const levels = [
      { id: 'lote', elevationMm: 0 },
      { id: 'terreo', elevationMm: 0 },
      { id: 'tipo', elevationMm: 3000 },
      { id: 'copia', elevationMm: 6000 },
      { id: 'sub', elevationMm: -3000 },
    ];
    expect(['lote', 'terreo', 'tipo', 'copia', 'sub'].map((id) => ordinalDoPavimento(levels, id))).toEqual([1, 1, 2, 3, 0]);
  });
});

describe('envio ao Empreendimento com o prédio lançado (PA10c)', () => {
  it('R4: sem o prédio vai a estimativa (com unidade no térreo); lançado, as 6 unidades da planta, com o número da planta', () => {
    const antes = estudo([30000, 40000], [5000, 15000, 25000, 27000], 4);
    // A estimativa pela área: põe unidade no térreo.
    expect(nomes(antes).filter((n) => n.startsWith('T')).length).toBeGreaterThan(0);
    const depois = lancar(antes);
    const lado = ladoDaMassa(EMP, depois, MEDIO, null);
    const torre = lado.towers[0];
    expect(torre.units.map((u) => u.fields.name)).toEqual(['101', '102', '201', '202', '301', '302']);
    // Os números da planta (os andares copiados também: 201, não "Torre · 3º pav · 101").
    expect(unidadesDoPredio(depois).unidades.map((u) => u.numero).sort()).toEqual(['101', '102', '201', '202', '301', '302']);
    expect(torre.fields).toMatchObject({ floors_count: 4, units_per_floor: 2 });
    // A chave é a da estimativa: o 101 casa com o já enviado; o T01 e o T02 viram órfãos.
    const chaves = new Set(ladoDaMassa(EMP, antes, MEDIO, null).towers[0].units.map((u) => u.sourceId));
    expect(torre.units.every((u) => chaves.has(u.sourceId))).toBe(true);
    const u101 = torre.units.find((u) => u.fields.name === '101')!;
    expect(u101.fields.floor).toBe(1);
    expect(u101.createOnly.floor_tipo).toBe('TIPO');
    // A área é a medida na planta (não a da tipologia), e o preço-semente sai dela.
    const medida = unidadesDoPredio(depois).unidades.find((u) => u.numero === '101')!;
    expect(u101.fields.private_area).toBe(Math.round(medida.medida.areaPrivativaMm2 / 1e4) / 100);
    expect(u101.fields.typology).toBe(medida.tipologia);
    expect(lado.warnings.some((w) => /^"Torre": vão as 6 unidade\(s\) desenhadas no prédio \(a estimativa da massa daria \d+\)\.$/.test(w))).toBe(true);
  }, 120_000);

  it('R8 com subsolo: 35 unidades (5 por andar, nenhuma no térreo) e as vagas da garagem lançada no aviso', () => {
    const depois = lancar(estudo([40000, 60000], [5000, 20000, 35000, 36000], 8, 1));
    const lado = ladoDaMassa(EMP, depois, MEDIO, null);
    const torre = lado.towers[0];
    expect(torre.units).toHaveLength(35);
    expect(torre.units.some((u) => String(u.fields.name).startsWith('T'))).toBe(false);
    expect(torre.fields.units_per_floor).toBe(5);
    const vagas = (depois.vagas ?? []).length;
    expect(lado.warnings.some((w) => w.startsWith(`"Subsolo" é garagem: não vira torre (${vagas} vaga(s) desenhadas na garagem lançada`))).toBe(true);
  }, 180_000);
});
