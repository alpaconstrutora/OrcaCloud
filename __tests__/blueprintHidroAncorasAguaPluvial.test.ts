/**
 * O HIDRÔMETRO E A SAÍDA PLUVIAL AUTOMÁTICOS (13/10/2026) — `planejarAlimentador` sem
 * hidrômetro e `planejarCondutores` sem caixa de areia nem saída.
 * Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, itens 5.1 e 5.2.
 *
 * O mesmo molde do esgoto: a peça nasce `sugerida` na frente do lote e o plano
 * já a inclui; só sem frente conhecida o motivo pede a frente.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_ALIMENTACAO_PADRAO, MOTIVO_SEM_FRENTE_PARA_O_HIDROMETRO, ROTULO_DO_ALIMENTADOR, entradaDeAgua, planejarAlimentador } from '../utils/blueprintAlimentador';
import { HIPOTESES_RESERVATORIO_PADRAO } from '../utils/blueprintReservacao';
import { MOTIVO_SEM_FRENTE_PARA_A_SAIDA_PLUVIAL, planejarCondutores } from '../utils/blueprintCondutoresPluviais';
import { planejarCalhas } from '../utils/blueprintCalhas';
import { HIPOTESES_PLUVIAIS_PADRAO } from '../utils/blueprintPluvial';
import { verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { HIPOTESES_HIDRO_PADRAO, memorialDeCalculoHidro } from '../utils/blueprintMemorialHidro';
import { sobrado } from './fixtures/sobradoHidro';

const RESP = { nome: 'Ana', titulo: 'Eng', conselho: 'CREA' as const, registro: '1', artNumero: '2', artData: '2026-09-29' };

/** O lote retangular com a frente (lado 0) ao sul, em y = `frenteY`. */
function comLote(m: BlueprintModel, x0: number, frenteY: number, x1: number, y1: number): BlueprintModel {
  const cantos: [number, number][] = [[x0, frenteY], [x1, frenteY], [x1, y1], [x0, y1]];
  return applyBatch(m, cantos.map(([ax, ay], i): Command => {
    const [bx, by] = cantos[(i + 1) % 4];
    return { type: 'AddBoundary', levelId: m.levels[0].id, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', ...(i === 0 ? { papel: 'FRENTE' as const } : {}) };
  })).model;
}

describe('5.1 — o hidrômetro nasce na frente do lote', () => {
  const planejar = (m: BlueprintModel) => planejarAlimentador(m, HIPOTESES_ALIMENTACAO_PADRAO, HIPOTESES_RESERVATORIO_PADRAO, 3);
  // O sobrado: a caixa d'água em (4500, 0) no superior; o lote com a frente em y = −8000.
  const base = () => comLote(sobrado(true, { cotaDaCaixaMm: 4500 }), -3000, -8000, 7500, 6000);

  it('proposto no cavalete da frente (no térreo, 0,60 m), sugerido, e o alimentador até a caixa no mesmo lote', () => {
    const m = base();
    const p = planejar(m);
    expect(p.motivo).toBeNull();
    expect(p.entradaId).toBeNull(); // ainda não existe
    expect(p.hidrometroProposto).toEqual({ levelId: m.levels[0].id, at: { x: 4500, y: -7700 }, cotaMm: 600, origem: 'PAPEL' });
    expect(p.comandos[0]).toMatchObject({ type: 'AddTerminal', tipoHidraulico: 'HIDROMETRO', sugerida: true, levelId: m.levels[0].id, at: { x: 4500, y: -7700 } });
    expect(p.comandos.filter((c) => c.type === 'AddTerminal' && c.tipoHidraulico === 'HIDROMETRO')).toHaveLength(1);
    expect(p.comandos.some((c) => c.type === 'AddTrecho' && c.rotulo === ROTULO_DO_ALIMENTADOR)).toBe(true);
  });

  it('lançado: o hidrômetro existe e é a entrada; relançar não põe outro', () => {
    const m = base();
    const depois = applyBatch(m, planejar(m).comandos).model;
    const h = entradaDeAgua(depois)!;
    expect(h).toMatchObject({ sugerida: true, at: { x: 4500, y: -7700 } });
    const de_novo = planejar(depois);
    expect(de_novo.entradaId).toBe(h.id);
    expect(de_novo.hidrometroProposto).toBeUndefined();
    expect(de_novo.comandos.some((c) => c.type === 'AddTerminal' && c.tipoHidraulico === 'HIDROMETRO')).toBe(false);
  });

  it('com topografia: o cavalete fica 0,60 m acima do terreno ali', () => {
    const p = planejarAlimentador(base(), HIPOTESES_ALIMENTACAO_PADRAO, HIPOTESES_RESERVATORIO_PADRAO, 3, { cotaEmM: () => 99.5, cotaZeroM: 100 });
    expect(p.hidrometroProposto?.cotaMm).toBe(100);
  });

  it('sem frente do lote: pede a frente', () => {
    expect(planejar(sobrado(true, { cotaDaCaixaMm: 4500 })).motivo).toBe(MOTIVO_SEM_FRENTE_PARA_O_HIDROMETRO);
  });

  it('o executivo e o memorial não tratam o hidrômetro proposto como existente', () => {
    const m = base();
    const v = verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, RESP).verificacoes;
    expect(v.find((x) => x.item === 'Entrada de água e alimentador predial')).toMatchObject({ obtido: 'hidrômetro não lançado', atende: false });
    expect(v.some((x) => x.item === 'Pressão na torneira de boia')).toBe(false);
    const texto = memorialDeCalculoHidro(m, HIPOTESES_HIDRO_PADRAO, { nomeDoEstudo: 'S', geradoEm: '2026-10-13T00:00:00Z' })
      .map((b) => (b.tipo === 'tabela' ? b.linhas.flat().join(' ') : b.texto)).join('\n');
    expect(texto).toMatch(/Sem hidrômetro no desenho/);
  });
});

