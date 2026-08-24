import { describe, expect, it } from 'vitest';
import {
  achatarSegmentos,
  desachatarArcos,
  temArcos,
  caminhoDoVetor,
  desachatarSegmentos,
} from '../services/blueprintUnderlayService';
import { paraPixelSemRotacao, type SegmentoVetor } from '../utils/blueprintVetor';

const seg = (ax: number, ay: number, bx: number, by: number, w = 0.6): SegmentoVetor => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  larguraPt: w,
});

describe('caminhoDoVetor', () => {
  it('deriva do caminho da imagem, sem coluna nova no banco', () => {
    expect(caminhoDoVetor('org/estudo/abc123.png')).toBe('org/estudo/abc123.vetor.json');
  });

  it('não duplica extensão quando o caminho vem sem .png', () => {
    expect(caminhoDoVetor('org/estudo/abc123')).toBe('org/estudo/abc123.vetor.json');
  });

  it('é estável — o mesmo caminho dá sempre o mesmo destino', () => {
    // A ausência do arquivo é a ÚNICA forma de saber que não há vetor. Se este
    // caminho mudasse entre versões, todo vetor já guardado viraria invisível.
    const p = 'org/estudo/deadbeefdeadbeef.png';
    expect(caminhoDoVetor(p)).toBe(caminhoDoVetor(p));
    expect(caminhoDoVetor(p)).toBe('org/estudo/deadbeefdeadbeef.vetor.json');
  });
});

describe('achatar/desachatar', () => {
  it('faz a volta completa preservando a geometria', () => {
    const original = [seg(10.5, 20.25, 30.75, 40), seg(0, 0, 1.23, 4.56, 0.12)];
    const volta = desachatarSegmentos(achatarSegmentos(original, 3370, 2384, paraPixelSemRotacao(2384)));

    expect(volta).toHaveLength(2);
    expect(volta[0]).toEqual(original[0]);
    expect(volta[1]).toEqual(original[1]);
  });

  it('guarda o tamanho da página — é ele que inverte o Y', () => {
    const v = achatarSegmentos([seg(0, 0, 1, 1)], 3370, 2384, paraPixelSemRotacao(2384));
    expect(v.alturaPt).toBe(2384);
    expect(v.larguraPt).toBe(3370);
    expect(v.v).toBe(3);
  });

  it('arredonda para 0,01 pt — 0,35 mm a 1:100, abaixo da tolerância do pareamento', () => {
    const v = achatarSegmentos([seg(1.23456, 2.34567, 3, 4)], 100, 100, paraPixelSemRotacao(100));
    expect(v.seg[0]).toBe(1.23);
    expect(v.seg[1]).toBe(2.35);
  });

  it('cinco números por segmento, sem nome de campo repetido', () => {
    // É o que faz o arquivo caber: uma prancha A0 tem ~20 mil traços, e a
    // forma com objetos gasta mais com nome de campo do que com número.
    const v = achatarSegmentos([seg(1, 2, 3, 4), seg(5, 6, 7, 8)], 100, 100, paraPixelSemRotacao(100));
    expect(v.seg).toHaveLength(10);
    expect(v.seg.slice(0, 5)).toEqual([1, 2, 3, 4, 0.6]);
  });

  it('ignora sobra incompleta no fim, em vez de devolver ponto NaN', () => {
    const truncado = {
      v: 2 as const,
      paraPixel: paraPixelSemRotacao(100),
      larguraPt: 100,
      alturaPt: 100,
      seg: [1, 2, 3, 4, 0.6, 9, 9],
    };
    const volta = desachatarSegmentos(truncado);
    expect(volta).toHaveLength(1);
    expect(volta.every((s) => Number.isFinite(s.a.x) && Number.isFinite(s.b.y))).toBe(true);
  });
});

describe('versão do formato', () => {
  it('guarda a MATRIZ, não só a altura da página', () => {
    // v1 guardava só `alturaPt`, e quem lia tinha de derivar a conversão
    // espelhando o Y — o que erra em página com rotação. Foi assim que as
    // paredes do usuário foram parar dezenas de metros acima do desenho.
    const v = achatarSegmentos([seg(1, 2, 3, 4)], 3370, 2384, paraPixelSemRotacao(2384));
    // v3 = v2 + arcos. O salto de versão é ADITIVO: v2 continua sendo aceito
    // para PAREDE, ao contrário do v1, que é rejeitado por estar errado.
    expect(v.v).toBe(3);
    expect(v.paraPixel).toHaveLength(6);
    expect(v.paraPixel).toEqual(paraPixelSemRotacao(2384));
  });
});

/**
 * OS ARCOS — o que o v3 acrescenta.
 *
 * A distinção entre "v2, não sei se há porta" e "v3, não há porta" é a coisa
 * mais importante daqui: um zero que parece resultado, quando na verdade é
 * ausência de dado, é o mesmo erro que a recusa por falta de aferição já
 * custou uma vez.
 */
describe('arcos no formato guardado', () => {
  const arco = (n: number) => ({
    ini: { x: n, y: n + 1 },
    c1: { x: n + 2, y: n + 3 },
    c2: { x: n + 4, y: n + 5 },
    fim: { x: n + 6, y: n + 7 },
  });

  it('vai e volta inteiro', () => {
    const original = [arco(10), arco(100)];
    const v = achatarSegmentos([seg(0, 0, 1, 1)], 3370, 2384, paraPixelSemRotacao(2384), original);
    const volta = desachatarArcos(v);
    expect(volta).toHaveLength(2);
    expect(volta[0]).toEqual(original[0]);
    expect(volta[1]).toEqual(original[1]);
  });

  it('v3 sem arco nenhum ainda é v3 — "não tem porta", não "não sei"', () => {
    const v = achatarSegmentos([seg(0, 0, 1, 1)], 3370, 2384, paraPixelSemRotacao(2384));
    expect(temArcos(v)).toBe(true);
    expect(desachatarArcos(v)).toHaveLength(0);
  });

  it('v2 NÃO sabe de arcos — e a lista vazia dele não significa "sem porta"', () => {
    const v2 = {
      v: 2 as const,
      paraPixel: paraPixelSemRotacao(2384),
      larguraPt: 3370,
      alturaPt: 2384,
      seg: [0, 0, 1, 1, 0.6],
    };
    expect(temArcos(v2)).toBe(false);
    expect(desachatarArcos(v2)).toHaveLength(0);
  });
});
