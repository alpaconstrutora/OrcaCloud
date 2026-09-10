/**
 * A simbologia da TOMADA (NBR 5444), informada com print em 10/09/2026:
 *
 *   △ vazio = baixa (≈300) · ◭ meio = média (≈1.300) · ▲ cheio = alta (≈2.000)
 *   ⊡ triângulo no quadrado = no piso.
 *
 * Potência em cima, circuito entre traços embaixo, haste para a parede e o
 * triângulo apontando para DENTRO do ambiente.
 */
import { describe, expect, it } from 'vitest';
import { point } from '../utils/blueprintKernel';
import { alturaDaTomada, orientacaoDaTomada, trianguloDaTomada } from '../utils/blueprintRede';

describe('tomada · a classe de altura pela COTA', () => {
  it('as três alturas nominais da norma caem nas classes certas', () => {
    expect(alturaDaTomada(300)).toBe('BAIXA');
    expect(alturaDaTomada(1300)).toBe('MEDIA');
    expect(alturaDaTomada(2000)).toBe('ALTA');
  });

  it('⚠️ os cortes ficam nos MEIOS entre as nominais', () => {
    // Uma tomada a 1.100 é média, não baixa; a 1.700 é alta. Cortar nas
    // próprias nominais faria 1.299 ser "baixa" e 1.301 "média".
    expect(alturaDaTomada(799)).toBe('BAIXA');
    expect(alturaDaTomada(800)).toBe('MEDIA');
    expect(alturaDaTomada(1649)).toBe('MEDIA');
    expect(alturaDaTomada(1650)).toBe('ALTA');
  });

  it('⚠️ piso é cota ≤ 0 — a mesma fronteira do traço pontilhado', () => {
    expect(alturaDaTomada(0)).toBe('PISO');
    expect(alturaDaTomada(-50)).toBe('PISO');
    expect(alturaDaTomada(1)).toBe('BAIXA');
  });
});

describe('tomada · para onde o triângulo aponta', () => {
  const parede = { a: point(0, 0), b: point(5000, 0), thicknessMm: 150 };

  it('⚠️ na FACE da parede, aponta para o lado em que está — sem girar nada', () => {
    // É o que faz o símbolo apontar para dentro do ambiente por construção: a
    // tomada encaixada na face de cima está do lado de cima, e aponta para
    // cima (90°); a da face de baixo, para baixo (270°).
    expect(orientacaoDaTomada({ at: point(2000, 75) }, [parede])).toBe(90);
    expect(orientacaoDaTomada({ at: point(2000, -75) }, [parede])).toBe(270);
  });

  it('o giro DECLARADO vence a parede', () => {
    // Quem escolheu, escolheu — a mesma regra das medidas.
    expect(orientacaoDaTomada({ at: point(2000, 75), rotacaoGraus: 45 }, [parede])).toBe(45);
  });

  it('⚠️ NO EIXO da parede é ambíguo, e não escolhe um lado ao acaso', () => {
    // Não há "lado". Escolher um seria um símbolo apontando para dentro em
    // metade dos casos e para a parede na outra metade, sem regra visível.
    expect(orientacaoDaTomada({ at: point(2000, 0) }, [parede])).toBe(0);
  });

  it('longe de qualquer parede, +X', () => {
    expect(orientacaoDaTomada({ at: point(2000, 3000) }, [parede])).toBe(0);
  });

  it('entre duas paredes, a MAIS PERTO decide', () => {
    const outra = { a: point(0, 400), b: point(5000, 400), thicknessMm: 150 };
    // A 75 da primeira e a 325 da segunda: a primeira decide → aponta para cima.
    expect(orientacaoDaTomada({ at: point(2000, 75) }, [outra, parede])).toBe(90);
    // A 75 da segunda (lado de baixo dela) → aponta para baixo.
    expect(orientacaoDaTomada({ at: point(2000, 325) }, [parede, outra])).toBe(270);
  });
});

describe('tomada · o triângulo', () => {
  it('o ápice aponta na direção dada e a base fica atrás do centro', () => {
    const [b1, b2, apice] = trianguloDaTomada(point(0, 0), 90, 200);
    // Aponta para +Y: o ápice está acima do centro, a base abaixo.
    expect(apice.y).toBeCloseTo(100, 6);
    expect(b1.y).toBeCloseTo(-100, 6);
    expect(b2.y).toBeCloseTo(-100, 6);
    // A base tem a largura pedida.
    expect(Math.hypot(b1.x - b2.x, b1.y - b2.y)).toBeCloseTo(200, 6);
  });

  it('girar não move o centro', () => {
    for (const g of [0, 45, 90, 180, 270]) {
      const pts = trianguloDaTomada(point(1000, 2000), g, 200);
      const cx = (pts[0].x + pts[1].x) / 2 / 2 + pts[2].x / 2;
      const cy = (pts[0].y + pts[1].y) / 2 / 2 + pts[2].y / 2;
      // Centro = média entre o meio da base e o ápice.
      expect(cx, `giro ${g}`).toBeCloseTo(1000, 6);
      expect(cy, `giro ${g}`).toBeCloseTo(2000, 6);
    }
  });
});
