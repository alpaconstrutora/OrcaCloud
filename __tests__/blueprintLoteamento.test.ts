/**
 * LOTEAMENTO (B1) — o motor puro: faixa da via, medida do lote, papéis dos
 * lados, confrontantes, quadro de áreas e numeração.
 *
 * Os casos foram escolhidos onde erro passa despercebido: a via com canto (o
 * offset pela bissetriz estreitaria a caixa), o lote de esquina (duas frentes),
 * e o mesmo lote desenhado nos DOIS sentidos — que é onde `polygonArea` no
 * lugar de `signedArea` espelha as laterais sem mudar o desenho.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel } from '../utils/blueprintKernel';
import {
  faixaDaVia,
  calcadasDaVia,
  medirLote,
  areasDoLoteamento,
  areaEmM2,
  numerarQuadra,
  centroide,
  rotuloDoLote,
} from '../utils/blueprintLoteamento';

/** Modelo com um pavimento — `emptyModel()` nasce sem nenhum. */
function base(): BlueprintModel {
  return applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
}

/** Quadra 60 × 30 m com uma rua de 12 m ao sul (y negativo). */
function comQuadraERua(): BlueprintModel {
  const m = base();
  const nivel = m.levels[0].id;
  const r = applyBatch(m, [
    { type: 'AddQuadra', levelId: nivel, nome: 'A', pontos: [
      { x: 0, y: 0 }, { x: 60000, y: 0 }, { x: 60000, y: 30000 }, { x: 0, y: 30000 },
    ] },
    { type: 'AddVia', levelId: nivel, nome: 'Rua 1', eixo: [{ x: -10000, y: -6000 }, { x: 70000, y: -6000 }], larguraMm: 12000, calcadaMm: 2000 },
  ]);
  return r.model;
}

describe('faixa da via', () => {
  it('eixo reto vira retângulo da largura da caixa', () => {
    const faixa = faixaDaVia([{ x: 0, y: 0 }, { x: 10000, y: 0 }], 12000);
    expect(faixa).toHaveLength(4);
    // 10 m × 12 m = 120 m²
    expect(areaEmM2(faixa)).toBeCloseTo(120, 2);
  });

  it('eixo com canto encontra as paralelas no CRUZAMENTO, não na bissetriz', () => {
    // L de 10 m + 10 m, caixa de 10 m. Pela bissetriz o canto estreitaria.
    const faixa = faixaDaVia([{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 10000 }], 10000);
    const xs = faixa.map((p) => p.x);
    const ys = faixa.map((p) => p.y);
    // O canto externo tem de chegar a (15000, -5000): 10000 + meia largura.
    expect(Math.max(...xs)).toBe(15000);
    expect(Math.min(...ys)).toBe(-5000);
    // E o canto interno a (5000, 5000).
    expect(faixa.some((p) => p.x === 5000 && p.y === 5000)).toBe(true);
  });

  it('largura zero ou eixo de um ponto não produzem faixa', () => {
    expect(faixaDaVia([{ x: 0, y: 0 }], 12000)).toEqual([]);
    expect(faixaDaVia([{ x: 0, y: 0 }, { x: 1000, y: 0 }], 0)).toEqual([]);
  });

  it('calçada sai como duas faixas dentro da caixa, e some quando é zero', () => {
    const m = comQuadraERua();
    const via = m.vias[0];
    const calcadas = calcadasDaVia(via);
    expect(calcadas).toHaveLength(2);
    expect(calcadasDaVia({ ...via, calcadaMm: 0 })).toEqual([]);
  });
});

