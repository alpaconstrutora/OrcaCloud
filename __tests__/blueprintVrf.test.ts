/**
 * CLIMATIZAÇÃO E6 (05/10/2026): o VRF — uma condensadora com N evaporadoras,
 * a árvore de Steiner pelas paredes, o DERIVADOR em cada divisão pelo somatório
 * a jusante, o diâmetro de cada trecho pelo mesmo somatório, a taxa de
 * combinação e os limites de comprimento/desnível (hipóteses de catálogo); troca
 * da condensadora por comando; relançar idempotente; e a convivência com a E4
 * (split) e a E5 (linha e dreno) sem um apagar o que é do outro.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { conexoesDerivadas } from '../utils/blueprintKernel/conexoes';
import { HIPOTESES_DA_LINHA_PADRAO, HIPOTESES_DO_VRF_PADRAO, hipotesesClimatizacaoDaColuna } from '../utils/blueprintClimatizacao';
import {
  ROTULO_DA_LINHA_VRF,
  analisarVrf,
  comandosLigarAoVrf,
  comandosTrocarCondensadora,
  conferenciaDoVrf,
  derivadorDoVrf,
  diametrosDoVrf,
  evaporadorasSemSistema,
  planejarVrf,
  sistemasVrfDoNivel,
} from '../utils/blueprintVrf';
import { planejarLinhasFrigorigenas } from '../utils/blueprintLinhaFrigorigena';

const hipLinha = HIPOTESES_DA_LINHA_PADRAO;
const hipVrf = HIPOTESES_DO_VRF_PADRAO;
const terminais = (m: BlueprintModel) => m.terminais ?? [];
const trechos = (m: BlueprintModel) => m.trechos ?? [];

/**
 * Um corredor de 20 × 4 m; a condensadora VRF do lado de fora da parede oeste; quatro
 * evaporadoras de 24.000 na face da parede norte (x = 4, 8, 12 e 16 m) — a árvore tem
 * TRÊS níveis de derivação (96 → 72 → 48 → 24 mil a jusante).
 */
