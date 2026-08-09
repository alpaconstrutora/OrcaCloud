/**
 * Planta de fundo — a matemática da calibração.
 *
 * Escala errada aqui é o mesmo defeito da folha que diz 1:100 e mede outra
 * coisa: o desenho sai plausível e TODO o quantitativo depois dele fica errado.
 * Por isso os casos medem de volta a distância declarada, em vez de conferir os
 * números intermediários — é a verificação que o usuário faria com o escalímetro.
 */

import { describe, expect, it } from 'vitest';
import {
  CalibracaoInvalida,
  UNDERLAY_NEUTRO,
  calibrar,
  distanciaMedidaMm,
  escalaAparente,
  modeloParaPixel,
  pixelParaModelo,
  type Underlay,
} from '../utils/blueprintUnderlay';

describe('calibração · a escala aferida é a que vale', () => {
  it('MEDIR DE VOLTA DEVOLVE A DISTÂNCIA DECLARADA', () => {
    // É a única conferência que importa. Se isto falha, tudo o que for traçado
    // sobre a imagem sai fora de escala.
    const p1 = { px: 100, py: 400 };
    const p2 = { px: 500, py: 400 };
    const u = calibrar({ p1, p2, distanciaMm: 3500 });

    expect(distanciaMedidaMm(u, p1, p2)).toBeCloseTo(3500, 6);
  });

  it('funciona com o segmento em diagonal', () => {
    // A cota de referência raramente está deitada na horizontal.
    const p1 = { px: 0, py: 0 };
    const p2 = { px: 300, py: 400 }; // 500 px
    const u = calibrar({ p1, p2, distanciaMm: 2500 });

    expect(u.mmPorPixel).toBeCloseTo(5, 9);
    expect(distanciaMedidaMm(u, p1, p2)).toBeCloseTo(2500, 6);
  });

  it('na primeira calibração o ponto clicado vira a origem do modelo', () => {
    const p1 = { px: 120, py: 340 };
    const u = calibrar({ p1, p2: { px: 520, py: 340 }, distanciaMm: 4000 });

    const m = pixelParaModelo(u, p1);
    expect(m.x).toBeCloseTo(0, 9);
    expect(m.y).toBeCloseTo(0, 9);
  });

  it('recusa dois pontos coincidentes em vez de dividir por zero', () => {
    expect(() =>
      calibrar({ p1: { px: 10, py: 10 }, p2: { px: 10, py: 10 }, distanciaMm: 1000 }),
    ).toThrow(CalibracaoInvalida);
  });

  it('recusa distância não positiva', () => {
    const p = { p1: { px: 0, py: 0 }, p2: { px: 100, py: 0 } };
    expect(() => calibrar({ ...p, distanciaMm: 0 })).toThrow(CalibracaoInvalida);
    expect(() => calibrar({ ...p, distanciaMm: -500 })).toThrow(CalibracaoInvalida);
  });
});

describe('calibração · o Y da imagem cresce para BAIXO', () => {
  it('O QUE ESTÁ EMBAIXO NA IMAGEM FICA EMBAIXO NO MODELO', () => {
    // Imagem tem Y para baixo; o modelo, para cima. Esquecer a inversão produz
    // uma planta espelhada na vertical — e numa planta simétrica isso não salta
    // aos olhos: só aparece com a porta do lado errado, na obra.
    const u = calibrar({
      p1: { px: 0, py: 0 },
      p2: { px: 100, py: 0 },
      distanciaMm: 1000,
    });

    const topoDaImagem = pixelParaModelo(u, { px: 0, py: 0 });
    const baseDaImagem = pixelParaModelo(u, { px: 0, py: 500 });

    expect(baseDaImagem.y, 'a base da imagem tem de ter Y MENOR no modelo').toBeLessThan(
      topoDaImagem.y,
    );
  });

  it('ida e volta fecha', () => {
    const u: Underlay = {
      origemXMm: 1234,
      origemYMm: -567,
      mmPorPixel: 8.5,
      rotacaoMrad: 0,
    };
    const p = { px: 321, py: 654 };
    const m = pixelParaModelo(u, p);
    const volta = modeloParaPixel(u, m.x, m.y);

    expect(volta.px).toBeCloseTo(p.px, 6);
    expect(volta.py).toBeCloseTo(p.py, 6);
  });

  it('ida e volta fecha TAMBÉM com rotação', () => {
    // A rotação é onde o sinal do Y costuma escapar: a inversão e o giro se
    // cancelam em alguns ângulos e o erro só aparece noutros.
    const u: Underlay = {
      origemXMm: -400,
      origemYMm: 900,
      mmPorPixel: 3.25,
      rotacaoMrad: 217,
    };
    const p = { px: 812, py: 145 };
    const m = pixelParaModelo(u, p);
    const volta = modeloParaPixel(u, m.x, m.y);

    expect(volta.px).toBeCloseTo(p.px, 6);
    expect(volta.py).toBeCloseTo(p.py, 6);
  });
});

