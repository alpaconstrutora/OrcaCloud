/**
 * Terreno da Planta × ficha do Empreendimento (plano docs/planos/2026-10-21-terreno-ficha-planta.md,
 * item 1). Decisões do usuário: o número da Planta é o DESENHADO; profundidade = média das
 * laterais; automático só preenche o que a ficha tem VAZIO.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command, type BoundaryPapel } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno } from '../utils/blueprintTerreno';
import { compararComFicha, medidasDaPlantaParaFicha, patchDaPlantaParaFicha } from '../utils/blueprintTerrenoDaFicha';

type Canto = { x: number; y: number };

/** Monta o lote pelos cantos; `papeis[i]` é o papel do lado i → i+1 (undefined = sem papel). */
function lote(cantos: Canto[], papeis: (BoundaryPapel | undefined)[], fechar = true) {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const n = cantos.length;
  const cmds: Command[] = [];
  for (let i = 0; i < (fechar ? n : n - 1); i++) {
    cmds.push({
      type: 'AddBoundary',
      levelId,
      a: point(cantos[i].x, cantos[i].y),
      b: point(cantos[(i + 1) % n].x, cantos[(i + 1) % n].y),
      kind: 'TERRENO',
      ...(papeis[i] ? { papel: papeis[i] } : {}),
    } as Command);
  }
  const model = applyBatch(base, cmds).model;
  const limites = divisasDoLote(model.boundaries);
  return { terreno: medirTerreno(limites), limites };
}

const QUATRO: BoundaryPapel[] = ['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA'];

describe('medidasDaPlantaParaFicha', () => {
  it('retângulo 12 × 30: área, frente, fundos, laterais e profundidade = lateral', () => {
    const { terreno, limites } = lote([{ x: 0, y: 0 }, { x: 12_000, y: 0 }, { x: 12_000, y: 30_000 }, { x: 0, y: 30_000 }], QUATRO);
    expect(medidasDaPlantaParaFicha(terreno, limites)).toEqual({
      areaM2: 360,
      frenteM: 12,
      fundosM: 12,
      lateralDireitaM: 30,
      lateralEsquerdaM: 30,
      profundidadeM: 30,
    });
  });

  it('irregular (trapézio): profundidade é a MÉDIA das laterais', () => {
    // frente 18 m embaixo; fundos 11 m em cima; laterais 30 m (reta) e ~30,81 m (inclinada)
    const { terreno, limites } = lote([{ x: 0, y: 0 }, { x: 18_000, y: 0 }, { x: 11_000, y: 30_000 }, { x: 0, y: 30_000 }], QUATRO);
    const m = medidasDaPlantaParaFicha(terreno, limites);
    expect(m.frenteM).toBe(18);
    expect(m.fundosM).toBe(11);
    expect(m.lateralEsquerdaM).toBe(30);
    expect(m.lateralDireitaM).toBeCloseTo(30.81, 2);
    expect(m.profundidadeM).toBeCloseTo((30 + 30.81) / 2, 2);
    expect(m.areaM2).toBe(435);
  });

  it('lado sem papel fica fora; uma lateral só vira a profundidade', () => {
    const { terreno, limites } = lote([{ x: 0, y: 0 }, { x: 12_000, y: 0 }, { x: 12_000, y: 30_000 }, { x: 0, y: 30_000 }], ['FRENTE', 'LATERAL_DIREITA', undefined, undefined]);
    const m = medidasDaPlantaParaFicha(terreno, limites);
    expect(m.fundosM).toBeNull();
    expect(m.lateralEsquerdaM).toBeNull();
    expect(m.profundidadeM).toBe(30);
  });

  it('contorno aberto ou sem lote: nada (estimativa não vira número da ficha)', () => {
    const aberto = lote([{ x: 0, y: 0 }, { x: 12_000, y: 0 }, { x: 12_000, y: 30_000 }, { x: 0, y: 30_000 }], QUATRO, false);
    const vazio = { areaM2: null, frenteM: null, fundosM: null, lateralDireitaM: null, lateralEsquerdaM: null, profundidadeM: null };
    expect(medidasDaPlantaParaFicha(aberto.terreno, aberto.limites)).toEqual(vazio);
    expect(medidasDaPlantaParaFicha(null, [])).toEqual(vazio);
  });
});

describe('compararComFicha', () => {
  const planta = { areaM2: 360, frenteM: 12, fundosM: 12, lateralDireitaM: 30, lateralEsquerdaM: 30, profundidadeM: 30 };

  it('as cinco situações, na ordem da ficha', () => {
    const linhas = compararComFicha(
      { ...planta, fundosM: null, profundidadeM: null },
      { terreno_area: 360.004, terreno_frente: 18, terreno_fundos: 11, terreno_profundidade: null },
    );
    expect(linhas.map((l) => [l.campo, l.situacao])).toEqual([
      ['terreno_area', 'IGUAL'],
      ['terreno_frente', 'DIFERENTE'],
      ['terreno_fundos', 'SO_FICHA'],
      ['terreno_profundidade', 'NENHUM'],
    ]);
    expect(compararComFicha(planta, null).every((l) => l.situacao === 'SO_PLANTA')).toBe(true);
  });
});

describe('patchDaPlantaParaFicha', () => {
  const planta = { areaM2: 360, frenteM: 12, fundosM: 12, lateralDireitaM: 30, lateralEsquerdaM: 30, profundidadeM: 30 };

  it('SO_VAZIOS: só o que a ficha não tem — nunca troca valor existente', () => {
    expect(
      patchDaPlantaParaFicha(planta, { terreno_area: 1229, terreno_frente: null, terreno_fundos: 11, terreno_profundidade: null, terreno_lateral_direita: null, terreno_lateral_esquerda: 30 }, 'SO_VAZIOS'),
    ).toEqual({ terreno_frente: 12, terreno_profundidade: 30, terreno_lateral_direita: 30 });
  });

  it('TUDO: leva o que difere; o que a Planta não mede não entra (não vai zero nem null)', () => {
    expect(
      patchDaPlantaParaFicha({ ...planta, fundosM: null }, { terreno_area: 360, terreno_frente: 18, terreno_fundos: 11, terreno_profundidade: 71 }, 'TUDO'),
    ).toEqual({ terreno_frente: 12, terreno_profundidade: 30, terreno_lateral_direita: 30, terreno_lateral_esquerda: 30 });
  });
});