function corredor(capCond = 96000, comParedes = true) {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = comParedes ? applyBatch(a, [w(0, 0, 20000, 0), w(20000, 0, 20000, 4000), w(20000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model : a;
  m = applyBatch(m, [
    { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'VRF', tipoHidraulico: 'CONDENSADORA_VRF', at: point(-700, 2000), cotaMm: 850, capacidadeBtuH: capCond } as Command,
    ...[4000, 8000, 12000, 16000].map((x) => ({ type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: `EV ${x / 1000}`, tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(x, 3815), cotaMm: 2200, capacidadeBtuH: 24000 }) as Command),
  ]).model;
  const cond = terminais(m).find((x) => x.tipoHidraulico === 'CONDENSADORA_VRF')!;
  m = applyBatch(m, comandosLigarAoVrf(cond.id, evaporadorasSemSistema(m, t).map((e) => e.id))).model;
  return { m, t, cond };
}
const lancado = (capCond = 96000) => {
  const c = corredor(capCond);
  const plano = planejarVrf(c.m, c.t, hipLinha);
  return { ...c, plano, depois: applyBatch(c.m, plano.comandos).model };
};

describe('climatização E6 · tabelas, hipóteses e sistema', () => {
  it('diâmetros e derivador pelo somatório a jusante; hipóteses do VRF da coluna com faixa', () => {
    expect(diametrosDoVrf(24000)).toMatchObject({ liquidoMm: 10, succaoMm: 16 });
    expect(diametrosDoVrf(72000)).toMatchObject({ liquidoMm: 10, succaoMm: 19 });
    expect(diametrosDoVrf(96000)).toMatchObject({ liquidoMm: 13, succaoMm: 22 });
    expect(derivadorDoVrf(48000)).toBe('Derivador VRF até 22,4 kW');
    expect(derivadorDoVrf(96000)).toBe('Derivador VRF até 33 kW');
    expect(hipotesesClimatizacaoDaColuna({ vrf: { taxaMaxPct: 120, aposPrimeiraDerivacaoMaxM: 9999 } }).vrf).toEqual({ ...hipVrf, taxaMaxPct: 120 });
  });

  it('o sistema é a relação condensadoraId da E3: ligar as sem sistema e TROCAR a condensadora por comando', () => {
    const { m, t, cond } = corredor();
    const [s] = sistemasVrfDoNivel(m, t);
    expect(s.evaporadoras).toHaveLength(4);
    expect(s.nome).toBe('CD-1');
    expect(evaporadorasSemSistema(m, t)).toEqual([]);
    const outra = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'VRF 2', tipoHidraulico: 'CONDENSADORA_VRF', at: point(-700, 1000), cotaMm: 850, capacidadeBtuH: 120000 } as Command).model;
    const nova = terminais(outra).find((x) => x.tipoHidraulico === 'CONDENSADORA_VRF' && x.id !== cond.id)!;
    const trocado = applyBatch(outra, comandosTrocarCondensadora(outra, cond.id, nova.id)).model;
    const sistemas = sistemasVrfDoNivel(trocado, t);
    expect(sistemas.find((x) => x.condensadora.id === cond.id)!.evaporadoras).toEqual([]);
    expect(sistemas.find((x) => x.condensadora.id === nova.id)!.evaporadoras).toHaveLength(4);
  });
});

describe('climatização E6.2/E6.3 · a árvore do VRF', () => {
  it('três níveis de derivação: um derivador em cada divisão, pelo somatório a jusante; o diâmetro de cada trecho idem; nenhuma ponta aberta e nenhum tê por cima do derivador', () => {
    const { t, cond, plano, depois } = lancado();
    expect(plano.motivo).toBeNull();
    expect(plano.aCriar).toEqual([expect.objectContaining({ evaporadoras: 4, derivadores: 3 })]);
    const ders = terminais(depois).filter((x) => x.tipoHidraulico === 'DERIVADOR_VRF').sort((a, b) => a.at.x - b.at.x);
    expect(ders.map((d) => [d.at.x, d.at.y, d.cotaMm])).toEqual([[4000, 4000, 2500], [8000, 4000, 2500], [12000, 4000, 2500]]);
    expect(ders.map((d) => d.tipo)).toEqual(['Derivador VRF até 33 kW', 'Derivador VRF até 22,4 kW', 'Derivador VRF até 22,4 kW']);
    expect(ders.every((d) => d.condensadoraId === cond.id && d.sugerida)).toBe(true);
    // O diâmetro de cada lance ao longo da parede norte encolhe com o que fica a jusante.
    const naNorte = (x0: number, x1: number) => trechos(depois).find((tr) => tr.a.y === 4000 && tr.b.y === 4000 && Math.min(tr.a.x, tr.b.x) === x0 && Math.max(tr.a.x, tr.b.x) === x1)!;
    expect([naNorte(4000, 8000), naNorte(8000, 12000), naNorte(12000, 16000)].map((tr) => [tr.bitolaMm, tr.bitolaSuccaoMm])).toEqual([[10, 19], [10, 16], [10, 16]]);
    expect([naNorte(0, 4000)].map((tr) => [tr.bitolaMm, tr.bitolaSuccaoMm, tr.isolamentoMm])).toEqual([[13, 22, 13]]);
    expect(trechos(depois).filter((tr) => tr.disciplina === 'FRIGORIGENA').every((tr) => tr.rotulo === ROTULO_DA_LINHA_VRF && tr.sugerido)).toBe(true);
    const cx = conexoesDerivadas(depois);
    expect(cx.pontasAbertas.filter((p) => p.disciplina === 'FRIGORIGENA')).toEqual([]);
    expect(cx.conexoes.filter((c) => c.disciplina === 'FRIGORIGENA' && c.tipo === 'TE')).toEqual([]);
    // A análise da rede pronta: todas alcançadas, taxa 100 %, comprimentos à mão.
    const a = analisarVrf(depois, sistemasVrfDoNivel(depois, t)[0]);
    expect(a.naoAlcancadas).toEqual([]);
    expect(a.taxaPct).toBe(100);
    expect(a.derivacoes.every((d) => d.temDerivador)).toBe(true);
    expect(a.trechos.every((tr) => !tr.abaixo)).toBe(true);
    // Riser 1,65 + 0,70 até a parede + 2,00 até o canto + 16,0 na norte + 4 × 0,185 de ramal + 4 × 0,30 de descida.
    expect(a.comprimentoTotalM).toBeCloseTo(22.29, 2);
    expect(a.maisDistanteM).toBeCloseTo(20.835, 3);
    expect(a.aposPrimeiraDerivacaoM).toBeCloseTo(12.485, 3);
    expect(a.desnivelCondEvapM).toBeCloseTo(1.35, 3);
    const conf = Object.fromEntries(conferenciaDoVrf(depois, t, hipVrf).map((c) => [c.codigo, c.estado]));
    expect(conf).toEqual({ SISTEMA: 'OK', TAXA: 'OK', ALCANCE: 'OK', DERIVADORES: 'OK', DIAMETROS: 'OK', LIMITES: 'OK' });
  });

  it('relançar é idempotente; aceitar a rede faz o planejador parar ("já têm a rede")', () => {
    const { t, depois } = lancado();
    const p2 = planejarVrf(depois, t, hipLinha);
    expect(p2.apagados).toBe(trechos(depois).filter((x) => x.rotulo === ROTULO_DA_LINHA_VRF).length + 3);
    const m2 = applyBatch(depois, p2.comandos).model;
    const ass = (mm: BlueprintModel) => [
      ...trechos(mm).map((x) => [x.a.x, x.a.y, x.cotaAMm, x.b.x, x.b.y, x.cotaBMm, x.bitolaMm, x.bitolaSuccaoMm].join(',')),
      ...terminais(mm).filter((x) => x.tipoHidraulico === 'DERIVADOR_VRF').map((x) => `D${x.at.x},${x.at.y},${x.tipo}`),
    ].sort();
    expect(ass(m2)).toEqual(ass(depois));
    const aceito = applyBatch(m2, [
      ...trechos(m2).map((x) => ({ type: 'SetTrechoProps', trechoId: x.id, sugerido: false }) as Command),
      ...terminais(m2).filter((x) => x.sugerida).map((x) => ({ type: 'SetTerminalProps', terminalId: x.id, sugerida: false }) as Command),
    ]).model;
    const p3 = planejarVrf(aceito, t, hipLinha);
    expect(p3.jaLigados).toEqual(['CD-1']);
    expect(p3.motivo).toMatch(/já têm a rede confirmada/);
  });

  it('a conferência acusa: taxa fora da faixa, diâmetro abaixo do somatório, limite após a 1ª derivação, divisão sem derivador', () => {
    // Condensadora de 48.000 para 96.000 em evaporadoras: taxa 200 %.
    const meia = lancado(48000);
    expect(conferenciaDoVrf(meia.depois, meia.t, hipVrf).find((c) => c.codigo === 'TAXA')).toMatchObject({ estado: 'FALTA', obtido: expect.stringMatching(/CD-1 200 %/) });
    const { t, depois } = lancado();
    // O tronco (96 mil a jusante) afinado para 10/16: DIAMETROS FALTA.
    const tronco = trechos(depois).find((tr) => tr.a.y === 4000 && tr.b.y === 4000 && Math.min(tr.a.x, tr.b.x) === 0)!;
    const fino = applyCommand(depois, { type: 'SetTrechoProps', trechoId: tronco.id, bitolaMm: 10, bitolaSuccaoMm: 16 }).model;
    expect(conferenciaDoVrf(fino, t, hipVrf).find((c) => c.codigo === 'DIAMETROS')).toMatchObject({ estado: 'FALTA', obtido: '1 trecho(s) abaixo do pedido' });
    // Limite após a 1ª derivação em 10 m: 12,5 m estoura.
    const lim = conferenciaDoVrf(depois, t, { ...hipVrf, aposPrimeiraDerivacaoMaxM: 10 }).find((c) => c.codigo === 'LIMITES')!;
    expect(lim.estado).toBe('FALTA');
    expect(lim.obtido).toMatch(/após a 1ª derivação 12,5 m > 10 m/);
    // Sem o derivador do meio: a divisão fica acusada.
    const meio = terminais(depois).find((x) => x.tipoHidraulico === 'DERIVADOR_VRF' && x.at.x === 8000)!;
    const sem = applyCommand(depois, { type: 'DeleteTerminal', terminalId: meio.id }).model;
    expect(conferenciaDoVrf(sem, t, hipVrf).find((c) => c.codigo === 'DERIVADORES')).toMatchObject({ estado: 'FALTA', obtido: '1 divisão(ões) sem derivador' });
  });

  it('sem paredes a rede sai em estrela da condensadora, com um derivador na saída; sem evaporadora a condensadora é acusada', () => {
    const { m, t } = corredor(96000, false);
    const plano = planejarVrf(m, t, hipLinha);
    expect(plano.aCriar[0].avisos.some((x) => /estrela/.test(x))).toBe(true);
    const depois = applyBatch(m, plano.comandos).model;
    expect(terminais(depois).filter((x) => x.tipoHidraulico === 'DERIVADOR_VRF')).toHaveLength(1);
    expect(analisarVrf(depois, sistemasVrfDoNivel(depois, t)[0]).naoAlcancadas).toEqual([]);
    const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const so = applyCommand(a, { type: 'AddTerminal', levelId: a.levels[0].id, disciplina: 'FRIGORIGENA', tipo: 'VRF', tipoHidraulico: 'CONDENSADORA_VRF', at: point(0, 0), cotaMm: 850 } as Command).model;
    expect(conferenciaDoVrf(so, a.levels[0].id, hipVrf)[0]).toMatchObject({ codigo: 'SISTEMA', estado: 'FALTA' });
    expect(planejarVrf(so, a.levels[0].id, hipLinha).motivo).toMatch(/nenhuma evaporadora ligada/);
  });

  it('convivência: a E5 faz só o DRENO das evaporadoras do VRF e o relançar dela não apaga a árvore do VRF', () => {
    const { t, depois } = lancado();
    const nVrf = trechos(depois).filter((x) => x.rotulo === ROTULO_DA_LINHA_VRF).length;
    const e5 = planejarLinhasFrigorigenas(depois, t, hipLinha);
    expect(e5.aCriar).toHaveLength(4);
    expect(e5.aCriar.every((x) => x.linha === false && x.dreno != null)).toBe(true);
    expect(e5.comandos.filter((c) => c.type === 'AddTrecho' && (c as { disciplina: string }).disciplina === 'FRIGORIGENA')).toEqual([]);
    const comDreno = applyBatch(depois, e5.comandos).model;
    const deNovo = applyBatch(comDreno, planejarLinhasFrigorigenas(comDreno, t, hipLinha).comandos).model;
    expect(trechos(deNovo).filter((x) => x.rotulo === ROTULO_DA_LINHA_VRF)).toHaveLength(nVrf);
    // E o relançar do VRF não apaga o dreno da E5.
    const nDreno = trechos(deNovo).filter((x) => x.disciplina === 'DRENO_AC').length;
    const vrf2 = applyBatch(deNovo, planejarVrf(deNovo, t, hipLinha).comandos).model;
    expect(trechos(vrf2).filter((x) => x.disciplina === 'DRENO_AC')).toHaveLength(nDreno);
  });
});
