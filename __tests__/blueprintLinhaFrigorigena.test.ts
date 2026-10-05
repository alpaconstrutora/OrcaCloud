/**
 * CLIMATIZAÇÃO E5 (05/10/2026): a LINHA FRIGORÍGENA da evaporadora à
 * condensadora pela parede, dimensionada pela capacidade (faixa de fabricante —
 * hipótese), o DRENO por gravidade (ou com bomba quando o descarte fica alto),
 * tudo ligado nos nós exatos das peças; a conferência diz comprimento, desnível,
 * diâmetros, isolamento, gás e curvas; relançar é idempotente.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { conexoesDerivadas } from '../utils/blueprintKernel/conexoes';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DA_LINHA_PADRAO, HIPOTESES_DE_SELECAO_PADRAO, hipotesesClimatizacaoDaColuna, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo, selecaoDoNivel } from '../utils/blueprintSelecaoClimatizacao';
import { planejarEquipamentosSplit } from '../utils/blueprintPosicaoSplit';
import { conferenciaDaLinha, drenosConferidos, drenosTrechoATrecho, faixaDaLinha, linhaExistente, linhasConferidas, planejarLinhasFrigorigenas, raioMinimoDaCurvaMm, sistemasDoNivel } from '../utils/blueprintLinhaFrigorigena';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';

const catalogo = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const hipClima: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };
const hipLinha = HIPOTESES_DA_LINHA_PADRAO;

/** Sala 4 × 4 (porta na divisa, janela ao sul) + Cozinha, com o split já lançado pela E4. */
function casaComSplit() {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))!;
  const coz = m.spaces.find((s) => s.id !== sala.id)!;
  const divisa = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
  const sul = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha' },
    { type: 'AddOpening', wallId: divisa.id, kind: 'door', offsetMm: 1500, widthMm: 800, heightMm: 2100, sillMm: 0 } as never,
    { type: 'AddOpening', wallId: sul.id, kind: 'window', offsetMm: 1000, widthMm: 2000, heightMm: 1000, sillMm: 1000 } as never,
  ]).model;
  const carga = cargaTermicaDoNivel(m, hipClima, t);
  const plano = planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, HIPOTESES_DE_SELECAO_PADRAO, catalogo), carga, HIPOTESES_DE_SELECAO_PADRAO);
  m = applyBatch(m, plano.comandos).model;
  return { m, t };
}
const terminais = (m: BlueprintModel) => m.terminais ?? [];
const trechos = (m: BlueprintModel) => m.trechos ?? [];

describe('climatização E5 · faixas e hipóteses', () => {
  it('a faixa pela capacidade: 12.000 → 6/10 mm · 15 m; 48.000 → 10/19 mm · 50 m; acima da tabela cai na última', () => {
    expect(faixaDaLinha(12000)).toMatchObject({ liquidoMm: 6, succaoMm: 10, comprimentoMaxM: 15 });
    expect(faixaDaLinha(48000)).toMatchObject({ liquidoMm: 10, succaoMm: 19, comprimentoMaxM: 50 });
    expect(faixaDaLinha(90000)).toBe(faixaDaLinha(60000));
    expect(faixaDaLinha(null).ateBtuH).toBe(12000);
  });
  it('as hipóteses da linha vêm da coluna com faixa e padrão', () => {
    const h = hipotesesClimatizacaoDaColuna({ linha: { cotaDaLinhaMm: 2300, declividadeDrenoPct: 99, dnDrenoMm: 32 } }).linha;
    expect(h).toEqual({ ...HIPOTESES_DA_LINHA_PADRAO, cotaDaLinhaMm: 2300, dnDrenoMm: 32 });
  });
});