describe('calibração · alinhar a planta torta', () => {
  it('o segmento de referência fica HORIZONTAL no modelo', () => {
    // Planta escaneada torta: a cota que deveria estar deitada sobe 40 px ao
    // longo de 400. Alinhar é o que evita traçar tudo enviesado.
    const p1 = { px: 0, py: 400 };
    const p2 = { px: 400, py: 360 };
    const u = calibrar({ p1, p2, distanciaMm: 4000, alinharHorizontal: true });

    const a = pixelParaModelo(u, p1);
    const b = pixelParaModelo(u, p2);

    expect(b.y - a.y, 'o segmento tem de sair reto').toBeCloseTo(0, 6);
    // E a distância declarada continua valendo depois de girar.
    expect(distanciaMedidaMm(u, p1, p2)).toBeCloseTo(4000, 6);
  });

  it('sem pedir alinhamento, a inclinação é preservada', () => {
    const p1 = { px: 0, py: 400 };
    const p2 = { px: 400, py: 360 };
    const u = calibrar({ p1, p2, distanciaMm: 4000 });

    const a = pixelParaModelo(u, p1);
    const b = pixelParaModelo(u, p2);
    expect(Math.abs(b.y - a.y)).toBeGreaterThan(1);
  });
});

describe('calibração · recalibrar não pode arrastar o que já foi traçado', () => {
  it('RECALIBRAR PIVOTA NO PRIMEIRO PONTO', () => {
    // Aferir de novo é comum: a primeira cota estava errada, ou o usuário quer
    // conferir noutra parte da folha. Se a imagem saltasse de lugar, todo o
    // traçado feito até ali teria de ser refeito por causa de uma medição.
    const p1 = { px: 200, py: 300 };
    const primeira = calibrar({ p1, p2: { px: 600, py: 300 }, distanciaMm: 4000 });
    const ondeEstava = pixelParaModelo(primeira, p1);

    const segunda = calibrar({
      p1,
      p2: { px: 600, py: 300 },
      distanciaMm: 4400, // a mesma cota, relida como 4,40 m
      anterior: primeira,
    });

    const ondeFicou = pixelParaModelo(segunda, p1);
    expect(ondeFicou.x).toBeCloseTo(ondeEstava.x, 6);
    expect(ondeFicou.y).toBeCloseTo(ondeEstava.y, 6);

    // E a escala nova é a que passa a valer.
    expect(distanciaMedidaMm(segunda, p1, { px: 600, py: 300 })).toBeCloseTo(4400, 6);
  });

  it('recalibrar em OUTRO ponto da folha também pivota nele', () => {
    const primeira = calibrar({
      p1: { px: 0, py: 0 },
      p2: { px: 400, py: 0 },
      distanciaMm: 4000,
    });

    const novoP1 = { px: 900, py: 700 };
    const ondeEstava = pixelParaModelo(primeira, novoP1);

    const segunda = calibrar({
      p1: novoP1,
      p2: { px: 1300, py: 700 },
      distanciaMm: 3800,
      anterior: primeira,
    });

    const ondeFicou = pixelParaModelo(segunda, novoP1);
    expect(ondeFicou.x).toBeCloseTo(ondeEstava.x, 6);
    expect(ondeFicou.y).toBeCloseTo(ondeEstava.y, 6);
  });
});

describe('calibração · leitura para o usuário', () => {
  it('a escala aparente traduz mm/px em 1:N', () => {
    // O número cru não diz nada a quem desenha; o denominador diz.
    // A 150 dpi, um pixel do papel vale 0,1693 mm. Uma planta 1:50 escaneada
    // assim dá 8,47 mm por pixel.
    const u = { ...UNDERLAY_NEUTRO, mmPorPixel: 25.4 / 150 * 50 };
    expect(escalaAparente(u, 150)).toBeCloseTo(50, 6);
  });
});
