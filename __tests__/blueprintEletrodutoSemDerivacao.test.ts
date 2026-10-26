/**
 * ELETRODUTO NÃO BIFURCA (25/10/2026): *"o conduite que sobe do painel e bifurca para dois lados. Isso nao acontece na
 * instalacao. deve sair dois eletrodutos um para cada lado. eletrodutos conduite nao bifurca."*
 */
import { describe, expect, it } from 'vitest';
import { desdobrarDerivacoes, type TrechoDoPlano } from '../utils/blueprintEletrodutoSemDerivacao';

const L = 'L0';
const no = (levelId: string, x: number, y: number, c: number) => `${levelId}|${x},${y}|${c}`;
const t = (ax: number, ay: number, ca: number, bx: number, by: number, cb: number, circ: string[]): TrechoDoPlano => ({
  levelId: L, a: { x: ax, y: ay }, b: { x: bx, y: by }, cotaAMm: ca, cotaBMm: cb, circuitoIds: circ, bitolaMm: 32,
});
const chaveDe = (x: TrechoDoPlano) => `${x.a.x},${x.a.y},${x.cotaAMm}>${x.b.x},${x.b.y},${x.cotaBMm}`;

/**
 * O caso da Garden: o quadro em (0,0) a 1600; sobe até a faixa (2755); anda até o nó S (1000,0) no forro, e ali se
 * divide — para a luz A (3000,0) e para a luz B (1000,3000).
 */
function garden() {
  const caixas = new Set([no(L, 0, 0, 1600), no(L, 3000, 0, 2755), no(L, 1000, 3000, 2755)]);
  const trechos = [
    t(0, 0, 1600, 0, 0, 2755, ['c1', 'c2', 'c3']),
    t(0, 0, 2755, 1000, 0, 2755, ['c1', 'c2', 'c3']),
    t(1000, 0, 2755, 3000, 0, 2755, ['c1', 'c2']),
    t(1000, 0, 2755, 1000, 3000, 2755, ['c3']),
  ];
  return { trechos, opcoes: { no, raiz: no(L, 0, 0, 1600), ehCaixa: (k: string) => caixas.has(k) } };
}

