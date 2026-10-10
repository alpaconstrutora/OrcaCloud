/**
 * CLIMATIZAÇÃO — pendências C1 a C6 (10/10/2026):
 *  - C1 a linha do split com a condensadora em OUTRO pavimento: sobe pela
 *    prumada (sob a condensadora, ou num shaft perto dela) e relançar acha o que
 *    é do pavimento onde estiver;
 *  - C2 o VRF entre pavimentos: o tronco pela prumada e uma árvore por pavimento;
 *  - C3 o comprimento equivalente (curvas, derivadores e coletores);
 *  - C4 o coletor em 3 ou mais ramais;
 *  - C5 o DN do dreno pela vazão de condensado;
 *  - C6 o sifão do dreno por gravidade.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type ObjectId } from '../utils/blueprintKernel';
import { conexoesDerivadas } from '../utils/blueprintKernel/conexoes';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DA_LINHA_PADRAO, HIPOTESES_DO_VRF_PADRAO } from '../utils/blueprintClimatizacao';
import { materiaisDeClimatizacao } from '../utils/blueprintMateriaisClimatizacao';
import {
  conferenciaDaLinha,
  dnDoDrenoMm,
  drenosConferidos,
  drenosPorVazao,
  drenosTrechoATrecho,
  linhaExistente,
  linhasConferidas,
  planejarLinhasFrigorigenas,
  sistemasDoNivel,
  sugeridosDaLinha,
  verticeNoCaminho,
} from '../utils/blueprintLinhaFrigorigena';
import { analisarVrf, conferenciaDoVrf, planejarVrf, sistemasVrfDoNivel, sugeridosDoVrf, vrfDeOutrosPavimentos } from '../utils/blueprintVrf';
import { lancesDaPrumada, pontoDaPrumada } from '../utils/blueprintPrumadaClimatizacao';
import { gerarIfc } from '../utils/blueprintIfc';
import { tipoDoPontoDeClimatizacaoIfc } from '../utils/ifcParaKernel';

const hipLinha = HIPOTESES_DA_LINHA_PADRAO;
const hipVrf = HIPOTESES_DO_VRF_PADRAO;
const terminais = (m: BlueprintModel) => m.terminais ?? [];
const trechos = (m: BlueprintModel) => m.trechos ?? [];
const assinatura = (m: BlueprintModel) =>
  [
    ...trechos(m).map((x) => [x.levelId, x.disciplina, x.a.x, x.a.y, x.cotaAMm, x.b.x, x.b.y, x.cotaBMm, x.bitolaMm, x.bitolaSuccaoMm ?? ''].join(',')),
    ...terminais(m).filter((x) => x.sugerida).map((x) => [x.levelId, x.tipoHidraulico, x.at.x, x.at.y, x.cotaMm].join(',')),
  ].sort();

/** Três pavimentos de 2,80 m (Térreo, Andar, Cobertura), cada um com a caixa de 8 × 4 m. */
function predio() {
  let m = emptyModel();
  for (const [name, elevationMm] of [['Térreo', 0], ['Andar', 2800], ['Cobertura', 5600]] as const) m = applyCommand(m, { type: 'AddLevel', name, elevationMm, defaultHeightMm: 2800 }).model;
  const [t, a, c] = m.levels.map((l) => l.id);
  const caixa = (lv: ObjectId): Command[] =>
    [[0, 0, 8000, 0], [8000, 0, 8000, 4000], [8000, 4000, 0, 4000], [0, 4000, 0, 0]].map(([ax, ay, bx, by]) => ({ type: 'AddWall', levelId: lv, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command);
  m = applyBatch(m, [...caixa(t), ...caixa(a), ...caixa(c)]).model;
  return { m, t, a, c };
}
const evaporadora = (levelId: ObjectId, x: number, cap: number, nome = 'EV'): Command =>
  ({ type: 'AddTerminal', levelId, disciplina: 'FRIGORIGENA', tipo: nome, tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(x, 3815), cotaMm: 2200, capacidadeBtuH: cap }) as Command;
const ligar = (m: BlueprintModel, condId: ObjectId) =>
  applyBatch(m, terminais(m).filter((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL' && !x.condensadoraId).map((e) => ({ type: 'SetTerminalProps', terminalId: e.id, condensadoraId: condId }) as Command)).model;

/** C1: a evaporadora no Térreo; a condensadora do split na Cobertura (fora da parede oeste, numa base de 30 cm). */
function splitNaCobertura(comShaft = false) {
  const p = predio();
  let m = applyBatch(p.m, [
    evaporadora(p.t, 4000, 12000),
    { type: 'AddTerminal', levelId: p.c, disciplina: 'FRIGORIGENA', tipo: 'Condensadora', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(-700, 2000), cotaMm: 300 } as Command,
  ]).model;
  const cond = terminais(m).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
  m = ligar(m, cond.id);
  if (comShaft) m = applyCommand(m, { type: 'AddNucleo', levelId: p.t, tipo: 'SHAFT', ring: [point(1000, 1000), point(1600, 1000), point(1600, 1600), point(1000, 1600)], disciplina: 'MECANICA' } as Command).model;
  return { ...p, m, cond };
}

describe('C1 · a prumada da linha do split entre pavimentos', () => {
  it('os lances da prumada: partida até o teto, piso a teto no meio, piso até a chegada (e o inverso descendo)', () => {
    const { m, t, a, c } = predio();
    expect(lancesDaPrumada(m, { levelId: t, cotaMm: 2500 }, { levelId: c, cotaMm: 300 })).toEqual([
      { levelId: t, cotaAMm: 2500, cotaBMm: 2800 },
      { levelId: a, cotaAMm: 0, cotaBMm: 2800 },
      { levelId: c, cotaAMm: 0, cotaBMm: 300 },
    ]);
    expect(lancesDaPrumada(m, { levelId: c, cotaMm: 2500 }, { levelId: t, cotaMm: 2500 })).toEqual([
      { levelId: c, cotaAMm: 2500, cotaBMm: 0 },
      { levelId: a, cotaAMm: 2800, cotaBMm: 0 },
      { levelId: t, cotaAMm: 2800, cotaBMm: 2500 },
    ]);
    expect(lancesDaPrumada(m, { levelId: t, cotaMm: 2500 }, { levelId: t, cotaMm: 850 })).toEqual([{ levelId: t, cotaAMm: 2500, cotaBMm: 850 }]);
  });

  it('a linha sobe da evaporadora do Térreo à condensadora da Cobertura numa prumada sob ela: trecho nos três pavimentos, ligada de verdade, sem ponta aberta', () => {
    const { m, t, a, c } = splitNaCobertura();
    expect(sistemasDoNivel(m, t)).toHaveLength(1);
    const plano = planejarLinhasFrigorigenas(m, t, hipLinha);
    expect(plano.motivo).toBeNull();
    expect(plano.aCriar[0].avisos.some((x) => /Cobertura/.test(x) && /prumada na posição dela/.test(x))).toBe(true);
    const depois = applyBatch(m, plano.comandos).model;
    const linha = trechos(depois).filter((x) => x.disciplina === 'FRIGORIGENA');
    expect(new Set(linha.map((x) => x.levelId))).toEqual(new Set([t, a, c]));
    // No Andar, a prumada de piso a teto na posição da condensadora.
    expect(linha.filter((x) => x.levelId === a).map((x) => [x.a.x, x.a.y, x.cotaAMm, x.b.x, x.b.y, x.cotaBMm])).toEqual([[-700, 2000, 0, -700, 2000, 2800]]);
    const s = sistemasDoNivel(depois, t)[0];
    expect(linhaExistente(depois, s)).not.toBeNull();
    // O desnível é de MUNDO: (5600 + 300) − (0 + 2200).
    expect(linhasConferidas(depois, t, hipLinha)[0].desnivelM).toBeCloseTo(3.7, 6);
    expect(Object.fromEntries(conferenciaDaLinha(depois, t, hipLinha).map((x) => [x.codigo, x.estado]))).toMatchObject({ LINHA: 'OK', DRENO: 'OK' });
    const cx = conexoesDerivadas(depois);
    expect(cx.pontasAbertas.filter((p) => p.disciplina === 'FRIGORIGENA')).toEqual([]);
  });

  it('relançar no Térreo acha a linha nos outros pavimentos e recria o mesmo; o planejador da Cobertura não toca nela', () => {
    const { m, t, c } = splitNaCobertura();
    const m1 = applyBatch(m, planejarLinhasFrigorigenas(m, t, hipLinha).comandos).model;
    const sug = sugeridosDaLinha(m1, t);
    expect(sug.trechos).toHaveLength(trechos(m1).filter((x) => x.sugerido).length);
    const p2 = planejarLinhasFrigorigenas(m1, t, hipLinha);
    expect(p2.apagados).toBe(sug.trechos.length + sug.terminais.length);
    expect(assinatura(applyBatch(m1, p2.comandos).model)).toEqual(assinatura(m1));
    // A Cobertura não tem evaporadora: nada é dela, nada se apaga.
    expect(sugeridosDaLinha(m1, c)).toEqual({ trechos: [], terminais: [] });
    expect(planejarLinhasFrigorigenas(m1, c, hipLinha).comandos).toEqual([]);
  });

  it('com um shaft mecânico perto da condensadora a prumada corre por ele, e no pavimento dela a linha vai do shaft à peça', () => {
    const { m, t, a, c, cond } = splitNaCobertura(true);
    const ids = [t, a, c];
    expect(pontoDaPrumada(m, cond.at, ids, hipLinha.raioDoShaftMm)).toEqual({ at: { x: 1300, y: 1300 }, shaft: true });
    expect(pontoDaPrumada(m, cond.at, ids, 1000).shaft).toBe(false);
    const plano = planejarLinhasFrigorigenas(m, t, hipLinha);
    expect(plano.aCriar[0].avisos.some((x) => /pelo shaft/.test(x))).toBe(true);
    const depois = applyBatch(m, plano.comandos).model;
    expect(trechos(depois).filter((x) => x.disciplina === 'FRIGORIGENA' && x.levelId === a).map((x) => [x.a.x, x.a.y, x.cotaAMm, x.b.x, x.b.y, x.cotaBMm])).toEqual([[1300, 1300, 0, 1300, 1300, 2800]]);
    expect(trechos(depois).some((x) => x.disciplina === 'FRIGORIGENA' && x.levelId === c && x.cotaAMm === 300 + 0 && x.a.x === -700)).toBe(false);
    expect(linhaExistente(depois, sistemasDoNivel(depois, t)[0])).not.toBeNull();
    expect(conexoesDerivadas(depois).pontasAbertas.filter((p) => p.disciplina === 'FRIGORIGENA')).toEqual([]);
  });
});

/** C2: a condensadora VRF na Cobertura; duas evaporadoras no Térreo e duas no Andar. */
function vrfNaCobertura() {
  const p = predio();
  let m = applyBatch(p.m, [
    { type: 'AddTerminal', levelId: p.c, disciplina: 'FRIGORIGENA', tipo: 'VRF', tipoHidraulico: 'CONDENSADORA_VRF', at: point(-700, 2000), cotaMm: 300, capacidadeBtuH: 96000 } as Command,
    evaporadora(p.t, 2000, 24000, 'EV T1'),
    evaporadora(p.t, 6000, 24000, 'EV T2'),
    evaporadora(p.a, 2000, 24000, 'EV A1'),
    evaporadora(p.a, 6000, 24000, 'EV A2'),
  ]).model;
  const cond = terminais(m).find((x) => x.tipoHidraulico === 'CONDENSADORA_VRF')!;
  m = ligar(m, cond.id);
  return { ...p, m, cond };
}

describe('C2 · o VRF entre pavimentos', () => {
  it('o sistema é a condensadora e TODAS as evaporadoras; a árvore desce pela prumada e se abre em cada pavimento, com derivador em cada divisão', () => {
    const { m, t, a, c } = vrfNaCobertura();
    const [s] = sistemasVrfDoNivel(m, c);
    expect(s.evaporadoras).toHaveLength(4);
    const plano = planejarVrf(m, c, hipLinha);
    expect(plano.motivo).toBeNull();
    expect(plano.aCriar).toEqual([expect.objectContaining({ evaporadoras: 4, derivadores: 3, coletores: 0, outrosPavimentos: 2 })]);
    expect(plano.resumo[0]).toMatch(/em 3 pavimentos/);
    const depois = applyBatch(m, plano.comandos).model;
    expect(new Set(trechos(depois).map((x) => x.levelId))).toEqual(new Set([t, a, c]));
    const an = analisarVrf(depois, sistemasVrfDoNivel(depois, c)[0]);
    expect(an.naoAlcancadas).toEqual([]);
    expect(an.taxaPct).toBe(100);
    expect(an.derivacoes.every((d) => d.temDerivador && d.ramais === 2)).toBe(true);
    // A derivação da prumada no Andar leva o somatório dos dois pavimentos abaixo dela (96 mil): o tronco.
    expect(an.derivacoes.find((d) => d.levelId === a && d.at.x === -700)?.jusanteBtuH).toBe(96000);
    expect(an.trechos.every((x) => !x.abaixo)).toBe(true);
    expect(an.desnivelCondEvapM).toBeCloseTo(3.7, 6);
    expect(Object.fromEntries(conferenciaDoVrf(depois, c, hipVrf).map((x) => [x.codigo, x.estado]))).toEqual({ SISTEMA: 'OK', TAXA: 'OK', ALCANCE: 'OK', DERIVADORES: 'OK', DIAMETROS: 'OK', LIMITES: 'OK' });
    expect(conferenciaDoVrf(depois, c, hipVrf)[0].obtido).toMatch(/4 evaporadora\(s\) em 2 pavimentos/);
    expect(conexoesDerivadas(depois).pontasAbertas.filter((p) => p.disciplina === 'FRIGORIGENA')).toEqual([]);
  });

  it('relançar na Cobertura é idempotente; no pavimento das evaporadoras o painel diz de onde lançar e nada é apagado; a E5 faz só o dreno', () => {
    const { m, t, c } = vrfNaCobertura();
    const m1 = applyBatch(m, planejarVrf(m, c, hipLinha).comandos).model;
    const sug = sugeridosDoVrf(m1, c);
    expect(sug.trechos).toHaveLength(trechos(m1).length);
    expect(sug.terminais).toHaveLength(3);
    expect(assinatura(applyBatch(m1, planejarVrf(m1, c, hipLinha).comandos).model)).toEqual(assinatura(m1));
    expect(sugeridosDoVrf(m1, t)).toEqual({ trechos: [], terminais: [] });
    const noTerreo = planejarVrf(m1, t, hipLinha);
    expect(noTerreo.comandos).toEqual([]);
    expect(noTerreo.motivo).toMatch(/são do VRF CD-1 \(em Cobertura\) — lance a rede do pavimento da condensadora/);
    expect(vrfDeOutrosPavimentos(m1, t)).toEqual([{ nome: 'CD-1', pavimento: 'Cobertura' }]);
    // A E5 no Térreo: só os drenos, e relançá-la não leva o VRF.
    const e5 = planejarLinhasFrigorigenas(m1, t, hipLinha);
    expect(e5.aCriar.every((x) => !x.linha && x.dreno)).toBe(true);
    const comDreno = applyBatch(m1, e5.comandos).model;
    const deNovo = applyBatch(comDreno, planejarLinhasFrigorigenas(comDreno, t, hipLinha).comandos).model;
    expect(trechos(deNovo).filter((x) => x.disciplina === 'FRIGORIGENA')).toHaveLength(trechos(m1).length);
  });
});

describe('C3 · o comprimento equivalente', () => {
  it('soma ao real os metros de cada curva e de cada derivador do caminho até a mais distante; o limite equivalente é conferido', () => {
    const { m, c } = vrfNaCobertura();
    const depois = applyBatch(m, planejarVrf(m, c, hipLinha).comandos).model;
    const s = sistemasVrfDoNivel(depois, c)[0];
    const zero = { ...hipVrf, equivalenteCurvaM: 0, equivalenteDerivadorM: 0, equivalenteColetorM: 0 };
    const real = analisarVrf(depois, s, zero);
    expect(real.maisDistanteEquivalenteM).toBeCloseTo(real.maisDistanteM!, 9);
    // Só o derivador valendo 1 m: o caminho até a mais distante passa por DUAS divisões (a da prumada no Andar e a do Térreo).
    expect(analisarVrf(depois, s, { ...zero, equivalenteDerivadorM: 1 }).maisDistanteEquivalenteM! - real.maisDistanteM!).toBeCloseTo(2, 9);
    // Só a curva valendo 1 m: um número inteiro de curvas, ao menos as da subida, da parede e da descida à peça.
    const curvas = analisarVrf(depois, s, { ...zero, equivalenteCurvaM: 1 }).maisDistanteEquivalenteM! - real.maisDistanteM!;
    expect(Number.isInteger(Math.round(curvas * 1e6) / 1e6)).toBe(true);
    expect(curvas).toBeGreaterThanOrEqual(3);
    const padrao = analisarVrf(depois, s);
    const lim = conferenciaDoVrf(depois, c, { ...hipVrf, ateMaisDistanteEquivalenteMaxM: Math.floor(padrao.maisDistanteM!) + 0.1 }).find((x) => x.codigo === 'LIMITES')!;
    expect(padrao.maisDistanteEquivalenteM!).toBeGreaterThan(Math.floor(padrao.maisDistanteM!) + 0.1);
    expect(lim.estado).toBe('FALTA');
    expect(lim.obtido).toMatch(/equivalente/);
  });
});

describe('C4 · o coletor do VRF', () => {
  /** Sem paredes: a condensadora no meio e três evaporadoras em volta — a estrela tem 3 ramais. */
  function estrela() {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m0.levels[0].id;
    let m = applyBatch(m0, [
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'VRF', tipoHidraulico: 'CONDENSADORA_VRF', at: point(0, 0), cotaMm: 850, capacidadeBtuH: 72000 } as Command,
      ...[[3000, 0], [0, 3000], [-3000, 0]].map(([x, y]) => ({ type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(x, y), cotaMm: 2200, capacidadeBtuH: 24000 }) as Command),
    ]).model;
    m = ligar(m, terminais(m).find((x) => x.tipoHidraulico === 'CONDENSADORA_VRF')!.id);
    return { m: applyBatch(m, planejarVrf(m, t, hipLinha).comandos).model, t };
  }

  it('três ramais num ponto ganham o coletor (nome pelo número de ramais), sem tê por cima; no IFC sai como junção com o tipo', () => {
    const { m, t } = estrela();
    const col = terminais(m).filter((x) => x.tipoHidraulico === 'COLETOR_VRF');
    expect(col.map((x) => [x.tipo, x.at.x, x.at.y, x.cotaMm])).toEqual([['Coletor VRF de 3 ramais', 0, 0, 2500]]);
    expect(conexoesDerivadas(m).conexoes.filter((x) => x.disciplina === 'FRIGORIGENA' && x.tipo === 'TE')).toEqual([]);
    expect(conferenciaDoVrf(m, t, hipVrf).find((x) => x.codigo === 'DERIVADORES')?.estado).toBe('OK');
    const ifc = gerarIfc(m, { titulo: 'VRF', revisao: 1, hash: 'c'.repeat(64), data: new Date('2026-10-10T12:00:00Z') });
    expect(ifc).toMatch(/IFCPIPEFITTING\([^;]*'COLETOR_VRF[^;]*\.JUNCTION\.\)/);
  });

  it('um derivador "Y" onde saem três ramais é acusado: pede coletor', () => {
    const { m, t } = estrela();
    const col = terminais(m).find((x) => x.tipoHidraulico === 'COLETOR_VRF')!;
    const trocado = applyBatch(m, [
      { type: 'DeleteTerminal', terminalId: col.id } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'Derivador', tipoHidraulico: 'DERIVADOR_VRF', at: col.at, cotaMm: col.cotaMm, condensadoraId: col.condensadoraId } as Command,
    ]).model;
    expect(conferenciaDoVrf(trocado, t, hipVrf).find((x) => x.codigo === 'DERIVADORES')).toMatchObject({ estado: 'FALTA', obtido: '1 divisão(ões) de 3 ou mais ramais sem coletor' });
  });
});

/** C5/C6: um pavimento, uma evaporadora de 48.000 na parede norte e a condensadora do split fora da parede oeste. */
function splitTerreo(cap = 48000) {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m0.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(m0, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0), evaporadora(t, 3000, cap), { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'Condensadora', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(-700, 2000), cotaMm: 850 } as Command]).model;
  m = ligar(m, terminais(m).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!.id);
  return { m, t };
}

describe('C5 · o DN do dreno pela vazão de condensado', () => {
  it('a tabela, com o DN mínimo das premissas por cima', () => {
    expect(dnDoDrenoMm(5, { ...hipLinha, dnDrenoMm: 15 })).toBe(20);
    expect(dnDoDrenoMm(5, hipLinha)).toBe(25);
    expect(dnDoDrenoMm(48, hipLinha)).toBe(32);
    expect(dnDoDrenoMm(120, hipLinha)).toBe(40);
    expect(dnDoDrenoMm(400, hipLinha)).toBe(50);
  });

  it('o planejador dá ao dreno o DN da vazão da evaporadora (48.000 × 1 L/h por mil = 48 L/h → DN 32) e a conferência confere', () => {
    const { m, t } = splitTerreo();
    const hip = { ...hipLinha, condensadoLhPorKbtu: 1 };
    const depois = applyBatch(m, planejarLinhasFrigorigenas(m, t, hip).comandos).model;
    const dreno = trechos(depois).filter((x) => x.disciplina === 'DRENO_AC');
    expect(dreno.length).toBeGreaterThan(1);
    expect(new Set(dreno.map((x) => x.bitolaMm))).toEqual(new Set([32]));
    expect(conferenciaDaLinha(depois, t, hip).find((x) => x.codigo === 'DN_DRENO')).toMatchObject({ estado: 'OK' });
    // Com a premissa padrão (0,2 L/h por mil = 9,6 L/h) o DN mínimo de 25 basta.
    const padrao = applyBatch(m, planejarLinhasFrigorigenas(m, t, hipLinha).comandos).model;
    expect(new Set(trechos(padrao).filter((x) => x.disciplina === 'DRENO_AC').map((x) => x.bitolaMm))).toEqual(new Set([25]));
  });

  it('o dreno COMPARTILHADO soma a vazão de quem passa: o trecho comum pede mais que os ramais', () => {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m0.levels[0].id;
    const ev = (x: number): Command => ({ type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(x, 0), cotaMm: 2200, capacidadeBtuH: 60000 }) as Command;
    const dr = (a: [number, number, number], b: [number, number, number]): Command => ({ type: 'AddTrecho', levelId: t, disciplina: 'DRENO_AC', a: point(a[0], a[1]), b: point(b[0], b[1]), cotaAMm: a[2], cotaBMm: b[2], bitolaMm: 25 }) as Command;
    const m1 = applyBatch(m0, [
      ev(0),
      ev(2000),
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'Condensadora', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(1000, -2000), cotaMm: 850 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'DRENO_AC', tipo: 'Ponto de dreno', tipoHidraulico: 'PONTO_DRENO', at: point(1000, 3000), cotaMm: 0 } as Command,
      dr([0, 0, 2200], [1000, 0, 2180]),
      dr([2000, 0, 2200], [1000, 0, 2180]),
      dr([1000, 0, 2180], [1000, 3000, 0]),
    ]).model;
    // A conferência da linha só corre com sistema (evaporadora com condensadora).
    const m = ligar(m1, terminais(m1).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!.id);
    const hip = { ...hipLinha, condensadoLhPorKbtu: 1 };
    const v = drenosPorVazao(m, t, hip);
    expect(v.map((x) => [x.vazaoLh, x.pedeMm]).sort((a, b) => a[0] - b[0])).toEqual([[60, 32], [60, 32], [120, 40]]);
    expect(conferenciaDaLinha(m, t, hip).find((x) => x.codigo === 'DN_DRENO')).toMatchObject({ estado: 'FALTA', obtido: expect.stringMatching(/^3 trecho\(s\) abaixo do DN pedido/) });
  });
});

describe('C6 · o sifão do dreno', () => {
  it('o caminho ganha o vértice do sifão à distância pedida (no máximo na metade)', () => {
    expect(verticeNoCaminho([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }], 300)).toEqual({ pontos: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }], indice: 1 });
    expect(verticeNoCaminho([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 800 }], 300).indice).toBe(2);
    expect(verticeNoCaminho([{ x: 0, y: 0 }, { x: 400, y: 0 }], 300)).toEqual({ pontos: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }], indice: 1 });
    expect(verticeNoCaminho([{ x: 0, y: 0 }], 300).indice).toBe(-1);
  });

  it('o dreno por gravidade sai com o sifão SOBRE ele, a 300 mm da saída pelo caminho, sem ponta aberta; sem o sifão, a conferência avisa', () => {
    const { m, t } = splitTerreo();
    const plano = planejarLinhasFrigorigenas(m, t, hipLinha);
    expect(plano.aCriar[0].dreno).toMatchObject({ comBomba: false, comSifao: true });
    expect(plano.resumo[0]).toMatch(/por gravidade, com sifão/);
    const depois = applyBatch(m, plano.comandos).model;
    const sifoes = terminais(depois).filter((x) => x.tipoHidraulico === 'SIFAO_DRENO');
    expect(sifoes).toHaveLength(1);
    const s = sifoes[0];
    const ev = terminais(depois).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    // Sobre o dreno: duas pontas de trecho DRENO_AC no nó do sifão, e a cota entre a saída e o ponto.
    const pontas = trechos(depois).filter((x) => x.disciplina === 'DRENO_AC').flatMap((x) => [[x.a, x.cotaAMm], [x.b, x.cotaBMm]] as const).filter(([p, z]) => p.x === s.at.x && p.y === s.at.y && z === s.cotaMm);
    expect(pontas).toHaveLength(2);
    expect(s.cotaMm).toBeLessThan(ev.cotaMm);
    expect(s.sugerida).toBe(true);
    expect(conexoesDerivadas(depois).pontasAbertas.filter((p) => p.disciplina === 'DRENO_AC')).toEqual([]);
    for (const d of drenosTrechoATrecho(depois)) if (d.declividadePct != null) expect(d.declividadePct + 1e-9).toBeGreaterThanOrEqual(1);
    expect(drenosConferidos(depois, t)[0].comSifao).toBe(true);
    expect(conferenciaDaLinha(depois, t, hipLinha).find((x) => x.codigo === 'SIFAO')?.estado).toBe('OK');
    // Na lista de materiais o sifão é peça do DRENO, uma unidade.
    expect(materiaisDeClimatizacao(depois, HIPOTESES_CLIMATIZACAO_PADRAO).totais.filter((l) => /Sifão do dreno/.test(l.item))).toEqual([expect.objectContaining({ grupo: 'Dreno', quantidade: 1, unidade: 'un' })]);
    const sem = applyCommand(depois, { type: 'DeleteTerminal', terminalId: s.id }).model;
    expect(conferenciaDaLinha(sem, t, hipLinha).find((x) => x.codigo === 'SIFAO')).toMatchObject({ estado: 'AVISO', obtido: expect.stringMatching(/^sem sifão/) });
  });

  it('com bomba de dreno (recalque) não há sifão nem a cobrança dele', () => {
    const { m, t } = splitTerreo();
    // O ponto de dreno ACIMA da saída da evaporadora: a gravidade não chega.
    const alto = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'DRENO_AC', tipo: 'Ponto de dreno', tipoHidraulico: 'PONTO_DRENO', at: point(6000, 2000), cotaMm: 2600 } as Command).model;
    const plano = planejarLinhasFrigorigenas(alto, t, hipLinha);
    expect(plano.aCriar[0].dreno).toMatchObject({ comBomba: true, comSifao: false });
    const depois = applyBatch(alto, plano.comandos).model;
    expect(terminais(depois).filter((x) => x.tipoHidraulico === 'SIFAO_DRENO')).toEqual([]);
    expect(conferenciaDaLinha(depois, t, hipLinha).find((x) => x.codigo === 'SIFAO')?.estado).toBe('NAO_AVALIADO');
  });

  it('o IFC: o sifão sai como IfcWasteTerminal .WASTETRAP. e volta como SIFAO_DRENO', () => {
    expect(tipoDoPontoDeClimatizacaoIfc('IFCWASTETERMINAL', '.WASTETRAP.', null)).toBe('SIFAO_DRENO');
    expect(tipoDoPontoDeClimatizacaoIfc('IFCWASTETERMINAL', '.USERDEFINED.', null)).toBe('PONTO_DRENO');
    const { m, t } = splitTerreo();
    const depois = applyBatch(m, planejarLinhasFrigorigenas(m, t, hipLinha).comandos).model;
    const ifc = gerarIfc(depois, { titulo: 'Dreno', revisao: 1, hash: 'd'.repeat(64), data: new Date('2026-10-10T12:00:00Z') });
    expect(ifc).toMatch(/IFCWASTETERMINAL\([^;]*\.WASTETRAP\.\)/);
  });
});
