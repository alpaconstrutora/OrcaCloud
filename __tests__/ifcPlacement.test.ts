/**
 * A cadeia de `IfcLocalPlacement` — onde a parede realmente está.
 *
 * ─── O DEFEITO QUE ISTO IMPEDE ──────────────────────────────────────────────
 *
 * A importação já tinha uma matriz por elemento, vinda de `StreamAllMeshes`.
 * Ela é a transformação do CORPO (placement do objeto composto com a posição da
 * extrusão), e para uma peça estrutural é exatamente a certa, porque é aplicada
 * aos cantos do PERFIL.
 *
 * O eixo da parede não vive nesse sistema. Aplicar a matriz do corpo a ele dá
 * número plausível e errado — medido em 06/09/2026 nos dois arquivos reais:
 *
 * | | matriz do corpo | cadeia de placement |
 * |---|---|---|
 * | FZK-Haus · eixos que colapsam para zero | 1 | 0 |
 * | FZK-Haus · cantos que se encontram | 23% | 69% |
 * | DigitalHub · eixos que colapsam para zero | **70** | 0 |
 * | DigitalHub · comprimento mediano | 2,20 | 5,40 |
 *
 * Setenta paredes entrariam com comprimento ZERO e o resto encolhido: no lugar
 * certo, com a medida errada. É o defeito preferido deste módulo — o silencioso.
 */
import { describe, expect, it } from 'vitest';
import { matrizDoPlacement } from '../services/ifcParametricoService';

/** Um `IfcAxis2Placement3D` na forma que o `web-ifc` entrega. */
const colocar = (
  local: [number, number, number],
  eixoX?: [number, number, number],
  pai?: unknown,
) => ({
  RelativePlacement: {
    Location: { Coordinates: local.map((v) => ({ value: v })) },
    ...(eixoX ? { RefDirection: { DirectionRatios: eixoX.map((v) => ({ value: v })) } } : {}),
  },
  ...(pai ? { PlacementRelTo: pai } : {}),
});

/** Onde um ponto local cai no mundo, pela matriz coluna-maior. */
const aplicar = (m: number[], x: number, y: number) => ({
  x: m[0] * x + m[4] * y + m[12],
  y: m[1] * x + m[5] * y + m[13],
});

describe('cadeia de placement', () => {
  it('sem placement não há posição — e ninguém inventa uma', () => {
    expect(matrizDoPlacement(null)).toBeNull();
    expect(matrizDoPlacement(undefined)).toBeNull();
    expect(matrizDoPlacement({})).toBeNull();
  });

  it('o padrão da norma: sem eixos declarados, X é (1,0,0) e Z é (0,0,1)', () => {
    const m = matrizDoPlacement(colocar([3, 4, 5]))!;
    expect(aplicar(m, 0, 0)).toEqual({ x: 3, y: 4 });
    expect(aplicar(m, 1, 0)).toEqual({ x: 4, y: 4 });
    expect(m[14]).toBe(5);
  });

  it('A PAREDE DE 4,25 QUE COLAPSAVA continua com 4,25', () => {
    // O caso exato lido do FZK-Haus: eixo local [(0,0),(4.25,0)]. Com a matriz
    // do corpo ele saía com comprimento zero.
    const m = matrizDoPlacement(colocar([10, 20, 0], [0, 1, 0]))!;
    const a = aplicar(m, 0, 0);
    const b = aplicar(m, 4.25, 0);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(4.25, 9);
    // Girada 90°: o eixo local +X aponta para o +Y do mundo.
    expect(a).toEqual({ x: 10, y: 20 });
    expect(b.x).toBeCloseTo(10, 9);
    expect(b.y).toBeCloseTo(24.25, 9);
  });

  it('a cadeia compõe: pavimento → prédio → parede', () => {
    // Sem seguir `PlacementRelTo`, toda parede de um pavimento alto entraria
    // com a cota do térreo — e o desenho pareceria certo em planta.
    const predio = colocar([100, 0, 0]);
    const pavimento = colocar([0, 0, 3], undefined, predio);
    const parede = colocar([5, 5, 0], undefined, pavimento);
    const m = matrizDoPlacement(parede)!;
    expect(aplicar(m, 0, 0)).toEqual({ x: 105, y: 5 });
    expect(m[14]).toBe(3);
  });

  it('a rotação do pai gira o filho junto', () => {
    // Pavimento girado 90° e parede deslocada 2 no X local: ela tem que sair no
    // +Y do mundo. Compor na ordem errada daria (2,0) — plausível e errado.
    const pavimento = colocar([0, 0, 0], [0, 1, 0]);
    const parede = colocar([2, 0, 0], undefined, pavimento);
    const p = aplicar(matrizDoPlacement(parede)!, 0, 0);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(2, 9);
  });

  it('o RefDirection é ortogonalizado, não usado cru', () => {
    // A norma permite um RefDirection que não seja perpendicular ao eixo Z; usar
    // o vetor cru deixaria a base torta e a parede sairia esticada.
    const m = matrizDoPlacement(colocar([0, 0, 0], [3, 0, 0]))!;
    expect(Math.hypot(m[0], m[1], m[2])).toBeCloseTo(1, 9);
    expect(aplicar(m, 4.25, 0).x).toBeCloseTo(4.25, 9);
  });

  it('placement 2D (só duas coordenadas) não vira NaN', () => {
    const m = matrizDoPlacement({
      RelativePlacement: { Location: { Coordinates: [{ value: 7 }, { value: 8 }] } },
    })!;
    expect(aplicar(m, 0, 0)).toEqual({ x: 7, y: 8 });
    expect(m[14]).toBe(0);
  });
});
