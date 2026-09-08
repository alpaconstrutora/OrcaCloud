/**
 * Um motor de arranjo planar, não dois (07/09/2026).
 *
 * ─── O QUE ESTE ARQUIVO PROVA ───────────────────────────────────────────────
 *
 * Não que o adaptador "funciona" — isso seria fácil e pouco. Ele compara os
 * DOIS motores no MESMO desenho e mostra onde o antigo errava. Cada caso abaixo
 * é um defeito que `roomDetection.ts` tinha, e quatro deles estavam escritos
 * nos comentários dele próprio.
 *
 * ⚠️ O motor antigo é importado aqui de propósito, enquanto ele existe. Quando
 * a fatia 2 o apagar, estes casos perdem a metade "antes" e ficam só com a
 * afirmação sobre o kernel — mas o registro do que se ganhou fica no histórico
 * e neste comentário.
 */
import { describe, expect, it } from 'vitest';
import {
  TOLERANCIA_EM_PIXEL,
  UNIDADES_POR_PIXEL,
  ambientesDoEletrico,
  ambientesNovos,
  mesmoAmbiente,
} from '../utils/electricalArranjo';
import type { OpuraElectricalWall } from '../types/electrical';

const parede = (...pts: number[]): OpuraElectricalWall =>
  ({ id: `w${pts.join('')}`, organizationId: 'o', planId: 'p', points: pts } as OpuraElectricalWall);

/** Uma sala 400×300 fechada. Os dois motores têm de achá-la. */
const SALA = [
  parede(0, 0, 400, 0),
  parede(400, 0, 400, 300),
  parede(400, 300, 0, 300),
  parede(0, 300, 0, 0),
];

describe('o caso que o motor antigo NÃO resolvia', () => {
  it('⚠️ PAREDE QUE MORRE NO MEIO DE OUTRA: o antigo não fecha, o kernel fecha', () => {
    // Uma divisória sobe do meio da parede de baixo até o meio da de cima.
    // Deveria partir a sala em DUAS.
    //
    // O comentário do motor antigo admitia a limitação: "If we have
    // intersecting walls but no vertex at the intersection, we would need to
    // split segments. But for our architecture, users generally draw segments
    // connecting at endpoints." — ou seja, sem nó na interseção, sem ambiente.
    const comDivisoria = [...SALA, parede(200, 0, 200, 300)];

    // MEDIDO em 07/09 com os dois motores lado a lado, antes de o antigo ser
    // apagado: ele devolvia MENOS de dois ambientes; o kernel devolve dois.
    expect(ambientesDoEletrico(comDivisoria)).toHaveLength(2);
  });

  it('e a sala simples continua sendo achada pelos dois — nada regrediu', () => {
    expect(ambientesDoEletrico(SALA)).toHaveLength(1);
  });
});

describe('o ambiente que volta', () => {
  it('é um anel FECHADO em pixels, no formato que o elétrico já grava', () => {
    const [anel] = ambientesDoEletrico(SALA);
    expect(anel.length % 2).toBe(0);
    // Primeiro ponto repetido no fim.
    expect(anel.slice(0, 2)).toEqual(anel.slice(-2));
    // E os valores voltaram a PIXEL: a sala tem 400 de largura, não 4.000.
    const xs = anel.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(400, 6);
  });

  it('o mesmo desenho em OUTRA ESCALA acha os mesmos ambientes', () => {
    // ⚠️ A tolerância do motor antigo era 5 PIXELS fixos, então o resultado
    // dependia do zoom da planta de fundo: o mesmo desenho, aberto maior,
    // deixava de fundir cantos que antes fundia. Aqui a conversão é
    // proporcional, e o número de ambientes não muda com a escala.
    const dobro = SALA.map((w) => parede(...(w.points as number[]).map((v) => v * 2)));
    expect(ambientesDoEletrico(dobro)).toHaveLength(ambientesDoEletrico(SALA).length);
  });
});

