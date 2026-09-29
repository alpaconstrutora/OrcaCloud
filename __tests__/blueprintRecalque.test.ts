/**
 * E4.4 — RECALQUE (29/09/2026): com reservatório inferior, a bomba, a sucção e
 * o recalque até a boia do superior; Forchheimer, altura manométrica e a
 * potência com o motor comercial.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, conexoesDerivadas, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_RECALQUE_PADRAO, ROTULO_DA_SUCCAO, ROTULO_DO_RECALQUE, diametroDeForchheimerMm, planejarRecalque } from '../utils/blueprintRecalque';
import { HIPOTESES_RESERVATORIO_PADRAO } from '../utils/blueprintReservacao';
import { HIPOTESES_ALIMENTACAO_PADRAO, planejarAlimentador } from '../utils/blueprintAlimentador';
import { planejarPecasDaCaixa } from '../utils/blueprintPecasDaCaixa';
import { pressoesDoModelo } from '../utils/blueprintPressaoDaRede';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';
import { verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { HIPOTESES_HIDRO_PADRAO, memorialDeCalculoHidro } from '../utils/blueprintMemorialHidro';
import { sobrado } from './fixtures/sobradoHidro';

const planejar = (m: BlueprintModel) => planejarRecalque(m, HIPOTESES_RECALQUE_PADRAO, HIPOTESES_RESERVATORIO_PADRAO);

/** O sobrado com uma CISTERNA (inferior) lá fora, no térreo, e as peças das duas caixas. */
function comCisterna(): BlueprintModel {
  let m = sobrado(true, { cotaDaCaixaMm: 2800, volumeDaCaixaL: 500 });
  m = applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'AGUA_FRIA', tipo: 'Cisterna', at: point(6000, 3500), cotaMm: 0, tipoHidraulico: 'RESERVATORIO', papelReservatorio: 'INFERIOR', volumeL: 1000 }).model;
  for (const cx of m.terminais!.filter((t) => t.tipoHidraulico === 'RESERVATORIO')) m = applyBatch(m, planejarPecasDaCaixa(m, cx).comandos).model;
  return m;
}

describe('E4.4 — quando há recalque', () => {
  it('sem inferior: nada a lançar e nada a cobrar', () => {
    const p = planejar(sobrado(true));
    expect(p).toMatchObject({ inferiorId: null, motivo: null, comandos: [] });
  });

  it('inferior sem superior: diz que falta', () => {
    const m = comCisterna();
    const soInferior = { ...m, terminais: m.terminais!.filter((t) => !(t.tipoHidraulico === 'RESERVATORIO' && t.papelReservatorio !== 'INFERIOR')) };
    expect(planejar(soInferior).motivo).toMatch(/não há o superior/);
  });
});

describe('E4.4 — o dimensionamento', () => {
  it('Forchheimer: D = 1,3·√Q·X^¼', () => {
    // 800 L em 6 h = 0,037 L/s; X = 0,25.
    expect(diametroDeForchheimerMm(800 / 21600, 6)).toBeCloseTo(1.3 * Math.sqrt(800 / 21600 / 1000) * 0.25 ** 0.25 * 1000, 9);
  });

  it('o sobrado (2 quartos, 800 L/dia): recalque DN 20, sucção DN 25; Hman = desnível + perdas; motor de 0,25 cv', () => {
    const p = planejar(comCisterna());
    expect(p.vazaoLs).toBeCloseTo(800 / 21600, 9);
    expect(p.dnRecalqueMm).toBe(20);
    expect(p.dnSuccaoMm).toBe(25);
    // Do fundo da cisterna (0) à boia do superior (2,90 + 2,80 + 0,80 − 0,10 = 6,40 m).
    expect(p.desnivelGeometricoM).toBeCloseTo(6.4, 6);
    expect(p.alturaManometricaM).toBeCloseTo(p.desnivelGeometricoM + p.perdasMca, 9);
    expect(p.potenciaCv).toBeCloseTo((9.80665 * (p.vazaoLs / 1000) * 1000 * p.alturaManometricaM) / 0.5 / 735.5, 9);
    expect(p.motorCv).toBe(0.25);
  });
});

