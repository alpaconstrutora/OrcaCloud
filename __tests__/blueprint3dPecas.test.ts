/**
 * ONDE A PEÇA CAI NO 3D (23/09/2026, P2.44).
 *
 * ⚠️ O defeito que estes casos travam: guarda-corpo e componentes usavam `-y`
 * como Z do mundo e o giro com o sinal do modelo, enquanto PAREDE, laje e
 * estrutura usam `z = +y` e giro invertido. Os dois mundos ficavam espelhados
 * um do outro em torno do eixo X — perto da origem quase coincidem, e a
 * dezenas de metros dela a peça vai parar fora do prédio. Foi o que o usuário
 * viu: o guarda-corpo da varanda solto, longe da edificação.
 *
 * A referência aqui é a PAREDE, que não mudou: `new Vector3(b.x - a.x, 0,
 * b.y - a.y)` para a direção e `((a.y + b.y) / 2) * S` para a posição
 * (`Blueprint3DViewer`, `geometriaDaEstrutural`).
 */
import { describe, expect, it } from 'vitest';
import { paineisDaPolilinha, pecaNoMundo, S_3D } from '../utils/blueprint3dPecas';

/** A conta da PAREDE, copiada do viewer — é contra ela que as peças têm de bater. */
function paredeNoMundo(a: { x: number; y: number }, b: { x: number; y: number }, alturaMm: number, elevacaoMm: number) {
  return {
    pos: [((a.x + b.x) / 2) * S_3D, (elevacaoMm + alturaMm / 2) * S_3D, ((a.y + b.y) / 2) * S_3D] as [number, number, number],
    dir: { x: b.x - a.x, z: b.y - a.y },
  };
}

describe('peça no 3D · a mesma convenção da parede', () => {
  it('o guarda-corpo em cima de uma parede cai EM CIMA dela no mundo — inclusive longe da origem', () => {
    // Uma parede a 40 m da origem e um guarda-corpo no mesmo eixo, no mesmo pavimento.
    const a = { x: 40000, y: 25000 };
    const b = { x: 44000, y: 25000 };
    const parede = paredeNoMundo(a, b, 2800, 3000);
    const [painel] = paineisDaPolilinha([a, b], 1100, 3000);
    expect(painel.pos[0]).toBeCloseTo(parede.pos[0], 6);
    expect(painel.pos[2]).toBeCloseTo(parede.pos[2], 6);
    // ⚠️ Com o sinal errado, o Z sairia em −25 m: 50 metros fora do lugar.
    expect(painel.pos[2]).toBeCloseTo(25, 6);
    expect(painel.comprimentoM).toBeCloseTo(4, 6);
    // Altura: base no piso do pavimento, caixa centrada.
    expect(painel.pos[1]).toBeCloseTo((3000 + 550) * S_3D, 6);
  });

  it('o giro segue a direção do trecho no MUNDO (positivo em planta = negativo em torno do Y)', () => {
    const horizontal = paineisDaPolilinha([{ x: 0, y: 0 }, { x: 1000, y: 0 }], 1100, 0)[0];
    expect(horizontal.rot).toBeCloseTo(0, 9);
    // Trecho subindo em +y (norte na planta): no mundo é +Z, e o giro é −90°.
    const paraNorte = paineisDaPolilinha([{ x: 0, y: 0 }, { x: 0, y: 1000 }], 1100, 0)[0];
    expect(paraNorte.rot).toBeCloseTo(-Math.PI / 2, 9);
    // E a ponta do painel girado cai onde o trecho termina (a prova de que giro e posição combinam).
    const meio = paraNorte.pos;
    const meiaVolta = paraNorte.comprimentoM / 2;
    const pontaX = meio[0] + Math.cos(paraNorte.rot) * meiaVolta;
    const pontaZ = meio[2] - Math.sin(paraNorte.rot) * meiaVolta;
    expect(pontaX).toBeCloseTo(0, 6);
    expect(pontaZ).toBeCloseTo(1, 6);
  });

  it('polilinha de três pontos vira dois painéis, numerados; trecho de clique duplo (menos de 1 mm) não vira nada', () => {
    const paineis = paineisDaPolilinha([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }], 1100, 0);
    expect(paineis.map((p) => p.trecho)).toEqual([1, 2]);
    expect(paineis.map((p) => Math.round(p.comprimentoM))).toEqual([2, 2]);
    expect(paineisDaPolilinha([{ x: 0, y: 0 }, { x: 0.4, y: 0 }], 1100, 0)).toEqual([]);
    expect(paineisDaPolilinha([{ x: 0, y: 0 }], 1100, 0)).toEqual([]);
  });

  it('a peça pontual (móvel, louça) usa o mesmo Z e o giro invertido, com a cota acima do piso', () => {
    const p = pecaNoMundo({ x: 40000, y: 25000 }, 90, 800, 0, 3000);
    expect(p.pos[0]).toBeCloseTo(40, 6);
    expect(p.pos[2]).toBeCloseTo(25, 6);
    expect(p.rot).toBeCloseTo(-Math.PI / 2, 9);
    expect(p.pos[1]).toBeCloseTo((3000 + 400) * S_3D, 6);
    // Evaporadora a 2,2 m do piso: a base sobe, a altura entra na conta.
    const alto = pecaNoMundo({ x: 0, y: 0 }, 0, 300, 2200, 3000);
    expect(alto.pos[1]).toBeCloseTo((3000 + 2200 + 150) * S_3D, 6);
  });
});
