/**
 * LANÇAMENTO AUTOMÁTICO DE ELETRODUTOS (13/09/2026; por quadro, compartilhado
 * e entre pavimentos desde 15/09/2026) — o plano é puro, explicável e
 * idempotente; o kernel marca o que nasceu proposto (`sugerido`) e limpa a
 * marca quando a pessoa move ou aceita.
 *
 * Critérios revistos com o usuário em 15/09: *"cada circuito não
 * necessariamente utiliza eletroduto exclusivo"* e *"não existe a necessidade
 * de quadro por pavimento"*.
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
  planejarEletrodutosDoModelo,
  pontosSemCircuito,
} from '../utils/blueprintEletrodutos';
import { HIPOTESES_PADRAO, agrupamentoDoCircuito, comprimentoDoCircuito } from '../utils/blueprintEletricaDimensionamento';

/** Sala 6 × 4; QDC a 1.600; C1 = luz de teto (a 2.800 = teto) + interruptor; C2 (FFF) = duas TUG; um ponto solto. */
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
  const ponto = (x: number, y: number, tipoEletrico: 'TUG' | 'ILUMINACAO_TETO' | 'INTERRUPTOR', cotaMm: number, circuitoId: string | null, levelId = t) => {
    m = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm, tipoEletrico }).model;
    const id = m.terminais[m.terminais.length - 1].id;
    if (circuitoId) m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, circuitoId }).model;
  };
  ponto(3000, 2000, 'ILUMINACAO_TETO', 2800, c1);
  ponto(1000, 75, 'INTERRUPTOR', 1100, c1);
  ponto(2000, 75, 'TUG', 300, c2);
  ponto(5925, 3000, 'TUG', 300, c2);
  ponto(4000, 3925, 'TUG', 300, null); // sem circuito
  return { m, t, quadroId, c1, c2, ponto: (x: number, y: number, tipo: 'TUG' | 'ILUMINACAO_TETO' | 'INTERRUPTOR', cota: number, cid: string | null, lvl?: string) => { ponto(x, y, tipo, cota, cid, lvl); return m; } };
}

const adds = (cmds: Command[]) => cmds.filter((c): c is Extract<Command, { type: 'AddTrecho' }> => c.type === 'AddTrecho');
const sets = (cmds: Command[]) => cmds.filter((c): c is Extract<Command, { type: 'SetTrechoProps' }> => c.type === 'SetTrechoProps');
const prumadas = (cmds: Command[]) => adds(cmds).filter((c) => c.a.x === c.b.x && c.a.y === c.b.y);
const horizontais = (cmds: Command[]) => adds(cmds).filter((c) => !(c.a.x === c.b.x && c.a.y === c.b.y));
const quadroDe = (m: BlueprintModel) => m.quadros[0];

