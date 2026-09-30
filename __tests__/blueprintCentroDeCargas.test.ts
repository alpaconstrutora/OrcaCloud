/**
 * CENTRO DE CARGAS (E6.2 do roadmap elétrico, 29/09/2026) — sem bump.
 *
 * Baricentro dos pontos ponderado por VA (os do quadro; todos, sem quadro);
 * a região onde Σ VA·d² fica até 10 % acima do mínimo (raio fechado); a
 * posição sugerida encaixada na parede mais próxima (até 3 m); "levar ao
 * centro" = TranslateEntities do quadro, ou AddQuadro quando não há.
 *
 * ⚠️ O que uma implementação ingênua erra: média SIMPLES das posições (um
 * chuveiro de 6 kW pesa o mesmo que um ponto de luz de 60 W); ponto sem
 * potência puxando o centro; e quadro "no centro" no meio da sala, longe de
 * qualquer parede.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import { RAIO_MINIMO_DA_REGIAO_MM, TOLERANCIA_DA_REGIAO, centroDeCargas, centroNaPlanta, comandosParaOCentro, trechosNoQuadro } from '../utils/blueprintCentroDeCargas';

type P = { x: number; y: number; va: number | null };

/** Um pavimento; quadro opcional em `quadroEm`; um circuito com os pontos dados; paredes opcionais. */
function cena(pontos: P[], opts: { quadroEm?: { x: number; y: number } | null; paredes?: [number, number, number, number][] } = {}): { m: BlueprintModel; levelId: string; quadroId: string | null } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  for (const [x0, y0, x1, y1] of opts.paredes ?? []) m = applyCommand(m, { type: 'AddWall', levelId, a: point(x0, y0), b: point(x1, y1), thicknessMm: 150, heightMm: 2800 }).model;
  const quadroEm = opts.quadroEm === undefined ? { x: 0, y: 0 } : opts.quadroEm;
  let quadroId: string | null = null;
  let circuitoId: string | null = null;
  if (quadroEm) {
    m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(quadroEm.x, quadroEm.y), cotaMm: 1600 }).model;
    quadroId = m.quadros[0].id;
    m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1', tensaoV: 127 }).model;
    circuitoId = m.circuitos[0].id;
  }
  for (const p of pontos) {
    m = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUE', at: point(p.x, p.y), cotaMm: 300, tipoEletrico: 'TUE', ...(p.va != null ? { potenciaW: p.va } : {}) }).model;
    if (circuitoId) m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId }).model;
  }
  return { m, levelId, quadroId };
}

const QUADRADO: P[] = [
  { x: 0, y: 0, va: 1000 },
  { x: 4000, y: 0, va: 3000 },
  { x: 4000, y: 4000, va: 1000 },
  { x: 0, y: 4000, va: 1000 },
];

