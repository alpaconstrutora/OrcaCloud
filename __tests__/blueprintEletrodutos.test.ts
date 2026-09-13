/**
 * LANÇAMENTO AUTOMÁTICO DE ELETRODUTOS (13/09/2026) — o plano é puro,
 * explicável e idempotente; o kernel marca o que nasceu proposto (`sugerido`)
 * e limpa a marca quando a pessoa move ou aceita.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  HIPOTESES_ELETRODUTO_PADRAO,
  eletrodutosSugeridos,
  planejarEletrodutos,
  planejarEletrodutosDoNivel,
  pontosSemCircuito,
} from '../utils/blueprintEletrodutos';
import { comprimentoDoCircuito } from '../utils/blueprintEletricaDimensionamento';

/** Sala 6 × 4; QDC a 1.600; C1 = luz de teto (a 2.800 = teto) + interruptor; C2 = duas TUG; um ponto solto. */
function casa() {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600 }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1', ligacao: 'FN' }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C2', ligacao: 'FFF' }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  const ponto = (x: number, y: number, tipoEletrico: 'TUG' | 'ILUMINACAO_TETO' | 'INTERRUPTOR', cotaMm: number, circuitoId: string | null) => {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm, tipoEletrico }).model;
    const id = m.terminais[m.terminais.length - 1].id;
    if (circuitoId) m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, circuitoId }).model;
  };
  ponto(3000, 2000, 'ILUMINACAO_TETO', 2800, c1);
  ponto(1000, 75, 'INTERRUPTOR', 1100, c1);
  ponto(2000, 75, 'TUG', 300, c2);
  ponto(5925, 3000, 'TUG', 300, c2);
  ponto(4000, 3925, 'TUG', 300, null); // sem circuito
  return { m, t, c1, c2 };
}

const adds = (cmds: Command[]) => cmds.filter((c): c is Extract<Command, { type: 'AddTrecho' }> => c.type === 'AddTrecho');
const prumadas = (cmds: Command[]) => adds(cmds).filter((c) => c.a.x === c.b.x && c.a.y === c.b.y);
const horizontais = (cmds: Command[]) => adds(cmds).filter((c) => !(c.a.x === c.b.x && c.a.y === c.b.y));

