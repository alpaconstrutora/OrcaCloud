import { describe, expect, it } from 'vitest';
import { blocosDaConcepcao, chamadasDaConcepcao, DESTAQUE_DO_USO, tomClaro, type PecaParaConcepcao } from '../utils/blueprintConcepcao';

const ret = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

// Torre A: 10 × 20 m, 2 pavimentos, cada um em 2 unidades (fatias). Torre B ao lado, em y 30–50 m, comercial.
const TORRE_A = ret(0, 0, 10000, 20000);
const pecas: PecaParaConcepcao[] = [
  { id: 'A', anel: ret(0, 0, 10000, 10000), contornoDoBloco: TORRE_A, baseMm: 0, topoMm: 3000, bloco: 'Torre A', uso: 'RESIDENCIAL', indice: 1 },
  { id: 'A', anel: ret(0, 10000, 10000, 20000), contornoDoBloco: TORRE_A, baseMm: 0, topoMm: 3000, bloco: 'Torre A', uso: 'RESIDENCIAL', indice: 1 },
  { id: 'A', anel: ret(0, 0, 10000, 10000), contornoDoBloco: TORRE_A, baseMm: 3000, topoMm: 6000, bloco: 'Torre A', uso: 'RESIDENCIAL', indice: 2 },
  { id: 'B', anel: ret(0, 30000, 10000, 50000), baseMm: 0, topoMm: 4000, bloco: 'Torre B', uso: 'COMERCIAL', indice: 1 },
];

describe('tomClaro', () => {
  it('mistura com o branco: 0 é a cor, 1 é o branco', () => {
    expect(tomClaro('#2563eb', 0)).toBe('#2563eb');
    expect(tomClaro('#2563eb', 1)).toBe('#ffffff');
    expect(tomClaro('#000000', 0.5)).toBe('#808080');
    expect(tomClaro('azul', 0.5)).toBe('#ffffff');
  });
});

describe('blocosDaConcepcao', () => {
  it('junta os prismas (pavimentos e fatias de unidade) num volume por bloco, com o contorno do bloco', () => {
    const b = blocosDaConcepcao(pecas);
    expect(b.map((x) => [x.id, x.nome, x.baseMm, x.topoMm, x.pavimentos])).toEqual([
      ['A', 'Torre A', 0, 6000, 2],
      ['B', 'Torre B', 0, 4000, 1],
    ]);
    expect(b[0].contorno).toEqual(TORRE_A);
  });

  it('a cor de destaque é a do uso, e o volume é quase branco', () => {
    const [a, b] = blocosDaConcepcao(pecas);
    expect(a.cor).toBe(DESTAQUE_DO_USO.RESIDENCIAL);
    expect(b.cor).toBe(DESTAQUE_DO_USO.COMERCIAL);
    expect(a.corClara).toBe(tomClaro(DESTAQUE_DO_USO.RESIDENCIAL, 0.9));
  });
});

describe('chamadasDaConcepcao', () => {
  it('cada bloco com a caixa para FORA da cena, na altura do meio dele, e a linha encostando na face', () => {
    const [a, b] = chamadasDaConcepcao(blocosDaConcepcao(pecas));
    // O centro dos blocos fica em y = 25 m: a Torre A (y 0–20) chama para −y, a Torre B (y 30–50) para +y.
    expect(a.ancora).toEqual([5, 3, 0]);
    expect(a.rotulo[2]).toBeLessThan(-5);
    expect(b.ancora).toEqual([5, 2, 50]);
    expect(b.rotulo[2]).toBeGreaterThan(55);
    expect(a.titulo).toBe('Torre A');
    expect(a.subtitulo).toBe('Residencial · 2 pav');
    expect(b.subtitulo).toBe('Comercial · 1 pav');
  });

  it('um bloco só: a caixa vai para o lado +x', () => {
    const [a] = chamadasDaConcepcao(blocosDaConcepcao(pecas.filter((p) => p.id === 'A')));
    expect(a.ancora).toEqual([10, 3, 10]);
    expect(a.rotulo[0]).toBeGreaterThan(10);
    expect(a.rotulo[2]).toBe(10);
  });

  it('sem blocos, nada', () => {
    expect(chamadasDaConcepcao([])).toEqual([]);
  });
});
