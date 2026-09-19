/**
 * Unidades (18/09/2026, E2.2): composição por etiqueta, área privativa NBR
 * 12721 (eixo + metade externa das paredes externas), geminada/comum/externa,
 * área comum do pavimento, fração ideal, canônico e a ponte com o Planta AI.
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
  type Command,
} from '../utils/blueprintKernel';
import { comandosDeImportacaoDoPlantaAi, medirUnidade, quadroDeUnidades, rotuloDaUnidade, unidadeExternaDoPlantaAi } from '../utils/blueprintUnidades';

/**
 * Dois apartamentos lado a lado (6 × 6 m de eixo cada) sobre um hall comum
 * (12 × 2 m): externas de 200 mm, internas de 150 mm.
 */
function predio(): { m: BlueprintModel; t: string; a: string; b: string; hall: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, e: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 2800 });
  m = applyBatch(m, [
    w(0, 0, 12000, 0, 200),
    w(12000, 0, 12000, 8000, 200),
    w(12000, 8000, 0, 8000, 200),
    w(0, 8000, 0, 0, 200),
    w(6000, 0, 6000, 6000, 150),
    w(0, 6000, 12000, 6000, 150),
  ]).model;
  const achar = (x: number, y: number) => m.spaces.find((s) => s.ring.some((p) => p.x === x && p.y === y) && s.areaMm2 === (y === 8000 ? 24_000_000 : 36_000_000))!.id;
  const a = achar(0, 0);
  const b = achar(12000, 0);
  const hall = achar(0, 8000);
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: a, name: 'Sala 101' },
    { type: 'NameSpace', spaceId: b, name: 'Sala 102' },
    { type: 'NameSpace', spaceId: hall, name: 'Hall' },
  ]).model;
  return { m, t, a, b, hall };
}

const etiqueta = (m: BlueprintModel, nome: string) => m.labels.find((l) => l.name === nome)!;

describe('kernel: unidade', () => {
  it('AddUnidade com etiquetas; número duplicado recusado; SetUnidadeDoAmbiente transfere; apagar a etiqueta tira o ambiente e a unidade fica', () => {
    const { m, a, b } = predio();
    let x = applyCommand(m, { type: 'AddUnidade', numero: ' 101 ', tipologia: '2 dorm.', labelIds: [etiqueta(m, 'Sala 101').id] }).model;
    expect(x.unidades[0]).toMatchObject({ numero: '101', tipologia: '2 dorm.', pcd: false });
    expect(x.unidades[0].etiquetaUids).toEqual([etiqueta(m, 'Sala 101').uid]);
    expect(() => applyCommand(x, { type: 'AddUnidade', numero: '101' })).toThrow(/Já existe a unidade "101"/);
    x = applyCommand(x, { type: 'AddUnidade', numero: '102', pcd: true }).model;
    // Transfere a Sala 101 para a 102: sai da 101.
    x = applyCommand(x, { type: 'SetUnidadeDoAmbiente', spaceId: a, unidadeId: x.unidades[1].id }).model;
    expect(x.unidades[0].etiquetaUids).toEqual([]);
    expect(x.unidades[1].etiquetaUids).toEqual([etiqueta(m, 'Sala 101').uid]);
    // Tira da unidade (null); ambiente sem etiqueta pede nome.
    x = applyCommand(x, { type: 'SetUnidadeDoAmbiente', spaceId: a, unidadeId: null }).model;
    expect(x.unidades[1].etiquetaUids).toEqual([]);
    const semEtiqueta = applyCommand(m, { type: 'NameSpace', spaceId: b, name: '' }).model;
    expect(() => applyCommand(semEtiqueta, { type: 'SetUnidadeDoAmbiente', spaceId: b, unidadeId: null })).toThrow(/informe o nome/);
    const criada = applyBatch(semEtiqueta, [{ type: 'AddUnidade', numero: '201' }]).model;
    const y = applyCommand(criada, { type: 'SetUnidadeDoAmbiente', spaceId: b, unidadeId: criada.unidades[0].id, nome: 'Quarto' }).model;
    expect(y.labels.find((l) => l.name === 'Quarto')).toBeTruthy();
    expect(y.unidades[0].etiquetaUids).toHaveLength(1);
    // Apagar a etiqueta (renomear para vazio): a unidade fica, vazia.
    const z = applyCommand(y, { type: 'NameSpace', spaceId: b, name: '' }).model;
    expect(z.unidades).toHaveLength(1);
    expect(z.unidades[0].etiquetaUids).toEqual([]);
    // SetUnidadeProps: número, tipologia null, pcd, conjunto de etiquetas; DeleteUnidade.
    const p = applyCommand(x, { type: 'SetUnidadeProps', unidadeId: x.unidades[0].id, numero: '103', tipologia: null, pcd: true, labelIds: [etiqueta(m, 'Sala 102').id, etiqueta(m, 'Hall').id] }).model;
    expect(p.unidades[0]).toMatchObject({ numero: '103', tipologia: null, pcd: true });
    expect(p.unidades[0].etiquetaUids).toHaveLength(2);
    expect(() => applyCommand(p, { type: 'SetUnidadeProps', unidadeId: p.unidades[0].id, numero: '102' })).toThrow(/Já existe/);
    expect(applyCommand(p, { type: 'DeleteUnidade', unidadeId: p.unidades[0].id }).model.unidades).toHaveLength(1);
  });

  it('canônico: `unidades` por número, etiquetas por índice; ida e volta byte a byte; sem unidade a chave some', () => {
    const { m } = predio();
    expect(parseCanonicalPayload(canonicalPayload(m)).unidades).toBeUndefined(); // a identidade (fora do hash) lista `[]`
    const x = applyBatch(m, [
      { type: 'AddUnidade', numero: '102', labelIds: [etiqueta(m, 'Sala 102').id] },
      { type: 'AddUnidade', numero: '101', tipologia: 'Studio', pcd: true, labelIds: [etiqueta(m, 'Sala 101').id] },
    ]).model;
    const json = canonicalPayload(x);
    const payload = parseCanonicalPayload(json);
    expect(payload.unidades!.map((u) => u.numero)).toEqual(['101', '102']);
    expect(payload.unidades![0]).toEqual({ numero: '101', tipologia: 'Studio', pcd: true, etiquetas: [payload.labels.findIndex((l) => l.name === 'Sala 101')] });
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(json);
    expect(volta.unidades.find((u) => u.numero === '101')!.etiquetaUids).toEqual([volta.labels.find((l) => l.name === 'Sala 101')!.uid]);
    expect(snapshotHash(volta)).toBe(snapshotHash(x));
    expect(snapshotHash(x)).not.toBe(snapshotHash(m));
  });
});

