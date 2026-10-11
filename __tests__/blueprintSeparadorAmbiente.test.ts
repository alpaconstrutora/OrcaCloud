/**
 * F3 do plano `2026-10-11-planta-recursos-video-synaps.md` — SEPARADOR DE AMBIENTE.
 *
 * A linha sem material (`Boundary` DIVISA) que reparte um espaço aberto: vira dois
 * ambientes no arranjo, NÃO ganha rodapé (não há parede onde pregá-lo — quant-1.27.0)
 * e sai no DXF em camada própria, tracejada.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  computeQuantities,
  comprimentoSemParedeMm,
  emptyModel,
  ladoSemParede,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { sugerirRodapes } from '../utils/blueprintRodape';
import { gerarDxf } from '../utils/blueprintDxf';

const H = 2800;

/** Salão 6000 × 3000 mm. `divisao`: o que reparte em x = 2000 (entrada 2 m × sala 4 m). */
function salao(divisao: 'separador' | 'parede' | 'nada' | 'separador-sobre-parede'): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H }).model;
  const levelId = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: H,
  });
  const cmds: Command[] = [w(0, 0, 6000, 0), w(6000, 0, 6000, 3000), w(6000, 3000, 0, 3000), w(0, 3000, 0, 0)];
  if (divisao === 'parede' || divisao === 'separador-sobre-parede') cmds.push(w(2000, 0, 2000, 3000));
  if (divisao === 'separador' || divisao === 'separador-sobre-parede') {
    cmds.push({ type: 'AddBoundary', levelId, a: point(2000, 0), b: point(2000, 3000), kind: 'DIVISA' });
  }
  return applyBatch(base, cmds).model;
}

const rodapeTotalM = (m: BlueprintModel) =>
  computeQuantities(m).ambientes.reduce((soma, a) => soma + a.comprimentoRodapeM, 0);

describe('separador de ambiente (F3)', () => {
  it('reparte o salão em dois ambientes que somam a área toda', () => {
    const m = salao('separador');
    expect(m.spaces).toHaveLength(2);
    const total = m.spaces.reduce((s, x) => s + x.areaMm2, 0);
    expect(total).toBeCloseTo(6000 * 3000, -3);
    expect(salao('nada').spaces).toHaveLength(1);
  });

  it('o lado comum dos dois ambientes é "sem parede"; os lados de parede não', () => {
    const m = salao('separador');
    const levelId = m.levels[0].id;
    expect(ladoSemParede(point(2000, 0), point(2000, 3000), levelId, m.walls, m.boundaries)).toBe(true);
    expect(ladoSemParede(point(0, 0), point(2000, 0), levelId, m.walls, m.boundaries)).toBe(false);
    for (const s of m.spaces) expect(comprimentoSemParedeMm(s, m.walls, m.boundaries)).toBeCloseTo(3000, 0);
  });

  it('rodapé derivado (quant-1.27.0): o separador NÃO ganha rodapé — dos dois lados', () => {
    // Com PAREDE no meio, o rodapé corre dos dois lados dela: 10 m + 14 m de perímetro.
    expect(rodapeTotalM(salao('parede'))).toBeCloseTo(24, 3);
    // Com SEPARADOR, os 3 m do meio somem dos dois ambientes: 24 − 2 × 3 = 18 m —
    // exatamente o perímetro do salão, como se a linha não existisse.
    expect(rodapeTotalM(salao('separador'))).toBeCloseTo(18, 3);
    expect(rodapeTotalM(salao('nada'))).toBeCloseTo(18, 3);
  });

  it('separador desenhado SOBRE uma parede não desconta — lá há parede', () => {
    expect(rodapeTotalM(salao('separador-sobre-parede'))).toBeCloseTo(24, 3);
  });

  it('o gerador de trechos de rodapé não põe trecho sobre o separador', () => {
    const m = salao('separador');
    const { sugestoes } = sugerirRodapes(m, m.levels[0].id);
    expect(sugestoes.length).toBeGreaterThan(0);
    const sobreOSeparador = sugestoes.filter((s) => {
      const c = s.comando as Extract<Command, { type: 'AddRodape' }>;
      return c.pontos.every((p) => Math.abs(p.x - 2000) < 1);
    });
    expect(sobreOSeparador).toHaveLength(0);
    const metros = sugestoes.reduce((soma, s) => soma + s.comprimentoMm, 0) / 1000;
    expect(metros).toBeCloseTo(18, 3);
  });

  it('DXF: o separador sai na camada PLANTA-SEPARADORES (tracejada); a parede não', () => {
    const dxf = gerarDxf(salao('separador'), { titulo: 't', revisao: 1, hash: 'h' });
    const blocos = dxf.split('\n0\n');
    const linhasNoSeparador = blocos.filter((b) => b.startsWith('LINE') && /\n8\nPLANTA-SEPARADORES\n/.test(b));
    expect(linhasNoSeparador).toHaveLength(1);
    expect(linhasNoSeparador[0]).toMatch(/\n10\n2000(\.0+)?\n/);
    expect(dxf).toMatch(/\nLAYER\n2\nPLANTA-SEPARADORES\n70\n0\n62\n3\n6\nTRACEJADO\n/);
  });
});
