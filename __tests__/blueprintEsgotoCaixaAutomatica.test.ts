/**
 * A CAIXA DE INSPEÇÃO AUTOMÁTICA (13/10/2026) — `posicaoDaCaixaProposta` e o
 * `planejarEsgoto` sem CI no desenho. Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, item 2.1.
 *
 * A casa e o lote: `fixtures/casaEsgotoNoLote.ts` (o vaso em (600, 800), frente ao sul em y = −8000).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_ESGOTO_PADRAO, planejarEsgoto, posicaoDaCaixaProposta, relancarEsgoto, trechosDeEsgotoSemDestino } from '../utils/blueprintEsgotoAutomatico';
import { casa } from './fixtures/casaEsgotoNoLote';

const ehCaixa = (c: Command) => c.type === 'AddTerminal' && c.tipoHidraulico === 'CAIXA_INSPECAO';

describe('posicaoDaCaixaProposta', () => {
  it('no rumo da frente: passa a parede da fachada (15 cm) e mais 1 m', () => {
    // Do vaso (600, 800) para o sul: a parede y = 0 a 800, mais 75 de meia espessura, mais 1000.
    expect(posicaoDaCaixaProposta(casa())).toEqual({ levelId: casa().levels[0].id, at: { x: 600, y: -1075 }, rumo: 'PAPEL' });
  });

  it('o afastamento é premissa', () => {
    // 800 até a parede + 75 + 2000 = 2875 a partir de y = 800.
    expect(posicaoDaCaixaProposta(casa(), { ...HIPOTESES_ESGOTO_PADRAO, afastamentoDaCiMm: 2000 })?.at).toEqual({ x: 600, y: -2075 });
  });

  it('sem frente conhecida: a fachada mais perto da saída (a oeste, a 60 cm)', () => {
    expect(posicaoDaCaixaProposta(casa({ frenteY: null }))).toMatchObject({ at: { x: -1075, y: 800 }, rumo: 'FACHADA' });
  });

  it('prédio quase na divisa: a caixa fica entre a fachada e a frente, sem sair do lote', () => {
    // Frente a y = −500: o ponto na frente é (600, −200); 875 + 1000 não cabe → o meio entre 875 e 1000.
    const at = posicaoDaCaixaProposta(casa({ frenteY: -500 }))!.at;
    expect(at).toEqual({ x: 600, y: -137 });
    expect(at.y).toBeGreaterThan(-500);
  });

  it('sem fonte de esgoto: nada', () => {
    expect(posicaoDaCaixaProposta(casa({ semAparelhos: true }))).toBeNull();
  });
});

describe('planejarEsgoto sem caixa de inspeção no desenho', () => {
  it('propõe a caixa, sugerida, como PRIMEIRO comando — e liga tudo a ela', () => {
    const m = casa();
    const plano = planejarEsgoto(m);
    expect(plano.motivo).toBeNull();
    expect(plano.destinoId).toBeNull(); // a caixa ainda não existe: a conferência do executivo continua dizendo "sem caixa"
    expect(plano.caixaProposta).toMatchObject({ at: { x: 600, y: -1075 }, rumo: 'PAPEL' });
    expect(plano.comandos[0]).toMatchObject({ type: 'AddTerminal', tipoHidraulico: 'CAIXA_INSPECAO', sugerida: true, at: { x: 600, y: -1075 } });
    expect(plano.comandos.filter(ehCaixa)).toHaveLength(1);

    const depois = applyBatch(m, plano.comandos).model;
    const ci = depois.terminais!.find((t) => t.tipoHidraulico === 'CAIXA_INSPECAO')!;
    expect(ci.sugerida).toBe(true);
    const outra = planejarEsgoto(depois);
    expect(outra).toMatchObject({ destinoId: ci.id, aLigar: 0 });
    expect(outra.caixaProposta).toBeUndefined();
    expect(trechosDeEsgotoSemDestino(depois)).toEqual([]);
  });

  it('é o MESMO traçado de quem tivesse posto a caixa à mão naquele ponto e cota', () => {
    const m = casa();
    const plano = planejarEsgoto(m);
    const { at, cotaMm, levelId } = plano.caixaProposta!;
    const aMao = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ESGOTO', tipo: 'Caixa de inspeção', at, cotaMm, tipoHidraulico: 'CAIXA_INSPECAO', sugerida: true }).model;
    expect(plano.comandos.slice(1)).toEqual(planejarEsgoto(aMao).comandos);
  });

  it('a caixa nasce na cota em que a rede chega: nunca com o aviso "aprofunde a caixa"', () => {
    const plano = planejarEsgoto(casa());
    expect(plano.caixaProposta!.cotaMm).toBeLessThanOrEqual(-600);
    expect(plano.caixaProposta!.cotaMm).toBeLessThanOrEqual(plano.cotaDeChegadaMm!);
    expect(plano.avisos.join(' ')).not.toMatch(/aprofunde/);
  });

  it('sobrado: a caixa vai no térreo e recebe o tubo de queda', () => {
    const m = casa({ doisAndares: true });
    const plano = planejarEsgoto(m);
    expect(plano.caixaProposta?.levelId).toBe(m.levels[0].id);
    expect(plano.pavimentos.find((p) => p.levelId === m.levels[1].id)?.tuboDeQueda).toBe(true);
    const depois = applyBatch(m, plano.comandos).model;
    expect(planejarEsgoto(depois).aLigar).toBe(0);
    expect(trechosDeEsgotoSemDestino(depois)).toEqual([]);
  });

  it('com caixa já no desenho, não propõe outra', () => {
    const plano = planejarEsgoto(casa({ ciEm: { x: 6000, y: -1500 } }));
    expect(plano.caixaProposta).toBeUndefined();
    expect(plano.comandos.some(ehCaixa)).toBe(false);
    expect(plano.destinoId).not.toBeNull();
  });

  it('relançar depois do lançamento não cria segunda caixa', () => {
    const m = casa();
    const depois = applyBatch(m, planejarEsgoto(m).comandos).model;
    expect(relancarEsgoto(depois).comandos.some(ehCaixa)).toBe(false);
  });

  it('sem aparelho de esgoto: o motivo diz o que falta de verdade, não "coloque uma caixa"', () => {
    const plano = planejarEsgoto(casa({ semAparelhos: true }));
    expect(plano.comandos).toEqual([]);
    expect(plano.caixaProposta).toBeNull();
    expect(plano.motivo).toMatch(/aparelhos/);
    expect(plano.motivo).not.toMatch(/coloque uma caixa/);
  });
});