describe('climatização E5.1/E5.2/E5.4 · linha e dreno do split lançado', () => {
  it('a linha liga a evaporadora à condensadora pelas paredes, na cota da linha, com Ø e isolamento da faixa; o dreno chega a um ponto novo na fachada; nenhuma ponta aberta', () => {
    const { m, t } = casaComSplit();
    const sistemas = sistemasDoNivel(m, t);
    expect(sistemas).toHaveLength(1);
    expect(linhaExistente(m, sistemas[0])).toBeNull();
    const plano = planejarLinhasFrigorigenas(m, t, hipLinha);
    expect(plano.motivo).toBeNull();
    expect(plano.aCriar).toHaveLength(1);
    const depois = applyBatch(m, plano.comandos).model;
    const linha = trechos(depois).filter((x) => x.disciplina === 'FRIGORIGENA');
    const dreno = trechos(depois).filter((x) => x.disciplina === 'DRENO_AC');
    expect(linha.length).toBeGreaterThanOrEqual(3);
    expect(dreno.length).toBeGreaterThanOrEqual(2);
    // 48.000 BTU/h: líquido 10, sucção 19, isolamento 13 — em todos os trechos da linha.
    const cap = sistemas[0].evaporadora.capacidadeBtuH!;
    const f = faixaDaLinha(cap);
    expect(linha.every((x) => x.bitolaMm === f.liquidoMm && x.bitolaSuccaoMm === f.succaoMm && x.isolamentoMm === (cap <= 24000 ? 9 : 13) && x.sugerido)).toBe(true);
    // A linha corre na cota da linha (2500) e toca as cotas das duas peças.
    const cotas = new Set(linha.flatMap((x) => [x.cotaAMm, x.cotaBMm]));
    expect(cotas.has(2500)).toBe(true);
    expect(cotas.has(sistemas[0].evaporadora.cotaMm)).toBe(true);
    expect(cotas.has(sistemas[0].condensadora.cotaMm)).toBe(true);
    // Ligada de verdade: há caminho na rede entre os nós das peças.
    const existente = linhaExistente(depois, sistemasDoNivel(depois, t)[0]);
    expect(existente).not.toBeNull();
    expect(existente!.sugerida).toBe(true);
    expect(plano.aCriar[0].comprimentoMm).toBe(Math.round(existente!.mm));
    // Nenhuma ponta aberta na linha nem no dreno: a evaporadora conta como peça no nó do dreno.
    const cx = conexoesDerivadas(depois);
    expect(cx.pontasAbertas.filter((p) => p.disciplina === 'FRIGORIGENA' || p.disciplina === 'DRENO_AC')).toEqual([]);
    // O dreno: ponto novo na fachada (cota 0), por gravidade, com ≥ 1 % em todo lance em planta.
    expect(plano.aCriar[0].dreno).toMatchObject({ destino: 'PONTO_NOVO_NA_FACHADA', comBomba: false });
    expect(terminais(depois).some((x) => x.tipoHidraulico === 'PONTO_DRENO' && x.sugerida && x.cotaMm === 0)).toBe(true);
    for (const d of drenosTrechoATrecho(depois)) if (d.declividadePct != null) expect(d.declividadePct + 1e-9).toBeGreaterThanOrEqual(1);
    expect(drenosConferidos(depois, t)).toEqual([{ evaporadoraId: sistemas[0].evaporadora.id, nome: sistemas[0].evaporadora.tipo, chega: true, comBomba: false }]);
    // E a verificação não acusa declividade baixa nem pilar.
    const marcas = marcasDeVerificacao(depois, t);
    expect(marcas.filter((x) => x.disciplina === 'DRENO_AC' || x.disciplina === 'FRIGORIGENA')).toEqual([]);
  });

  it('a conferência: LINHA/LIMITES/DIAMETROS/DRENO ok e o gás além da pré-carga; sem linha, FALTA', () => {
    const { m, t } = casaComSplit();
    const antes = conferenciaDaLinha(m, t, hipLinha);
    expect(antes.find((c) => c.codigo === 'LINHA')).toMatchObject({ estado: 'FALTA' });
    expect(antes.find((c) => c.codigo === 'DRENO')).toMatchObject({ estado: 'FALTA' });
    const depois = applyBatch(m, planejarLinhasFrigorigenas(m, t, hipLinha).comandos).model;
    const c = conferenciaDaLinha(depois, t, hipLinha);
    const por = Object.fromEntries(c.map((x) => [x.codigo, x.estado]));
    expect(por).toMatchObject({ LINHA: 'OK', LIMITES: 'OK', DIAMETROS: 'OK', DRENO: 'OK' });
    const l = linhasConferidas(depois, t, hipLinha)[0];
    expect(l.comprimentoM).toBeGreaterThan(1);
    expect(l.comprimentoM!).toBeLessThan(l.faixa.comprimentoMaxM);
    expect(l.gasAdicionalG).toBe(Math.round(Math.max(0, l.comprimentoM! - hipLinha.preCargaM) * l.faixa.gasAdicionalGPorM));
    expect(l.curvas).toBeGreaterThanOrEqual(1);
    // O raio mínimo é o do MAIOR diâmetro da linha (a sucção da faixa): 10 → 40, 13 → 50, 19 → 80.
    expect(l.raioMinimoMm).toBe(raioMinimoDaCurvaMm(l.faixa.succaoMm));
    expect(c.find((x) => x.codigo === 'CURVAS')?.obtido).toMatch(new RegExp(`raio mínimo .*${l.raioMinimoMm} mm`));
  });

  it('relançar é idempotente (apaga as sugestões e recria o mesmo); aceitar a linha fixa e o planejador não mexe mais', () => {
    const { m, t } = casaComSplit();
    const p1 = planejarLinhasFrigorigenas(m, t, hipLinha);
    const m1 = applyBatch(m, p1.comandos).model;
    const p2 = planejarLinhasFrigorigenas(m1, t, hipLinha);
    expect(p2.apagados).toBe(trechos(m1).filter((x) => x.sugerido && (x.disciplina === 'FRIGORIGENA' || x.disciplina === 'DRENO_AC')).length + 1); // + o ponto de dreno sugerido
    const m2 = applyBatch(m1, p2.comandos).model;
    const assinatura = (mm: BlueprintModel) => trechos(mm).map((x) => [x.disciplina, x.a.x, x.a.y, x.cotaAMm, x.b.x, x.b.y, x.cotaBMm].join(',')).sort();
    expect(assinatura(m2)).toEqual(assinatura(m1));
    const aceito = applyBatch(m2, trechos(m2).filter((x) => x.disciplina === 'FRIGORIGENA').map((x) => ({ type: 'SetTrechoProps', trechoId: x.id, sugerido: false }) as Command)).model;
    const p3 = planejarLinhasFrigorigenas(aceito, t, hipLinha);
    expect(p3.jaLigados).toHaveLength(1);
    expect(p3.aCriar).toHaveLength(0);
    expect(p3.motivo).toMatch(/já têm linha confirmada/);
  });

  it('descarte ALTO: um ponto de dreno declarado a 2,50 m ganha bomba de dreno e o recalque não cobra declividade', () => {
    const { m, t } = casaComSplit();
    const evap = terminais(m).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    const alto = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'DRENO_AC', tipo: 'Ponto de dreno', tipoHidraulico: 'PONTO_DRENO', at: point(evap.at.x + 1500, evap.at.y), cotaMm: 2500 } as Command).model;
    const plano = planejarLinhasFrigorigenas(alto, t, hipLinha);
    expect(plano.aCriar[0].dreno).toMatchObject({ destino: 'PONTO_EXISTENTE', comBomba: true });
    const depois = applyBatch(alto, plano.comandos).model;
    expect(terminais(depois).some((x) => x.tipoHidraulico === 'BOMBA_DRENO' && x.sugerida)).toBe(true);
    expect(drenosConferidos(depois, t)[0]).toMatchObject({ chega: true, comBomba: true });
    expect(drenosTrechoATrecho(depois).every((d) => d.declividadePct == null)).toBe(true);
    expect(marcasDeVerificacao(depois, t).filter((x) => x.tipo === 'DECLIVIDADE_BAIXA')).toEqual([]);
    // Sem bomba, um dreno quase plano é acusado.
    const plano2 = applyBatch(m, [{ type: 'AddTrecho', levelId: t, disciplina: 'DRENO_AC', a: evap.at, b: point(evap.at.x + 2000, evap.at.y), cotaAMm: evap.cotaMm, cotaBMm: evap.cotaMm - 5, bitolaMm: 25 } as Command]).model;
    expect(marcasDeVerificacao(plano2, t).filter((x) => x.tipo === 'DECLIVIDADE_BAIXA' && x.disciplina === 'DRENO_AC')).toHaveLength(1);
  });

  it('linha longa demais para a faixa: a condensadora a 30 m de um 9.000 vira FALTA em LIMITES com o motivo', () => {
    const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = a.levels[0].id;
    let m = applyBatch(a, [
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV 9k', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(0, 0), cotaMm: 2200, capacidadeBtuH: 9000 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'CD 9k', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(30000, 0), cotaMm: 350, capacidadeBtuH: 9000 } as Command,
    ]).model;
    const [e, c] = terminais(m);
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: e.id, condensadoraId: c.id }).model;
    const plano = planejarLinhasFrigorigenas(m, t, hipLinha);
    expect(plano.aCriar[0].avisos.some((x) => /sem parede/.test(x))).toBe(true);
    const depois = applyBatch(m, plano.comandos).model;
    const lim = conferenciaDaLinha(depois, t, hipLinha).find((x) => x.codigo === 'LIMITES')!;
    expect(lim.estado).toBe('FALTA');
    expect(lim.obtido).toMatch(/acima do comprimento/);
    expect(linhasConferidas(depois, t, hipLinha)[0].pendencias.some((p) => /acima do máximo de 15 m/.test(p))).toBe(true);
  });
});
