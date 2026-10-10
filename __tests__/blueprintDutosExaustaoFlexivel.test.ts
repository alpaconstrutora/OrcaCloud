/**
 * CLIMATIZAÇÃO — pendências C7 a C10 dos dutos (10/10/2026):
 *  - C7 o exaustor sem duto ganha o seu até a fachada, com a veneziana na face
 *    de fora (e a rede sai no IFC como ventilação, C14);
 *  - C8 o duto no forro contorna o pilar;
 *  - C9 damper e plenum no caminho somam a perda deles;
 *  - C10 o último ramal até o terminal sai em duto flexível (redondo).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { conexoesDerivadas } from '../utils/blueprintKernel/conexoes';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DO_AR_PADRAO, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { analisarRedesDeAr, comandosDeDimensionamento, conferenciaDaRedeDeAr, cotaDoDutoNoForro, descargaNaFachada, exaustoresDoNivel, planejarRedeDeAr, vazoesDosTerminais, ventilacaoDoNivel } from '../utils/blueprintRedeDeAr';
import { pegadasDePilares } from '../utils/blueprintObstaculosEstruturais';
import { pointInPolygon } from '../utils/blueprintKernel/geom';
import { gerarIfc, idsDaRedeDeExaustao } from '../utils/blueprintIfc';
import { materiaisDeClimatizacao } from '../utils/blueprintMateriaisClimatizacao';

const hip = HIPOTESES_DO_AR_PADRAO;
const hipClima: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };
const terminais = (m: BlueprintModel) => m.terminais ?? [];
const trechos = (m: BlueprintModel) => m.trechos ?? [];
const assinatura = (m: BlueprintModel) =>
  [
    ...trechos(m).map((x) => [x.a.x, x.a.y, x.cotaAMm, x.b.x, x.b.y, x.cotaBMm, x.bitolaMm, x.alturaDutoMm ?? '', x.material ?? ''].join(',')),
    ...terminais(m).filter((x) => x.sugerida).map((x) => [x.tipoHidraulico, x.at.x, x.at.y, x.cotaMm].join(',')),
  ].sort();

/** A sala 10 × 6 m da E7: a evaporadora dutada junto da parede oeste e quatro difusores de 300 m³/h (com `dutada`), e/ou um exaustor. */
function sala(opcoes: { dutada?: boolean; exaustor?: boolean; pilar?: boolean } = { dutada: true }) {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 10000, 0), w(10000, 0, 10000, 6000), w(10000, 6000, 0, 6000), w(0, 6000, 0, 0)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' }).model;
  const cmds: Command[] = [];
  if (opcoes.dutada) {
    cmds.push({ type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Dutada', tipoHidraulico: 'EVAPORADORA_DUTADA', at: point(300, 3000), cotaMm: 2600 } as Command);
    for (const [x, y] of [[3000, 1500], [3000, 4500], [7000, 1500], [7000, 4500]]) cmds.push({ type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', tipoHidraulico: 'DIFUSOR', at: point(x, y), cotaMm: 2600, vazaoM3h: 300 } as Command);
  }
  if (opcoes.exaustor) cmds.push({ type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Exaustor', tipoHidraulico: 'EXAUSTOR_AR', at: point(8000, 5000), cotaMm: 2300, vazaoM3h: 90 } as Command);
  if (opcoes.pilar) cmds.push({ type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(5000, 3000)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800 } as Command);
  m = applyBatch(m, cmds).model;
  return { m, t };
}
const vazoes = (m: BlueprintModel, t: string, h = hip) => vazoesDosTerminais(m, cargaTermicaDoNivel(m, hipClima, t), h);
const lancar = (m: BlueprintModel, t: string, h = hip) => applyBatch(m, planejarRedeDeAr(m, t, vazoes(m, t, h), h).comandos).model;

describe('C10 · o duto flexível do ramal do terminal', () => {
  it('o último ramal até cada difusor (1,5 m) e a descida saem flexíveis e redondos; o "ajustar seções" não tem o que mexer', () => {
    const { m, t } = sala();
    const depois = lancar(m, t);
    const flex = trechos(depois).filter((x) => x.material === 'DUTO_FLEXIVEL');
    // Quatro ramais de 1,5 m (o máximo) e as quatro descidas aos difusores.
    expect(flex).toHaveLength(8);
    expect(flex.every((x) => x.alturaDutoMm == null && x.sugerido)).toBe(true);
    expect(flex.filter((x) => x.a.x !== x.b.x || x.a.y !== x.b.y).map((x) => Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y))).toEqual([1500, 1500, 1500, 1500]);
    const redes = analisarRedesDeAr(depois, t, vazoes(depois, t), hip);
    expect(redes[0].terminais).toHaveLength(4);
    expect(comandosDeDimensionamento(redes)).toEqual([]);
    expect(conexoesDerivadas(depois).pontasAbertas.filter((p) => p.disciplina === 'MECANICA')).toEqual([]);
    // Na lista de materiais o flexível sai em metros.
    expect(materiaisDeClimatizacao(depois, HIPOTESES_CLIMATIZACAO_PADRAO).totais.some((l) => /Duto flexível/i.test(l.item) && l.unidade === 'm')).toBe(true);
  });

  it('com o máximo em 1 m o ramal se divide (rígido + 1 m flexível); com 0, nada é flexível', () => {
    const { m, t } = sala();
    const um = lancar(m, t, { ...hip, comprimentoFlexivelMaxMm: 1000 });
    const ramaisFlex = trechos(um).filter((x) => x.material === 'DUTO_FLEXIVEL' && (x.a.x !== x.b.x || x.a.y !== x.b.y));
    expect(ramaisFlex.map((x) => Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y))).toEqual([1000, 1000, 1000, 1000]);
    expect(trechos(um).filter((x) => x.material !== 'DUTO_FLEXIVEL' && x.a.x === 3000 && x.b.x === 3000 && Math.abs(x.b.y - x.a.y) === 500)).toHaveLength(2);
    const zero = lancar(m, t, { ...hip, comprimentoFlexivelMaxMm: 0 });
    expect(trechos(zero).filter((x) => x.material === 'DUTO_FLEXIVEL')).toEqual([]);
  });
});

describe('C8 · o duto contorna o pilar no forro', () => {
  it('o pilar no meio da espinha: nenhum trecho o atravessa, e a rede ainda alcança os quatro difusores', () => {
    const { m, t } = sala({ dutada: true, pilar: true });
    const depois = lancar(m, t);
    const pegada = pegadasDePilares(depois, t);
    expect(pegada).toHaveLength(1);
    // Amostra cada trecho em planta: nenhum ponto cai dentro do pilar.
    for (const x of trechos(depois)) {
      for (let i = 0; i <= 50; i++) {
        const p = { x: x.a.x + ((x.b.x - x.a.x) * i) / 50, y: x.a.y + ((x.b.y - x.a.y) * i) / 50 };
        expect(pointInPolygon(pegada[0], p)).toBe(false);
      }
    }
    expect(analisarRedesDeAr(depois, t, vazoes(depois, t), hip)[0].terminais).toHaveLength(4);
    expect(conexoesDerivadas(depois).pontasAbertas.filter((p) => p.disciplina === 'MECANICA')).toEqual([]);
    // Controle: sem o pilar, a espinha passa reto por x = 5000 em y = 3000.
    const reto = lancar(sala().m, t);
    expect(trechos(reto).some((x) => x.a.y === 3000 && x.b.y === 3000 && Math.min(x.a.x, x.b.x) < 5000 && Math.max(x.a.x, x.b.x) > 5000)).toBe(true);
  });
});

describe('C9 · a perda no damper e no plenum', () => {
  it('o damper num nó do caminho soma a perda dele aos terminais a jusante; o plenum no difusor, só ao difusor', () => {
    const { m, t } = sala();
    const depois = lancar(m, t);
    const cota = cotaDoDutoNoForro(depois, t, hip);
    const antes = analisarRedesDeAr(depois, t, vazoes(depois, t), hip)[0].terminais;
    const difusor = terminais(depois).find((x) => x.tipoHidraulico === 'DIFUSOR' && x.at.x === 7000 && x.at.y === 1500)!;
    const comPecas = applyBatch(depois, [
      // O damper no nó da espinha em x = 7000 (passam os dois difusores de x = 7000).
      { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Damper', tipoHidraulico: 'DAMPER', at: point(7000, 3000), cotaMm: cota } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Plenum', tipoHidraulico: 'CAIXA_PLENUM', at: difusor.at, cotaMm: difusor.cotaMm } as Command,
    ]).model;
    const depoisDasPecas = analisarRedesDeAr(comPecas, t, vazoes(comPecas, t), hip)[0].terminais;
    const delta = new Map(depoisDasPecas.map((x) => [x.terminalId, x.perdaPa - antes.find((y) => y.terminalId === x.terminalId)!.perdaPa]));
    const porPosicao = (x: number, y: number) => terminais(comPecas).find((z) => z.tipoHidraulico === 'DIFUSOR' && z.at.x === x && z.at.y === y)!.id;
    expect(delta.get(porPosicao(7000, 1500))).toBeCloseTo(hip.perdaDamperPa + hip.perdaPlenumPa, 9);
    expect(delta.get(porPosicao(7000, 4500))).toBeCloseTo(hip.perdaDamperPa, 9);
    expect(delta.get(porPosicao(3000, 1500))).toBeCloseTo(0, 9);
    expect(depoisDasPecas.find((x) => x.terminalId === porPosicao(7000, 1500))!.perdaEmPecasPa).toBe(hip.perdaDamperPa + hip.perdaPlenumPa);
  });
});

describe('C7 · a exaustão com duto até a fachada', () => {
  it('o ponto de descarga: a parede externa mais perto, na face de fora', () => {
    const { m, t } = sala({ exaustor: true });
    expect(descargaNaFachada(m, t, { x: 8000, y: 5000 })).toMatchObject({ at: { x: 8000, y: 6075 }, noEixo: { x: 8000, y: 6000 } });
    expect(descargaNaFachada(m, t, { x: 9500, y: 1000 })).toMatchObject({ at: { x: 10075, y: 1000 } });
  });

  it('o exaustor sem duto: sobe ao forro, corre até a fachada e termina na veneziana; a conferência passa de AVISO a OK; relançar é idempotente', () => {
    const { m, t } = sala({ exaustor: true });
    const v = vazoes(m, t);
    const conf = (mm: BlueprintModel) => conferenciaDaRedeDeAr(analisarRedesDeAr(mm, t, v, hip), ventilacaoDoNivel(mm, cargaTermicaDoNivel(mm, hipClima, t), hip), hip, exaustoresDoNivel(mm, t)).find((x) => x.codigo === 'EXAUSTAO_DUTO');
    expect(conf(m)).toMatchObject({ estado: 'AVISO', obtido: expect.stringMatching(/^1 exaustor\(es\) sem duto/) });
    const plano = planejarRedeDeAr(m, t, v, hip);
    expect(plano.motivo).toBeNull();
    expect(plano.aCriar).toEqual([expect.objectContaining({ exaustao: true, vazaoM3h: 90 })]);
    const depois = applyBatch(m, plano.comandos).model;
    const cota = cotaDoDutoNoForro(depois, t, hip);
    const ven = terminais(depois).filter((x) => x.tipoHidraulico === 'VENEZIANA_AR');
    expect(ven.map((x) => [x.at.x, x.at.y, x.cotaMm, x.sugerida])).toEqual([[8000, 6075, cota, true]]);
    expect(trechos(depois).map((x) => [x.a.x, x.a.y, x.cotaAMm, x.b.x, x.b.y, x.cotaBMm]).sort()).toEqual([[8000, 5000, 2300, 8000, 5000, cota], [8000, 5000, cota, 8000, 6075, cota]].sort());
    expect(exaustoresDoNivel(depois, t)).toEqual([expect.objectContaining({ chegaNaFachada: true })]);
    expect(conf(depois)?.estado).toBe('OK');
    expect(conexoesDerivadas(depois).pontasAbertas.filter((p) => p.disciplina === 'MECANICA')).toEqual([]);
    // Relançar: apaga o duto e a veneziana sugeridos e refaz o mesmo.
    const p2 = planejarRedeDeAr(depois, t, vazoes(depois, t), hip);
    expect(p2.apagados).toBe(3);
    expect(assinatura(applyBatch(depois, p2.comandos).model)).toEqual(assinatura(depois));
    // C14: a rede é só de exaustão — sai no IFC como ventilação.
    expect(idsDaRedeDeExaustao(depois).size).toBe(4);
    expect(gerarIfc(depois, { titulo: 'Exaustão', revisao: 1, hash: 'e'.repeat(64), data: new Date('2026-10-10T12:00:00Z') })).toMatch(/IFCDISTRIBUTIONSYSTEM\([^;]*\.VENTILATION\.\)/);
  });

  it('a exaustão convive com a rede da dutada: os dois no mesmo lançamento, e o exaustor já com duto confirmado não é tocado', () => {
    const { m, t } = sala({ dutada: true, exaustor: true });
    const plano = planejarRedeDeAr(m, t, vazoes(m, t), hip);
    expect(plano.aCriar.map((x) => !!x.exaustao).sort()).toEqual([false, true]);
    const depois = applyBatch(m, plano.comandos).model;
    const aceito = applyBatch(depois, [
      ...trechos(depois).map((x) => ({ type: 'SetTrechoProps', trechoId: x.id, sugerido: false }) as Command),
      ...terminais(depois).filter((x) => x.sugerida).map((x) => ({ type: 'SetTerminalProps', terminalId: x.id, sugerida: false }) as Command),
    ]).model;
    const p3 = planejarRedeDeAr(aceito, t, vazoes(aceito, t), hip);
    expect(p3.comandos).toEqual([]);
  });
});
