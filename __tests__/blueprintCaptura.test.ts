/**
 * F13 do plano `2026-10-11-planta-recursos-video-synaps.md` — CAPTURA DA IMAGEM DO 3D: as contas que não
 * precisam de WebGL (o tamanho que a placa aceita, a inversão das linhas, a imagem vazia, o nome do PNG).
 */
import { describe, expect, it } from 'vitest';
import { RESOLUCOES_DA_CAPTURA, dimensoesDaCaptura, fracaoComConteudo, inverterLinhas, nomeDaCaptura } from '../utils/blueprintCaptura';

describe('captura do 3D', () => {
  it('as resoluções são 16:9 (HD, QHD, 4K)', () => {
    for (const r of RESOLUCOES_DA_CAPTURA) expect(r.largura / r.altura).toBeCloseTo(16 / 9, 6);
  });

  it('dentro do limite da placa, o tamanho pedido; acima, reduz NA MESMA proporção e avisa', () => {
    expect(dimensoesDaCaptura(1920, 1080, 16384)).toEqual({ largura: 1920, altura: 1080, reduzida: false });
    const r = dimensoesDaCaptura(3840, 2160, 2048);
    expect(r).toEqual({ largura: 2048, altura: 1152, reduzida: true });
    expect(r.largura / r.altura).toBeCloseTo(16 / 9, 2);
  });

  it('inverte as linhas (o WebGL lê de baixo para cima) sem mexer dentro da linha', () => {
    // 2 × 2: linha de baixo vermelha, linha de cima azul (como o WebGL entrega).
    const px = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255]);
    expect(Array.from(inverterLinhas(px, 2, 2))).toEqual([0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 0, 255, 255, 0, 0, 255]);
  });

  it('imagem preta ou transparente = sem conteúdo; a cena com fundo claro passa', () => {
    expect(fracaoComConteudo(new Uint8Array(4 * 100))).toBe(0);
    const preto = new Uint8Array(4 * 100).map((_, i) => (i % 4 === 3 ? 255 : 0));
    expect(fracaoComConteudo(preto)).toBe(0);
    const claro = new Uint8Array(4 * 100).fill(248);
    expect(fracaoComConteudo(claro)).toBe(1);
  });

  it('o nome do PNG: estudo, vista e dia, sem acento nem espaço', () => {
    expect(nomeDaCaptura('Planta 11/10/2026', 'Sala — da varanda', new Date('2026-10-12T15:00:00Z'))).toBe('planta-11-10-2026--sala-da-varanda--2026-10-12.png');
    expect(nomeDaCaptura('Casa Térrea', null, new Date('2026-10-12T15:00:00Z'))).toBe('casa-terrea--3d--2026-10-12.png');
  });
});
