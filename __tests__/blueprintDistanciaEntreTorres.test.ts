/**
 * DISTÂNCIA ENTRE TORRES NA MASSA (28/10/2026): a medida entre os contornos de dois blocos e o deslocamento que afasta
 * o segundo até a distância pedida pelo Empreendimento. Puro.
 */
import { describe, expect, it } from 'vitest';
import { afastamentoNecessario, distanciaEntrePoligonosMm, transladar } from '../utils/blueprintDistanciaEntreTorres';

const ret = (x: number, y: number, w = 11000, h = 16000) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

describe('distanciaEntrePoligonosMm', () => {
  it('lado a lado: a folga entre as faces', () => {
    expect(distanciaEntrePoligonosMm(ret(0, 0), ret(15000, 0))).toBe(4000);
  });
  it('em diagonal: a distância entre os cantos', () => {
    expect(distanciaEntrePoligonosMm(ret(0, 0, 10000, 10000), ret(13000, 14000, 10000, 10000))).toBe(5000);
  });
  it('sobrepostos ou encostados: zero', () => {
    expect(distanciaEntrePoligonosMm(ret(0, 0), ret(5000, 5000))).toBe(0);
    expect(distanciaEntrePoligonosMm(ret(0, 0), ret(11000, 0))).toBe(0);
  });
});

describe('afastamentoNecessario', () => {
  it('Torre B a 4 m da A, pedido 6 m: afasta 2 m para longe da A, e a nova distância é a pedida', () => {
    const d = afastamentoNecessario(ret(0, 0), ret(15000, 0), 6000);
    expect(d).not.toBeNull();
    expect(Math.round(d!.x)).toBe(2000);
    expect(Math.round(d!.y)).toBe(0);
    expect(distanciaEntrePoligonosMm(ret(0, 0), transladar(ret(15000, 0), d!))).toBeGreaterThanOrEqual(6000);
    expect(distanciaEntrePoligonosMm(ret(0, 0), transladar(ret(15000, 0), d!))).toBeLessThan(6010);
  });
  it('já cumpre: nada a mover', () => {
    expect(afastamentoNecessario(ret(0, 0), ret(20000, 0), 6000)).toBeNull();
  });
  it('sobrepostos com o mesmo centro: afasta no eixo x, sem travar', () => {
    const d = afastamentoNecessario(ret(0, 0), ret(0, 0), 6000)!;
    expect(distanciaEntrePoligonosMm(ret(0, 0), transladar(ret(0, 0), d))).toBeGreaterThanOrEqual(6000);
  });
});
