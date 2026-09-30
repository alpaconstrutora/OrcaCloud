/**
 * INCÊNDIO E1.2 (30/09/2026, kernel 0.80.0): os tubos da rede de combate —
 * aço galvanizado, aço carbono SCH 40 e CPVC de sprinkler — com rugosidade,
 * C de Hazen-Williams, diâmetro interno até DN 150 e o comprimento equivalente
 * do aço (achado 2 do benchmark: a tabela de PVC parava no DN 75).
 */
import { describe, expect, it } from 'vitest';
import {
  MATERIAIS_DA_DISCIPLINA,
  MATERIAIS_DE_TUBO,
  applyCommand,
  emptyModel,
  materialDoTrecho,
  point,
  type Command,
  type MaterialDeTubo,
} from '../utils/blueprintKernel';
import { FICHA_DO_MATERIAL, comprimentoEquivalenteM, diametroInternoMm, perdaLocalizadaMca } from '../utils/blueprintHidraulicaPressao';

function comTrecho(disciplina: 'INCENDIO' | 'AGUA_FRIA' | 'ESGOTO', material?: MaterialDeTubo) {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return () =>
    applyCommand(m, {
      type: 'AddTrecho', levelId: m.levels[0].id, disciplina, a: point(0, 0), b: point(3000, 0), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 65,
      ...(material ? { material } : {}),
    } as Command).model;
}

describe('incêndio E1.2 · materiais por rede', () => {
  it('todo material tem ficha com C de Hazen-Williams e rugosidade positiva', () => {
    for (const m of MATERIAIS_DE_TUBO) {
      expect(FICHA_DO_MATERIAL[m].cHazenWilliams, m).toBeGreaterThan(0);
      expect(FICHA_DO_MATERIAL[m].rugosidadeMm, m).toBeGreaterThan(0);
    }
    expect(FICHA_DO_MATERIAL.ACO_GALVANIZADO.cHazenWilliams).toBe(120);
  });

  it('a rede de incêndio admite aço e CPVC de sprinkler; a água não admite aço; o esgoto não tem material', () => {
    expect(MATERIAIS_DA_DISCIPLINA.INCENDIO).toEqual(['ACO_GALVANIZADO', 'ACO_CARBONO', 'CPVC_INCENDIO', 'COBRE']);
    expect(comTrecho('INCENDIO', 'ACO_CARBONO')().trechos![0].material).toBe('ACO_CARBONO');
    expect(comTrecho('AGUA_FRIA', 'ACO_GALVANIZADO')).toThrow(/Material inválido/);
    expect(comTrecho('INCENDIO', 'PVC_SOLDAVEL')).toThrow(/Material inválido/);
    expect(comTrecho('ESGOTO', 'COBRE')).toThrow(/Material inválido/);
  });

  it('sem material declarado, o incêndio é aço galvanizado (derivado, não gravado)', () => {
    const t = comTrecho('INCENDIO')().trechos![0];
    expect(t.material ?? null).toBeNull();
    expect(materialDoTrecho(t)).toBe('ACO_GALVANIZADO');
  });
});

describe('incêndio E1.2 · diâmetros e comprimento equivalente do aço', () => {
  it('o aço vai de DN 15 a DN 150, com interno SCH 40', () => {
    expect(diametroInternoMm('ACO_GALVANIZADO', 65)).toBe(62.7);
    expect(diametroInternoMm('ACO_CARBONO', 150)).toBe(154.1);
    expect(FICHA_DO_MATERIAL.ACO_GALVANIZADO.diametros.map((d) => d.dn)).toEqual([15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150]);
  });

  it('o joelho de aço DN 100 sai da tabela de aço (10 pés), não da extrapolação do PVC', () => {
    expect(comprimentoEquivalenteM('JOELHO_90', 100, 'ACO_GALVANIZADO')).toBeCloseTo(10 * 0.3048, 9);
    expect(comprimentoEquivalenteM('JOELHO_90', 150, 'ACO_CARBONO')).toBeCloseTo(14 * 0.3048, 9);
    // A passagem direta do tê não soma perda na tabela de aço.
    expect(comprimentoEquivalenteM('TE_PASSAGEM', 65, 'ACO_GALVANIZADO')).toBe(0);
  });

  it('⚠️ os materiais de sempre continuam na tabela de PVC — nada muda na água', () => {
    expect(comprimentoEquivalenteM('JOELHO_90', 25)).toBe(1.2);
    expect(comprimentoEquivalenteM('JOELHO_90', 25, 'PVC_SOLDAVEL')).toBe(1.2);
    expect(comprimentoEquivalenteM('JOELHO_90', 25, 'CPVC_INCENDIO')).toBe(1.2);
  });

  it('a perda localizada usa a tabela do material', () => {
    const aco = perdaLocalizadaMca('JOELHO_90', 5, 'ACO_GALVANIZADO', 65);
    const pvcExtrapolado = perdaLocalizadaMca('JOELHO_90', 5, 'COBRE', 65);
    expect(aco).toBeGreaterThan(0);
    expect(aco).not.toBeCloseTo(pvcExtrapolado, 6);
  });
});
