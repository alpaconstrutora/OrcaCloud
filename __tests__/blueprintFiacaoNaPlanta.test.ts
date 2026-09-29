/**
 * FIAÇÃO NA PLANTA E NO QUADRO DE CARGAS (E2.4 do roadmap elétrico, 29/09/2026).
 *
 * Trecho com mais condutores do que se lê em traços leva um número e a folha,
 * a tabela; o quadro de cargas ganha a coluna "Condutores"; e a ocupação do
 * eletroduto põe cada condutor na SUA seção (o PE de um 50 mm² é 25).
 */
import { describe, expect, it } from 'vitest';
import {
  LIMITE_DE_CONDUTORES_DESENHADOS,
  applyBatch,
  applyCommand,
  composicaoDaRede,
  condutoresDoCircuito,
  emptyModel,
  linhasDosTrechosNumerados,
  point,
  resumoComSecoes,
  trechosNumerados,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO, ocupacaoDoEletrodutoCompartilhado, ocupacaoDoTrecho } from '../utils/blueprintEletricaDimensionamento';
import { linhasDaLegenda, linhasDoQuadroDeCargas } from '../utils/blueprintPranchaEletrica';

const TETO = 2800;

/** Dois pavimentos; em cada um, um trecho com 8 condutores DECLARADOS e um com 3. C1 em 2,5 mm² F-N. */
function casa(opts: { rotulo?: string } = {}): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: TETO }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: TETO, defaultHeightMm: TETO }).model;
  const [t0, t1] = m.levels.map((l) => l.id);
  m = applyCommand(m, { type: 'AddQuadro', levelId: t0, nome: 'QDC', at: point(0, 0), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 127, ligacao: 'FN', secaoMm2: 2.5 }).model;
  const c1 = m.circuitos[0].id;
  const trecho = (levelId: string, x: number, condutores?: number, rotulo?: string): Command => ({
    type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(x, 0), b: point(x + 2000, 0), cotaAMm: TETO, cotaBMm: TETO, bitolaMm: 25, circuitoIds: [c1], condutores, rotulo,
  });
  m = applyBatch(m, [trecho(t0, 0, 8, opts.rotulo), trecho(t0, 3000, 3), trecho(t1, 0, 9), trecho(t1, 3000, 7)]).model;
  return m;
}

describe('trechos numerados', () => {
  it('só os trechos com mais condutores que o limite (6) entram; numeração por pavimento, na ordem dos ids; o rótulo do projetista vence', () => {
    expect(LIMITE_DE_CONDUTORES_DESENHADOS).toBe(6);
    const m = casa();
    const n = trechosNumerados(m);
    expect(n.size).toBe(3);
    const [t8, t3, t9, t7] = m.trechos;
    expect(n.get(t3.id)).toBeUndefined();
    expect(n.get(t8.id)!.rotulo).toBe('1');
    expect(n.get(t8.id)!.condutores).toBe(8);
    expect(n.get(t9.id)!.rotulo).toBe('1'); // recomeça no pavimento de cima
    expect(n.get(t7.id)!.rotulo).toBe('2');
    const comRotulo = casa({ rotulo: 'T-A' });
    expect(trechosNumerados(comRotulo).get(comRotulo.trechos[0].id)!.rotulo).toBe('T-A');
  });

  it('a tabela da folha: nº, pavimento, contagem e a composição por circuito com a seção', () => {
    const m = casa();
    const linhas = linhasDosTrechosNumerados(m);
    expect(linhas.map((l) => `${l.rotulo}|${l.pavimento}|${l.condutores}`)).toEqual(['1|Térreo|8', '1|Superior|9', '2|Superior|7']);
    // 8 declarados num F-N: F N 5R T (a base e os retornos sem dono, como o desenho já fazia).
    expect(linhas[0].descricao).toBe('C1: F N 5R T 2,5 mm²');
    const texto = linhasDoQuadroDeCargas(m);
    expect(texto).toContain('FIACAO DOS TRECHOS NUMERADOS');
    expect(texto).toContain('1 | Térreo | 8 | C1: F N 5R T 2,5 mm²');
    expect(linhasDaLegenda(m).some((l) => /TRECHO NUMERADO/.test(l))).toBe(true);
    // Sem trecho cheio, nem tabela nem legenda.
    const magra = applyBatch(m, m.trechos.map((t) => ({ type: 'SetTrechoProps' as const, trechoId: t.id, condutores: 3 }))).model;
    expect(linhasDoQuadroDeCargas(magra)).not.toContain('FIACAO DOS TRECHOS NUMERADOS');
    expect(linhasDaLegenda(magra).some((l) => /TRECHO NUMERADO/.test(l))).toBe(false);
  });

  it('resumo com seções: PE e neutro só quando diferem da fase', () => {
    const m = casa();
    let c = m.circuitos[0];
    const porId = new Map([[c.id, { ...c, secaoMm2: 50 }]]);
    expect(resumoComSecoes([{ tipo: 'FASE', circuitoId: c.id }, { tipo: 'NEUTRO', circuitoId: c.id }, { tipo: 'TERRA', circuitoId: c.id }], porId)).toBe('C1: F N T 50 mm² (PE 25)');
    c = { ...c, secaoMm2: 4, secaoNeutroMm2: 2.5 };
    expect(resumoComSecoes([{ tipo: 'FASE', circuitoId: c.id }, { tipo: 'NEUTRO', circuitoId: c.id }], new Map([[c.id, c]]))).toBe('C1: F N 4 mm² (N 2,5)');
  });
});