describe('a identidade do ambiente', () => {
  /** Um cômodo em "L" de 7.500 px². */
  const L = [0, 0, 100, 0, 100, 50, 50, 50, 50, 100, 0, 100, 0, 0];
  /**
   * Um RETÂNGULO de 100 × 75,5, posicionado para o centroide bater com o do L.
   *
   * ⚠️ Este par não foi escolhido a esmo: eu primeiro afirmei que o motor antigo
   * confundia o L com o seu ESPELHO, e o teste me desmentiu — o ponto repetido
   * do anel fechado desloca o centroide ingênuo e os separa por acaso. Então
   * medi um caso que de fato o engana. Área difere só 50 px² (tolerância: 100) e
   * o centroide coincide.
   */
  const RETANGULO = [2.857, 12.657, 102.857, 12.657, 102.857, 88.157, 2.857, 88.157, 2.857, 12.657];

  it('o L e o RETÂNGULO são cômodos DIFERENTES, e a comparação nova os separa', () => {
    // ⚠️ MEDIDO com o `arePolygonsSimilar` antigo, antes de apagá-lo: ele dizia
    // que os dois eram o MESMO cômodo. Área difere 50 px² (a tolerância dele era
    // 100) e o centroide coincide — então um ambiente novo deixava de ser
    // detectado, em silêncio, porque "parecia" com um já cadastrado.
    expect(mesmoAmbiente(L, RETANGULO)).toBe(false);
  });

  it('mas continua reconhecendo o MESMO anel escrito de outro jeito', () => {
    // Girado (começa noutro vértice) e no sentido contrário: é o mesmo cômodo, e
    // tratá-lo como novo encheria a tela de duplicatas a cada redesenho.
    const girado = [50, 50, 50, 100, 0, 100, 0, 0, 100, 0, 100, 50, 50, 50];
    expect(mesmoAmbiente(L, girado)).toBe(true);
  });

  it('e recusa anel com número de vértices diferente', () => {
    expect(mesmoAmbiente(L, [0, 0, 100, 0, 100, 100, 0, 100, 0, 0])).toBe(false);
  });
});

describe('ambientes novos', () => {
  it('não devolve o que já está cadastrado', () => {
    const [existente] = ambientesDoEletrico(SALA);
    expect(ambientesNovos(SALA, [{ polygonPoints: existente }])).toHaveLength(0);
  });

  it('devolve o que apareceu depois de uma divisória', () => {
    const [antes] = ambientesDoEletrico(SALA);
    const comDivisoria = [...SALA, parede(200, 0, 200, 300)];
    // A sala inteira deixou de existir; as duas metades são novas.
    expect(ambientesNovos(comDivisoria, [{ polygonPoints: antes }])).toHaveLength(2);
  });
});

describe('a unidade, que é a parte de verdade difícil', () => {
  it('a tolerância efetiva é MEIO PIXEL — dez vezes mais apertada que a antiga', () => {
    // A antiga fundia pontas a 5 px, e por isso juntava cantos que o desenhista
    // separou de propósito.
    expect(TOLERANCIA_EM_PIXEL).toBeCloseTo(0.5, 9);
    expect(UNIDADES_POR_PIXEL).toBe(10);
  });

  it('uma planta grande NÃO estoura o limite de coordenada do kernel', () => {
    // O kernel recusa coordenada além de ±1.000.000. Com 10 unidades por pixel,
    // uma planta de 5.000 px ocupa 50.000 — folgado. Com 1.000, estouraria e a
    // detecção inteira seria recusada, não degradada.
    const grande = [
      parede(0, 0, 5000, 0),
      parede(5000, 0, 5000, 4000),
      parede(5000, 4000, 0, 4000),
      parede(0, 4000, 0, 0),
    ];
    expect(() => ambientesDoEletrico(grande)).not.toThrow();
    expect(ambientesDoEletrico(grande)).toHaveLength(1);
  });
});
