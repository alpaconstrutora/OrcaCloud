/**
 * O terreno em BLOCO do estilo Maquete (25/11/2026, o reel da Hektar: *"No video mostra o volume
 * em corte"*): laterais nas arestas de borda da malha e fundo plano. A prova de que o sólido fecha:
 * topo + bloco, cada aresta (pela POSIÇÃO dos vértices) é usada por exatamente duas faces.
 */
import { describe, expect, it } from 'vitest';
import { blocoDoTerreno, espessuraDoBloco, malhaDaGrade, type GradeDeElevacao, type MalhaDoTerreno } from '../utils/blueprintTopografia';

const grade = (cotasM: (number | null)[], colunas: number, linhas: number): GradeDeElevacao => ({
  origem: { x: 0, y: 0 },
  espacamentoMm: 10_000,
  colunas,
  linhas,
  cotasM,
});

/** Conta as faces de cada aresta (chave = as duas pontas, por posição arredondada). */
function arestasPorPosicao(partes: { posicoes: Float32Array; indices: Uint32Array }[]): Map<string, number> {
  const m = new Map<string, number>();
  const ponto = (pos: Float32Array, i: number) => `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;
  for (const { posicoes, indices } of partes) {
    for (let k = 0; k < indices.length; k += 3) {
      for (let e = 0; e < 3; e++) {
        const a = ponto(posicoes, indices[k + e]);
        const b = ponto(posicoes, indices[k + ((e + 1) % 3)]);
        if (a === b) continue;
        const chave = a < b ? `${a}|${b}` : `${b}|${a}`;
        m.set(chave, (m.get(chave) ?? 0) + 1);
      }
    }
  }
  return m;
}

const fechado = (topo: MalhaDoTerreno) => {
  const bloco = blocoDoTerreno(topo);
  const arestas = arestasPorPosicao([topo, bloco]);
  return { bloco, abertas: [...arestas.values()].filter((n) => n !== 2).length };
};

describe('blocoDoTerreno', () => {
  it('grade cheia 3 × 3 nós: 8 arestas de borda viram parede, e o sólido fecha', () => {
    const topo = malhaDaGrade(grade([10, 11, 12, 11, 13, 12, 12, 12, 14], 3, 3), 10)!;
    const { bloco, abertas } = fechado(topo);
    expect(bloco.paredes).toBe(8);
    expect(abertas).toBe(0);
  });

  it('com nodata (borda recortada), as paredes seguem o recorte e o sólido continua fechado', () => {
    // Canto (2,2) sem dado: a célula de cima à direita some — a borda faz um "L".
    const topo = malhaDaGrade(grade([0, 1, 2, 1, 2, 3, 2, 3, null], 3, 3), 0)!;
    expect(topo.triangulos).toBe(6);
    const { bloco, abertas } = fechado(topo);
    expect(bloco.paredes).toBe(8);
    expect(abertas).toBe(0);
  });

  it('o fundo fica abaixo do ponto mais baixo pela espessura (15 % do desnível, 6 % do lado, no mínimo 2 m)', () => {
    const baixo = malhaDaGrade(grade([0, 1, 1, 2], 2, 2), 0)!;
    expect(espessuraDoBloco(baixo)).toBe(2);
    expect(blocoDoTerreno(baixo).baseY).toBe(-2);
    const alto = malhaDaGrade(grade([0, 40, 40, 80], 2, 2), 0)!;
    expect(espessuraDoBloco(alto)).toBeCloseTo(12, 9);
    expect(blocoDoTerreno(alto).baseY).toBeCloseTo(-12, 9);
    expect(blocoDoTerreno(alto, 5).baseY).toBe(-5);
    // Terreno largo e quase plano: 500 m de lado (51 nós a 10 m) e 1 m de desnível → 6 % de 500 = 30 m.
    const n = 51;
    const largo = malhaDaGrade(grade(Array.from({ length: n * n }, (_, k) => (k % n) / (n - 1)), n, n), 0)!;
    expect(espessuraDoBloco(largo)).toBeCloseTo(30, 6);
  });

  it('as paredes descem verticais: cada face tem o x/z do topo e o y do fundo', () => {
    const topo = malhaDaGrade(grade([5, 6, 7, 8], 2, 2), 0)!;
    const { posicoes, baseY } = blocoDoTerreno(topo);
    for (let f = 0; f < 4; f++) {
      const v = (i: number) => [posicoes[(f * 4 + i) * 3], posicoes[(f * 4 + i) * 3 + 1], posicoes[(f * 4 + i) * 3 + 2]];
      const [a, b, bb, ab] = [v(0), v(1), v(2), v(3)];
      expect([bb[0], bb[2]]).toEqual([b[0], b[2]]);
      expect([ab[0], ab[2]]).toEqual([a[0], a[2]]);
      expect(bb[1]).toBe(baseY);
      expect(ab[1]).toBe(baseY);
    }
  });
});