describe('coluna "Condutores" do quadro de cargas', () => {
  it('"F+N+T 2,5 mm²"; trifásico 50 → "3F+T 50 mm² (PE 25)"; com comando na fiação, "· 1 comando"', () => {
    const base = { id: 'c', ligacao: 'FN' as const };
    expect(condutoresDoCircuito(base, 2.5, null).texto).toBe('F+N+T 2,5 mm²');
    expect(condutoresDoCircuito({ id: 'c', ligacao: 'FFF' }, 50, null).texto).toBe('3F+T 50 mm² (PE 25)');
    expect(condutoresDoCircuito({ id: 'c', ligacao: 'FN', secaoNeutroMm2: 2.5 }, 4, null).texto).toBe('F+N+T 4 mm² (N 2,5)');
    expect(condutoresDoCircuito(base, null, null).texto).toBe('F+N+T');
    // Uma casa ligada: luz 'a' com interruptor → 1 comando.
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: TETO }).model;
    const t = m.levels[0].id;
    m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 127, ligacao: 'FN', secaoMm2: 1.5 }).model;
    const c1 = m.circuitos[0].id;
    const tr = (a: [number, number], ca: number, b: [number, number], cb: number): Command => ({ type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(a[0], a[1]), b: point(b[0], b[1]), cotaAMm: ca, cotaBMm: cb, bitolaMm: 25, circuitoIds: [c1] });
    m = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: point(4000, 2000), cotaMm: TETO, tipoEletrico: 'ILUMINACAO_TETO', potenciaW: 100, comando: 'a' },
      { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Int', at: point(6000, 0), cotaMm: 1100, tipoEletrico: 'INTERRUPTOR', comando: 'a' },
      tr([0, 0], 1500, [0, 0], TETO), tr([0, 0], TETO, [4000, 0], TETO), tr([4000, 0], TETO, [4000, 2000], TETO), tr([4000, 0], TETO, [6000, 0], TETO), tr([6000, 0], TETO, [6000, 0], 1100),
    ]).model;
    m = applyBatch(m, m.terminais.map((x) => ({ type: 'SetTerminalProps' as const, terminalId: x.id, circuitoId: c1 }))).model;
    const r = condutoresDoCircuito(m.circuitos[0], 1.5, composicaoDaRede(m));
    expect(r.comandos).toBe(1);
    expect(r.texto).toBe('F+N+T 1,5 mm² · 1 comando');
    expect(linhasDoQuadroDeCargas(m).some((l) => /\| Condutores$/.test(l))).toBe(true);
    expect(linhasDoQuadroDeCargas(m).some((l) => /F\+N\+T 1,5 mm² · 1 comando$/.test(l))).toBe(true);
  });
});

describe('ocupação com a seção real de cada condutor', () => {
  it('⚠️ circuito F-N de 50 mm²: F N T derivados ocupam MENOS que 3 × 50 — o PE é 25 (Tab. 58); declarado sem tipo continua conservador', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: TETO }).model;
    const t = m.levels[0].id;
    m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1500, tensaoV: 220, ligacao: 'FN' }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 220, ligacao: 'FN', secaoMm2: 50 }).model;
    const c1 = m.circuitos[0].id;
    m = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(0, 0), b: point(3000, 0), cotaAMm: TETO, cotaBMm: TETO, bitolaMm: 50, circuitoIds: [c1] }).model;
    const trecho = m.trechos[0];
    const derivados = [{ circuitoId: c1, tipo: 'FASE' as const }, { circuitoId: c1, tipo: 'NEUTRO' as const }, { circuitoId: c1, tipo: 'TERRA' as const }];
    const comTipo = ocupacaoDoTrecho(m, trecho, undefined, derivados);
    expect(comTipo.ocupacao).not.toBeNull();
    expect(comTipo.ocupacao!.condutores).toBe(3);
    const tudo50 = ocupacaoDoEletrodutoCompartilhado(50, [{ secaoMm2: 50, quantidade: 3 }], HIPOTESES_PADRAO)!;
    const misto = ocupacaoDoEletrodutoCompartilhado(50, [{ secaoMm2: 50, quantidade: 2 }, { secaoMm2: 25, quantidade: 1 }], HIPOTESES_PADRAO)!;
    expect(comTipo.ocupacao!.ocupacaoPct).toBeCloseTo(misto.ocupacaoPct, 6);
    expect(comTipo.ocupacao!.ocupacaoPct).toBeLessThan(tudo50.ocupacaoPct);
    // Sem `tipo` (chamador antigo), tudo na fase — igual a antes.
    const semTipo = ocupacaoDoTrecho(m, trecho, undefined, derivados.map((d) => ({ circuitoId: d.circuitoId })));
    expect(semTipo.ocupacao!.ocupacaoPct).toBeCloseTo(tudo50.ocupacaoPct, 6);
    // Contagem DECLARADA (3) não tem tipos: conservador, tudo em 50.
    const declarado = applyCommand(m, { type: 'SetTrechoProps', trechoId: trecho.id, condutores: 3 }).model;
    expect(ocupacaoDoTrecho(declarado, declarado.trechos[0]).ocupacao!.ocupacaoPct).toBeCloseTo(tudo50.ocupacaoPct, 6);
  });
});
