/**
 * E4.3 — ENTRADA DE ÁGUA E ALIMENTADOR PREDIAL (29/09/2026): do hidrômetro à
 * torneira de boia, pelas paredes, subindo os pavimentos; DN pelo consumo
 * diário em 24 h; a pressão que chega à boia; e fora da rede de distribuição.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_ALIMENTACAO_PADRAO, ROTULO_DO_ALIMENTADOR, planejarAlimentador, trechosDoAlimentador } from '../utils/blueprintAlimentador';
import { HIPOTESES_RESERVATORIO_PADRAO } from '../utils/blueprintReservacao';
import { pressoesDoModelo } from '../utils/blueprintPressaoDaRede';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';
import { hipotesesHidroDaColuna } from '../hooks/useBlueprintHidro';
import { sobrado } from './fixtures/sobradoHidro';

const planejar = (m: BlueprintModel, hip = HIPOTESES_ALIMENTACAO_PADRAO) => planejarAlimentador(m, hip, HIPOTESES_RESERVATORIO_PADRAO, 3);
const chave = (levelId: string, p: { x: number; y: number }, c: number) => `${levelId}|${p.x},${p.y}|${c}`;

describe('E4.3 — sem o que ligar', () => {
  it('sem hidrômetro: diz onde pôr; sem caixa: diz que falta', () => {
    const m = sobrado(true, { cotaDaCaixaMm: 4500 });
    expect(planejar(m).motivo).toMatch(/^Coloque o hidrômetro/);
    const semCaixa = applyCommand({ ...m, terminais: m.terminais!.filter((t) => t.tipoHidraulico !== 'RESERVATORIO') }, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'AGUA_FRIA', tipo: 'H', at: point(6000, 1500), cotaMm: 600, tipoHidraulico: 'HIDROMETRO' }).model;
    expect(planejar(semCaixa).motivo).toMatch(/Não há caixa d'água/);
  });
});

describe('E4.3 — a rota e o dimensionamento', () => {
  const m = sobrado(true, { cotaDaCaixaMm: 4500, alimentador: true });
  const trechos = trechosDoAlimentador(m);

  it('um caminho contínuo, do hidrômetro (descendo à cota enterrada) à torneira de boia no superior', () => {
    expect(trechos.length).toBeGreaterThan(3);
    expect(trechos.every((t) => t.rotulo === ROTULO_DO_ALIMENTADOR && t.sugerido && t.bitolaMm === 25)).toBe(true);
    const h = m.terminais!.find((t) => t.tipoHidraulico === 'HIDROMETRO')!;
    expect(trechos[0]).toMatchObject({ a: h.at, cotaAMm: 600, b: h.at, cotaBMm: -300 });
    const boia = m.terminais!.find((t) => t.tipoHidraulico === 'TORNEIRA_BOIA')!;
    const ultimo = trechos[trechos.length - 1];
    expect(ultimo.levelId).toBe(boia.levelId);
    expect(ultimo.b).toEqual(boia.at);
    expect(ultimo.cotaBMm).toBe(boia.cotaMm);
    // Contínuo: cada trecho começa onde o anterior acabou (a laje é o encontro entre pavimentos).
    for (let i = 1; i < trechos.length; i++) {
      const [p, q] = [trechos[i - 1], trechos[i]];
      if (p.levelId === q.levelId) expect(chave(q.levelId, q.a, q.cotaAMm)).toBe(chave(p.levelId, p.b, p.cotaBMm));
      else expect([q.a, q.cotaAMm]).toEqual([p.b, 0]);
    }
  });

  it('DN pelo consumo em 24 h (800 L → 0,009 L/s): o mínimo, 25; e a pressão que chega à boia atende', () => {
    const p = planejar(sobrado(true, { cotaDaCaixaMm: 4500, alimentador: true }));
    expect(p.vazaoLs).toBeCloseTo(800 / 86400, 6);
    expect(p.dnMm).toBe(25);
    // Desnível do cavalete (0,60) à boia (2,90 + 4,50 + 0,80 − 0,10): 7,5 m.
    expect(p.desnivelM).toBeCloseTo(7.5, 2);
    expect(p.pressaoNaBoiaKpa).toBeCloseTo(100 - 7.5 * 9.80665 - p.perdaDistribuidaKpa - p.perdaLocalizadaKpa - p.perdaNoHidrometroKpa, 6);
    expect(p.atende).toBe(true);
  });

  it('rede pública fraca: não chega à caixa superior — o aviso manda usar inferior com recalque', () => {
    const p = planejar(m, { ...HIPOTESES_ALIMENTACAO_PADRAO, pressaoDaRedePublicaKpa: 50 });
    expect(p.atende).toBe(false);
    expect(p.avisos).toContain('A rede pública não sobe até a caixa superior com a pressão mínima na boia: use reservatório INFERIOR com recalque.');
  });

  it('com reservatório INFERIOR, o destino é ele', () => {
    const t = m.levels[0].id;
    const comInferior = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Cisterna', at: point(3500, 1500), cotaMm: 0, tipoHidraulico: 'RESERVATORIO', papelReservatorio: 'INFERIOR' }).model;
    const p = planejar(comInferior);
    expect(p.destinoInferior).toBe(true);
    expect(p.destinoId).toBe(comInferior.terminais![comInferior.terminais!.length - 1].id);
  });

  it('relançar apaga os sugeridos e refaz; confirmado, não relança por cima', () => {
    const p = planejar(m);
    expect(p.apagados).toBe(trechos.length);
    expect(p.comandos.filter((c) => c.type === 'DeleteTrecho')).toHaveLength(trechos.length);
    const confirmado = applyBatch(m, trechos.map((x): Command => ({ type: 'SetTrechoProps', trechoId: x.id, sugerido: false }))).model;
    const q = planejar(confirmado);
    expect(q.comandos).toEqual([]);
    expect(q.avisos.some((a) => /já tem \d+ trecho\(s\) confirmado/.test(a))).toBe(true);
  });

  it('o alimentador não é rede de distribuição, e não deixa ponta aberta', () => {
    const ids = new Set(trechos.map((t) => t.id));
    expect(pressoesDoModelo(m).flatMap((r) => r.trechos).some((t) => ids.has(t.trechoId))).toBe(false);
    expect(marcasDeVerificacao(m).filter((x) => x.tipo === 'PONTA_ABERTA')).toEqual([]);
  });
});

describe('E4.3 — premissas do estudo', () => {
  it('a coluna sem `alimentacao` completa com o padrão', () => {
    expect(hipotesesHidroDaColuna({}).alimentacao).toEqual(HIPOTESES_ALIMENTACAO_PADRAO);
    expect(hipotesesHidroDaColuna({ alimentacao: { pressaoDaRedePublicaKpa: 150 } }).alimentacao.pressaoDaRedePublicaKpa).toBe(150);
  });
});
