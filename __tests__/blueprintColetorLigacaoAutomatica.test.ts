/**
 * A LIGAÇÃO À REDE PÚBLICA AUTOMÁTICA (13/10/2026) — `planejarColetorPredial`
 * sem ligação no desenho, a cota ESTIMADA e quem a lê (executivo, memorial).
 * Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, itens 3.1 e 3.2.
 *
 * O pedido: *"cliquei em esgoto automatico e recebi a seguinte mensagem: Coloque
 * a ligação à rede pública (no limite do lote, com a cota da rede) para lançar o
 * coletor predial."*
 *
 * A casa: `fixtures/casaEsgotoNoLote.ts`. Lançado o esgoto, a caixa automática
 * fica em (600, −1075); a frente do lote é y = −8000, então a ligação vai em
 * (600, −7700) — 30 cm para dentro da divisa.
 */
import { describe, expect, it } from 'vitest';
import { PARAMETRO_COTA_DA_REDE, applyBatch, applyCommand, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_ESGOTO_PADRAO, planejarEsgoto } from '../utils/blueprintEsgotoAutomatico';
import { MOTIVO_SEM_FRENTE, MOTIVO_TRATAMENTO_INDIVIDUAL, ROTULO_DO_COLETOR, cotaDaRedeEstimada, ligacaoDaRede, planejarColetorPredial } from '../utils/blueprintColetorPredial';
import { verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { HIPOTESES_HIDRO_PADRAO, memorialDeCalculoHidro } from '../utils/blueprintMemorialHidro';
import { casa } from './fixtures/casaEsgotoNoLote';

const RESP = { nome: 'Ana', titulo: 'Eng', conselho: 'CREA' as const, registro: '1', artNumero: '2', artData: '2026-09-29' };
const lancar = (m: BlueprintModel, comandos: Command[]) => applyBatch(m, comandos).model;
/** A casa com o esgoto já lançado (a caixa automática em (600, −1075)). */
const esgotada = (opcoes: Parameters<typeof casa>[0] = {}) => {
  const m = casa(opcoes);
  return lancar(m, planejarEsgoto(m).comandos);
};
const planejar = (m: BlueprintModel) => planejarColetorPredial(m, HIPOTESES_ESGOTO_PADRAO);
const ehLigacao = (c: Command) => c.type === 'AddTerminal' && c.tipoHidraulico === 'LIGACAO_ESGOTO';
const itemDoColetor = (m: BlueprintModel) => verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, RESP).verificacoes.find((v) => v.item === 'Coletor predial até a rede pública')!;
const textoDoMemorial = (m: BlueprintModel) =>
  memorialDeCalculoHidro(m, HIPOTESES_HIDRO_PADRAO, { nomeDoEstudo: 'Casa', geradoEm: '2026-10-13T00:00:00Z' })
    .map((b) => (b.tipo === 'tabela' ? b.linhas.flat().join(' ') : b.texto))
    .join('\n');

describe('sem ligação no desenho: ela é PROPOSTA na frente do lote', () => {
  it('a mensagem do pedido não volta: a ligação sugerida, na frente, com a cota estimada, e o coletor até ela', () => {
    const m = esgotada();
    const p = planejar(m);
    expect(p.motivo).toBeNull();
    expect(p.ligacaoId).toBeNull(); // ainda não existe
    expect(p.ligacaoProposta).toEqual({ levelId: m.levels[0].id, at: { x: 600, y: -7700 }, cotaMm: -1500, origem: 'PAPEL' });
    expect(p.cotaEstimada).toBe(true);
    expect(p.comandos[0]).toMatchObject({
      type: 'AddTerminal', tipoHidraulico: 'LIGACAO_ESGOTO', sugerida: true, at: { x: 600, y: -7700 }, cotaMm: -1500,
      parametros: { [PARAMETRO_COTA_DA_REDE]: 'estimada' },
    });
    expect(p.comandos.filter(ehLigacao)).toHaveLength(1);
    // O coletor sai da caixa automática e chega à ligação.
    expect(p.comprimentoM).toBeCloseTo(6.625, 6);
    const trechos = p.comandos.filter((c) => c.type === 'AddTrecho');
    expect(trechos[0]).toMatchObject({ a: { x: 600, y: -1075 }, rotulo: ROTULO_DO_COLETOR });
    expect(trechos[trechos.length - 1]).toMatchObject({ b: { x: 600, y: -7700 }, cotaBMm: -1500 });
  });

  it('lançado: a ligação existe, sugerida e estimada; relançar não põe outra', () => {
    const m = esgotada();
    const depois = lancar(m, planejar(m).comandos);
    const lr = ligacaoDaRede(depois)!;
    expect(lr).toMatchObject({ sugerida: true, at: { x: 600, y: -7700 }, cotaMm: -1500 });
    expect(cotaDaRedeEstimada(lr)).toBe(true);
    const de_novo = planejar(depois);
    expect(de_novo).toMatchObject({ ligacaoId: lr.id, ligacaoProposta: null, cotaEstimada: true, motivo: null });
    expect(de_novo.comandos.some(ehLigacao)).toBe(false);
  });

  it('a profundidade da rede é premissa', () => {
    const p = planejarColetorPredial(esgotada(), { ...HIPOTESES_ESGOTO_PADRAO, profundidadeDaRedeMm: 2000 });
    expect(p.ligacaoProposta?.cotaMm).toBe(-2000);
  });

  it('com topografia: a cota é a do terreno na frente menos a profundidade', () => {
    // Terreno 0,50 m abaixo do zero do desenho na frente.
    const p = planejarColetorPredial(esgotada(), HIPOTESES_ESGOTO_PADRAO, { cotaEmM: () => 99.5, cotaZeroM: 100 });
    expect(p.ligacaoProposta?.cotaMm).toBe(-2000);
  });

  it('sem frente do lote: pede a frente (a única pergunta que sobra)', () => {
    const p = planejar(esgotada({ frenteY: null }));
    expect(p).toMatchObject({ motivo: MOTIVO_SEM_FRENTE, comandos: [], ligacaoProposta: null });
  });

  it('com tratamento individual (sumidouro): não há rede pública, não propõe ligação', () => {
    const m = esgotada();
    const comSumidouro = applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'ESGOTO', tipo: 'Sumidouro', at: point(6000, 4000), cotaMm: -1000, tipoHidraulico: 'SUMIDOURO' }).model;
    expect(planejar(comSumidouro)).toMatchObject({ motivo: MOTIVO_TRATAMENTO_INDIVIDUAL, comandos: [] });
  });

  it('sem caixa de inspeção: manda lançar o esgoto antes', () => {
    expect(planejar(casa()).motivo).toMatch(/^Lance o esgoto primeiro/);
  });

  it('ligação posta à mão: não propõe outra, e a cota dela vale como confirmada', () => {
    const m = esgotada();
    const aMao = applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'ESGOTO', tipo: 'Ligação', at: point(600, -6000), cotaMm: -1200, tipoHidraulico: 'LIGACAO_ESGOTO' }).model;
    const p = planejar(aMao);
    expect(p.comandos.some(ehLigacao)).toBe(false);
    expect(p).toMatchObject({ ligacaoProposta: null, cotaEstimada: false });
  });
});

