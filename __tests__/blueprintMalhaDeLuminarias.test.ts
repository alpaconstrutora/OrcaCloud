/**
 * LUMINÁRIAS EM MALHA POR ÁREA (E6.3, 29/09/2026 — item A do benchmark).
 *
 * "Completar pela norma" punha UMA luz de teto no ponto interior. Com a
 * hipótese "1 a cada N m²", a luz de teto que falta nasce em malha (linhas ×
 * colunas proporcionais ao ambiente), todas na mesma letra, e o mínimo da
 * norma (9.5.2.1.2) é dividido entre elas. Sem a hipótese, nada muda.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { comandosDeIluminacao, conferirIluminacao, malhaDeLuminarias, minimoDeIluminacaoVA } from '../utils/blueprintDistribuicao';

/** Um ambiente fechado pelo contorno dado (paredes de 15 cm). */
function ambiente(contorno: [number, number][]): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const cmds: Command[] = contorno.map(([x, y], i) => {
    const [bx, by] = contorno[(i + 1) % contorno.length];
    return { type: 'AddWall', levelId: t, a: point(x, y), b: point(bx, by), thicknessMm: 150, heightMm: 2800 };
  });
  return applyBatch(base, cmds).model;
}

const RETANGULO: [number, number][] = [[0, 0], [6000, 0], [6000, 4000], [0, 4000]];

describe('malha de luminárias', () => {
  it('sala 6 × 4 (≈ 23 m² úteis), 1 a cada 9 m² → n = 3 → 2 colunas × 2 linhas, centros das células', () => {
    const m = ambiente(RETANGULO);
    const s = m.spaces[0];
    const pts = malhaDeLuminarias(s, 9);
    expect(pts).toHaveLength(4);
    // Colunas em 1/4 e 3/4 da largura, linhas em 1/4 e 3/4 da altura do ambiente (face interna).
    const xs = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
    const ys = [...new Set(pts.map((p) => p.y))].sort((a, b) => a - b);
    expect(xs).toHaveLength(2);
    expect(ys).toHaveLength(2);
    expect(xs[0] + xs[1]).toBeCloseTo(6000, -1); // simétricas em torno do centro
    expect(ys[0] + ys[1]).toBeCloseTo(4000, -1);
  });

  it('ambiente pequeno (área ≤ m² por luminária) → uma só, no ponto interior', () => {
    const m = ambiente([[0, 0], [2000, 0], [2000, 2000], [0, 2000]]);
    expect(malhaDeLuminarias(m.spaces[0], 9)).toHaveLength(1);
  });

  it('⚠️ ambiente em L: as células que caem FORA do ambiente não viram luminária', () => {
    const m = ambiente([[0, 0], [8000, 0], [8000, 3000], [3000, 3000], [3000, 8000], [0, 8000]]);
    const s = m.spaces[0];
    const pts = malhaDeLuminarias(s, 4);
    expect(pts.length).toBeGreaterThan(1);
    // Nenhuma no "buraco" do L (x > 3000 e y > 3000).
    expect(pts.some((p) => p.x > 3000 && p.y > 3000)).toBe(false);
  });

  it('⚠️ Completar pela norma com malha: n luminárias na MESMA letra, o mínimo dividido (arredondado a 10 VA) e um interruptor', () => {
    const m = ambiente(RETANGULO);
    const s = m.spaces[0];
    const area = 6 * 4;
    const conf = conferirIluminacao(s, [], area, 'SALA');
    const cmds = comandosDeIluminacao(m.levels[0].id, s, m.walls, m.openings, 2800, conf, [], 9);
    const luzes = cmds.filter((c): c is Extract<Command, { type: 'AddTerminal' }> => c.type === 'AddTerminal' && c.tipoEletrico === 'ILUMINACAO_TETO');
    expect(luzes).toHaveLength(4);
    expect(new Set(luzes.map((l) => l.comando))).toEqual(new Set(['a']));
    const minimo = minimoDeIluminacaoVA(area);
    expect(minimo).toBe(340);
    for (const l of luzes) {
      expect(l.potenciaW).toBe(90); // 340 / 4 = 85 → 90
      expect(l.rotulo).toBe('340 VA (mínimo da norma) em 4 luminárias — confira');
      expect(l.sugerida).toBe(true);
    }
    const interruptores = cmds.filter((c) => c.type === 'AddTerminal' && c.tipoEletrico === 'INTERRUPTOR');
    expect(interruptores).toHaveLength(1);
  });

  it('sem a hipótese (padrão): igual a antes — uma luz, o mínimo inteiro, o rótulo de sempre', () => {
    const m = ambiente(RETANGULO);
    const s = m.spaces[0];
    const conf = conferirIluminacao(s, [], 24, 'SALA');
    const luzes = comandosDeIluminacao(m.levels[0].id, s, m.walls, m.openings, 2800, conf, []).filter((c) => c.type === 'AddTerminal' && c.tipoEletrico === 'ILUMINACAO_TETO');
    expect(luzes).toHaveLength(1);
    expect(luzes[0]).toMatchObject({ potenciaW: 340, rotulo: '340 VA é o mínimo da norma — confira' });
  });
});