describe('medida do lote', () => {
  /** Lote de meio de quadra: 12 m de testada (sul, na rua) × 30 m de fundo. */
  function comLoteDeMeio(m: BlueprintModel, x = 0): BlueprintModel {
    const nivel = m.levels[0].id;
    const quadraId = m.quadras[0].id;
    return applyBatch(m, [
      { type: 'AddLote', levelId: nivel, quadraId, numero: '1', pontos: [
        { x, y: 0 }, { x: x + 12000, y: 0 }, { x: x + 12000, y: 30000 }, { x, y: 30000 },
      ] },
    ]).model;
  }

  it('área, perímetro e testada saem do anel; a frente é a aresta na via', () => {
    const m = comLoteDeMeio(comQuadraERua());
    const medida = medirLote(m, m.lotes[0]);
    expect(medida.areaMm2).toBe(360_000_000); // 12 × 30 = 360 m²
    expect(medida.perimetroMm).toBe(84_000);
    expect(medida.testadaMm).toBe(12_000);
    expect(medida.encravado).toBe(false);
    const frente = medida.lados.find((l) => l.papel === 'FRENTE');
    expect(frente?.confrontante).toBe('Rua 1');
    expect(medida.lados.filter((l) => l.papel === 'FUNDO')).toHaveLength(1);
    expect(medida.lados.filter((l) => l.papel.startsWith('LATERAL'))).toHaveLength(2);
  });

  it('o mesmo lote desenhado nos DOIS sentidos dá os mesmos papéis', () => {
    const m = comLoteDeMeio(comQuadraERua());
    const horario = medirLote(m, m.lotes[0]);

    const invertido = applyBatch(comQuadraERua(), [
      { type: 'AddLote', levelId: comQuadraERua().levels[0].id, numero: '1', pontos: [
        { x: 0, y: 30000 }, { x: 12000, y: 30000 }, { x: 12000, y: 0 }, { x: 0, y: 0 },
      ] },
    ]).model;
    const antiHorario = medirLote(invertido, invertido.lotes[0]);

    const papelDaAresta = (med: ReturnType<typeof medirLote>, dey: number, paray: number) =>
      med.lados.find((l) => l.de.y === dey && l.para.y === paray)?.papel;
    // A aresta de y=0 a y=0 (o lado sul, na rua) é FRENTE nos dois sentidos.
    expect(horario.lados.filter((l) => l.de.y === 0 && l.para.y === 0)[0].papel).toBe('FRENTE');
    expect(antiHorario.lados.filter((l) => l.de.y === 0 && l.para.y === 0)[0].papel).toBe('FRENTE');
    // E cada lateral guarda o mesmo papel nos dois sentidos.
    const esqHorario = horario.lados.find((l) => l.de.x === 0 && l.para.x === 0)?.papel;
    const esqAnti = antiHorario.lados.find((l) => l.de.x === 0 && l.para.x === 0)?.papel;
    expect(esqHorario).toBe(esqAnti);
    expect(papelDaAresta(horario, 0, 0)).toBe('FRENTE');
  });

  it('lote de esquina tem DUAS frentes e a testada soma as duas', () => {
    const m0 = comQuadraERua();
    const nivel = m0.levels[0].id;
    const comSegundaRua = applyBatch(m0, [
      { type: 'AddVia', levelId: nivel, nome: 'Rua 2', eixo: [{ x: -6000, y: -10000 }, { x: -6000, y: 40000 }], larguraMm: 12000, calcadaMm: 2000 },
      { type: 'AddLote', levelId: nivel, quadraId: m0.quadras[0].id, numero: '1', pontos: [
        { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 },
      ] },
    ]).model;
    const medida = medirLote(comSegundaRua, comSegundaRua.lotes[0]);
    const frentes = medida.lados.filter((l) => l.papel === 'FRENTE');
    expect(frentes).toHaveLength(2);
    expect(medida.testadaMm).toBe(12_000 + 30_000);
  });

  it('lote sem via nenhuma é ENCRAVADO e cai no lado mais curto como frente', () => {
    const m = base();
    const nivel = m.levels[0].id;
    const sozinho = applyBatch(m, [
      { type: 'AddLote', levelId: nivel, numero: '9', pontos: [
        { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 },
      ] },
    ]).model;
    const medida = medirLote(sozinho, sozinho.lotes[0]);
    expect(medida.encravado).toBe(true);
    expect(medida.testadaMm).toBe(12_000);
    expect(medida.lados.every((l) => l.confrontante === null)).toBe(true);
  });

  it('o lote vizinho aparece como confrontante da lateral', () => {
    const um = comLoteDeMeio(comQuadraERua(), 0);
    const dois = applyBatch(um, [
      { type: 'AddLote', levelId: um.levels[0].id, quadraId: um.quadras[0].id, numero: '2', pontos: [
        { x: 12000, y: 0 }, { x: 24000, y: 0 }, { x: 24000, y: 30000 }, { x: 12000, y: 30000 },
      ] },
    ]).model;
    const medida = medirLote(dois, dois.lotes[0]);
    const lateralDireita = medida.lados.find((l) => l.de.x === 12000 && l.para.x === 12000);
    expect(lateralDireita?.confrontante).toBe('Lote 2 da quadra A');
  });
});

