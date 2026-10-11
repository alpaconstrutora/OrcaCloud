/**
 * 11/10/2026 (teste do usuário no app real): "EV-1" encostado em "SF-1" e "CD-1" por
 * cima do desenho da condensadora. A cena do print, em pixels de tela: a evaporadora
 * comprida e rasa, o sifão colado na ponta direita dela, a condensadora logo abaixo e
 * o ponto de dreno à direita.
 */
import { describe, expect, it } from 'vitest';
import { posicionarRotulos, type CaixaNaTela, type RotuloAPosicionar } from '../utils/blueprintRotulosSemColisao';

const cruza = (a: CaixaNaTela, b: CaixaNaTela) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const caixaDoTexto = (p: { x: number; y: number }, r: RotuloAPosicionar): CaixaNaTela => ({ x0: p.x, y0: p.y, x1: p.x + r.largura, y1: p.y + r.altura });

describe('o rótulo da peça fora dela e sem colisão', () => {
  const pecas = {
    EV: { x0: 395, y0: 329, x1: 463, y1: 346 },
    SF: { x0: 440, y0: 336, x1: 452, y1: 348 },
    CD: { x0: 403, y0: 369, x1: 469, y1: 398 },
    PD: { x0: 476, y0: 371, x1: 490, y1: 385 },
  };
  const rotulos: RotuloAPosicionar[] = (Object.keys(pecas) as (keyof typeof pecas)[]).map((id) => ({ id, largura: 26, altura: 11, caixa: pecas[id] }));
  const obstaculos = rotulos.map((r) => ({ id: r.id, caixa: r.caixa }));

  it('a cena do print: nenhum rótulo cobre outro, nem a própria peça, nem outra peça', () => {
    const postos = posicionarRotulos(rotulos, obstaculos);
    const caixas = postos.map((p, i) => ({ id: p.id, c: caixaDoTexto(p, rotulos[i]) }));
    for (const a of caixas) {
      for (const b of caixas) if (a.id !== b.id) expect(cruza(a.c, b.c), `${a.id} × ${b.id}`).toBe(false);
      for (const o of obstaculos) expect(cruza(a.c, o.caixa), `${a.id} sobre a peça ${o.id}`).toBe(false);
    }
  });

  it('a peça sozinha: o lugar de sempre — acima, à direita, na diagonal da caixa', () => {
    const r: RotuloAPosicionar = { id: 'EV', largura: 26, altura: 11, caixa: pecas.EV };
    expect(posicionarRotulos([r], [{ id: 'EV', caixa: pecas.EV }])).toEqual([{ id: 'EV', x: 463 + 3, y: 329 - 11 }]);
  });

  it('sem lugar livre, fica no primeiro (não some)', () => {
    const r: RotuloAPosicionar = { id: 'X', largura: 26, altura: 11, caixa: { x0: 100, y0: 100, x1: 110, y1: 110 } };
    const tudo = [{ id: 'muro', caixa: { x0: 0, y0: 0, x1: 300, y1: 300 } }];
    expect(posicionarRotulos([r], tudo)).toEqual([{ id: 'X', x: 113, y: 89 }]);
  });
});
