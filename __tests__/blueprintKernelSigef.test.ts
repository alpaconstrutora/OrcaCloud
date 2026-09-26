/**
 * Kernel 0.60.0 — o que o SIGEF pede do desenho (A4).
 *
 *  - vértice: sigmas por eixo (mm) e altitude (m), com as travas de sinal;
 *  - nomeação no padrão `<credenciado>-<tipo>-<sequencial>`, uma sequência por
 *    tipo, continuando de onde o credenciado parou; credenciado com 4 caracteres;
 *  - divisa: tipo de limite do catálogo do INCRA e documentos do confrontante;
 *  - canônico: ida e volta sem perder nada, e SEM chave nova quando ausentes.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  type BlueprintModel,
} from '../utils/blueprintKernel';

function lote(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const lv = m.levels[0].id;
  const cantos = [
    { x: 0, y: 0 },
    { x: 20_000, y: 0 },
    { x: 20_000, y: 30_000 },
    { x: 0, y: 30_000 },
  ];
  m = applyBatch(
    m,
    cantos.map((a, i) => ({ type: 'AddBoundary' as const, levelId: lv, a, b: cantos[(i + 1) % 4], kind: 'TERRENO' as const })),
  ).model;
  return m;
}

describe('vértice do terreno — SIGEF', () => {
  it('sigmas por eixo e altitude; null apaga, ausente não mexe', () => {
    let m = applyCommand(lote(), { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'V1', tipo: 'M', sigmaEMm: 12, sigmaNMm: 15, sigmaHMm: 30, altitudeM: 812.345, metodo: 'PG6' }).model;
    expect(m.verticesDoTerreno[0]).toMatchObject({ tipo: 'M', sigmaEMm: 12, sigmaNMm: 15, sigmaHMm: 30, altitudeM: 812.345, metodo: 'PG6' });
    m = applyCommand(m, { type: 'SetVerticeDoTerreno', ponto: { x: 2, y: 1 }, nome: 'V1', sigmaHMm: null }).model;
    expect(m.verticesDoTerreno[0].sigmaHMm).toBeUndefined();
    expect(m.verticesDoTerreno[0].sigmaEMm).toBe(12);
  });

  it('sigma negativo é recusado pela invariante', () => {
    expect(() => applyCommand(lote(), { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'V1', sigmaNMm: -1 })).toThrow(/sigmaNMm tem de ser positivo/);
  });

  it('nomear no padrão SIGEF: sequência por tipo, continuando de onde parou; credenciado de 4 caracteres', () => {
    let m = lote();
    m = applyBatch(m, [
      { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'a', tipo: 'M' },
      { type: 'SetVerticeDoTerreno', ponto: { x: 20_000, y: 0 }, nome: 'b', tipo: 'P' },
      { type: 'SetVerticeDoTerreno', ponto: { x: 20_000, y: 30_000 }, nome: 'c', tipo: 'M' },
    ]).model;
    const pontos = [
      { x: 0, y: 0 },
      { x: 20_000, y: 0 },
      { x: 20_000, y: 30_000 },
      { x: 0, y: 30_000 },
    ];
    m = applyCommand(m, { type: 'NomearVerticesDoTerreno', pontos, sigef: { credenciado: 'abc1', inicio: { M: 37 } } }).model;
    const nomes = pontos.map((p) => m.verticesDoTerreno.find((v) => v.ponto.x === p.x && v.ponto.y === p.y)!.nome);
    // o 4º não tinha tipo → P
    expect(nomes).toEqual(['ABC1-M-0037', 'ABC1-P-0001', 'ABC1-M-0038', 'ABC1-P-0002']);
    expect(() => applyCommand(m, { type: 'NomearVerticesDoTerreno', pontos, sigef: { credenciado: 'AB' } })).toThrow(/4 caracteres/);
  });
});

describe('divisa — tipo de limite e confrontante', () => {
  it('SetBoundarySigef grava, apara, apaga com vazio; tipo fora do catálogo é recusado', () => {
    let m = lote();
    const b = m.boundaries[0].id;
    m = applyCommand(m, { type: 'SetBoundarySigef', boundaryId: b, tipoDeLimite: 'LA1', confrontanteCns: ' 12.345-6 ', confrontanteMatricula: '4.567', confrontanteDocumento: '123.456.789-00' }).model;
    expect(m.boundaries[0]).toMatchObject({ tipoDeLimite: 'LA1', confrontanteCns: '12.345-6', confrontanteMatricula: '4.567', confrontanteDocumento: '123.456.789-00' });
    m = applyCommand(m, { type: 'SetBoundarySigef', boundaryId: b, confrontanteCns: '' }).model;
    expect(m.boundaries[0].confrontanteCns).toBeNull();
    expect(m.boundaries[0].tipoDeLimite).toBe('LA1');
    expect(() => applyCommand(m, { type: 'SetBoundarySigef', boundaryId: b, tipoDeLimite: 'LX9' as never })).toThrow(/Tipo de limite desconhecido/);
  });
});

describe('canônico', () => {
  it('ida e volta preserva sigmas, altitude, tipo de limite e documentos', () => {
    let m = lote();
    m = applyBatch(m, [
      { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'ABC1-M-0001', tipo: 'M', sigmaEMm: 12, sigmaNMm: 15, sigmaHMm: 30, altitudeM: 812.5, metodo: 'PG6' },
      { type: 'SetBoundarySigef', boundaryId: m.boundaries[1].id, tipoDeLimite: 'LN1', confrontanteMatricula: '99' },
    ]).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.verticesDoTerreno[0]).toMatchObject({ sigmaEMm: 12, sigmaNMm: 15, sigmaHMm: 30, altitudeM: 812.5, metodo: 'PG6' });
    const comLimite = volta.boundaries.filter((x) => x.tipoDeLimite === 'LN1');
    expect(comLimite).toHaveLength(1);
    expect(comLimite[0].confrontanteMatricula).toBe('99');
    expect(canonicalPayload(volta)).toEqual(canonicalPayload(m));
  });

  it('sem os campos SIGEF, o payload do limite não ganha chave nova', () => {
    const p = JSON.parse(canonicalPayload(lote())) as { boundaries: Record<string, unknown>[] };
    for (const b of p.boundaries) {
      expect(Object.keys(b)).not.toContain('tipoDeLimite');
      expect(Object.keys(b)).not.toContain('confrontanteDocumento');
    }
  });
});
