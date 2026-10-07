/**
 * CLIMATIZAÇÃO E7.2–E7.4 (05/10/2026): a rede de ar — perda de carga (prova
 * independente de um ramal), dimensionamento por velocidade, vazão declarada e
 * derivada do ambiente, traçado em espinha no forro, balanceamento, pressão
 * disponível, renovação e exaustão (banheiro sem janela sem exaustor = FALTA).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { conexoesDerivadas } from '../utils/blueprintKernel/conexoes';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DO_AR_PADRAO, hipotesesClimatizacaoDaColuna, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import {
  ROTULO_DA_REDE_DE_AR,
  analisarRedesDeAr,
  comandosDeDimensionamento,
  conferenciaDaRedeDeAr,
  cotaDoDutoNoForro,
  perdaPorAtritoPa,
  planejarRedeDeAr,
  secaoProposta,
  ventilacaoDoNivel,
  vazoesDosTerminais,
} from '../utils/blueprintRedeDeAr';

const hip = HIPOTESES_DO_AR_PADRAO;
const hipClima: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };
const terminais = (m: BlueprintModel) => m.terminais ?? [];
const trechos = (m: BlueprintModel) => m.trechos ?? [];

/** Uma sala 10 × 6 m; a evaporadora dutada junto da parede oeste; quatro difusores no forro. */
function sala(declarada = true) {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 10000, 0), w(10000, 0, 10000, 6000), w(10000, 6000, 0, 6000), w(0, 6000, 0, 0)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' }).model;
  m = applyBatch(m, [
    { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Dutada', tipoHidraulico: 'EVAPORADORA_DUTADA', at: point(300, 3000), cotaMm: 2600 } as Command,
    ...[
      [3000, 1500],
      [3000, 4500],
      [7000, 1500],
      [7000, 4500],
    ].map(([x, y]) => ({ type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', tipoHidraulico: 'DIFUSOR', at: point(x, y), cotaMm: 2600, ...(declarada ? { vazaoM3h: 300 } : {}) }) as Command),
  ]).model;
  return { m, t };
}
const contexto = (m: BlueprintModel, t: string) => {
  const carga = cargaTermicaDoNivel(m, hipClima, t);
  return { carga, vazoes: vazoesDosTerminais(m, carga, hip) };
};

describe('climatização E7.2 · física e dimensionamento', () => {
  it('prova independente de um ramal (Darcy + Swamee-Jain, calculada em Python fora do código): 500 m³/h em Ø200 e 1.200 m³/h em 400×250, 10 m de chapa', () => {
    expect(perdaPorAtritoPa(500, { bitolaMm: 200, alturaDutoMm: null }, 10, 0.15)).toBeCloseTo(13.415, 2);
    expect(perdaPorAtritoPa(1200, { bitolaMm: 400, alturaDutoMm: 250 }, 10, 0.15)).toBeCloseTo(4.653, 2);
  });

  it('por velocidade: 1.000 m³/h no tronco (6 m/s) pede 200×250; no ramal (4 m/s), 300×250; redondo, 500 m³/h de ramal pede Ø250', () => {
    expect(secaoProposta(1000, true, hip)).toEqual({ bitolaMm: 200, alturaDutoMm: 250 });
    expect(secaoProposta(1000, false, hip)).toEqual({ bitolaMm: 300, alturaDutoMm: 250 });
    expect(secaoProposta(500, false, { ...hip, secaoPadrao: 'REDONDA' })).toEqual({ bitolaMm: 250, alturaDutoMm: null });
    // Igual atrito: a seção escolhida perde no máximo o pedido por metro.
    const s = secaoProposta(1000, true, { ...hip, metodo: 'IGUAL_ATRITO', perdaPorAtritoPaM: 1 });
    expect(perdaPorAtritoPa(1000, s, 1, 0.15)).toBeLessThanOrEqual(1);
  });

  it('as hipóteses do ar vêm da coluna com faixa e os dois enums', () => {
    const h = hipotesesClimatizacaoDaColuna({ ar: { metodo: 'IGUAL_ATRITO', secaoPadrao: 'REDONDA', velocidadeTroncoMs: 99, alturaPadraoMm: 300 } }).ar;
    expect(h).toEqual({ ...hip, metodo: 'IGUAL_ATRITO', secaoPadrao: 'REDONDA', alturaPadraoMm: 300 });
  });
});

describe('climatização E7.4 · o traçado em espinha e a análise da rede', () => {
  it('a espinha passa pela dutada; cada difusor ganha ramal; a seção encolhe com a vazão a jusante; nenhuma ponta aberta; a perda crítica atende', () => {
    const { m, t } = sala();
    const { vazoes } = contexto(m, t);
    const plano = planejarRedeDeAr(m, t, vazoes, hip);
    expect(plano.motivo).toBeNull();
    expect(plano.aCriar).toEqual([expect.objectContaining({ terminais: 4, vazaoM3h: 1200, cotaMm: cotaDoDutoNoForro(m, t, hip) })]);
    const depois = applyBatch(m, plano.comandos).model;
    const cota = cotaDoDutoNoForro(m, t, hip);
    expect(cota).toBe(2800 - 100 - 125);
    const no = (x0: number, x1: number) => trechos(depois).find((x) => x.a.y === 3000 && x.b.y === 3000 && x.cotaAMm === cota && Math.min(x.a.x, x.b.x) === x0 && Math.max(x.a.x, x.b.x) === x1)!;
    expect([no(300, 3000), no(3000, 7000)].map((x) => [x.bitolaMm, x.alturaDutoMm])).toEqual([[250, 250], [150, 250]]);
    expect(trechos(depois).every((x) => x.rotulo === ROTULO_DA_REDE_DE_AR && x.sugerido && x.disciplina === 'MECANICA')).toBe(true);
    expect(conexoesDerivadas(depois).pontasAbertas.filter((p) => p.disciplina === 'MECANICA')).toEqual([]);
    const [rede] = analisarRedesDeAr(depois, t, vazoes, hip);
    expect(rede.terminais).toHaveLength(4);
    expect(rede.vazaoTotalM3h).toBe(1200);
    expect(rede.atende).toBe(true);
    // Balanceamento: o terminal do caminho crítico tem excesso zero; os mais perto absorvem o resto.
    expect(Math.min(...rede.terminais.map((x) => x.excessoPa))).toBe(0);
    expect(Math.max(...rede.terminais.map((x) => x.excessoPa))).toBeGreaterThan(0);
    // Pressão disponível de 5 Pa não dá: PRESSAO FALTA.
    const { carga } = contexto(depois, t);
    const conf = conferenciaDaRedeDeAr(analisarRedesDeAr(depois, t, vazoes, { ...hip, pressaoDisponivelPa: 5 }), ventilacaoDoNivel(depois, carga, hip), { ...hip, pressaoDisponivelPa: 5 });
    expect(conf.find((c) => c.codigo === 'PRESSAO')?.estado).toBe('FALTA');
    expect(conf.find((c) => c.codigo === 'VAZAO')?.estado).toBe('OK');
  });

  it('relançar é idempotente; aceitar faz o planejador dizer que tudo já está ligado', () => {
    const { m, t } = sala();
    const { vazoes } = contexto(m, t);
    const m1 = applyBatch(m, planejarRedeDeAr(m, t, vazoes, hip).comandos).model;
    const p2 = planejarRedeDeAr(m1, t, vazoes, hip);
    expect(p2.apagados).toBe(trechos(m1).length);
    const m2 = applyBatch(m1, p2.comandos).model;
    const ass = (mm: BlueprintModel) => trechos(mm).map((x) => [x.a.x, x.a.y, x.cotaAMm, x.b.x, x.b.y, x.cotaBMm, x.bitolaMm, x.alturaDutoMm].join(',')).sort();
    expect(ass(m2)).toEqual(ass(m1));
    const aceito = applyBatch(m2, trechos(m2).map((x) => ({ type: 'SetTrechoProps', trechoId: x.id, sugerido: false }) as Command)).model;
    expect(planejarRedeDeAr(aceito, t, vazoes, hip).motivo).toMatch(/já estão ligados por rede confirmada/);
  });

  it('dimensionamento: um trecho afinado à mão volta à proposta com "ajustar seções" (um lote)', () => {
    const { m, t } = sala();
    const { vazoes } = contexto(m, t);
    const m1 = applyBatch(m, planejarRedeDeAr(m, t, vazoes, hip).comandos).model;
    expect(comandosDeDimensionamento(analisarRedesDeAr(m1, t, vazoes, hip))).toEqual([]);
    const tronco = trechos(m1).find((x) => x.bitolaMm === 250 && x.alturaDutoMm === 250 && x.a.y === 3000 && x.b.y === 3000)!;
    const fino = applyCommand(m1, { type: 'SetTrechoProps', trechoId: tronco.id, bitolaMm: 100 }).model;
    const r = analisarRedesDeAr(fino, t, vazoes, hip);
    expect(r[0].trechos.find((x) => x.trechoId === tronco.id)!.velocidadeAlta).toBe(true);
    expect(comandosDeDimensionamento(r)).toEqual([{ type: 'SetTrechoProps', trechoId: tronco.id, bitolaMm: 250, alturaDutoMm: 250 }]);
  });

  it('sem vazão declarada, os difusores da Sala climatizada dividem a vazão de projeto (calor sensível ou renovação, o maior)', () => {
    const { m, t } = sala(false);
    const { carga, vazoes } = contexto(m, t);
    const salaCarga = carga.ambientes.find((a) => a.nome === 'Sala')!;
    const projeto = Math.max(Math.round((salaCarga.sensivelW / (1.2 * 1005 * 10)) * 3600), Math.round((2.5 * salaCarga.premissas.pessoas.valor + 0.3 * salaCarga.areaPisoM2) * 3.6));
    const difusores = terminais(m).filter((x) => x.tipoHidraulico === 'DIFUSOR');
    for (const d of difusores) expect(vazoes.get(d.id)).toMatchObject({ vazaoM3h: Math.round(projeto / 4), origem: 'DERIVADA' });
    expect(vazoes.get(terminais(m).find((x) => x.tipoHidraulico === 'EVAPORADORA_DUTADA')!.id)).toBeUndefined();
  });
});

describe('climatização E7.3 · exaustão e renovação', () => {
  function banheiro(comJanela: boolean, comExaustor: boolean) {
    const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = a.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    let m = applyBatch(a, [w(0, 0, 2000, 0), w(2000, 0, 2000, 2500), w(2000, 2500, 0, 2500), w(0, 2500, 0, 0)]).model;
    m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Banheiro' }).model;
    if (comJanela) m = applyCommand(m, { type: 'AddOpening', wallId: m.walls[0].id, kind: 'window', offsetMm: 500, widthMm: 600, heightMm: 600, sillMm: 1500 } as never).model;
    if (comExaustor) m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Exaustor', tipoHidraulico: 'EXAUSTOR_AR', at: point(1000, 1250), cotaMm: 2300 } as Command).model;
    const carga = cargaTermicaDoNivel(m, hipClima, t);
    return conferenciaDaRedeDeAr([], ventilacaoDoNivel(m, carga, hip), hip).find((c) => c.codigo === 'EXAUSTAO')!;
  }

  it('banheiro sem janela e sem exaustor = FALTA; com exaustor ou com janela, OK', () => {
    expect(banheiro(false, false)).toMatchObject({ estado: 'FALTA', obtido: expect.stringMatching(/Banheiro sem janela: exige exaustão mecânica \(90 m³\/h\)/) });
    expect(banheiro(false, true).estado).toBe('OK');
    expect(banheiro(true, false).estado).toBe('OK');
  });

  it('sem rede de dutos a conferência não inventa: REDE fica "não avaliado"', () => {
    const { m, t } = sala();
    const carga = cargaTermicaDoNivel(m, hipClima, t);
    const conf = conferenciaDaRedeDeAr(analisarRedesDeAr(m, t, new Map(), hip), ventilacaoDoNivel(m, carga, hip), hip);
    expect(conf.find((c) => c.codigo === 'REDE')?.estado).toBe('NAO_AVALIADO');
  });
});