describe('quadro de áreas e numeração', () => {
  it('soma lotes, via e área verde, com percentual sobre a gleba', () => {
    const m0 = comQuadraERua();
    const nivel = m0.levels[0].id;
    const m = applyBatch(m0, [
      { type: 'AddLote', levelId: nivel, quadraId: m0.quadras[0].id, numero: '1', pontos: [
        { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 },
      ] },
      { type: 'AddAreaPublica', levelId: nivel, tipo: 'VERDE', pontos: [
        { x: 40000, y: 0 }, { x: 60000, y: 0 }, { x: 60000, y: 30000 }, { x: 40000, y: 30000 },
      ] },
    ]).model;
    // Gleba de 1.800 m² (a quadra 60 × 30).
    const linhas = areasDoLoteamento(m, 1800 * 1_000_000);
    const lotes = linhas.find((l) => l.chave === 'LOTES');
    expect(lotes?.quantidade).toBe(1);
    expect(lotes?.areaM2).toBeCloseTo(360, 2);
    expect(lotes?.percentual).toBeCloseTo(20, 2);
    const verde = linhas.find((l) => l.chave === 'VERDE');
    expect(verde?.areaM2).toBeCloseTo(600, 2);
    // Sem gleba informada, o percentual é null — e não zero, que seria mentira.
    expect(areasDoLoteamento(m, null).every((l) => l.percentual === null)).toBe(true);
  });

  it('numeração é determinística e no sentido horário a partir do canto', () => {
    const m0 = comQuadraERua();
    const nivel = m0.levels[0].id;
    const q = m0.quadras[0].id;
    const m = applyBatch(m0, [
      { type: 'AddLote', levelId: nivel, quadraId: q, numero: 'x', pontos: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 15000 }, { x: 0, y: 15000 }] },
      { type: 'AddLote', levelId: nivel, quadraId: q, numero: 'y', pontos: [{ x: 12000, y: 0 }, { x: 24000, y: 0 }, { x: 24000, y: 15000 }, { x: 12000, y: 15000 }] },
      { type: 'AddLote', levelId: nivel, quadraId: q, numero: 'z', pontos: [{ x: 24000, y: 0 }, { x: 36000, y: 0 }, { x: 36000, y: 15000 }, { x: 24000, y: 15000 }] },
    ]).model;
    const uma = numerarQuadra(m, m.quadras[0]);
    const outra = numerarQuadra(m, m.quadras[0]);
    expect(uma.map((x) => x.numero)).toEqual(['1', '2', '3']);
    expect(uma).toEqual(outra);
    expect(numerarQuadra(m, m.quadras[0], { inicio: 10, prefixo: 'L-' })[0].numero).toBe('L-10');
  });

  it('centróide do retângulo é o centro, e o rótulo traz quadra e lote', () => {
    expect(centroide([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toEqual({ x: 5, y: 5 });
    const m0 = comQuadraERua();
    const m = applyBatch(m0, [
      { type: 'AddLote', levelId: m0.levels[0].id, quadraId: m0.quadras[0].id, numero: '7', pontos: [
        { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 },
      ] },
    ]).model;
    expect(rotuloDoLote(m, m.lotes[0])).toBe('Quadra A · Lote 7');
  });
});

describe('invariantes do kernel', () => {
  it('apagar a quadra NÃO apaga os lotes: eles ficam soltos', () => {
    const m0 = comQuadraERua();
    const m = applyBatch(m0, [
      { type: 'AddLote', levelId: m0.levels[0].id, quadraId: m0.quadras[0].id, numero: '1', pontos: [
        { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 },
      ] },
    ]).model;
    const depois = applyBatch(m, [{ type: 'DeleteQuadra', quadraId: m.quadras[0].id }]).model;
    expect(depois.quadras).toHaveLength(0);
    expect(depois.lotes).toHaveLength(1);
    expect(depois.lotes[0].quadraId).toBeNull();
  });

  it('as duas calçadas não podem passar da caixa da via', () => {
    const m = base();
    expect(() =>
      applyBatch(m, [{ type: 'AddVia', levelId: m.levels[0].id, nome: 'Rua', eixo: [{ x: 0, y: 0 }, { x: 10000, y: 0 }], larguraMm: 6000, calcadaMm: 3000 }]),
    ).toThrow(/calcadas/i);
  });

  it('testada fora das arestas é recusada', () => {
    const m = base();
    expect(() =>
      applyBatch(m, [{ type: 'AddLote', levelId: m.levels[0].id, numero: '1', pontos: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }], testadaIndex: 7 }]),
    ).toThrow(/[Tt]estada/);
  });

  it('encurtar o anel do lote solta a testada em vez de deixá-la apontando para fora', () => {
    const m = base();
    const com5 = applyBatch(m, [
      { type: 'AddLote', levelId: m.levels[0].id, numero: '1', pontos: [
        { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 500 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 },
      ], testadaIndex: 4 },
    ]).model;
    expect(com5.lotes[0].testadaIndex).toBe(4);
    const com3 = applyBatch(com5, [
      { type: 'SetLoteProps', loteId: com5.lotes[0].id, pontos: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }] },
    ]).model;
    expect(com3.lotes[0].testadaIndex).toBeNull();
  });
});