describe('planejarEletrodutos — UMA rede por quadro, compartilhada', () => {
  it('todos os pontos do quadro numa árvore: prumadas do quadro e dos pontos fora do teto; quatro trechos no teto a partir do quadro', () => {
    const { m, c1, c2 } = casa();
    const plano = planejarEletrodutos(m, quadroDe(m));
    expect(plano.motivo).toBeNull();
    expect(plano).toMatchObject({ pontos: 4, ligados: 0, aLigar: 4, prumadasEntrePavimentos: 0, trechosAtualizados: 0 });
    expect(plano.pavimentos).toEqual([{ levelId: m.levels[0].id, nome: 'Térreo', pontos: 4, ligados: 0, aLigar: 4 }]);
    expect(prumadas(plano.comandos).map((c) => [c.a.x, c.a.y, c.cotaAMm, c.cotaBMm])).toEqual([
      [75, 1000, 1600, 2800], // o quadro sobe ao teto
      [1000, 75, 1100, 2800], // interruptor
      [2000, 75, 300, 2800], // TUG
      [5925, 3000, 300, 2800], // TUG
    ]);
    const hz = horizontais(plano.comandos);
    expect(hz).toHaveLength(4);
    for (const c of hz) expect([c.cotaAMm, c.cotaBMm]).toEqual([2800, 2800]);
    // Prim: o interruptor (a 1,3 m do quadro) liga primeiro, DIRETO ao quadro.
    expect([hz[0].a, hz[0].b]).toEqual([{ x: 75, y: 1000 }, { x: 1000, y: 75 }]);
    for (const c of adds(plano.comandos)) expect(c).toMatchObject({ disciplina: 'ELETRICA', sugerido: true });

    // O TRONCO (prumada do quadro e quadro→interruptor) carrega os DOIS circuitos: 3 (FN) + 4 (FFF) = 7 condutores.
    const prumadaDoQuadro = prumadas(plano.comandos)[0];
    expect(prumadaDoQuadro.circuitoIds).toEqual([c1, c2]);
    expect(prumadaDoQuadro.condutores).toBe(7);
    expect(hz[0].circuitoIds).toEqual([c1, c2]);
    // A prumada do interruptor é só C1; a da TUG, só C2.
    expect(prumadas(plano.comandos)[1]).toMatchObject({ circuitoIds: [c1], condutores: 3 });
    expect(prumadas(plano.comandos)[2]).toMatchObject({ circuitoIds: [c2], condutores: 4 });
    expect(plano.metrosPrevistos).toBeGreaterThan(5);
  });

  it('a BITOLA vem da ocupação: sete condutores de 2,5 cabem em 20; com C2 em 10 mm² o tronco sobe para 25 e o ramal só de C1 fica em 20', () => {
    const { m, c1, c2 } = casa();
    const hip = { ...HIPOTESES_ELETRODUTO_PADRAO, bitolaMm: 20 };
    const magro = planejarEletrodutos(m, quadroDe(m), hip);
    for (const c of adds(magro.comandos)) expect(c.bitolaMm).toBe(20);

    const grosso = applyCommand(m, { type: 'SetCircuitoProps', circuitoId: c2, secaoMm2: 10 }).model;
    const plano = planejarEletrodutos(grosso, quadroDe(grosso), hip);
    const tronco = prumadas(plano.comandos)[0];
    expect(tronco.circuitoIds).toEqual([c1, c2]);
    expect(tronco.bitolaMm).toBe(25);
    const ramalC1 = prumadas(plano.comandos)[1];
    expect(ramalC1.circuitoIds).toEqual([c1]);
    expect(ramalC1.bitolaMm).toBe(20);
  });

  it('aplicado, o plano é IDEMPOTENTE; a queda de tensão lê os eletrodutos; o AGRUPAMENTO medido entra na Tabela 42', () => {
    const { m, c1 } = casa();
    const plano = planejarEletrodutos(m, quadroDe(m));
    const depois = applyBatch(m, plano.comandos).model;
    expect(depois.trechos).toHaveLength(adds(plano.comandos).length);
    expect(eletrodutosSugeridos(depois, null)).toHaveLength(adds(plano.comandos).length);

    const denovo = planejarEletrodutos(depois, quadroDe(depois));
    expect(denovo).toMatchObject({ pontos: 4, ligados: 4, aLigar: 0, comandos: [], motivo: 'todos os pontos já têm eletroduto' });

    const circ = depois.circuitos.find((c) => c.id === c1)!;
    const comprimento = comprimentoDoCircuito(depois, circ);
    expect(comprimento?.origem).toBe('ELETRODUTOS');
    expect(comprimento!.metros).toBeGreaterThan(0);
    // C1 divide o tronco com C2: agrupamento 2 no pior trecho; sem eletroduto, a hipótese (1).
    expect(agrupamentoDoCircuito(depois, c1, HIPOTESES_PADRAO)).toBe(2);
    expect(agrupamentoDoCircuito(m, c1, HIPOTESES_PADRAO)).toBe(1);
  });

  it('respeita o que já existe: a prumada do quadro desenhada à mão não é lançada de novo — e GANHA o circuito que passa a usá-la', () => {
    const { m, t, c1, c2 } = casa();
    const comPrumada = applyCommand(m, {
      type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(75, 1000), b: point(75, 1000),
      cotaAMm: 1600, cotaBMm: 2800, bitolaMm: 25, circuitoId: c1, condutores: 3,
    }).model;
    const plano = planejarEletrodutos(comPrumada, quadroDe(comPrumada));
    expect(prumadas(plano.comandos).map((c) => [c.a.x, c.a.y])).toEqual([[1000, 75], [2000, 75], [5925, 3000]]);
    expect(plano.trechosAtualizados).toBe(1);
    const [atualizado] = sets(plano.comandos);
    expect(atualizado).toMatchObject({ trechoId: comPrumada.trechos![0].id, circuitoIds: [c1, c2], condutores: 7 });
    // Aplica e o trecho existente passa a carregar os dois.
    const depois = applyBatch(comPrumada, plano.comandos).model;
    expect(depois.trechos!.find((x) => x.id === comPrumada.trechos![0].id)!.circuitoIds).toEqual([c1, c2]);
  });

  it('ENTRE PAVIMENTOS: ponto no andar de cima é alcançado por uma prumada piso→teto na posição do quadro, que carrega o circuito dele', () => {
    const { m, c1, ponto } = casa();
    const comAndar = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const t1 = comAndar.levels[1].id;
    // ponto() fecha sobre o modelo interno da casa; aqui aplicamos direto.
    void ponto;
    const comPonto = (() => {
      const a = applyCommand(comAndar, { type: 'AddTerminal', levelId: t1, disciplina: 'ELETRICA', tipo: 'TUG', at: point(1000, 500), cotaMm: 300, tipoEletrico: 'TUG' }).model;
      return applyCommand(a, { type: 'SetTerminalProps', terminalId: a.terminais[a.terminais.length - 1].id, circuitoId: c1 }).model;
    })();
    const plano = planejarEletrodutos(comPonto, quadroDe(comPonto));
    expect(plano.pavimentos.map((p) => [p.nome, p.pontos, p.aLigar])).toEqual([['Térreo', 4, 4], ['1º', 1, 1]]);
    expect(plano.prumadasEntrePavimentos).toBe(1);
    const shaft = prumadas(plano.comandos).find((c) => c.levelId === t1 && c.a.x === 75 && c.a.y === 1000)!;
    expect(shaft).toMatchObject({ cotaAMm: 0, cotaBMm: 2800, circuitoIds: [c1], condutores: 3 });
    // No andar de cima: a prumada do ponto e um trecho no teto do quadro ao ponto.
    const noAndar = adds(plano.comandos).filter((c) => c.levelId === t1);
    expect(noAndar).toHaveLength(3);
    const hzAndar = horizontais(plano.comandos).filter((c) => c.levelId === t1);
    expect([hzAndar[0].a, hzAndar[0].b]).toEqual([{ x: 75, y: 1000 }, { x: 1000, y: 500 }]);
    // Aplica: tudo passa na invariante, e o caminho do C1 até o quadro existe.
    const depois = applyBatch(comPonto, plano.comandos).model;
    expect(planejarEletrodutos(depois, quadroDe(depois)).comandos).toEqual([]);
  });

  it('PAVIMENTO ABAIXO: o quadro desce ao piso do próprio pavimento, que é o teto do de baixo', () => {
    const { m, c1 } = casa();
    const comSub = applyCommand(m, { type: 'AddLevel', name: 'Subsolo', elevationMm: -2800, defaultHeightMm: 2800 }).model;
    const ts = comSub.levels[1].id;
    const a = applyCommand(comSub, { type: 'AddTerminal', levelId: ts, disciplina: 'ELETRICA', tipo: 'TUG', at: point(500, 500), cotaMm: 300, tipoEletrico: 'TUG' }).model;
    const comPonto = applyCommand(a, { type: 'SetTerminalProps', terminalId: a.terminais[a.terminais.length - 1].id, circuitoId: c1 }).model;
    const plano = planejarEletrodutos(comPonto, quadroDe(comPonto));
    expect(plano.prumadasEntrePavimentos).toBe(1);
    const descida = prumadas(plano.comandos).find((c) => c.levelId === m.levels[0].id && c.cotaAMm === 0 && c.cotaBMm === 1600)!;
    expect(descida).toBeDefined();
    expect(descida.circuitoIds).toEqual([c1]);
    expect(() => applyBatch(comPonto, plano.comandos)).not.toThrow();
  });

  it('sem circuitos ou sem pontos: motivo dito; um plano por quadro; ponto sem circuito é pendência, não decisão', () => {
    const { m, t } = casa();
    expect(pontosSemCircuito(m, t).map((p) => p.at)).toEqual([{ x: 4000, y: 3925 }]);
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const soQuadro = applyCommand(base, { type: 'AddQuadro', levelId: base.levels[0].id, nome: 'Q', at: point(0, 0), cotaMm: 1500 }).model;
    expect(planejarEletrodutos(soQuadro, soQuadro.quadros[0]).motivo).toBe('o quadro não tem circuitos');
    const semPontos = applyCommand(soQuadro, { type: 'AddCircuito', quadroId: soQuadro.quadros[0].id, nome: 'C1' }).model;
    expect(planejarEletrodutos(semPontos, semPontos.quadros[0]).motivo).toBe('nenhum ponto com circuito deste quadro');
    expect(planejarEletrodutosDoModelo(m)).toHaveLength(1);
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
    expect(JSON.parse(canonicalPayload(comum)).trechos[0]).not.toHaveProperty('circuitos');

    const { m: sug } = umTrechoSugerido();
    const payload = JSON.parse(canonicalPayload(sug));
    expect(payload.trechos[0].sugerido).toBe(true);
    expect(payload.trechos[0].circuitos).toEqual([0]);
    const volta = modelFromCanonicalPayload(payload);
    expect(volta.trechos![0].sugerido).toBe(true);
    expect(volta.trechos![0].circuitoIds).toEqual([sug.circuitos[0].id]);
  });

  it('o `circuito` ESCALAR do acervo antigo é lido como lista de um', () => {
    const { m: sug } = umTrechoSugerido();
    const payload = JSON.parse(canonicalPayload(sug));
    payload.trechos[0].circuito = payload.trechos[0].circuitos[0];
    delete payload.trechos[0].circuitos;
    const volta = modelFromCanonicalPayload(payload);
    expect(volta.trechos![0].circuitoIds).toEqual([sug.circuitos[0].id]);
  });

  it('MOVER confirma; SetTrechoProps sugerido:false aceita; apagar um circuito tira só ele do trecho', () => {
    const { m, id } = umTrechoSugerido();
    const movido = applyCommand(m, {
      type: 'TranslateEntities', wallIds: [], boundaryIds: [], trechoIds: [id], delta: point(100, 0), manterJuncoes: false,
    }).model;
    expect(movido.trechos![0].sugerido).toBeNull();

    const aceito = applyCommand(m, { type: 'SetTrechoProps', trechoId: id, sugerido: false }).model;
    expect(aceito.trechos![0].sugerido).toBeNull();
    expect(eletrodutosSugeridos(aceito, null)).toHaveLength(0);

    const [c1, c2] = m.circuitos.map((c) => c.id);
    const doisCircuitos = applyCommand(m, { type: 'SetTrechoProps', trechoId: id, circuitoIds: [c1, c2] }).model;
    expect(doisCircuitos.trechos![0].circuitoIds).toEqual([c1, c2]);
    const semC1 = applyCommand(doisCircuitos, { type: 'DeleteCircuito', circuitoId: c1 }).model;
    expect(semC1.trechos![0].circuitoIds).toEqual([c2]);
    const semNenhum = applyCommand(semC1, { type: 'DeleteCircuito', circuitoId: c2 }).model;
    expect(semNenhum.trechos![0].circuitoIds ?? null).toBeNull();
  });
});