describe('desdobrarDerivacoes', () => {
  it('⚠️ o "T" no meio do forro vira DOIS eletrodutos desde o quadro, um para cada lado, cada um com os seus circuitos', () => {
    const { trechos, opcoes } = garden();
    const r = desdobrarDerivacoes(trechos, opcoes);
    // A subida e o pedaço até S, repetidos (um por ramo); os dois ramos, como estavam.
    expect(r.map(chaveDe)).toEqual([
      '0,0,1600>0,0,2755',
      '0,0,1600>0,0,2755',
      '0,0,2755>1000,0,2755',
      '0,0,2755>1000,0,2755',
      '1000,0,2755>3000,0,2755',
      '1000,0,2755>1000,3000,2755',
    ]);
    expect(r.slice(0, 2).map((x) => x.circuitoIds)).toEqual([['c1', 'c2'], ['c3']]);
    expect(r.slice(2, 4).map((x) => x.circuitoIds)).toEqual([['c1', 'c2'], ['c3']]);
  });

  it('a bitola de cada eletroduto repetido sai dos circuitos dele', () => {
    const { trechos, opcoes } = garden();
    const r = desdobrarDerivacoes(trechos, { ...opcoes, bitolaDe: (ids) => (ids.length > 1 ? 25 : 20) });
    expect(r.slice(0, 2).map((x) => x.bitolaMm)).toEqual([25, 20]);
    // O trecho que não se repete fica com a bitola dele.
    expect(r[4].bitolaMm).toBe(32);
  });

  it('a derivação NUMA CAIXA (a luz, a caixa de passagem) é permitida: nada se repete', () => {
    const { trechos, opcoes } = garden();
    const r = desdobrarDerivacoes(trechos, { ...opcoes, ehCaixa: (k) => opcoes.ehCaixa(k) || k === no(L, 1000, 0, 2755) });
    expect(r).toEqual(trechos);
  });

  it('dois níveis de derivação sem caixa: três eletrodutos saem do quadro', () => {
    const caixas = new Set([no(L, 0, 0, 1600), no(L, 3000, 0, 2755), no(L, 2000, 2000, 2755), no(L, 1000, 3000, 2755)]);
    const trechos = [
      t(0, 0, 1600, 0, 0, 2755, ['a', 'b', 'c']),
      t(0, 0, 2755, 1000, 0, 2755, ['a', 'b', 'c']), // S1 em (1000,0)
      t(1000, 0, 2755, 1000, 3000, 2755, ['c']),
      t(1000, 0, 2755, 2000, 0, 2755, ['a', 'b']), // S2 em (2000,0)
      t(2000, 0, 2755, 3000, 0, 2755, ['a']),
      t(2000, 0, 2755, 2000, 2000, 2755, ['b']),
    ];
    const r = desdobrarDerivacoes(trechos, { no, raiz: no(L, 0, 0, 1600), ehCaixa: (k) => caixas.has(k) });
    const subidas = r.filter((x) => chaveDe(x) === '0,0,1600>0,0,2755');
    expect(subidas.map((x) => x.circuitoIds)).toEqual([['c'], ['a'], ['b']]);
    // De S1 até S2, os dois que seguem.
    expect(r.filter((x) => chaveDe(x) === '1000,0,2755>2000,0,2755').map((x) => x.circuitoIds)).toEqual([['a'], ['b']]);
  });

  it('⚠️ o nó SOBRE a caixa de um ponto: cada eletroduto que chega desce até a caixa (a descida se repete), nada sobe ao quadro', () => {
    // Q (0,0,1600) sobe a X0 (0,0,2800); X0 → X1 (2000,0) sobre a TUE1; X1 → X2 (4000,0) sobre a TUE2.
    const caixas = new Set([no(L, 0, 0, 1600), no(L, 2000, 0, 300), no(L, 4000, 0, 300)]);
    const trechos = [
      t(0, 0, 1600, 0, 0, 2800, ['c1', 'c2']),
      t(0, 0, 2800, 2000, 0, 2800, ['c1', 'c2']),
      t(2000, 0, 2800, 2000, 0, 300, ['c1']),
      t(2000, 0, 2800, 4000, 0, 2800, ['c2']),
      t(4000, 0, 2800, 4000, 0, 300, ['c2']),
    ];
    const r = desdobrarDerivacoes(trechos, { no, raiz: no(L, 0, 0, 1600), ehCaixa: (k) => caixas.has(k) });
    // A subida do quadro e o trecho até X1 continuam UM eletroduto só.
    expect(r.filter((x) => chaveDe(x) === '0,0,1600>0,0,2800')).toHaveLength(1);
    expect(r.filter((x) => chaveDe(x) === '0,0,2800>2000,0,2800')).toHaveLength(1);
    // A descida até a TUE1: duas — a do eletroduto que chega (c1, c2) e a do que sai para a TUE2 (c2).
    expect(r.filter((x) => chaveDe(x) === '2000,0,2800>2000,0,300').map((x) => x.circuitoIds)).toEqual([['c1', 'c2'], ['c2']]);
    // A da TUE2, que só recebe: uma.
    expect(r.filter((x) => chaveDe(x) === '4000,0,2800>4000,0,300')).toHaveLength(1);
  });

  it('sem derivação nenhuma (cadeia simples), sai igual', () => {
    const caixas = new Set([no(L, 0, 0, 1600), no(L, 3000, 0, 2755)]);
    const trechos = [t(0, 0, 1600, 0, 0, 2755, ['a']), t(0, 0, 2755, 3000, 0, 2755, ['a'])];
    expect(desdobrarDerivacoes(trechos, { no, raiz: no(L, 0, 0, 1600), ehCaixa: (k) => caixas.has(k) })).toEqual(trechos);
  });
});

describe('refazerEletrodutos · as sobras sem circuito (25/10/2026)', () => {
  it('⚠️ apaga o sem circuito ligado à rede ou ao quadro (os tocos do lançamento antigo); o solto, longe dela, fica', async () => {
    const { applyBatch, applyCommand, emptyModel, point } = await import('../utils/blueprintKernel');
    const { planejarEletrodutos, refazerEletrodutos } = await import('../utils/blueprintEletrodutos');
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const lv = m.levels[0].id;
    m = applyCommand(m, { type: 'AddQuadro', levelId: lv, nome: 'QDC', at: point(0, 0), cotaMm: 1600 }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', ligacao: 'FN' }).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: lv, disciplina: 'ELETRICA', tipo: 'TUG', at: point(3000, 0), cotaMm: 300, tipoEletrico: 'TUG' }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: m.circuitos[0].id }).model;
    m = applyBatch(m, planejarEletrodutos(m, m.quadros[0]).comandos).model;
    const semCircuito = (ax: number, ay: number, ca: number, bx: number, by: number, cb: number) =>
      ({ type: 'AddTrecho', levelId: lv, disciplina: 'ELETRICA', a: point(ax, ay), b: point(bx, by), cotaAMm: ca, cotaBMm: cb, bitolaMm: 25 }) as const;
    m = applyBatch(m, [
      semCircuito(0, 0, 1600, 0, 0, 2150), // toco do quadro (o lançamento antigo, sob a viga)
      semCircuito(0, 0, 2150, 500, 0, 2150), // e o que seguia dele — sobra em cadeia
      semCircuito(8000, 8000, 2800, 9000, 8000, 2800), // solto, longe da rede: fica
    ]).model;
    const [toco, cadeia, solto] = m.trechos.slice(-3).map((t) => t.id);
    const apagados = refazerEletrodutos(m, m.quadros[0]).comandos.filter((c) => c.type === 'DeleteTrecho').map((c) => (c as { trechoId: string }).trechoId);
    expect(apagados).toContain(toco);
    expect(apagados).toContain(cadeia);
    expect(apagados).not.toContain(solto);
  });
});
