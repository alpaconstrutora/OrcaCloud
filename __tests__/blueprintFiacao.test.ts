/**
 * O MOTOR DE ESQUEMAS DE LIGAÇÃO (E2.2 do roadmap elétrico, 29/09/2026).
 *
 * A fiação de cada eletroduto DERIVADA do que os pontos exigem e do caminho
 * pela rede: fase, neutro e terra do quadro até tomadas e luzes; a fase do
 * quadro até o interruptor; o RETORNO do interruptor até a luz; dois retornos
 * entre paralelos. Declarado vence e aparece como divergência; ponto sem
 * caminho cai na base antiga, dito.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { composicaoDaRede, exigenciaDoPonto, resumoDaComposicao } from '../utils/blueprintFiacao';
import { ocupacaoDoTrecho } from '../utils/blueprintEletricaDimensionamento';

const TETO = 2800;

/**
 * Térreo com QDC em (0,0) cota 1500 e o tronco no teto até o nó (4000,0):
 *   quadro ─prumada→ (0,0,teto) ─tronco→ (4000,0,teto)
 *   do nó: ramal→(4000,2000,teto) ─prumada→ luz (4000,2000,2800 é o teto: a luz está NO nó)
 *          ramal→(6000,0,teto) ─prumada→ interruptor (6000,0,1100)
 *          ramal→(2000,-2000,teto)... simplificado: tomada em (4000,-2000,300) com prumada própria
 */
function casa(opts: { comInterruptor?: boolean; paralelos?: boolean; declarar?: number } = {}): { m: BlueprintModel; ids: Record<string, string> } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: TETO }).model;
  const t = base.levels[0].id;
  let m = applyCommand(base, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
  const q = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C1 — luz', tensaoV: 127, ligacao: 'FN', secaoMm2: 1.5 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C2 — TUG', tensaoV: 127, ligacao: 'FN', secaoMm2: 2.5 }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  const term = (tipo: 'ILUMINACAO_TETO' | 'INTERRUPTOR' | 'TUG', x: number, y: number, cota: number, circuitoId: string, comando?: string, interruptor?: 'UMA_SECAO' | 'PARALELO'): Command => ({
    type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo, at: point(x, y), cotaMm: cota, tipoEletrico: tipo, potenciaW: tipo === 'INTERRUPTOR' ? undefined : 100, comando: comando ?? null, interruptor: interruptor ?? null,
  });
  const trecho = (a: [number, number], ca: number, b: [number, number], cb: number, circuitoIds: string[], condutores?: number): Command => ({
    type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(a[0], a[1]), b: point(b[0], b[1]), cotaAMm: ca, cotaBMm: cb, bitolaMm: 25, circuitoIds, ...(condutores != null ? { condutores } : {}),
  });
  const cmds: Command[] = [
    term('ILUMINACAO_TETO', 4000, 2000, TETO, c1, opts.comInterruptor === false ? undefined : 'a'),
    term('TUG', 4000, -2000, 300, c2),
    // Quadro → teto; tronco; ramal da luz; ramal + prumada da tomada.
    trecho([0, 0], 1500, [0, 0], TETO, [c1, c2], opts.declarar),
    trecho([0, 0], TETO, [4000, 0], TETO, [c1, c2]),
    trecho([4000, 0], TETO, [4000, 2000], TETO, [c1]),
    trecho([4000, 0], TETO, [4000, -2000], TETO, [c2]),
    trecho([4000, -2000], TETO, [4000, -2000], 300, [c2]),
  ];
  if (opts.comInterruptor !== false) {
    if (opts.paralelos) {
      cmds.push(term('INTERRUPTOR', 6000, 0, 1100, c1, 'a', 'PARALELO'), term('INTERRUPTOR', 4000, 4000, 1100, c1, 'a', 'PARALELO'));
      cmds.push(trecho([4000, 0], TETO, [6000, 0], TETO, [c1]), trecho([6000, 0], TETO, [6000, 0], 1100, [c1]));
      cmds.push(trecho([4000, 2000], TETO, [4000, 4000], TETO, [c1]), trecho([4000, 4000], TETO, [4000, 4000], 1100, [c1]));
    } else {
      cmds.push(term('INTERRUPTOR', 6000, 0, 1100, c1, 'a'));
      cmds.push(trecho([4000, 0], TETO, [6000, 0], TETO, [c1]), trecho([6000, 0], TETO, [6000, 0], 1100, [c1]));
    }
  }
  m = applyBatch(m, cmds).model;
  // Os pontos precisam do circuito: o AddTerminal não o grava.
  const setCirc: Command[] = m.terminais.map((x) => ({ type: 'SetTerminalProps' as const, terminalId: x.id, circuitoId: x.tipoEletrico === 'TUG' ? c2 : c1 }));
  m = applyBatch(m, setCirc).model;
  const porGeom = (a: [number, number], b: [number, number]) => m.trechos.find((x) => x.a.x === a[0] && x.a.y === a[1] && x.b.x === b[0] && x.b.y === b[1])!.id;
  return {
    m,
    ids: {
      c1, c2,
      prumadaQuadro: porGeom([0, 0], [0, 0]),
      tronco: porGeom([0, 0], [4000, 0]),
      ramalLuz: porGeom([4000, 0], [4000, 2000]),
      ramalTomada: porGeom([4000, 0], [4000, -2000]),
      prumadaTomada: m.trechos.filter((x) => x.a.x === 4000 && x.a.y === -2000 && x.b.x === 4000 && x.b.y === -2000)[0].id,
      ramalInt: m.trechos.find((x) => x.a.x === 4000 && x.a.y === 0 && x.b.x === 6000)?.id ?? '',
      prumadaInt: m.trechos.find((x) => x.a.x === 6000 && x.b.x === 6000)?.id ?? '',
      ramalP2: m.trechos.find((x) => x.a.y === 2000 && x.b.y === 4000)?.id ?? '',
    },
  };
}