describe('planejarEletrodutos — a proposta', () => {
  it('C1: prumada do quadro e do interruptor; a luz no teto não ganha prumada; dois trechos no teto a partir do quadro', () => {
    const { m, t, c1 } = casa();
    const plano = planejarEletrodutos(m, m.circuitos.find((c) => c.id === c1)!, t);
    expect(plano.motivo).toBeNull();
    expect(plano).toMatchObject({ pontos: 2, ligados: 0, aLigar: 2 });
    const pr = prumadas(plano.comandos);
    expect(pr.map((c) => [c.a.x, c.a.y, c.cotaAMm, c.cotaBMm])).toEqual([
      [75, 1000, 1600, 2800], // o quadro sobe ao teto
      [1000, 75, 1100, 2800], // o interruptor sobe ao teto
    ]);
    const hz = horizontais(plano.comandos);
    expect(hz).toHaveLength(2);
    // Todas no teto, do circuito, com 3 condutores (FN), bitola 25, SUGERIDAS.
    for (const c of adds(plano.comandos)) {
      expect(c).toMatchObject({ disciplina: 'ELETRICA', bitolaMm: 25, circuitoId: c1, condutores: 3, sugerido: true });
    }
    for (const c of hz) expect([c.cotaAMm, c.cotaBMm]).toEqual([2800, 2800]);
    // Prim: o interruptor (a 1,3 m do quadro) liga primeiro, DIRETO ao quadro; a luz liga ao mais próximo.
    expect([hz[0].a, hz[0].b]).toEqual([{ x: 75, y: 1000 }, { x: 1000, y: 75 }]);
    expect(plano.metrosPrevistos).toBeGreaterThan(3);
  });

  it('C2 trifásico leva 4 condutores; bitola vem da hipótese', () => {
    const { m, t, c2 } = casa();
    const plano = planejarEletrodutos(m, m.circuitos.find((c) => c.id === c2)!, t, {
      ...HIPOTESES_ELETRODUTO_PADRAO,
      bitolaMm: 32,
    });
    expect(plano.aLigar).toBe(2);
    for (const c of adds(plano.comandos)) expect(c).toMatchObject({ condutores: 4, bitolaMm: 32 });
  });

  it('aplicado, o plano é IDEMPOTENTE: rodar de novo não liga nada, e a queda de tensão passa a ler os eletrodutos', () => {
    const { m, t, c1 } = casa();
    const circ = m.circuitos.find((c) => c.id === c1)!;
    const plano = planejarEletrodutos(m, circ, t);
    const depois = applyBatch(m, plano.comandos).model;
    expect(depois.trechos).toHaveLength(plano.comandos.length);
    expect(eletrodutosSugeridos(depois, t)).toHaveLength(plano.comandos.length);

    const denovo = planejarEletrodutos(depois, circ, t);
    expect(denovo).toMatchObject({ pontos: 2, ligados: 2, aLigar: 0, comandos: [], motivo: 'todos os pontos já têm eletroduto' });

    const comprimento = comprimentoDoCircuito(depois, circ);
    expect(comprimento?.origem).toBe('ELETRODUTOS');
    expect(comprimento!.metros).toBeGreaterThan(0);
  });

  it('respeita o que já existe: com a prumada do quadro desenhada à mão, ela não é lançada de novo', () => {
    const { m, t, c1 } = casa();
    const comPrumada = applyCommand(m, {
      type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(75, 1000), b: point(75, 1000),
      cotaAMm: 1600, cotaBMm: 2800, bitolaMm: 25, circuitoId: c1,
    }).model;
    const plano = planejarEletrodutos(comPrumada, comPrumada.circuitos.find((c) => c.id === c1)!, t);
    expect(prumadas(plano.comandos).map((c) => [c.a.x, c.a.y])).toEqual([[1000, 75]]);
  });

  it('sem quadro, sem ponto: motivo dito; ponto sem circuito é pendência, não decisão', () => {
    const { m, t } = casa();
    expect(pontosSemCircuito(m, t).map((p) => p.at)).toEqual([{ x: 4000, y: 3925 }]);
    const semPontos = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C3' }).model;
    const c3 = semPontos.circuitos[2];
    expect(planejarEletrodutos(semPontos, c3, t).motivo).toBe('nenhum ponto neste circuito');
    expect(planejarEletrodutosDoNivel(semPontos, t)).toHaveLength(3);
  });
});

describe('Trecho.sugerido no kernel', () => {
  function umTrechoSugerido(): { m: BlueprintModel; id: string } {
    const { m, t, c1 } = casa();
    const depois = applyCommand(m, {
      type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(75, 1000), b: point(3000, 2000),
      cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 25, circuitoId: c1, condutores: 3, sugerido: true,
    }).model;
    return { m: depois, id: depois.trechos![0].id };
  }

  it('⚠️ AUSENTE no canônico quando falso — o acervo não muda de hash; `true` sobrevive à ida e volta', () => {
    const { m } = casa();
    const comum = applyCommand(m, {
      type: 'AddTrecho', levelId: m.levels[0].id, disciplina: 'ELETRICA', a: point(0, 0), b: point(1000, 0),
      cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 25,
    }).model;
    expect(JSON.parse(canonicalPayload(comum)).trechos[0]).not.toHaveProperty('sugerido');

    const { m: sug } = umTrechoSugerido();
    const payload = JSON.parse(canonicalPayload(sug));
    expect(payload.trechos[0].sugerido).toBe(true);
    const volta = modelFromCanonicalPayload(payload);
    expect(volta.trechos![0].sugerido).toBe(true);
    expect(volta.trechos![0].circuitoId).toBe(sug.circuitos[0].id);
  });

  it('MOVER confirma; SetTrechoProps sugerido:false aceita', () => {
    const { m, id } = umTrechoSugerido();
    const movido = applyCommand(m, {
      type: 'TranslateEntities', wallIds: [], boundaryIds: [], trechoIds: [id], delta: point(100, 0), manterJuncoes: false,
    }).model;
    expect(movido.trechos![0].sugerido).toBeNull();

    const aceito = applyCommand(m, { type: 'SetTrechoProps', trechoId: id, sugerido: false }).model;
    expect(aceito.trechos![0].sugerido).toBeNull();
    expect(eletrodutosSugeridos(aceito, null)).toHaveLength(0);
  });
});
