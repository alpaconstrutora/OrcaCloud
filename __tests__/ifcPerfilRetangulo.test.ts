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
    const r = normalizarRetangulo(pts([-9.5, -35], [9.5, -35], [9.5, 35], [-9.5, 35]));
    expect(r).toEqual({ forma: 'RETANGULO', xDim: 19, yDim: 70 });
  });

  it('as medidas saem dos LADOS, não de uma tabela', () => {
    const r = normalizarRetangulo(pts([-20, -6], [20, -6], [20, 6], [-20, 6]));
    expect(r).toEqual({ forma: 'RETANGULO', xDim: 40, yDim: 12 });
  });

  it('primeiro ponto repetido no fim não atrapalha', () => {
    const r = normalizarRetangulo(pts([-9.5, -35], [9.5, -35], [9.5, 35], [-9.5, 35], [-9.5, -35]));
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

/**
 * A LIMPEZA do contorno — pontos que não mudam a forma.
 *
 * Medido no modelo real: dos 589 perfis poligonais, 28 eram reconhecíveis como
 * retângulo direto e 132 depois da limpeza. Os 104 a mais eram retângulos
 * escritos com um vértice a mais no meio de um lado.
 *
 * ⚠️ O caso "dois colineares seguidos" é o que quebra a implementação ingênua:
 * removendo em bloco com `filter`, os dois se julgam removíveis olhando um para
 * o outro e a forma desmonta. Na primeira medição desta investigação, 157
 * polígonos ortogonais viraram "triângulos" por causa disso.
 */
describe('perfil · limpeza do contorno', () => {
  it('ponto no MEIO de um lado não impede o reconhecimento', () => {
    const r = normalizarRetangulo(pts([-9.5, -35], [0, -35], [9.5, -35], [9.5, 35], [-9.5, 35]));
    expect(r).toEqual({ forma: 'RETANGULO', xDim: 19, yDim: 70 });
  });

  it('DOIS pontos colineares seguidos — o caso que derruba a versão ingênua', () => {
    const r = normalizarRetangulo(pts([-9.5, -35], [-3, -35], [3, -35], [9.5, -35], [9.5, 35], [-9.5, 35]));
    expect(r).toEqual({ forma: 'RETANGULO', xDim: 19, yDim: 70 });
  });

  it('ponto REPETIDO não impede', () => {
    const r = normalizarRetangulo(pts([-9.5, -35], [-9.5, -35], [9.5, -35], [9.5, 35], [-9.5, 35]));
    expect(r).toEqual({ forma: 'RETANGULO', xDim: 19, yDim: 70 });
  });

  it('colinear em CADA lado ainda dá o mesmo retângulo', () => {
    const r = normalizarRetangulo(
      pts([-9.5, -35], [0, -35], [9.5, -35], [9.5, 0], [9.5, 35], [0, 35], [-9.5, 35], [-9.5, 0]),
    );
    expect(r).toEqual({ forma: 'RETANGULO', xDim: 19, yDim: 70 });
  });

  it('e a limpeza NÃO transforma uma seção T em retângulo', () => {
    // A garantia de que limpar não vira aproximar: a forma continua a mesma.
    const t = pts(
      [0, 0], [99, 0], [99, 15], [59, 15], [59, 70], [40, 70], [40, 15], [0, 15],
    );
    expect(normalizarRetangulo(t).forma).toBe('POLIGONO');
  });

  it('nem um L em retângulo', () => {
    const l = pts([0, 0], [60, 0], [60, 20], [20, 20], [20, 70], [0, 70]);
    expect(normalizarRetangulo(l).forma).toBe('POLIGONO');
  });
});

/**
 * ⚠️ O RETÂNGULO TEM DE ESTAR CENTRADO NA ORIGEM.
 *
 * `RETANGULO` guarda só `xDim`/`yDim`, e quem o consome reconstrói os cantos em
 * −xDim/2..+xDim/2 — centrados, como manda `IfcRectangleProfileDef`. Um polígono
 * retangular desenhado longe da origem do perfil tem a mesma FORMA e outra
 * POSIÇÃO: convertê-lo moveria a peça pela distância do centro até a origem, em
 * silêncio, com as medidas todas certas.
 *
 * É o pior tipo de defeito deste módulo — resultado plausível, peça no lugar
 * errado — e ele só apareceu ao investigar por que a limpeza de contorno não
 * rendia peça nenhuma.
 */
describe('perfil · posição, não só forma', () => {
  it('retângulo FORA da origem continua polígono — converter o moveria', () => {
    const r = normalizarRetangulo(pts([0, 0], [19, 0], [19, 70], [0, 70]));
    expect(r.forma).toBe('POLIGONO');
  });

  it('o mesmo retângulo CENTRADO é convertido', () => {
    const r = normalizarRetangulo(pts([-9.5, -35], [9.5, -35], [9.5, 35], [-9.5, 35]));
    expect(r).toEqual({ forma: 'RETANGULO', xDim: 19, yDim: 70 });
  });

  it('deslocado só em um eixo também não passa', () => {
    const r = normalizarRetangulo(pts([-9.5, 0], [9.5, 0], [9.5, 70], [-9.5, 70]));
    expect(r.forma).toBe('POLIGONO');
  });
});