const tipos = (m: BlueprintModel, id: string, circuitoId?: string) => {
  const c = composicaoDaRede(m).get(id)!;
  return c.lista.filter((x) => !circuitoId || x.circuitoId === circuitoId).map((x) => x.tipo);
};

describe('esquemas de ligação · o que cada ponto exige', () => {
  it('tomada F-N: F N T; trifásica: F F F T; luz com comando: só N e T (a fase vem por retorno); interruptor primeiro da cadeia: F; terra e caixa: nada', () => {
    const p = (tipoEletrico: string) => ({ tipoEletrico } as never);
    expect(exigenciaDoPonto(p('TUG'), 'FN', false, false)).toEqual({ fases: 1, neutro: true, terra: true });
    expect(exigenciaDoPonto(p('TUE'), 'FFF', false, false)).toEqual({ fases: 3, neutro: false, terra: true });
    expect(exigenciaDoPonto(p('ILUMINACAO_TETO'), 'FN', true, false)).toEqual({ fases: 0, neutro: true, terra: true });
    expect(exigenciaDoPonto(p('ILUMINACAO_TETO'), 'FN', false, false)).toEqual({ fases: 1, neutro: true, terra: true });
    expect(exigenciaDoPonto(p('INTERRUPTOR'), 'FN', false, true)).toEqual({ fases: 1, neutro: false, terra: false });
    expect(exigenciaDoPonto(p('INTERRUPTOR'), 'FN', false, false)).toBeNull();
    expect(exigenciaDoPonto(p('ATERRAMENTO'), 'FN', false, false)).toBeNull();
    expect(exigenciaDoPonto(p('CAIXA_PASSAGEM'), 'FN', false, false)).toBeNull();
  });
});

