/**
 * O TRACEJADO DO MOBILIÁRIO nas pranchas (11/11/2026). Achado pela planta da prévia da casa automática: a planta HUMANIZADA
 * a 1:75 congelava a página (e a exportação, com o mesmo código). Num segmento de 23,2 mm de papel, a fase acumulada chegava
 * a 1,1999999999999993 — logo abaixo do fim do traço cheio (1,2) —, o passo virava 7e-16, `t + passo === t` e o laço
 * desenhava linhas de comprimento zero para sempre.
 */
import { describe, expect, it } from 'vitest';
import { DesenhistaDeProva, linhaDoMobiliario } from '../utils/blueprintExport';

describe('linhaDoMobiliario — tracejado', () => {
  it('o segmento de 23,2 mm que travava termina: 12 traços cheios, nenhum de comprimento zero', () => {
    const d = new DesenhistaDeProva();
    linhaDoMobiliario(d, [{ x: 0, y: 0 }, { x: 23.2, y: 0 }], 'detalhe', true, '#111111');
    const tracos = d.chamadas.filter((c) => c.tipo === 'linha').map((c) => c.args as number[]);
    expect(tracos).toHaveLength(12);
    expect(tracos.every(([x1, , x2]) => x2 - x1 > 1e-6)).toBe(true);
  });

  it('a fase continua de um segmento para o seguinte e o desenho termina em qualquer comprimento', () => {
    for (let n = 1; n <= 400; n++) {
      const comp = n * 0.1;
      const d = new DesenhistaDeProva();
      linhaDoMobiliario(d, [{ x: 0, y: 0 }, { x: comp, y: 0 }, { x: comp, y: comp }], 'detalhe', true, '#111111');
      // No máximo um traço por período de 2 mm em cada segmento, mais o do começo de cada um.
      expect(d.chamadas.length).toBeLessThanOrEqual(Math.ceil((2 * comp) / 2) + 2);
    }
  });
});
