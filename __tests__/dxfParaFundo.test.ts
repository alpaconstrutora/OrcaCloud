/**
 * O DXF COMO PLANTA DE FUNDO (22/09/2026, P2.36): o desenho original
 * rasterizado por baixo das paredes geradas, JÁ AFERIDO — a transformação
 * pixel→modelo sai do arquivo, com a unidade e a ancoragem das paredes.
 */
import { describe, expect, it } from 'vitest';
import { COR_DO_DESTAQUE, COR_DO_FUNDO, desenharFundo, LADO_MAX_PX, planejarFundo, type ContextoDeTraco } from '../utils/dxfParaFundo';
import { pixelParaModelo, modeloParaPixel } from '../utils/blueprintUnderlay';

const leitura = {
  segmentos: [
    { camada: 'PAREDE', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
    { camada: 'PAREDE', a: { x: 10, y: 0 }, b: { x: 10, y: 6 } },
    { camada: 'COTAS', a: { x: -1, y: -1 }, b: { x: 11, y: -1 } },
  ],
  arcos: [{ camada: 'PORTAS', centro: { x: 2, y: 0 }, raio: 0.8, anguloInicial: 0, anguloFinal: 90 }],
};

/** Grava as chamadas, para conferir sem canvas. */
function gravador() {
  const chamadas: string[] = [];
  const ctx: ContextoDeTraco & { chamadas: string[] } = {
    chamadas,
    lineWidth: 1,
    strokeStyle: '',
    lineCap: 'butt',
    beginPath: () => chamadas.push('begin'),
    moveTo: (x, y) => chamadas.push(`move ${x.toFixed(1)},${y.toFixed(1)}`),
    lineTo: (x, y) => chamadas.push(`line ${x.toFixed(1)},${y.toFixed(1)}`),
    arc: (x, y, r, a0, a1, anti) => chamadas.push(`arc ${x.toFixed(1)},${y.toFixed(1)} r${r.toFixed(1)} ${a0.toFixed(3)}..${a1.toFixed(3)} ${anti ? 'anti' : 'hor'}`),
    stroke: () => chamadas.push(`stroke ${String(ctx.strokeStyle)} w${ctx.lineWidth}`),
  };
  return ctx;
}

describe('planta de fundo do DXF · o plano', () => {
  it('a caixa vem do desenho em mm com a ancoragem; a resolução tem piso de 1 mm/px; o pixel (margem, margem) é o canto superior esquerdo do desenho', () => {
    // Arquivo em METRO (1000 mm/unidade), deslocado 500 mm em x. Caixa: x de −1 a 11 m, y de −1 a 6 m (a cota também conta).
    const plano = planejarFundo(leitura, { mmPorUnidade: 1000, dx: 500, dy: 0 })!;
    expect(plano).toMatchObject({ minX: -500, maxX: 11500, minY: -1000, maxY: 6000 });
    // 12 m no lado maior em 4096 − 16 px → 2,94 mm/px.
    expect(plano.mmPorPixel).toBeCloseTo(12000 / (LADO_MAX_PX - 16), 3);
    expect(plano.larguraPx).toBeLessThanOrEqual(LADO_MAX_PX);
    expect(plano.alturaPx).toBeLessThan(plano.larguraPx);
    const canto = pixelParaModelo(plano.underlay, { px: 8, py: 8 });
    expect(canto.x).toBeCloseTo(-500, 3);
    expect(canto.y).toBeCloseTo(6000, 3);
    // E a inversa: o canto inferior direito do desenho cai no pixel (largura − margem, altura − margem), a menos do arredondamento do teto.
    const q = modeloParaPixel(plano.underlay, 11500, -1000);
    expect(q.px).toBeCloseTo(plano.larguraPx - 8, -1);
    expect(q.py).toBeCloseTo(plano.alturaPx - 8, -1);
  });

  it('desenho pequeno não é ampliado além de 1 mm/px; sem traço devolve null; filtro de camadas restringe a caixa', () => {
    const pequeno = planejarFundo({ segmentos: [{ camada: 'X', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } }], arcos: [] }, { mmPorUnidade: 1, dx: 0, dy: 0 })!;
    expect(pequeno.mmPorPixel).toBe(1);
    expect(pequeno.larguraPx).toBe(1000 + 16);
    expect(planejarFundo({ segmentos: [], arcos: [] }, { mmPorUnidade: 1, dx: 0, dy: 0 })).toBeNull();
    const soParede = planejarFundo(leitura, { mmPorUnidade: 1000, dx: 0, dy: 0, camadas: new Set(['PAREDE']) })!;
    expect(soParede).toMatchObject({ minX: 0, minY: 0, maxX: 10000, maxY: 6000 });
  });
});

describe('planta de fundo do DXF · o traço', () => {
  it('cada segmento vira move+line em pixels do plano, o arco troca o sinal dos ângulos (Y invertido) e a camada em destaque sai por último, mais escura', () => {
    const o = { mmPorUnidade: 1000, dx: 0, dy: 0, camadaDestaque: 'PAREDE' };
    const plano = planejarFundo(leitura, o)!;
    const ctx = gravador();
    const n = desenharFundo(ctx, plano, leitura, o);
    expect(n).toEqual({ segmentos: 3, arcos: 1 });
    // Duas passadas: as camadas comuns (cinza, 1 px) e depois a de destaque (escura, 1,5 px).
    const strokes = ctx.chamadas.filter((c) => c.startsWith('stroke'));
    // Traço em MILÍMETROS do modelo (20 e 30 mm), convertido para pixels da imagem — não 1 px fixo.
    const u = plano.underlay;
    expect(strokes).toEqual([`stroke ${COR_DO_FUNDO} w${Math.max(1.5, 20 / u.mmPorPixel)}`, `stroke ${COR_DO_DESTAQUE} w${Math.max(2, 30 / u.mmPorPixel)}`]);
    // O ponto (0,0) do modelo: x = margem + (0 − minX)/mmPorPixel; y = (maxY − 0)/mmPorPixel + margem.
    const px = (0 - u.origemXMm) / u.mmPorPixel;
    const py = (u.origemYMm - 0) / u.mmPorPixel;
    expect(ctx.chamadas).toContain(`move ${px.toFixed(1)},${py.toFixed(1)}`);
    // O arco de 0°→90° anti-horário no modelo vira 0 → −π/2 "anti" no canvas (que tem Y para baixo).
    const arco = ctx.chamadas.find((c) => c.startsWith('arc'))!;
    expect(arco).toMatch(/ 0\.000\.\.-1\.571 anti$/);
    expect(arco).toMatch(new RegExp(`r${(800 / u.mmPorPixel).toFixed(1)}`));
  });

  it('o filtro de camadas deixa de fora o que não foi pedido', () => {
    const o = { mmPorUnidade: 1000, dx: 0, dy: 0, camadas: new Set(['PAREDE']) };
    const plano = planejarFundo(leitura, o)!;
    const ctx = gravador();
    expect(desenharFundo(ctx, plano, leitura, o)).toEqual({ segmentos: 2, arcos: 0 });
  });
});
