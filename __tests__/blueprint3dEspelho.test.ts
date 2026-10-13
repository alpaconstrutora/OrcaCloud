/**
 * O 3D sem espelho (12/10/2026): o espaço do desenho (Z = +y) passa ao mundo
 * pela escala (1, 1, −1). O que se prova é a ORIENTAÇÃO — o defeito era uma
 * reflexão, e reflexão não aparece em medida, só em lado.
 */
import { describe, expect, it } from 'vitest';
import { doDesenhoParaMundo, ESCALA_DO_DESENHO_NO_MUNDO, planoNoMundo } from '../utils/blueprint3dEspelho';

const cruz = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Do desenho (x leste, y norte, cota) ao espaço do desenho 3D, como o viewer monta: (x, cota, y). */
const noEspacoDoDesenho = (leste: number, norte: number, cota = 0): [number, number, number] => [leste, cota, norte];

describe('o desenho no mundo 3D', () => {
  it('no mundo, leste × cima = sul — a orientação de um mapa visto de CIMA (sem espelho)', () => {
    const leste = doDesenhoParaMundo(noEspacoDoDesenho(1, 0));
    const cima = doDesenhoParaMundo(noEspacoDoDesenho(0, 0, 1));
    const sul = doDesenhoParaMundo(noEspacoDoDesenho(0, -1));
    expect(cruz(leste, cima)).toEqual(sul);
  });

  it('o ESPAÇO DO DESENHO sozinho é a reflexão: leste × cima = NORTE (o defeito)', () => {
    expect(cruz(noEspacoDoDesenho(1, 0), noEspacoDoDesenho(0, 0, 1))).toEqual(noEspacoDoDesenho(0, 1));
  });

  it('norte do desenho em −Z no mundo; a escala do grupo é a mesma conta', () => {
    expect(doDesenhoParaMundo(noEspacoDoDesenho(0, 10))).toEqual([0, 0, -10]);
    const p = noEspacoDoDesenho(3, 7, 2);
    expect(doDesenhoParaMundo(p)).toEqual(p.map((v, i) => v * ESCALA_DO_DESENHO_NO_MUNDO[i]));
    // É a própria inversa.
    expect(doDesenhoParaMundo(doDesenhoParaMundo(p))).toEqual(p);
  });

  it('o plano de recorte no mundo corta o MESMO ponto que cortava no desenho', () => {
    const plano = { normal: [0.6, 0, 0.8] as [number, number, number], constante: -5 };
    const p = noEspacoDoDesenho(4, 3.25, 1);
    const ladoNoDesenho = plano.normal[0] * p[0] + plano.normal[1] * p[1] + plano.normal[2] * p[2] + plano.constante;
    const w = planoNoMundo(plano);
    const q = doDesenhoParaMundo(p);
    const ladoNoMundo = w.normal[0] * q[0] + w.normal[1] * q[1] + w.normal[2] * q[2] + w.constante;
    expect(ladoNoMundo).toBeCloseTo(ladoNoDesenho, 12);
    expect(w.constante).toBe(-5);
  });
});
