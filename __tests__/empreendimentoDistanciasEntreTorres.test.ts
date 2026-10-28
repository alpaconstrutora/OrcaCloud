/**
 * DISTÂNCIA ENTRE TORRES (28/10/2026): *"quando um empreendimento tem mais de uma torre a distância entre torres
 * deve ser informada … em incorporação > empreendimento > aba torres e unidades. Essa informação deve ser considerada
 * em incorporação > planta inteligente"*. Decisão: UMA POR PAR de torres. Puro.
 */
import { describe, expect, it } from 'vitest';
import { comDistancia, distanciaDoPar, lerDistanciaDigitada, lerDistancias, paresDeTorres } from '../utils/empreendimentoDistanciasEntreTorres';

const T = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, sort_order: 0, ...extra });

describe('paresDeTorres', () => {
  it('cada par uma vez, na ordem da aba; quadra do loteamento fica fora', () => {
    const pares = paresDeTorres([T('c', 'Torre C', { sort_order: 2 }), T('a', 'Torre A'), T('b', 'Torre B', { sort_order: 1 }), T('q', 'Quadra 1', { blueprint_quadra_uid: 'u' })]);
    expect(pares.map(([x, y]) => `${x.name}–${y.name}`)).toEqual(['Torre A–Torre B', 'Torre A–Torre C', 'Torre B–Torre C']);
  });
  it('uma torre só: nenhum par', () => {
    expect(paresDeTorres([T('a', 'Torre A')])).toEqual([]);
  });
});

describe('lerDistancias (o jsonb do banco)', () => {
  it('aceita a lista válida e descarta o que não é par com número positivo', () => {
    expect(
      lerDistancias([
        { torre_a: 'a', torre_b: 'b', distancia_m: 6 },
        { torre_a: 'a', torre_b: 'a', distancia_m: 6 },
        { torre_a: 'a', torre_b: 'c', distancia_m: -1 },
        { torre_a: 'b' },
        'lixo',
      ]),
    ).toEqual([{ torre_a: 'a', torre_b: 'b', distancia_m: 6 }]);
    expect(lerDistancias(null)).toEqual([]);
  });
});

describe('distanciaDoPar / comDistancia', () => {
  it('o par vale nos dois sentidos; gravar troca, vazio tira', () => {
    let l = comDistancia([], 'b', 'a', 6);
    expect(l).toEqual([{ torre_a: 'a', torre_b: 'b', distancia_m: 6 }]);
    expect(distanciaDoPar(l, 'a', 'b')).toBe(6);
    expect(distanciaDoPar(l, 'b', 'a')).toBe(6);
    l = comDistancia(l, 'a', 'b', 8.5);
    expect(l).toEqual([{ torre_a: 'a', torre_b: 'b', distancia_m: 8.5 }]);
    expect(comDistancia(l, 'a', 'b', null)).toEqual([]);
    expect(distanciaDoPar([], 'a', 'b')).toBeNull();
  });
});

describe('lerDistanciaDigitada', () => {
  it('metros com vírgula ou ponto; vazio = sem distância; zero, negativo ou acima de 500 m recusado', () => {
    expect(lerDistanciaDigitada('6,50')).toBe(6.5);
    expect(lerDistanciaDigitada('12')).toBe(12);
    expect(lerDistanciaDigitada('  ')).toBeNull();
    expect(lerDistanciaDigitada('0')).toBe(false);
    expect(lerDistanciaDigitada('-3')).toBe(false);
    expect(lerDistanciaDigitada('600')).toBe(false);
    expect(lerDistanciaDigitada('abc')).toBe(false);
  });
});
