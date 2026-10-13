/**
 * ÁGUA E CHUVA NUM CLIQUE (13/10/2026) — `planejarAguaCompleta` e `planejarPluvialCompleta`.
 * Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, item 5.3.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_ALIMENTACAO_PADRAO, ROTULO_DO_ALIMENTADOR, entradaDeAgua, planejarAlimentador } from '../utils/blueprintAlimentador';
import { HIPOTESES_RESERVATORIO_PADRAO } from '../utils/blueprintReservacao';
import { planejarAguaCompleta } from '../utils/blueprintAguaCompleta';
import { planejarPluvialCompleta } from '../utils/blueprintPluvialCompleto';
import { MOTIVO_SEM_FRENTE_PARA_A_SAIDA_PLUVIAL } from '../utils/blueprintCondutoresPluviais';
import { HIPOTESES_PLUVIAIS_PADRAO } from '../utils/blueprintPluvial';
import { HIPOTESES_HIDRO_PADRAO } from '../utils/blueprintMemorialHidro';
import { sobrado } from './fixtures/sobradoHidro';

function comLote(m: BlueprintModel, x0: number, frenteY: number, x1: number, y1: number): BlueprintModel {
  const cantos: [number, number][] = [[x0, frenteY], [x1, frenteY], [x1, y1], [x0, y1]];
  return applyBatch(m, cantos.map(([ax, ay], i): Command => {
    const [bx, by] = cantos[(i + 1) % 4];
    return { type: 'AddBoundary', levelId: m.levels[0].id, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', ...(i === 0 ? { papel: 'FRENTE' as const } : {}) };
  })).model;
}
const contar = (m: BlueprintModel, tipo: string) => (m.terminais ?? []).filter((t) => t.tipoHidraulico === tipo).length;
const geometria = (m: BlueprintModel) =>
  (m.trechos ?? []).map((t) => `${t.levelId}|${t.disciplina}|${t.a.x},${t.a.y},${t.cotaAMm}>${t.b.x},${t.b.y},${t.cotaBMm}/${t.bitolaMm}/${t.rotulo ?? ''}`).sort();
const tiposDosTerminais = (m: BlueprintModel) => (m.terminais ?? []).map((t) => `${t.tipoHidraulico}@${t.at.x},${t.at.y}`).sort();

describe('planejarAguaCompleta', () => {
  const hip = HIPOTESES_HIDRO_PADRAO;
  // O sobrado (rede de água já lançada pela fixture), sem peças da caixa, sem hidrômetro — e com lote.
  const base = () => comLote(sobrado(true, { cotaDaCaixaMm: 4500 }), -3000, -8000, 7500, 6000);

  it('um lote: as peças da caixa (com a boia), o hidrômetro na frente e o alimentador até a boia', () => {
    const m = base();
    expect(contar(m, 'TORNEIRA_BOIA')).toBe(0);
    const p = planejarAguaCompleta(m, hip);
    expect(p.pendencias).toEqual([]);
    expect(p.presumido[0]).toMatch(/^Hidrômetro posto no cavalete da frente do lote/);
    const depois = applyBatch(m, p.comandos).model;
    expect(contar(depois, 'TORNEIRA_BOIA')).toBe(1);
    expect(contar(depois, 'HIDROMETRO')).toBe(1);
    expect((depois.trechos ?? []).some((t) => t.rotulo === ROTULO_DO_ALIMENTADOR)).toBe(true);
    // O alimentador chega à BOIA (não "ao alto da caixa"): a boia nasceu antes dele no mesmo lote.
    const alim = planejarAlimentador(depois, HIPOTESES_ALIMENTACAO_PADRAO, HIPOTESES_RESERVATORIO_PADRAO, 3);
    expect(alim.entradaId).toBe(entradaDeAgua(depois)!.id);
    expect(alim.avisos.join(' ')).not.toMatch(/não tem torneira de boia/);
  });

  it('clicar de novo não duplica peça nem muda a rede', () => {
    const uma = applyBatch(base(), planejarAguaCompleta(base(), hip).comandos).model;
    const duas = applyBatch(uma, planejarAguaCompleta(uma, hip).comandos).model;
    expect(tiposDosTerminais(duas)).toEqual(tiposDosTerminais(uma));
    expect(geometria(duas)).toEqual(geometria(uma));
  });

  it('sem frente do lote: lança o que dá e devolve a pendência do hidrômetro', () => {
    const m = sobrado(true, { cotaDaCaixaMm: 4500 });
    const p = planejarAguaCompleta(m, hip);
    expect(p.pendencias.join(' ')).toMatch(/Marque a divisa da frente do lote/);
    expect(contar(applyBatch(m, p.comandos).model, 'TORNEIRA_BOIA')).toBe(1);
  });
});

describe('planejarPluvialCompleta', () => {
  const hip = HIPOTESES_PLUVIAIS_PADRAO;
  /** Casa 10 × 8 m, duas águas — SEM calhas lançadas, sem caixa de areia, sem saída. */
  const casa = (comFrente = true): BlueprintModel => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddAgua', levelId: t, pontos: [point(0, 0), point(10000, 0), point(10000, 4000), point(0, 4000)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
      { type: 'AddAgua', levelId: t, pontos: [point(0, 4000), point(10000, 4000), point(10000, 8000), point(0, 8000)], beiralIndex: 2, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
    ] as never).model;
    return comFrente ? comLote(m, -3000, -8000, 13000, 12000) : m;
  };

  it('um lote: calhas, bocais, condutores e a saída na frente', () => {
    const m = casa();
    const p = planejarPluvialCompleta(m, hip);
    expect(p.pendencias).toEqual([]);
    expect(p.presumido[0]).toMatch(/^Saída pluvial posta na frente do lote/);
    const depois = applyBatch(m, p.comandos).model;
    expect((depois.trechos ?? []).some((t) => t.secaoCalha)).toBe(true);
    expect(contar(depois, 'LIGACAO_PLUVIAL')).toBe(1);
    expect((depois.trechos ?? []).some((t) => t.rotulo === 'Condutor vertical')).toBe(true);
    expect((depois.trechos ?? []).some((t) => t.rotulo === 'Condutor horizontal')).toBe(true);
  });

  it('clicar de novo não duplica peça nem muda a rede', () => {
    const uma = applyBatch(casa(), planejarPluvialCompleta(casa(), hip).comandos).model;
    const duas = applyBatch(uma, planejarPluvialCompleta(uma, hip).comandos).model;
    expect(tiposDosTerminais(duas)).toEqual(tiposDosTerminais(uma));
    expect(geometria(duas)).toEqual(geometria(uma));
  });

  it('sem frente do lote: as calhas saem e a saída fica pendente', () => {
    const m = casa(false);
    const p = planejarPluvialCompleta(m, hip);
    expect(p.pendencias).toEqual([MOTIVO_SEM_FRENTE_PARA_A_SAIDA_PLUVIAL]);
    expect((applyBatch(m, p.comandos).model.trechos ?? []).some((t) => t.secaoCalha)).toBe(true);
  });
});