describe('5.2 — a saída pluvial nasce na frente do lote', () => {
  const hip = HIPOTESES_PLUVIAIS_PADRAO;
  /** Casa 10 × 8 m, duas águas, calhas lançadas — sem caixa de areia e sem saída. */
  const casa = (comFrente = true): BlueprintModel => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddAgua', levelId: t, pontos: [point(0, 0), point(10000, 0), point(10000, 4000), point(0, 4000)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
      { type: 'AddAgua', levelId: t, pontos: [point(0, 4000), point(10000, 4000), point(10000, 8000), point(0, 8000)], beiralIndex: 2, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
    ] as never).model;
    m = applyBatch(m, planejarCalhas(m, hip).comandos).model;
    return comFrente ? comLote(m, -3000, -8000, 13000, 12000) : m;
  };

  it('proposta na frente, sugerida, numa cota em que o condutor mais longo chega por gravidade', () => {
    const m = casa();
    const p = planejarCondutores(m, hip);
    expect(p.motivo).toBeNull();
    expect(p.saidaProposta).toMatchObject({ levelId: m.levels[0].id, origem: 'PAPEL', at: { y: -7700 } });
    expect(p.comandos[0]).toMatchObject({ type: 'AddTerminal', tipoHidraulico: 'LIGACAO_PLUVIAL', sugerida: true });
    expect(p.avisos[0]).toMatch(/^saída pluvial posta na frente do lote, a −\d,\d\d m .* confira o nível da sarjeta/);
    // Nenhum condutor fica sem gravidade por causa da saída proposta.
    expect(p.avisos.join(' ')).not.toMatch(/alta demais/);
    expect(p.saidaProposta!.cotaMm).toBeLessThan(-Math.abs(hip.profundidadeDoCondutorMm));
  });

  it('lançada: todo bocal chega à saída; relançar não põe outra', () => {
    const m = casa();
    const depois = applyBatch(m, planejarCondutores(m, hip).comandos).model;
    const saidas = (depois.terminais ?? []).filter((t) => t.tipoHidraulico === 'LIGACAO_PLUVIAL');
    expect(saidas).toHaveLength(1);
    expect(saidas[0].sugerida).toBe(true);
    const de_novo = planejarCondutores(depois, hip);
    expect(de_novo.saidaProposta).toBeUndefined();
    expect(de_novo.comandos.some((c) => c.type === 'AddTerminal' && c.tipoHidraulico === 'LIGACAO_PLUVIAL')).toBe(false);
  });

  it('sem frente do lote: pede a frente', () => {
    expect(planejarCondutores(casa(false), hip).motivo).toBe(MOTIVO_SEM_FRENTE_PARA_A_SAIDA_PLUVIAL);
  });
});
