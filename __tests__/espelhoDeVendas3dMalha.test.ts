/**
 * ESPELHO DE VENDAS 3D (09/11/2026) — os grupos de desenho e o toque: de qual unidade é o triângulo tocado numa
 * malha que junta todas as unidades de um status. Puro. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import { describe, expect, it } from 'vitest';
import { gruposDoEspelho, iniciosDasFaces, prismaDaFace, resumoDoEspelho } from '../utils/espelhoDeVendas3dMalha';
import type { PrismaDoEspelho } from '../utils/espelhoDeVendas3d';

const prisma = (extra: Partial<PrismaDoEspelho>): PrismaDoEspelho => ({
  chave: 'k',
  unitId: 'u',
  torreId: 'A',
  torre: 'Torre A',
  andar: 1,
  nomeDoAndar: 'Pavimento 1',
  rotulo: '101',
  anel: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }],
  baseMm: 3000,
  topoMm: 6000,
  status: 'available',
  abaixoDoSolo: false,
  ...extra,
});

describe('gruposDoEspelho', () => {
  it('um grupo por status, na ordem da legenda, e o dos pisos sem unidade por último', () => {
    const grupos = gruposDoEspelho([
      prisma({ unitId: 'a', status: 'sold' }),
      prisma({ unitId: null, rotulo: null, status: null }),
      prisma({ unitId: 'b', status: 'available' }),
      prisma({ unitId: 'c', status: 'sold' }),
    ]);
    expect(grupos.map((g) => [g.chave, g.prismas.map((p) => p.unitId)])).toEqual([
      ['available', ['b']],
      ['sold', ['a', 'c']],
      ['piso', [null]],
    ]);
  });

  // 10/11/2026: o subsolo ficava fora do desenho. No Garden Cambuhy a Torre B tem 8 apartamentos nos pavimentos -1 e
  // -2 (prédio em desnível) e as duas torres têm estacionamentos -1 a -4 — nada disso aparecia no 3D dos portais.
  it('o subsolo entra no desenho: a unidade pelo status, o piso sem unidade (estacionamento) neutro', () => {
    const grupos = gruposDoEspelho([
      prisma({ unitId: 'ss1', andar: -1, abaixoDoSolo: true, status: 'reserved', baseMm: -3000, topoMm: 0 }),
      prisma({ unitId: null, rotulo: null, status: null, andar: -2, abaixoDoSolo: true, baseMm: -6000, topoMm: -3000 }),
    ]);
    expect(grupos.map((g) => [g.chave, g.prismas.map((p) => p.andar)])).toEqual([
      ['reserved', [-1]],
      ['piso', [-2]],
    ]);
  });
});

describe('prismaDaFace', () => {
  // Três prismas com 12, 20 e 12 triângulos: 0–11, 12–31, 32–43.
  const inicios = iniciosDasFaces([12, 20, 12]);

  it('os inícios acumulam os triângulos, com o total no fim', () => {
    expect(inicios).toEqual([0, 12, 32, 44]);
  });

  it('cada triângulo cai no prisma da sua faixa — inclusive nas bordas', () => {
    expect([0, 11, 12, 31, 32, 43].map((f) => prismaDaFace(inicios, f))).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('fora da malha, sem face ou malha vazia: -1', () => {
    expect(prismaDaFace(inicios, 44)).toBe(-1);
    expect(prismaDaFace(inicios, -1)).toBe(-1);
    expect(prismaDaFace(inicios, null)).toBe(-1);
    expect(prismaDaFace(iniciosDasFaces([]), 0)).toBe(-1);
  });
});

describe('resumoDoEspelho', () => {
  it('diz os números, no singular e no plural, e pula o que é zero', () => {
    const frase = resumoDoEspelho([
      prisma({ unitId: 'a', status: 'available' }),
      prisma({ unitId: 'b', status: 'available' }),
      prisma({ unitId: 'c', status: 'sold' }),
      prisma({ unitId: null, status: null }),
    ]);
    expect(frase).toBe('3 unidades: 2 disponíveis, 1 vendida.');
  });

  it('sem unidade nenhuma', () => {
    expect(resumoDoEspelho([prisma({ unitId: null, status: null })])).toBe('Nenhuma unidade para mostrar.');
  });
});
