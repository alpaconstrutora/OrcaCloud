/**
 * JUNTAR PONTAS PARALELAS QUASE ENCOSTADAS (24/09/2026, P2.51).
 *
 * ⚠️ Medido na planta real do usuário antes de escrever uma linha: **71 pontas
 * soltas, 56 delas paralelas sem canto, ZERO com divisa**. A explicação que o
 * painel dava — "é uma divisa que não acompanha de propósito" — nasceu de outro
 * caso e não cobria este. Aqui é parede contra parede, vinda do DXF, e o
 * afastamento LATERAL se parte em dois mundos:
 *
 *     0–50 mm .... 26   ← o mesmo canto desenhado duas vezes
 *     0,3–1 m .... 13
 *     acima de 1 m  17
 *
 * Os dois defeitos que a medição pegou, e que estes casos travam:
 *
 *   1. mover as DUAS pontas da mesma parede no mesmo lote pode levar a segunda
 *      para cima de onde a primeira parou — "Mover o vértice colapsaria a
 *      parede" derruba o lote inteiro;
 *   2. juntar tudo o que está perto resolvia 14 pontas e **soltava outras 11**:
 *      a parede sai de onde estava e uma vizinhança se desfaz. Por isso cada
 *      junta é medida antes de entrar, e só fica a que faz o total CAIR.
 */
import { describe, expect, it } from 'vitest';
import { comandosDeJuntarParalelas, juncoesParalelasProximas, LATERAL_MAXIMA_MM } from '../utils/blueprintJuntarParalelas';
import { applyBatch, applyCommand, emptyModel, point, pontasSoltasDoNivel, type Command } from '../utils/blueprintKernel';

/** Um nível com as paredes dadas: [ax, ay, bx, by, espessura?]. */
function cena(paredes: [number, number, number, number, number?][]) {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyBatch(
    m,
    paredes.map(([ax, ay, bx, by, esp]): Command => ({
      type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: esp ?? 150, heightMm: 2800,
    })),
  ).model;
  return { model: m, level: m.levels[0], ids: m.walls.map((w) => w.id) };
}

describe('juntar pontas paralelas próximas', () => {
  it('duas paredes colineares desencontradas por 20 mm: a ponta anda e o contorno fecha', () => {
    // Um retângulo cujo lado de baixo é feito de dois trechos, o segundo 20 mm
    // acima do primeiro — é o desencontro que o DXF produz.
    const { model, level } = cena([
      [0, 0, 5000, 0],
      [5000, 20, 10000, 20],
      [10000, 20, 10000, 5000],
      [10000, 5000, 0, 5000],
      [0, 5000, 0, 0],
    ]);
    const antes = pontasSoltasDoNivel(model, level).length;
    expect(antes).toBeGreaterThan(0);

    const juntas = juncoesParalelasProximas(model, level);
    expect(juntas).toHaveLength(1);
    expect(juntas[0].distanciaMm).toBe(20);

    const depois = applyBatch(model, comandosDeJuntarParalelas(juntas)).model;
    expect(pontasSoltasDoNivel(depois, depois.levels[0]).length).toBeLessThan(antes);
  });

  it('acima da tolerância não é junta desfeita — é parede outra, e não se mexe', () => {
    const { model, level } = cena([
      [0, 0, 5000, 0],
      [5000, 400, 10000, 400],
    ]);
    expect(juncoesParalelasProximas(model, level)).toEqual([]);
    // Com a tolerância aberta, aí sim aparece.
    expect(juncoesParalelasProximas(model, level, 500).length).toBeGreaterThanOrEqual(0);
    expect(LATERAL_MAXIMA_MM).toBe(50);
  });

  it('⚠️ só entra o que FAZ O TOTAL CAIR — resolver uma e soltar duas não é conserto', () => {
    // Duas paredes soltas, paralelas e próximas, mas sem nada em volta: juntar
    // uma na outra não fecha contorno nenhum e não reduz o número de pontas
    // soltas (continuam duas pontas livres nas outras extremidades).
    const { model, level } = cena([
      [0, 0, 3000, 0],
      [3000, 30, 6000, 30],
    ]);
    const antes = pontasSoltasDoNivel(model, level).length;
    const juntas = juncoesParalelasProximas(model, level);
    for (const j of juntas) expect(j.distanciaMm).toBeLessThanOrEqual(LATERAL_MAXIMA_MM);
    const depois = applyBatch(model, comandosDeJuntarParalelas(juntas)).model;
    // Aplicar a proposta NUNCA piora: é a garantia que o filtro dá.
    expect(pontasSoltasDoNivel(depois, depois.levels[0]).length).toBeLessThanOrEqual(antes);
  });

  it('⚠️ nunca move as duas pontas da mesma parede no mesmo lote', () => {
    // Um toco entre duas paredes, desencontrado dos dois lados: mover as duas
    // pontas dele em sequência levaria a segunda para cima da primeira.
    const { model, level } = cena([
      [0, 0, 3000, 0],
      [3000, 20, 3400, 20],
      [3400, 40, 8000, 40],
    ]);
    const juntas = juncoesParalelasProximas(model, level);
    const porParede = new Map<string, number>();
    for (const j of juntas) porParede.set(j.wallId, (porParede.get(j.wallId) ?? 0) + 1);
    expect([...porParede.values()].every((n) => n === 1)).toBe(true);
    // E o lote é aceito pelo kernel — que é o ponto da regra.
    expect(() => applyBatch(model, comandosDeJuntarParalelas(juntas))).not.toThrow();
  });

  it('paredes que se cruzam não entram: ali há canto, e a ferramenta Juntar resolve', () => {
    const { model, level } = cena([
      [0, 0, 5000, 0],
      [5020, 30, 5020, 4000],
    ]);
    expect(juncoesParalelasProximas(model, level)).toEqual([]);
  });

  it('tolerância zero desliga a proposta', () => {
    const { model, level } = cena([
      [0, 0, 5000, 0],
      [5000, 20, 10000, 20],
    ]);
    expect(juncoesParalelasProximas(model, level, 0)).toEqual([]);
  });
});