describe('centro de cargas', () => {
  it('⚠️ PRONTO QUANDO: 4 pontos → o baricentro PONDERADO por VA (não a média simples)', () => {
    const { m, quadroId } = cena(QUADRADO, { quadroEm: { x: -3000, y: 0 } });
    const c = centroDeCargas(m, quadroId)!;
    // x = (0·1000 + 4000·3000 + 4000·1000 + 0·1000) / 6000; y = (4000·1000 + 4000·1000) / 6000.
    expect(c.centro).toEqual({ x: 2667, y: 1333 });
    expect(c.totalVA).toBe(6000);
    expect(c.pontos).toBe(4);
    // A média simples daria (2000, 2000): o ponto de 3 kVA puxa o centro.
    expect(c.centro).not.toEqual({ x: 2000, y: 2000 });
  });

  it('⚠️ a região: na borda do círculo o momento quadrático é 10 % maior que no centro (raio fechado, não chute)', () => {
    const { m, quadroId } = cena(QUADRADO);
    const c = centroDeCargas(m, quadroId)!;
    const cx = (4000 * 3000 + 4000 * 1000) / 6000;
    const cy = (4000 * 1000 + 4000 * 1000) / 6000;
    const J = (px: number, py: number) => QUADRADO.reduce((s, p) => s + (p.va as number) * ((p.x - px) ** 2 + (p.y - py) ** 2), 0);
    expect(TOLERANCIA_DA_REGIAO).toBe(0.1);
    expect(J(cx + c.raioMm, cy) / J(cx, cy)).toBeCloseTo(1.1, 3);
    expect(J(cx, cy - c.raioMm) / J(cx, cy)).toBeCloseTo(1.1, 3);
  });

  it('carga num ponto só: o raio fica no mínimo (a marca não some)', () => {
    const { m, quadroId } = cena([{ x: 1000, y: 1000, va: 600 }]);
    const c = centroDeCargas(m, quadroId)!;
    expect(c.centro).toEqual({ x: 1000, y: 1000 });
    expect(c.raioMm).toBe(RAIO_MINIMO_DA_REGIAO_MM);
  });

  it('⚠️ ponto sem potência fica FORA da conta (e é contado); sem nenhum com potência, não há centro', () => {
    const { m, quadroId } = cena([...QUADRADO, { x: 90000, y: 90000, va: null }]);
    const c = centroDeCargas(m, quadroId)!;
    expect(c.centro).toEqual({ x: 2667, y: 1333 });
    expect(c.pontosSemPotencia).toBe(1);
    const vazio = cena([{ x: 0, y: 0, va: null }]);
    expect(centroDeCargas(vazio.m, vazio.quadroId)).toBeNull();
    expect(centroDeCargas(vazio.m, 'qua_inexistente')).toBeNull();
  });

  it('⚠️ a posição sugerida ENCAIXA na parede mais próxima (até 3 m); sem parede perto, é o próprio centro', () => {
    // Parede horizontal em y = 0, de x = −1000 a 6000: o centro (2667, 1333) projeta em (2667, 0).
    const comParede = cena(QUADRADO, { paredes: [[-1000, 0, 6000, 0]] });
    const c1 = centroDeCargas(comParede.m, comParede.quadroId)!;
    expect(c1.posicaoSugerida).toEqual({ x: 2667, y: 0 });
    expect(c1.paredeId).toBe(comParede.m.walls[0].id);
    // Parede longe (y = 9000, a 7,7 m do centro): não encaixa.
    const longe = cena(QUADRADO, { paredes: [[-1000, 9000, 6000, 9000]] });
    const c2 = centroDeCargas(longe.m, longe.quadroId)!;
    expect(c2.posicaoSugerida).toEqual(c2.centro);
    expect(c2.paredeId).toBeNull();
  });

  it('quadro longe: distância, fora da região e Σ VA·d que cai na posição sugerida', () => {
    const { m, quadroId } = cena(QUADRADO, { quadroEm: { x: -6000, y: 0 } });
    const c = centroDeCargas(m, quadroId)!;
    expect(c.quadroEm).toEqual({ x: -6000, y: 0 });
    expect(c.distanciaDoQuadroMm).toBeCloseTo(Math.hypot(6000 + 8000 / 3, 4000 / 3), 6);
    expect(c.dentroDaRegiao).toBe(false);
    expect(c.momentoSugeridoVAm).toBeLessThan(c.momentoAtualVAm as number);
    // Σ VA·d no quadro atual, à mão: cada ponto × distância em m.
    const esperado = QUADRADO.reduce((s, p) => s + ((p.va as number) * Math.hypot(p.x + 6000, p.y)) / 1000, 0);
    expect(c.momentoAtualVAm).toBeCloseTo(esperado, 6);
  });

  it('⚠️ "levar ao centro": um TranslateEntities do quadro até a posição sugerida; depois dele, nada a mover', () => {
    const { m, quadroId } = cena(QUADRADO, { quadroEm: { x: -6000, y: 0 }, paredes: [[-1000, 0, 6000, 0]] });
    const c = centroDeCargas(m, quadroId)!;
    const cmds = comandosParaOCentro(m, c);
    expect(cmds).toEqual([{ type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], quadroIds: [quadroId], delta: { x: 2667 + 6000, y: 0 }, manterJuncoes: false }]);
    const depois = applyBatch(m, cmds).model;
    expect(depois.quadros[0].at).toEqual({ x: 2667, y: 0 });
    expect(depois.walls[0]).toEqual(m.walls[0]); // a parede não andou
    const c2 = centroDeCargas(depois, quadroId)!;
    expect(comandosParaOCentro(depois, c2)).toEqual([]);
    expect(c2.quadroNaSugerida).toBe(true);
    // ⚠️ A parede (y = 0) passa a 1,33 m do centro e a região tem 0,84 m: o quadro na parede fica FORA do círculo —
    // é o melhor prático, e o campo diz isso (a tela troca "fora da região" por "na posição sugerida").
    expect(c2.raioMm).toBe(843);
    expect(c2.sugeridaDentroDaRegiao).toBe(false);
    expect(c2.dentroDaRegiao).toBe(false);
    // Com a parede passando dentro da região (y = 1000, a 0,33 m do centro), a sugerida cai nela.
    const perto = cena(QUADRADO, { quadroEm: { x: -6000, y: 0 }, paredes: [[-1000, 1000, 6000, 1000]] });
    const c3 = centroDeCargas(perto.m, perto.quadroId)!;
    expect(c3.posicaoSugerida).toEqual({ x: 2667, y: 1000 });
    expect(c3.sugeridaDentroDaRegiao).toBe(true);
    expect(centroDeCargas(applyBatch(perto.m, comandosParaOCentro(perto.m, c3)).model, perto.quadroId)!.dentroDaRegiao).toBe(true);
  });

  it('sem quadro: o centro de TODOS os pontos, e "criar no centro" põe um QDC na posição sugerida', () => {
    const { m } = cena(QUADRADO, { quadroEm: null, paredes: [[-1000, 0, 6000, 0]] });
    const c = centroDeCargas(m, null)!;
    expect(c.quadroId).toBeNull();
    expect(c.levelId).toBe(m.levels[0].id);
    expect(c.distanciaDoQuadroMm).toBeNull();
    expect(c.momentoAtualVAm).toBeNull();
    const cmds = comandosParaOCentro(m, c);
    expect(cmds).toEqual([{ type: 'AddQuadro', levelId: m.levels[0].id, nome: 'QDC', at: { x: 2667, y: 0 }, cotaMm: 1600 }]);
    expect(applyBatch(m, cmds).model.quadros[0].nome).toBe('QDC');
  });

  it('sem quadro e com dois pavimentos: a marca vai para o de MAIOR carga', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const [t, s] = m.levels.map((l) => l.id);
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUE', at: point(0, 0), cotaMm: 300, tipoEletrico: 'TUE', potenciaW: 500 }).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: s, disciplina: 'ELETRICA', tipo: 'TUE', at: point(3000, 0), cotaMm: 300, tipoEletrico: 'TUE', potenciaW: 5500 }).model;
    const c = centroDeCargas(m, null)!;
    expect(c.levelId).toBe(s);
    expect(c.centro).toEqual({ x: 2750, y: 0 });
  });

  it('só os pontos DO quadro: o de outro quadro não puxa o centro', () => {
    const { m, levelId, quadroId } = cena(QUADRADO);
    let m2 = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QD2', at: point(50000, 0), cotaMm: 1600 }).model;
    const q2 = m2.quadros[1].id;
    m2 = applyCommand(m2, { type: 'AddCircuito', quadroId: q2, nome: 'C1', tensaoV: 127 }).model;
    m2 = applyCommand(m2, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUE', at: point(50000, 50000), cotaMm: 300, tipoEletrico: 'TUE', potenciaW: 9000 }).model;
    m2 = applyCommand(m2, { type: 'SetTerminalProps', terminalId: m2.terminais[m2.terminais.length - 1].id, circuitoId: m2.circuitos[1].id }).model;
    expect(centroDeCargas(m2, quadroId)!.centro).toEqual({ x: 2667, y: 1333 });
    expect(centroDeCargas(m2, q2)!.centro).toEqual({ x: 50000, y: 50000 });
  });

  it('⚠️ PRONTO QUANDO: mover apaga a marca — pelo botão ou arrastado; criar o 1º quadro apaga a de "todos"', () => {
    const { m, quadroId } = cena(QUADRADO, { quadroEm: { x: -6000, y: 0 } });
    const marca = { alvo: quadroId as string, quadroEm: { x: -6000, y: 0 } };
    expect(centroNaPlanta(m, marca)).toEqual({ levelId: m.levels[0].id, centro: { x: 2667, y: 1333 }, raioMm: 843, posicaoSugerida: { x: 2667, y: 1333 }, rotulo: 'Centro de cargas · QDC' });
    // Levado ao centro pelo botão:
    const levado = applyBatch(m, comandosParaOCentro(m, centroDeCargas(m, quadroId)!)).model;
    expect(centroNaPlanta(levado, marca)).toBeNull();
    // Arrastado 1 mm só:
    const arrastado = applyBatch(m, [{ type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], quadroIds: [quadroId as string], delta: { x: 1, y: 0 }, manterJuncoes: false }]).model;
    expect(centroNaPlanta(arrastado, marca)).toBeNull();
    // Mexer noutra coisa (um ponto) não apaga — a marca acompanha o centro novo.
    const outro = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, potenciaW: 7000 }).model;
    expect(centroNaPlanta(outro, marca)?.centro).not.toEqual({ x: 2667, y: 1333 });
    // Sem quadro: a marca de TODOS vale até o primeiro quadro nascer.
    const semQuadro = cena(QUADRADO, { quadroEm: null });
    const todos = { alvo: 'TODOS' as const, quadroEm: null };
    expect(centroNaPlanta(semQuadro.m, todos)?.rotulo).toBe('Centro de cargas');
    const criado = applyBatch(semQuadro.m, comandosParaOCentro(semQuadro.m, centroDeCargas(semQuadro.m, null)!)).model;
    expect(centroNaPlanta(criado, todos)).toBeNull();
    expect(centroNaPlanta(m, null)).toBeNull();
  });

  it('trechosNoQuadro conta os eletrodutos com uma ponta no quadro (os que não andam junto)', () => {
    const { m, levelId, quadroId } = cena(QUADRADO);
    let m2 = applyCommand(m, { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(0, 0), b: point(0, 2000), cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 25 }).model;
    m2 = applyCommand(m2, { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(0, 2000), b: point(2000, 2000), cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 25 }).model;
    expect(trechosNoQuadro(m2, quadroId as string)).toBe(1);
    expect(trechosNoQuadro(m2, 'qua_x')).toBe(0);
  });
});
