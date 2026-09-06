/**
 * Retângulo escrito como POLÍGONO — reconhecer não é estimar.
 *
 * ─── O CASO REAL ────────────────────────────────────────────────────────────
 *
 * Exportador nenhum é obrigado a usar `IfcRectangleProfileDef` para uma seção
 * retangular: escrever os quatro cantos como `IfcArbitraryClosedProfileDef` é
 * igualmente válido, e é o que o AltoQi faz em parte das vigas. Medido no
 * modelo real de 14 MB em 06/09/2026: 28 vigas eram recusadas por "perfil não
 * retangular" sendo retângulos de 19 × 70 cm.
 *
 * As dimensões saem dos próprios lados — exatas, lidas e não deduzidas. O que
 * este arquivo protege é a fronteira: o que NÃO é retângulo tem de continuar
 * não sendo, porque a alternativa (aceitar aproximando) é o número plausível e
 * errado que este módulo existe para recusar.
 */
import { describe, expect, it } from 'vitest';
import { normalizarRetangulo } from '../services/ifcParametricoService';

const pts = (...c: [number, number][]) => c.map(([x, y]) => ({ x, y }));

describe('perfil · retângulo escrito como polígono', () => {
  it('quatro cantos alinhados aos eixos viram RETANGULO, com as medidas dos lados', () => {
    const r = normalizarRetangulo(pts([0, 0], [19, 0], [19, 70], [0, 70]));
    expect(r).toEqual({ forma: 'RETANGULO', xDim: 19, yDim: 70 });
  });

  it('fora da origem também — o que importa são as dimensões', () => {
    const r = normalizarRetangulo(pts([-9.5, -35], [9.5, -35], [9.5, 35], [-9.5, 35]));
    expect(r).toEqual({ forma: 'RETANGULO', xDim: 19, yDim: 70 });
  });

  it('primeiro ponto repetido no fim não atrapalha', () => {
    const r = normalizarRetangulo(pts([0, 0], [19, 0], [19, 70], [0, 70], [0, 0]));
    expect(r).toEqual({ forma: 'RETANGULO', xDim: 19, yDim: 70 });
  });

  it('RODADO continua polígono — não há onde guardar o ângulo', () => {
    // Converter giraria a seção em silêncio: medidas certas, lugar errado.
    const r = normalizarRetangulo(pts([0, 0], [10, 10], [0, 20], [-10, 10]));
    expect(r.forma).toBe('POLIGONO');
  });

  it('seção T (8 pontos) continua polígono', () => {
    const t = pts(
      [0, 0], [99, 0], [99, 15], [59, 15], [59, 70], [40, 70], [40, 15], [0, 15],
    );
    expect(normalizarRetangulo(t).forma).toBe('POLIGONO');
  });

  it('triângulo continua polígono', () => {
    expect(normalizarRetangulo(pts([0, 0], [10, 0], [0, 10])).forma).toBe('POLIGONO');
  });

  it('degenerado com dois cantos coincidentes NÃO passa por retângulo', () => {
    // Tem 4 pontos e todos os lados paralelos a um eixo, mas a área não é a da
    // caixa. Sem a conferência de área, viraria um retângulo que não existe.
    const r = normalizarRetangulo(pts([0, 0], [19, 0], [19, 0], [0, 70]));
    expect(r.forma).toBe('POLIGONO');
  });

  it('achatado (área zero) continua polígono', () => {
    expect(normalizarRetangulo(pts([0, 0], [19, 0], [19, 0], [0, 0])).forma).toBe('POLIGONO');
  });
});