describe('esquemas de ligação · a fiação caminha pela rede', () => {
  it('⚠️ interruptor simples: o tronco leva F N T de cada circuito; o ramal do interruptor leva F e R; o ramal da luz leva N R T (sem fase)', () => {
    const { m, ids } = casa();
    // Tronco: C1 = F N T (a luz pede N e T; o interruptor pede F) + C2 = F N T.
    expect(tipos(m, ids.tronco, ids.c1)).toEqual(['FASE', 'NEUTRO', 'TERRA']);
    expect(tipos(m, ids.tronco, ids.c2)).toEqual(['FASE', 'NEUTRO', 'TERRA']);
    // Ramal do interruptor: fase que vai e retorno que volta.
    expect(tipos(m, ids.ramalInt)).toEqual(['FASE', 'RETORNO']);
    expect(tipos(m, ids.prumadaInt)).toEqual(['FASE', 'RETORNO']);
    // Ramal da luz: neutro e terra do quadro, retorno do interruptor — sem fase.
    expect(tipos(m, ids.ramalLuz)).toEqual(['NEUTRO', 'RETORNO', 'TERRA']);
    // Tomada: F N T, e a prumada dela idem.
    expect(tipos(m, ids.ramalTomada)).toEqual(['FASE', 'NEUTRO', 'TERRA']);
    expect(tipos(m, ids.prumadaTomada)).toEqual(['FASE', 'NEUTRO', 'TERRA']);
    // O retorno leva a letra do comando.
    const c = composicaoDaRede(m).get(ids.ramalLuz)!;
    expect(c.origem).toBe('DERIVADO');
    expect(c.lista.find((x) => x.tipo === 'RETORNO')?.comando).toBe('a');
  });

  it('luz SEM interruptor: exige fase do quadro como a tomada — e nada de retorno', () => {
    const { m, ids } = casa({ comInterruptor: false });
    expect(tipos(m, ids.ramalLuz)).toEqual(['FASE', 'NEUTRO', 'TERRA']);
  });

  it('⚠️ PARALELOS: dois retornos entre eles; a fase só no primeiro (mais perto do quadro); um retorno do último à luz', () => {
    const { m, ids } = casa({ paralelos: true });
    // P1 em (6000,0) fica a 6000 mm do quadro; P2 em (4000,4000) a 8000 mm — P1 é o primeiro.
    expect(tipos(m, ids.prumadaInt)).toEqual(['FASE', 'RETORNO', 'RETORNO']); // F chega, 2 travellers saem para P2
    // O caminho P1 → P2 passa pelo ramal da luz (4000,0→4000,2000→4000,4000): 2 travellers + o retorno de P2 à luz não passa aqui (P2→luz é o trecho 2000→4000).
    expect(tipos(m, ids.ramalLuz)).toEqual(['NEUTRO', 'RETORNO', 'RETORNO', 'TERRA']);
    expect(tipos(m, ids.ramalP2)).toEqual(['RETORNO', 'RETORNO', 'RETORNO']); // 2 travellers + 1 retorno à luz
    const c = composicaoDaRede(m).get(ids.ramalP2)!;
    expect(c.lista.every((x) => x.comando === 'a')).toBe(true);
  });

  it('declarado ≠ derivado: vale o declarado, marcado divergente; igual: derivado; ponto sem caminho: base da ligação, dito', () => {
    const { m, ids } = casa({ declarar: 9 });
    const c = composicaoDaRede(m).get(ids.prumadaQuadro)!;
    expect(c.origem).toBe('DECLARADO');
    expect(c.divergente).toBe(true);
    expect(c.declarados).toBe(9);
    expect(c.derivados).toHaveLength(6);
    expect(c.lista).toHaveLength(9); // a base por ligação + retornos sem dono, como antes
    const igual = casa({ declarar: 6 });
    expect(composicaoDaRede(igual.m).get(igual.ids.prumadaQuadro)!.origem).toBe('DERIVADO');
    // Trecho solto, com circuito mas sem ponto ligado: base da ligação.
    const solto = applyCommand(m, { type: 'AddTrecho', levelId: m.levels[0].id, disciplina: 'ELETRICA', a: point(9000, 9000), b: point(9500, 9000), cotaAMm: TETO, cotaBMm: TETO, bitolaMm: 25, circuitoIds: [ids.c2] }).model;
    const cs = composicaoDaRede(solto).get(solto.trechos[solto.trechos.length - 1].id)!;
    expect(cs.origem).toBe('BASE');
    expect(cs.lista.map((x) => x.tipo)).toEqual(['FASE', 'NEUTRO', 'TERRA']);
  });

  it('a ocupação lê a derivação sem contagem declarada: prumada do quadro com 6 condutores (3 × 1,5 + 3 × 2,5) em Ø25', () => {
    const { m, ids } = casa();
    const t = m.trechos.find((x) => x.id === ids.prumadaQuadro)!;
    const fiacao = composicaoDaRede(m).get(t.id)!.lista;
    const r = ocupacaoDoTrecho(m, t, undefined, fiacao);
    expect(r.ocupacao).not.toBeNull();
    expect(r.ocupacao!.condutores).toBe(6);
    // Sem a derivação e sem contagem, não se avalia — e o motivo diz.
    expect(ocupacaoDoTrecho(m, t).ocupacao).toBeNull();
    expect(ocupacaoDoTrecho(m, t).motivo).toMatch(/não declarados nem derivados/);
  });

  it('o resumo: "C1 — luz: N R T · C2 — TUG: F N T"', () => {
    const { m, ids } = casa();
    const nome = (id: string | null) => (id ? m.circuitos.find((c) => c.id === id)!.nome : 'retorno');
    expect(resumoDaComposicao(composicaoDaRede(m).get(ids.tronco)!.lista, nome)).toBe('C1 — luz: F N T · C2 — TUG: F N T');
    expect(resumoDaComposicao(composicaoDaRede(m).get(ids.ramalLuz)!.lista, nome)).toBe('C1 — luz: N R T');
  });
});
