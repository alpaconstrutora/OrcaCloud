/**
 * E6.3 — CONDUTORES DE ÁGUAS PLUVIAIS (29/09/2026, NBR 10844 5.6/5.7): o
 * horizontal por Manning a 2/3 (Tabela 4), o vertical com DN mínimo 75, o
 * lançamento do bocal à caixa de areia e à saída — atravessando pavimentos — e
 * a vazão acumulada por gravidade na verificação.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { planejarCalhas } from '../utils/blueprintCalhas';
import {
  ROTULO_DO_CONDUTOR_HORIZONTAL,
  ROTULO_DO_CONDUTOR_VERTICAL,
  capacidadeDoHorizontalLMin,
  capacidadeDoVerticalLMin,
  dnDoHorizontal,
  dnDoVertical,
  planejarCondutores,
  verificarCondutores,
} from '../utils/blueprintCondutoresPluviais';
import { HIPOTESES_PLUVIAIS_PADRAO } from '../utils/blueprintPluvial';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';

const hip = HIPOTESES_PLUVIAIS_PADRAO;
/** Casa 10 × 8 m, duas águas; `doisAndares` põe o telhado no superior. Calhas lançadas; caixa de areia e saída à esquerda. */
const casa = (opcoes: { doisAndares?: boolean; caixa?: boolean; saida?: boolean } = {}): BlueprintModel => {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  if (opcoes.doisAndares) m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const terreo = m.levels[0].id;
  const topo = m.levels[m.levels.length - 1].id;
  m = applyBatch(m, [
    { type: 'AddAgua', levelId: topo, pontos: [point(0, 0), point(10000, 0), point(10000, 4000), point(0, 4000)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
    { type: 'AddAgua', levelId: topo, pontos: [point(0, 4000), point(10000, 4000), point(10000, 8000), point(0, 8000)], beiralIndex: 2, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
    ...(opcoes.caixa === false ? [] : [{ type: 'AddTerminal', levelId: terreo, disciplina: 'PLUVIAL', tipo: 'CA', at: point(-1000, 4000), cotaMm: -600, tipoHidraulico: 'CAIXA_AREIA' }]),
    ...(opcoes.saida === false ? [] : [{ type: 'AddTerminal', levelId: terreo, disciplina: 'PLUVIAL', tipo: 'Saída', at: point(-1000, 12000), cotaMm: -800, tipoHidraulico: 'LIGACAO_PLUVIAL' }]),
  ] as never).model;
  return applyBatch(m, planejarCalhas(m, hip).comandos).model;
};
const lancar = (m: BlueprintModel) => applyBatch(m, planejarCondutores(m, hip).comandos).model;

describe('E6.3 — as contas', () => {
  it('horizontal a 2/3 com n 0,011 e 0,5 %: bate com a Tabela 4 da NBR 10844 (DN 100 → 204, DN 150 → 601 L/min, ±1 %)', () => {
    expect(Math.abs(capacidadeDoHorizontalLMin(100, 0.011, 0.5) / 204 - 1)).toBeLessThan(0.01);
    expect(Math.abs(capacidadeDoHorizontalLMin(150, 0.011, 0.5) / 601 - 1)).toBeLessThan(0.01);
    expect(capacidadeDoHorizontalLMin(100, 0.011, 0)).toBe(0);
  });

  it('vertical: nunca abaixo de 75; cresce com a vazão; o horizontal nunca abaixo do mínimo pedido', () => {
    expect(dnDoVertical(0)).toBe(75);
    expect(capacidadeDoVerticalLMin(100)).toBeGreaterThan(capacidadeDoVerticalLMin(75));
    expect(dnDoVertical(capacidadeDoVerticalLMin(75) + 1)).toBe(100);
    expect(dnDoHorizontal(10, 0.011, 1, 100)).toBe(100);
  });
});

describe('E6.3 — o lançamento', () => {
  it('térreo: um vertical por bocal até −0,30, horizontal até a caixa de areia e a caixa até a saída — nada solto, tudo atende', () => {
    const m = casa();
    const p = planejarCondutores(m, hip);
    expect(p).toMatchObject({ motivo: null, fontes: 2, verticais: 2, horizontais: 3 });
    const depois = lancar(m);
    const cond = depois.trechos!.filter((t) => t.rotulo === ROTULO_DO_CONDUTOR_VERTICAL || t.rotulo === ROTULO_DO_CONDUTOR_HORIZONTAL);
    expect(cond).toHaveLength(5);
    expect(marcasDeVerificacao(depois, null, [], hip).filter((x) => x.disciplina === 'PLUVIAL')).toEqual([]);
    const v = verificarCondutores(depois, hip);
    expect(v.every((c) => c.atende)).toBe(true);
    // A caixa → saída leva as duas águas (115 + 115 L/min).
    const final = v.find((c) => !c.vertical && Math.round(c.vazaoLMin) === 230);
    expect(final).toBeDefined();
  });

  it('sobrado com o telhado no superior: o vertical atravessa a laje e continua no térreo', () => {
    const depois = lancar(casa({ doisAndares: true }));
    const [terreo, superior] = depois.levels.map((l) => l.id);
    const verticais = depois.trechos!.filter((t) => t.rotulo === ROTULO_DO_CONDUTOR_VERTICAL);
    // Dois bocais: um trecho no superior e um no térreo para cada um.
    expect([verticais.filter((t) => t.levelId === superior).length, verticais.filter((t) => t.levelId === terreo).length]).toEqual([2, 2]);
    expect(verticais.filter((t) => t.levelId === superior).every((t) => Math.min(t.cotaAMm, t.cotaBMm) === 0)).toBe(true);
    expect(verticais.filter((t) => t.levelId === terreo).every((t) => Math.max(t.cotaAMm, t.cotaBMm) === 2800 && Math.min(t.cotaAMm, t.cotaBMm) === -300)).toBe(true);
    expect(marcasDeVerificacao(depois, null, [], hip).filter((x) => x.disciplina === 'PLUVIAL')).toEqual([]);
  });

  it('sem caixa de areia vai direto à saída; sem saída, o aviso', () => {
    const direto = planejarCondutores(casa({ caixa: false }), hip);
    expect(direto.horizontais).toBe(2);
    expect(direto.comandos.filter((c) => c.type === 'AddTrecho' && (c as { rotulo: string }).rotulo === ROTULO_DO_CONDUTOR_HORIZONTAL).every((c) => (c as { b: { y: number } }).b.y === 12000)).toBe(true);
    expect(planejarCondutores(casa({ saida: false }), hip).avisos).toContain('sem a saída pluvial (sarjeta ou galeria): a caixa de areia fica sem destino');
  });

  it('os motivos: sem bocal, e sem destino', () => {
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(planejarCondutores(vazio, hip).motivo).toMatch(/^Lance as calhas/);
    expect(planejarCondutores(casa({ caixa: false, saida: false }), hip).motivo).toMatch(/^Coloque a caixa de areia/);
  });

  it('relançar troca os sugeridos; o bocal com condutor confirmado fica de fora', () => {
    const depois = lancar(casa());
    expect(planejarCondutores(depois, hip).apagados).toBe(5);
    const v = depois.trechos!.find((t) => t.rotulo === ROTULO_DO_CONDUTOR_VERTICAL)!;
    const confirmado = applyCommand(depois, { type: 'SetTrechoProps', trechoId: v.id, sugerido: false }).model;
    expect(planejarCondutores(confirmado, hip).fontes).toBe(1);
  });
});

describe('E6.3 — a verificação da rede desenhada', () => {
  it('vertical DN 50 e horizontal sem caimento: as duas marcas', () => {
    const m0 = casa();
    const l = m0.levels[0].id;
    const bocal = m0.terminais!.find((t) => t.tipoHidraulico === 'RALO_PLUVIAL')!;
    const m = applyBatch(m0, [
      { type: 'AddTrecho', levelId: l, disciplina: 'PLUVIAL', a: bocal.at, b: bocal.at, cotaAMm: bocal.cotaMm, cotaBMm: -300, bitolaMm: 50 },
      { type: 'AddTrecho', levelId: l, disciplina: 'PLUVIAL', a: bocal.at, b: point(-1000, 4000), cotaAMm: -300, cotaBMm: -300, bitolaMm: 100 },
    ] as Command[]).model;
    const tipos = marcasDeVerificacao(m, null, [], hip).filter((x) => x.disciplina === 'PLUVIAL').map((x) => [x.tipo, x.texto]);
    expect(tipos).toEqual(expect.arrayContaining([['CONDUTOR_INSUFICIENTE', 'condutor vertical DN 50 < 75'], ['CONDUTOR_DECLIVIDADE', 'i 0 % < 0,5 %']]));
  });
});