describe('medidas', () => {
  it('privativa = eixo + metade externa das externas; lados classificados; geminada marcada; comum e fração ideal', () => {
    const { m } = predio();
    const x = applyBatch(m, [
      { type: 'AddUnidade', numero: '101', labelIds: [etiqueta(m, 'Sala 101').id] },
      { type: 'AddUnidade', numero: '102', labelIds: [etiqueta(m, 'Sala 102').id] },
    ]).model;
    const q = quadroDeUnidades(x);
    const u101 = q.unidades.find((u) => u.numero === '101')!;
    expect(u101.areaDeEixoMm2).toBe(36_000_000);
    // Dois lados externos de 6 m × 200 mm / 2 = 600.000 mm² cada.
    expect(u101.areaDasParedesExternasMm2).toBe(1_200_000);
    expect(u101.areaPrivativaMm2).toBe(37_200_000);
    expect(u101.paredes.map((p) => p.lado).sort()).toEqual(['COMUM', 'EXTERNA', 'EXTERNA', 'GEMINADA']);
    expect(u101.geminadaCom).toEqual([q.unidades.find((u) => u.numero === '102')!.id]);
    expect(u101.fracaoIdeal).toBeCloseTo(0.5, 9);
    expect(q.paredesGeminadas.size).toBe(1);
    const meio = x.walls.find((w) => w.a.x === 6000 && w.b.x === 6000)!;
    expect(q.paredesGeminadas.has(meio.id)).toBe(true);
    // Pavimento: construída pela face externa = 12,2 × 8,2 m; comum = construída − 2 × 37,2.
    const pav = q.pavimentos[0];
    expect(pav.areaConstruidaMm2).toBe(12_200 * 8_200);
    expect(pav.unidades).toBe(2);
    expect(pav.areaPrivativaMm2).toBe(74_400_000);
    expect(pav.areaComumMm2).toBe(12_200 * 8_200 - 74_400_000);
    expect(q.totalPrivativaMm2).toBe(74_400_000);
  });

  it('dois ambientes na MESMA unidade: a parede entre eles é INTERNA e a privativa soma os dois; o hall na unidade vira privativo', () => {
    const { m } = predio();
    const x = applyCommand(m, { type: 'AddUnidade', numero: '101', labelIds: [etiqueta(m, 'Sala 101').id, etiqueta(m, 'Sala 102').id] }).model;
    const med = medirUnidade(x, x.unidades[0]);
    expect(med.paredes.filter((p) => p.lado === 'INTERNA')).toHaveLength(2); // o mesmo trecho visto dos dois ambientes
    expect(med.paredes.some((p) => p.lado === 'GEMINADA')).toBe(false);
    // Eixo 72 m² + externas: 2 × (6 m baixo) + 2 × (6 m lateral) = 24 m × 0,1 = 2,4 m².
    expect(med.areaPrivativaMm2).toBe(72_000_000 + 2_400_000);
    expect(med.levelIds).toHaveLength(1);
    expect(rotuloDaUnidade({ numero: '101', tipologia: '3 dorm.', pcd: true })).toBe('Un. 101 · 3 dorm. · PCD');
    expect(rotuloDaUnidade({ numero: '101', tipologia: '3 dorm.', pcd: false }, true)).toBe('Un. 101');
  });

  it('ponte com o Planta AI: cria só as que faltam, idempotente, e converte a linha do plant_units', () => {
    const { m } = predio();
    const x = applyCommand(m, { type: 'AddUnidade', numero: '101' }).model;
    const externas = [
      unidadeExternaDoPlantaAi({ unit_code: '101', unit_type: '2 dorm.', private_area: 62.5, _floor_number: 1 })!,
      unidadeExternaDoPlantaAi({ unit_code: '102', bedrooms: 3, private_area: 80, _floor_number: 1 })!,
      unidadeExternaDoPlantaAi({ unit_code: '102', bedrooms: 3 })!,
    ];
    expect(unidadeExternaDoPlantaAi({})).toBeNull();
    expect(externas[1].tipologia).toBe('3 dorm.');
    const r = comandosDeImportacaoDoPlantaAi(x, externas);
    expect(r.jaExistiam).toEqual(['101']);
    expect(r.comandos).toEqual([{ type: 'AddUnidade', numero: '102', tipologia: '3 dorm.', pcd: false }]);
    const y = applyBatch(x, r.comandos).model;
    expect(comandosDeImportacaoDoPlantaAi(y, externas).comandos).toEqual([]);
  });
});
