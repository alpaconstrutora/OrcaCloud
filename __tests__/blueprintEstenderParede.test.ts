/**
 * A PAREDE QUE TERMINA NO VAZIO (23/09/2026, P2.42).
 *
 * `encostosSemJuncao` resolve a ponta que já está DENTRO da faixa desenhada da
 * outra parede (falta meia espessura) e `cantosEncostados` junta duas pontas
 * soltas sobrepostas. Sobra a parede que morre a meio metro da que deveria
 * encontrar: no desenho ela nem parece ligada, e por isso nenhum passe
 * automático a toca. `extensoesAteEncontrar` diz quais dessas alcançariam
 * alguém andando em frente — e é a pessoa que manda esticar.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, extensoesAteEncontrar, MAX_EXTENSAO_MM, point, pontasSoltasDoNivel, type Command } from '../utils/blueprintKernel';

/** Um nível com as paredes dadas; devolve o modelo, o nível e os ids na ordem. */
function comParedes(paredes: [number, number, number, number, number?][]) {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyBatch(
    m,
    paredes.map(([ax, ay, bx, by, esp]): Command => ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: esp ?? 150, heightMm: 2800 })),
  ).model;
  return { model: m, level: m.levels[0], ids: m.walls.map((w) => w.id) };
}

describe('extensoesAteEncontrar', () => {
  it('a parede que morre a 400 mm da perpendicular é alcançável — e esticá-la fecha o canto', () => {
    // Vertical de (0,0) a (0,5000) e horizontal que vai de (3000,5000) até (400,5000): falta 400 mm.
    const { model, level, ids } = comParedes([
      [0, 0, 0, 5000],
      [3000, 5000, 400, 5000],
    ]);
    expect(pontasSoltasDoNivel(model, level).length).toBeGreaterThanOrEqual(2);
    const e = extensoesAteEncontrar(model, level);
    const daHorizontal = e.filter((x) => x.wallId === ids[1]);
    expect(daHorizontal).toHaveLength(1);
    expect(daHorizontal[0]).toMatchObject({ end: 'b', to: { x: 0, y: 5000 }, alvoId: ids[0], distanciaMm: 400 });

    const esticado = applyBatch(model, daHorizontal.map((x): Command => ({ type: 'MoveVertex', wallId: x.wallId, end: x.end, to: x.to }))).model;
    // O canto fechou: a ponta virou vértice de grau 2, e some da lista de soltas.
    const soltasDepois = pontasSoltasDoNivel(esticado, esticado.levels[0]);
    expect(soltasDepois.some((s) => s.wallId === ids[1] && s.end === 'b')).toBe(false);
  });

  it('⚠️ acima do teto não é canto mal fechado, é vão: 1,5 m de distância não entra', () => {
    const { model, level, ids } = comParedes([
      [0, 0, 0, 5000],
      [3000, 5000, 1500, 5000],
    ]);
    expect(extensoesAteEncontrar(model, level).filter((x) => x.wallId === ids[1])).toEqual([]);
    // Com o teto afrouxado explicitamente, aí sim — a decisão é de quem chama.
    expect(extensoesAteEncontrar(model, level, 2000).filter((x) => x.wallId === ids[1])).toHaveLength(1);
    expect(MAX_EXTENSAO_MM).toBe(1200);
  });

  it('só para FRENTE: a parede que tem o alvo ATRÁS não é esticada (esticar não gira nem inverte)', () => {
    // A horizontal vai de (400,5000) para (3000,5000): a ponta livre `b` aponta para LONGE da vertical.
    const { model, level, ids } = comParedes([
      [0, 0, 0, 5000],
      [400, 5000, 3000, 5000],
    ]);
    const daHorizontal = extensoesAteEncontrar(model, level).filter((x) => x.wallId === ids[1]);
    // A ponta `a` (a de trás) é que alcança a vertical; a `b` não tem nada à frente.
    expect(daHorizontal.map((x) => x.end)).toEqual(['a']);
  });

  it('eixos paralelos não se cruzam, e encontro fora do corpo do alvo não vale', () => {
    // Duas horizontais na mesma linha, com um vão de 400: paralelas, nada a fazer.
    const paralelas = comParedes([
      [0, 0, 2000, 0],
      [2400, 0, 5000, 0],
    ]);
    expect(extensoesAteEncontrar(paralelas.model, paralelas.level)).toEqual([]);

    // A vertical está deslocada: o cruzamento cairia 1 m ALÉM da ponta dela.
    const fora = comParedes([
      [0, 0, 0, 3000],
      [3000, 5000, 400, 5000],
    ]);
    expect(extensoesAteEncontrar(fora.model, fora.level).filter((x) => x.wallId === fora.ids[1])).toEqual([]);
  });

  it('entre duas paredes à frente, a mais próxima ganha', () => {
    const { model, level, ids } = comParedes([
      [0, 0, 0, 5000],
      [600, 0, 600, 5000],
      [3000, 5000, 900, 5000],
    ]);
    const e = extensoesAteEncontrar(model, level).filter((x) => x.wallId === ids[2]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ alvoId: ids[1], distanciaMm: 300 });
  });
});
