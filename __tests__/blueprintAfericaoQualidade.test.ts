import { describe, expect, it } from 'vitest';
import {
  VAO_CURTO_PX,
  escalaAparente,
  escalaPadraoProxima,
  precisaoDaAfericao,
} from '../utils/blueprintUnderlay';

describe('escalaPadraoProxima', () => {
  it('pega o CASO REAL de 22/08/2026: 1:101,5 quando era 1:100', () => {
    // Aferição real lida do banco: mm_por_pixel = 17,1789 sobre uma cota
    // declarada de 1,1 m. A 150 dpi isso dá 1:101,5.
    const aparente = escalaAparente({
      origemXMm: 0,
      origemYMm: 0,
      mmPorPixel: 17.178867814079,
      rotacaoMrad: 0,
    });
    expect(aparente).toBeCloseTo(101.45, 1);
    expect(escalaPadraoProxima(aparente)).toBe(100);
  });

  it('CALA quando a aferição já está boa', () => {
    // 1:100 exato a 150 dpi. Avisar aqui viraria ruído que se aprende a ignorar.
    const exata = escalaAparente({
      origemXMm: 0,
      origemYMm: 0,
      mmPorPixel: (25.4 / 150) * 100,
      rotacaoMrad: 0,
    });
    expect(exata).toBeCloseTo(100, 6);
    expect(escalaPadraoProxima(exata)).toBeNull();
  });

  it('cala quando está longe demais de qualquer escala padrão', () => {
    // 1:137 não é erro de clique — é outra escala, ou outro dpi. Sugerir 1:125
    // seria empurrar o usuário para um número errado com ar de certeza.
    expect(escalaPadraoProxima(137)).toBeNull();
  });

  it('reconhece as escalas usuais de projeto', () => {
    expect(escalaPadraoProxima(50.8)).toBe(50);
    expect(escalaPadraoProxima(75.9)).toBe(75);
    expect(escalaPadraoProxima(24.7)).toBe(25);
    expect(escalaPadraoProxima(203)).toBe(200);
  });

  it('não sugere para entrada inválida', () => {
    expect(escalaPadraoProxima(0)).toBeNull();
    expect(escalaPadraoProxima(-100)).toBeNull();
    expect(escalaPadraoProxima(Number.NaN)).toBeNull();
  });
});

describe('precisaoDaAfericao', () => {
  it('explica o caso real: 1,1 m sobre ~64 px faz 1 pixel valer 1,5%', () => {
    const p = precisaoDaAfericao({ px: 100, py: 100 }, { px: 164, py: 100 });
    expect(p.vaoPx).toBeCloseTo(64, 5);
    expect(p.pctPorPixel).toBeCloseTo(1.56, 1);
    expect(p.vaoPx).toBeLessThan(VAO_CURTO_PX);
  });

  it('a cota longa é NOVE vezes mais precisa, com a mesma mão', () => {
    const curta = precisaoDaAfericao({ px: 0, py: 0 }, { px: 65, py: 0 });
    const longa = precisaoDaAfericao({ px: 0, py: 0 }, { px: 590, py: 0 });
    expect(longa.pctPorPixel).toBeLessThan(curta.pctPorPixel / 8);
    expect(longa.vaoPx).toBeGreaterThan(VAO_CURTO_PX);
  });

  it('mede na diagonal, não só na horizontal', () => {
    const p = precisaoDaAfericao({ px: 0, py: 0 }, { px: 300, py: 400 });
    expect(p.vaoPx).toBeCloseTo(500, 5);
  });

  it('não divide por zero quando os dois cliques coincidem', () => {
    const p = precisaoDaAfericao({ px: 10, py: 10 }, { px: 10, py: 10 });
    expect(p.pctPorPixel).toBe(Infinity);
  });
});
