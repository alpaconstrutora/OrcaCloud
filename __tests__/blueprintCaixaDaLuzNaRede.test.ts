/**
 * A CAIXA DA LUZ DE TETO NA REDE (25/10/2026).
 *
 * *"essa é uma caixa de luz de teto, note que a caixa tem 6 entradas e é por onde cada conduite chega. Por sua vez
 * note que na planta 3d os conduites se encontrar acima da caixa e desce apenas um conduite o que nao é o correto"* —
 * decisão: a caixa no alto, na rede; até a luminária, só cabo. O motor deixa de lançar a descida (ver os testes "NO
 * FORRO" em `blueprintEletrodutos.test.ts`); aqui, a regra de ligação e a fiação sem a descida.
 */
import { describe, expect, it } from 'vitest';
import { ALCANCE_DA_CAIXA_DA_LUZ_MM, applyBatch, applyCommand, caixaDaLuzNaRede, composicaoDaRede, cotasDeLigacao, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';

const LUMINARIA = 2553;
const REDE = 2755;

/** Quadro → rede no forro → luz (sem descida) e interruptor (com descida até a caixa dele). */
function casa(comDescidaNaLuz = false): { m: BlueprintModel; ids: { ramalLuz: string; ramalInt: string; descidaLuz?: string } } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  let m = applyCommand(base, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1 — luz', tensaoV: 127, ligacao: 'FN', secaoMm2: 1.5 }).model;
  const c1 = m.circuitos[0].id;
  const trecho = (a: [number, number], ca: number, b: [number, number], cb: number): Command => ({
    type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(a[0], a[1]), b: point(b[0], b[1]), cotaAMm: ca, cotaBMm: cb, bitolaMm: 25, circuitoIds: [c1],
  });
  const cmds: Command[] = [
    { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: point(4000, 2000), cotaMm: LUMINARIA, tipoEletrico: 'ILUMINACAO_TETO', potenciaW: 100, comando: 'a' },
    { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Interruptor', at: point(6000, 0), cotaMm: 1100, tipoEletrico: 'INTERRUPTOR', comando: 'a' },
    trecho([0, 0], 1500, [0, 0], REDE),
    trecho([0, 0], REDE, [4000, 2000], REDE),
    trecho([4000, 2000], REDE, [6000, 0], REDE),
    trecho([6000, 0], REDE, [6000, 0], 1100),
  ];
  if (comDescidaNaLuz) cmds.push(trecho([4000, 2000], REDE, [4000, 2000], LUMINARIA));
  m = applyBatch(m, cmds).model;
  m = applyBatch(m, m.terminais.map((x) => ({ type: 'SetTerminalProps' as const, terminalId: x.id, circuitoId: c1 }))).model;
  const porGeom = (a: [number, number], b: [number, number], ca?: number) =>
    m.trechos.find((x) => x.a.x === a[0] && x.a.y === a[1] && x.b.x === b[0] && x.b.y === b[1] && (ca == null || x.cotaAMm === ca))!.id;
  return {
    m,
    ids: {
      ramalLuz: porGeom([0, 0], [4000, 2000]),
      ramalInt: porGeom([4000, 2000], [6000, 0]),
      ...(comDescidaNaLuz ? { descidaLuz: porGeom([4000, 2000], [4000, 2000]) } : {}),
    },
  };
}
const tipos = (m: BlueprintModel, id: string) => composicaoDaRede(m).get(id)!.lista.map((c) => c.tipo).sort();

describe('caixa da luz de teto na rede · a regra', () => {
  it('a luz abaixo da rede, dentro do alcance, tem a caixa na rede; fora do alcance, acima da rede ou outra peça, não', () => {
    const luz = { disciplina: 'ELETRICA' as const, tipoEletrico: 'ILUMINACAO_TETO' as const, cotaMm: LUMINARIA };
    expect(caixaDaLuzNaRede(luz, REDE)).toBe(true);
    expect(caixaDaLuzNaRede(luz, LUMINARIA)).toBe(false);
    expect(caixaDaLuzNaRede(luz, LUMINARIA + ALCANCE_DA_CAIXA_DA_LUZ_MM + 1)).toBe(false);
    expect(caixaDaLuzNaRede({ ...luz, tipoEletrico: 'TUG' as const }, REDE)).toBe(false);
  });

  it('sem eletroduto na cota da luminária, a luz se liga na ponta logo acima; com a descida (planta antiga), na própria cota', () => {
    const sem = casa();
    expect(cotasDeLigacao(sem.m)(sem.m.terminais.find((x) => x.tipoEletrico === 'ILUMINACAO_TETO')!)).toBe(REDE);
    const com = casa(true);
    expect(cotasDeLigacao(com.m)(com.m.terminais.find((x) => x.tipoEletrico === 'ILUMINACAO_TETO')!)).toBe(LUMINARIA);
    // A tomada, o interruptor: sempre a própria cota.
    expect(cotasDeLigacao(sem.m)(sem.m.terminais.find((x) => x.tipoEletrico === 'INTERRUPTOR')!)).toBe(1100);
  });
});

describe('caixa da luz de teto na rede · a fiação', () => {
  it('⚠️ sem a descida, a fiação chega à luz pela caixa: neutro e terra do quadro; retorno do interruptor', () => {
    const { m, ids } = casa();
    // Do quadro até a caixa da luz: o neutro e o terra da luz, a fase que segue ao interruptor.
    expect(tipos(m, ids.ramalLuz)).toEqual(['FASE', 'NEUTRO', 'TERRA']);
    // Da caixa da luz ao interruptor: a fase que vai e o retorno que volta.
    expect(tipos(m, ids.ramalInt)).toEqual(['FASE', 'RETORNO']);
  });

  it('a planta antiga, com a descida, continua com a mesma fiação (a descida leva N, T e o retorno)', () => {
    const { m, ids } = casa(true);
    expect(tipos(m, ids.ramalLuz)).toEqual(['FASE', 'NEUTRO', 'TERRA']);
    expect(tipos(m, ids.ramalInt)).toEqual(['FASE', 'RETORNO']);
    expect(tipos(m, ids.descidaLuz!)).toEqual(['NEUTRO', 'RETORNO', 'TERRA']);
  });
});
