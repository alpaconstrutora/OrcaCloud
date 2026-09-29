/**
 * E5.4 — VENTILAÇÃO DO ESGOTO (29/09/2026): desconector ventilado ao alcance
 * da tabela (medido pelo tubo), a ventilação primária pelo TQ prolongado, a
 * coluna com o DN da tabela e 30 cm acima da cobertura; e o lançamento.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, point, type BlueprintModel } from '../utils/blueprintKernel';
import {
  ACIMA_DA_COBERTURA_MM,
  coberturaNoPontoMm,
  distanciaMaximaAoVentiladorM,
  dnDaColunaDeVentilacao,
  planejarVentilacao,
  verificarVentilacao,
} from '../utils/blueprintVentilacao';
import { esgotoTrechoATrecho } from '../utils/blueprintEsgotoAutomatico';
import { sobrado } from './fixtures/sobradoHidro';

describe('E5.4 — as tabelas', () => {
  it('distância máxima do desconector ao ventilador pelo DN do ramal de descarga', () => {
    expect([40, 50, 75, 100].map(distanciaMaximaAoVentiladorM)).toEqual([1.0, 1.2, 1.8, 2.4]);
  });

  it('DN da coluna pelo DN do tubo, UHC e comprimento; nunca abaixo de 50 com bacia', () => {
    expect(dnDaColunaDeVentilacao(100, 10, 3, true)).toBe(50);
    expect(dnDaColunaDeVentilacao(100, 10, 12, true)).toBe(75);
    expect(dnDaColunaDeVentilacao(100, 200, 60, true)).toBe(100);
    expect(dnDaColunaDeVentilacao(50, 1, 5, false)).toBe(40);
    expect(dnDaColunaDeVentilacao(50, 1, 30, false)).toBe(50);
  });
});

describe('E5.4 — a cobertura', () => {
  it('sem telhado: o topo do último pavimento; com uma água sobre o ponto, a altura dela ali', () => {
    const m = sobrado(true);
    expect(coberturaNoPontoMm(m, { x: 1000, y: 1000 })).toBe(2900 + 2800);
    const sup = m.levels[1].id;
    const comTelhado = applyCommand(m, {
      type: 'AddAgua', levelId: sup, pontos: [point(0, 0), point(4500, 0), point(4500, 3000), point(0, 3000)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100,
    } as never).model;
    // A 1 m do beiral (y = 0): 2,90 + 2,80 + 0,30 + 0,10.
    expect(coberturaNoPontoMm(comTelhado, { x: 1000, y: 1000 })).toBe(2900 + 2800 + 300 + 100);
  });
});

describe('E5.4 — a verificação', () => {
  it('sobrado: os vasos ventilados pelo TQ (ventilação primária); as sifonadas longe demais; a coluna do TQ abaixo da cobertura', () => {
    const v = verificarVentilacao(sobrado(true));
    const vasos = v.desconectores.filter((d) => d.sigla === 'VS');
    expect(vasos.every((d) => d.ventilado && d.distanciaM! < 0.3)).toBe(true);
    const sifonadas = v.desconectores.filter((d) => d.sigla === 'CS');
    expect(sifonadas.every((d) => !d.ventilado && d.distanciaM! > d.maximaM)).toBe(true);
    expect(v.colunas).toHaveLength(1);
    expect(v.colunas[0]).toMatchObject({ dnAtualMm: 50, dnNecessarioMm: 50, coberturaMm: 5700, acimaDaCobertura: false });
  });

  it('casa térrea sem nenhuma ventilação: nenhum desconector ventilado (distância nula)', () => {
    const v = verificarVentilacao(sobrado(false));
    expect(v.desconectores.map((d) => [d.sigla, d.distanciaM, d.ventilado])).toEqual([
      ['VS', null, false],
      ['CS', null, false],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).reverse());
  });
});

describe('E5.4 — o lançamento', () => {
  const lancar = (m: BlueprintModel) => applyBatch(m, planejarVentilacao(m).comandos).model;

  it('sobrado: estende a coluna do TQ a 30 cm acima da cobertura e sobe UMA coluna nas sifonadas empilhadas; depois, tudo em ordem', () => {
    const m = sobrado(true);
    const p = planejarVentilacao(m);
    expect(p.resumo).toEqual(['1 coluna(s) nova(s)', '1 estendida(s) até 30 cm acima da cobertura']);
    const depois = lancar(m);
    const v = verificarVentilacao(depois);
    expect(v.desconectores.every((d) => d.ventilado)).toBe(true);
    expect(v.colunas.every((c) => c.acimaDaCobertura && c.topoMm === c.coberturaMm + ACIMA_DA_COBERTURA_MM && c.dnAtualMm >= c.dnNecessarioMm)).toBe(true);
    expect(planejarVentilacao(depois).comandos).toEqual([]);
  });

  it('a ventilação não entra no fluxo do esgoto: o cálculo do esgoto é o mesmo antes e depois', () => {
    const m = sobrado(true);
    const tira = (x: ReturnType<typeof esgotoTrechoATrecho>) => x.map((c) => [c.trechoId, c.uhc, c.papel, c.contrafluxo]);
    expect(tira(esgotoTrechoATrecho(lancar(m)))).toEqual(tira(esgotoTrechoATrecho(m)));
  });

  it('casa térrea: uma coluna no vaso (DN 50) e outra na sifonada (DN 40), cada uma até a cobertura', () => {
    const depois = lancar(sobrado(false));
    const v = verificarVentilacao(depois);
    expect(v.colunas.map((c) => c.dnAtualMm).sort()).toEqual([40, 50]);
    expect(v.desconectores.every((d) => d.ventilado)).toBe(true);
  });
});