describe('a cota estimada até alguém decidir (kernel)', () => {
  const comLigacaoEstimada = () => {
    const m = esgotada();
    return lancar(m, planejar(m).comandos);
  };

  it('editar a cota é decidir a cota: passa a confirmada', () => {
    const m = comLigacaoEstimada();
    const lr = ligacaoDaRede(m)!;
    const editado = applyCommand(m, { type: 'SetTerminalProps', terminalId: lr.id, cotaMm: -1350 }).model;
    const depois = ligacaoDaRede(editado)!;
    expect(depois.parametros?.[PARAMETRO_COTA_DA_REDE]).toBe('confirmada');
    expect(planejar(editado).cotaEstimada).toBe(false);
    // O histórico não é mutado: o modelo de antes continua estimado.
    expect(cotaDaRedeEstimada(ligacaoDaRede(m)!)).toBe(true);
  });

  it('confirmar sem mudar a cota (o botão do painel): SetParametros', () => {
    const m = comLigacaoEstimada();
    const lr = ligacaoDaRede(m)!;
    const confirmado = applyCommand(m, { type: 'SetParametros', familia: 'terminal', id: lr.id, valores: { [PARAMETRO_COTA_DA_REDE]: 'confirmada' } }).model;
    expect(planejar(confirmado).cotaEstimada).toBe(false);
  });

  it('mexer na cota de uma peça qualquer não inventa o parâmetro', () => {
    const m = comLigacaoEstimada();
    const ci = m.terminais!.find((t) => t.tipoHidraulico === 'CAIXA_INSPECAO')!;
    const editado = applyCommand(m, { type: 'SetTerminalProps', terminalId: ci.id, cotaMm: ci.cotaMm - 100 }).model;
    expect(editado.terminais!.find((t) => t.id === ci.id)!.parametros).toBeUndefined();
  });
});

describe('quem lê a ligação: a conferência do executivo e o memorial', () => {
  it('ligação só proposta: o executivo diz que não foi lançada, e não emite', () => {
    expect(itemDoColetor(esgotada())).toMatchObject({ obtido: 'ligação à rede pública não lançada', atende: false });
    expect(textoDoMemorial(esgotada())).toMatch(/Sem ligação à rede pública no desenho/);
  });

  it('cota estimada: o executivo não emite e o memorial manda confirmar com a concessionária', () => {
    const m = esgotada();
    const lancada = lancar(m, planejar(m).comandos);
    expect(itemDoColetor(lancada)).toMatchObject({ obtido: 'cota da rede ESTIMADA — confirmar com a concessionária', atende: false });
    expect(textoDoMemorial(lancada)).toMatch(/Cota da rede pública ESTIMADA: 1,50 m abaixo do terreno/);
  });

  it('confirmada: o item volta a depender só do coletor e da gravidade', () => {
    const m = esgotada();
    const lancada = lancar(m, planejar(m).comandos);
    const lr = ligacaoDaRede(lancada)!;
    const confirmada = applyCommand(lancada, { type: 'SetParametros', familia: 'terminal', id: lr.id, valores: { [PARAMETRO_COTA_DA_REDE]: 'confirmada' } }).model;
    const item = itemDoColetor(confirmada);
    expect(item.obtido).not.toMatch(/ESTIMADA/);
    expect(item.atende).toBe(planejar(confirmada).porGravidade);
    expect(textoDoMemorial(confirmada)).not.toMatch(/ESTIMADA/);
  });
});