describe('E4.4 — o lançamento', () => {
  it('bomba ao lado da cisterna, sucção do fundo dela à bomba, recalque contínuo até a boia do superior', () => {
    const m = comCisterna();
    const depois = applyBatch(m, planejar(m).comandos).model;
    const bomba = depois.terminais!.find((t) => t.tipoHidraulico === 'BOMBA')!;
    // Do lado da cisterna voltado para o superior, a 600 + 600 mm do centro.
    const cisterna = depois.terminais!.find((t) => t.papelReservatorio === 'INFERIOR')!;
    const sup = depois.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO' && t.papelReservatorio !== 'INFERIOR')!;
    expect(Math.hypot(bomba.at.x - cisterna.at.x, bomba.at.y - cisterna.at.y)).toBeCloseTo(1200, -1);
    expect(Math.hypot(bomba.at.x - sup.at.x, bomba.at.y - sup.at.y)).toBeLessThan(Math.hypot(cisterna.at.x - sup.at.x, cisterna.at.y - sup.at.y));
    expect(bomba).toMatchObject({ cotaMm: 0, sugerida: true });
    const [succao] = depois.trechos!.filter((t) => t.rotulo === ROTULO_DA_SUCCAO);
    expect(succao).toMatchObject({ a: { x: 6000, y: 3500 }, b: bomba.at, bitolaMm: 25 });
    const recalque = depois.trechos!.filter((t) => t.rotulo === ROTULO_DO_RECALQUE);
    // Sobe na bomba até 2,20 m: 90° com a sucção — nenhuma conexão com aviso.
    expect(recalque[0]).toMatchObject({ a: bomba.at, b: bomba.at, cotaAMm: 0, cotaBMm: 2200 });
    // (Os nós da distribuição e do TQ do sobrado já têm avisos próprios — backlog; aqui, os do recalque.)
    const doRecalque = new Set(depois.trechos!.filter((t) => t.rotulo === ROTULO_DA_SUCCAO || t.rotulo === ROTULO_DO_RECALQUE).map((t) => t.id));
    expect(conexoesDerivadas(depois).conexoes.filter((c) => c.aviso && c.trechoIds.some((id) => doRecalque.has(id)))).toEqual([]);
    const superior = depois.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO' && t.papelReservatorio !== 'INFERIOR')!;
    const boia = depois.terminais!.find((t) => t.tipoHidraulico === 'TORNEIRA_BOIA' && t.levelId === superior.levelId)!;
    expect(recalque[recalque.length - 1]).toMatchObject({ b: boia.at, cotaBMm: boia.cotaMm, levelId: boia.levelId });
    // Nada de ponta aberta, e nada disso entra na distribuição.
    expect(marcasDeVerificacao(depois).filter((x) => x.tipo === 'PONTA_ABERTA')).toEqual([]);
    const ids = new Set(depois.trechos!.filter((t) => t.rotulo === ROTULO_DA_SUCCAO || t.rotulo === ROTULO_DO_RECALQUE).map((t) => t.id));
    expect(pressoesDoModelo(depois).flatMap((r) => r.trechos).some((t) => ids.has(t.trechoId))).toBe(false);
    // Relançar refaz os sugeridos e NÃO duplica a bomba.
    const de2 = planejar(depois);
    expect(de2.apagados).toBe(ids.size);
    expect(de2.comandos.some((c) => c.type === 'AddTerminal')).toBe(false);
  });

  it('o alimentador vai à cisterna (o inferior), não ao superior', () => {
    const m = comCisterna();
    const hidrometro = applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'AGUA_FRIA', tipo: 'H', at: point(8000, 1500), cotaMm: 600, tipoHidraulico: 'HIDROMETRO' }).model;
    const a = planejarAlimentador(hidrometro, HIPOTESES_ALIMENTACAO_PADRAO, HIPOTESES_RESERVATORIO_PADRAO, 3);
    expect(a.destinoInferior).toBe(true);
    expect(a.atende).toBe(true);
  });

  it('memorial e conferência: a seção Recalque e a pendência até lançar', () => {
    const m = comCisterna();
    const secoes = memorialDeCalculoHidro(m, HIPOTESES_HIDRO_PADRAO, { nomeDoEstudo: 'x', geradoEm: '2026-09-29T12:00:00Z' })
      .filter((b) => b.tipo === 'secao')
      .map((b) => (b as { texto: string }).texto);
    expect(secoes).toContain('Recalque');
    const resp = { nome: 'Ana', titulo: 'Eng', conselho: 'CREA' as const, registro: '1', artNumero: '2', artData: '2026-09-29' };
    const antes = verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, resp).verificacoes.find((v) => v.item === 'Recalque do inferior ao superior')!;
    expect(antes).toMatchObject({ atende: false, obtido: 'não lançado' });
    const depois = applyBatch(m, planejar(m).comandos as Command[]).model;
    const v = verificacoesHidro(depois, HIPOTESES_HIDRO_PADRAO, resp).verificacoes.find((x) => x.item === 'Recalque do inferior ao superior')!;
    expect(v.atende).toBe(true);
    expect(v.obtido).toMatch(/^bomba 0,25 cv, Hman \d+,\d mca$/);
    // Sem inferior, nem seção nem verificação.
    const semInferior = memorialDeCalculoHidro(sobrado(true), HIPOTESES_HIDRO_PADRAO, { nomeDoEstudo: 'x', geradoEm: '2026-09-29T12:00:00Z' });
    expect(semInferior.some((b) => b.tipo === 'secao' && b.texto === 'Recalque')).toBe(false);
  });
});
