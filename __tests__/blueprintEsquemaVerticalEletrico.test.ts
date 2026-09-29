/**
 * O ESQUEMA VERTICAL ELÉTRICO (E4.5 do roadmap elétrico, 29/09/2026).
 *
 * Sobrado com dois quadros: QGBT no térreo (entrada) alimenta o QD do
 * superior; uma prumada de eletroduto Ø32 sobe pelo mesmo (x, y) nos dois
 * pavimentos. A folha entra no conjunto só quando há o que cortar.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import { desenharEsquemaVerticalEletrico, linhasDaLegendaEletrica, prumadasEletricas, temEsquemaVerticalEletrico } from '../utils/blueprintEsquemaVerticalEletrico';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDoEsquemaVerticalEletrico, enquadrar, orientar } from '../utils/blueprintExport';
import { TEMPLATE_DE_PRANCHA_PADRAO, planejarConjunto } from '../utils/blueprintPranchas';

function sobrado(opts: { comQdSuperior?: boolean } = { comQdSuperior: true }): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const [t0, t1] = m.levels.map((l) => l.id);
  for (const lv of [t0, t1]) {
    for (const [ax, ay, bx, by] of [[0, 0, 4500, 0], [4500, 0, 4500, 3000], [4500, 3000, 0, 3000], [0, 3000, 0, 0]]) {
      m = applyCommand(m, { type: 'AddWall', levelId: lv, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }).model;
    }
  }
  m = applyCommand(m, { type: 'AddQuadro', levelId: t0, nome: 'QGBT', at: point(300, 300), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, tipo: 'QGBT' }).model;
  const qgbt = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: qgbt, nome: 'C1', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16 }).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t0, disciplina: 'ELETRICA', tipo: 'TUG', at: point(2000, 75), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: m.circuitos[0].id }).model;
  if (opts.comQdSuperior) {
    m = applyCommand(m, { type: 'AddQuadro', levelId: t1, nome: 'QD1', at: point(300, 300), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, quadroPaiId: qgbt, alimentadorM: 6 }).model;
    const qd = m.quadros[1].id;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: qd, nome: 'C1', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16 }).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: t1, disciplina: 'ELETRICA', tipo: 'TUG', at: point(2000, 75), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 1200 }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[1].id, circuitoId: m.circuitos[1].id }).model;
    // A prumada Ø32 em (4000, 1500): do teto do térreo... na verdade do piso ao teto de cada pavimento — atravessa a laje.
    m = applyCommand(m, { type: 'AddTrecho', levelId: t0, disciplina: 'ELETRICA', a: point(4000, 1500), b: point(4000, 1500), cotaAMm: 0, cotaBMm: 2800, bitolaMm: 32 }).model;
    m = applyCommand(m, { type: 'AddTrecho', levelId: t1, disciplina: 'ELETRICA', a: point(4000, 1500), b: point(4000, 1500), cotaAMm: 0, cotaBMm: 2800, bitolaMm: 32 }).model;
    // A descida ao próprio quadro NÃO é prumada.
    m = applyCommand(m, { type: 'AddTrecho', levelId: t0, disciplina: 'ELETRICA', a: point(300, 300), b: point(300, 300), cotaAMm: 1600, cotaBMm: 2800, bitolaMm: 25 }).model;
  }
  return m;
}

describe('esquema vertical elétrico', () => {
  it('prumadas: uma coluna P-1 Ø32 nos dois pavimentos; a descida ao quadro fica de fora; há esquema quando há hierarquia/pavimentos/prumada', () => {
    const m = sobrado();
    const p = prumadasEletricas(m);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ nome: 'P-1', x: 4000, y: 1500 });
    expect(p[0].segmentos.map((s) => [s.zA, s.zB, s.bitolaMm])).toEqual([[0, 2800, 32], [2900, 5700, 32]]);
    expect(temEsquemaVerticalEletrico(m)).toBe(true);
    expect(temEsquemaVerticalEletrico(sobrado({ comQdSuperior: false }))).toBe(false);
    expect(linhasDaLegendaEletrica(m)).toEqual([
      'QGBT — QGBT · FN 127 V · entrada · alimenta QD1',
      'QD1 — QD · FN 127 V · de QGBT',
      'P-1 — prumada de eletroduto Ø32 (2 pavimento(s))',
    ]);
  });

  it('o desenho: pavimentos com cota, os dois quadros, o alimentador com seção/geral/metros, a prumada Ø32, a legenda; a folha tem o título', () => {
    const m = sobrado();
    const d = new DesenhistaDeProva();
    expect(desenharEsquemaVerticalEletrico(d, m, HIPOTESES_PADRAO, 10, 10, 380, 240)).toBe(2);
    const textos = d.textos();
    for (const t of ['Térreo', 'Superior', 'Cobertura', '+0,00', '+2,90', '+5,70', 'QGBT', 'QD1', 'P-1', 'Ø32', 'LEGENDA DOS QUADROS', 'entrada']) expect(textos, t).toContain(t);
    expect(textos.some((t) => /^\d+(,\d+)? mm² · \d+ A · 6 m$/.test(t))).toBe(true);
    expect(textos.some((t) => /^Esquema vertical elétrico · escala vertical 1:\d+/.test(t))).toBe(true);
    // Sem quadro: o aviso, e zero.
    const vazio = new DesenhistaDeProva();
    expect(desenharEsquemaVerticalEletrico(vazio, emptyModel(), HIPOTESES_PADRAO, 0, 0, 100, 100)).toBe(0);
    expect(vazio.textos()).toContain('Nenhum quadro de distribuição no desenho.');
    const papel = orientar(PAPEIS.find((p) => p.id === 'A1') ?? PAPEIS[0], true);
    const folha = new DesenhistaDeProva();
    desenharFolhaDoEsquemaVerticalEletrico(folha, m, { denominador: 50, papel, titulo: 'Sobrado', revisao: 1, hash: 'p'.repeat(64), data: new Date('2026-09-29T12:00:00Z'), hipotesesEletricas: HIPOTESES_PADRAO }, enquadrar(m, 50, papel, false));
    expect(folha.textos()).toContain('ESQUEMA VERTICAL ELÉTRICO');
  });

  it('no conjunto: a folha ESQUEMA_ELETRICO vem depois do unifilar quando há o que cortar; casa térrea de um quadro não a tem', () => {
    const t = { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, eletrica: true } };
    const plano = planejarConjunto(sobrado(), t);
    // E5.2: a lista de materiais fecha o bloco elétrico, depois do esquema.
    expect(plano.map((p) => p.tipo).slice(-4)).toEqual(['QUADRO_DE_CARGAS', 'UNIFILAR', 'ESQUEMA_ELETRICO', 'MATERIAIS_ELETRICA']);
    expect(plano[plano.length - 2].titulo).toBe('Esquema vertical elétrico');
    const terrea = planejarConjunto(sobrado({ comQdSuperior: false }), t);
    expect(terrea.map((p) => p.tipo)).not.toContain('ESQUEMA_ELETRICO');
  });
});
