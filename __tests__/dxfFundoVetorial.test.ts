/**
 * E10.4c do roadmap de climatização (08/10/2026): o DXF como fundo VETORIAL.
 * O vetor só substitui o PNG quando o plano refeito do desenho guardado bate
 * pixel a pixel com a imagem — e então cada traço cai no mesmo milímetro do
 * modelo em que o PNG o pôs.
 */
import { describe, expect, it } from 'vitest';
import { desenharFundo, fundoVetorialDoDesenho, LIMITE_DE_TRACOS_VETORIAIS, planejarFundo, type ContextoDeTraco } from '../utils/dxfParaFundo';
import { pixelParaModelo } from '../utils/blueprintUnderlay';
import type { LeituraDxf } from '../utils/dxfLeitor';

type Leitura = Pick<LeituraDxf, 'segmentos' | 'arcos'>;
const seg = (ax: number, ay: number, bx: number, by: number, camada = 'PAREDE') => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, camada }) as Leitura['segmentos'][number];
const leitura: Leitura = {
  segmentos: [seg(0, 0, 10, 0), seg(10, 0, 10, 5), seg(10, 5, 0, 5), seg(0, 5, 0, 0), seg(2, 1, 8, 1, 'MOBILIA')],
  arcos: [{ centro: { x: 3, y: 0 }, raio: 0.9, anguloInicial: 0, anguloFinal: 90, camada: 'PORTA' } as Leitura['arcos'][number]],
};
const desenho = { mmPorUnidade: 1000, camada: 'PAREDE', dx: 500, dy: -200 };

function gravador() {
  const chamadas: { op: string; a: number[]; largura: number }[] = [];
  const ctx: ContextoDeTraco = {
    lineWidth: 0,
    strokeStyle: '',
    lineCap: 'butt',
    beginPath() {},
    moveTo(x, y) {
      chamadas.push({ op: 'moveTo', a: [x, y], largura: ctx.lineWidth });
    },
    lineTo(x, y) {
      chamadas.push({ op: 'lineTo', a: [x, y], largura: ctx.lineWidth });
    },
    arc() {},
    stroke() {},
  };
  return { ctx, chamadas };
}

describe('E10.4c · o vetor só vale quando o plano bate com a imagem', () => {
  it('importado pela camada e unidade escolhidas: o 1º candidato bate, com a camada em destaque', () => {
    const plano = planejarFundo(leitura, { mmPorUnidade: 1000, dx: 500, dy: -200, camadaDestaque: 'PAREDE' })!;
    const v = fundoVetorialDoDesenho(leitura, desenho, { larguraPx: plano.larguraPx, alturaPx: plano.alturaPx });
    expect(v?.opcoes).toMatchObject({ mmPorUnidade: 1000, camadaDestaque: 'PAREDE' });
    expect(v?.plano.underlay).toEqual(plano.underlay);
  });

  it('importado pela leitura da ÒPURA (mm, sem destaque): o 2º candidato bate', () => {
    const plano = planejarFundo(leitura, { mmPorUnidade: 1, dx: 500, dy: -200 })!;
    const v = fundoVetorialDoDesenho(leitura, desenho, { larguraPx: plano.larguraPx, alturaPx: plano.alturaPx });
    expect(v?.opcoes).toMatchObject({ mmPorUnidade: 1, camadaDestaque: null });
  });

  it('a imagem não bate com nenhum (outra unidade, outra resolução): fica o PNG', () => {
    expect(fundoVetorialDoDesenho(leitura, desenho, { larguraPx: 1234, alturaPx: 567 })).toBeNull();
  });

  it('desenho grande demais para traçar a cada quadro: fica o PNG', () => {
    const grande: Leitura = { segmentos: Array.from({ length: LIMITE_DE_TRACOS_VETORIAIS + 1 }, (_, i) => seg(i, 0, i, 1)), arcos: [] };
    const plano = planejarFundo(grande, { mmPorUnidade: 1000, dx: 500, dy: -200, camadaDestaque: 'PAREDE' })!;
    expect(fundoVetorialDoDesenho(grande, desenho, { larguraPx: plano.larguraPx, alturaPx: plano.alturaPx })).toBeNull();
  });
});

describe('E10.4c · cada traço cai no milímetro em que o PNG o pôs', () => {
  it('o pixel do traço, levado pela aferição da prancha, é o ponto do DXF × unidade + ancoragem', () => {
    const plano = planejarFundo(leitura, { mmPorUnidade: 1000, dx: 500, dy: -200, camadaDestaque: 'PAREDE' })!;
    const v = fundoVetorialDoDesenho(leitura, desenho, { larguraPx: plano.larguraPx, alturaPx: plano.alturaPx })!;
    const { ctx, chamadas } = gravador();
    desenharFundo(ctx, v.plano, v.leitura, { ...v.opcoes, larguraFixaPx: 0.25 });
    // Os traços comuns (MOBILIA) saem antes; o 1º da camada em destaque é o (0,0)→(10,0).
    const daParede = chamadas.filter((c) => c.largura === 0.25 * 1.5);
    const inicio = pixelParaModelo(v.plano.underlay, { px: daParede[0].a[0], py: daParede[0].a[1] });
    expect(inicio.x).toBeCloseTo(0 * 1000 + 500, 6);
    expect(inicio.y).toBeCloseTo(0 * 1000 - 200, 6);
    const fim = pixelParaModelo(v.plano.underlay, { px: daParede[1].a[0], py: daParede[1].a[1] });
    expect(fim.x).toBeCloseTo(10 * 1000 + 500, 6);
    expect(fim.y).toBeCloseTo(-200, 6);
  });

  it('o traço é FIXO (o que a tela pediu) — e a camada em destaque sai 1,5× mais grossa', () => {
    const plano = planejarFundo(leitura, { mmPorUnidade: 1000, dx: 500, dy: -200, camadaDestaque: 'PAREDE' })!;
    const { ctx, chamadas } = gravador();
    desenharFundo(ctx, plano, leitura, { mmPorUnidade: 1000, dx: 500, dy: -200, camadaDestaque: 'PAREDE', larguraFixaPx: 0.4 });
    expect(new Set(chamadas.map((c) => c.largura))).toEqual(new Set([0.4, 0.4 * 1.5]));
    // Sem a largura fixa, o raster de sempre (20 mm do modelo, no mínimo 1,5 px).
    const raster = gravador();
    desenharFundo(raster.ctx, plano, leitura, { mmPorUnidade: 1000, dx: 500, dy: -200, camadaDestaque: 'PAREDE' });
    expect(Math.min(...raster.chamadas.map((c) => c.largura))).toBeGreaterThanOrEqual(1.5);
  });
});
