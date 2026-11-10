/**
 * O CONTORNO DA TORRE para o Espelho de Vendas 3D (F1b, 10/11/2026): do Bloco da Planta casado com a torre para o
 * que se grava em `empreendimento_towers` — e de volta, do que o banco devolve para o que a cena aceita. Puro.
 * Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import { describe, expect, it } from 'vitest';
import { contornoDaLinha, contornosDasTorres, mesmoContorno } from '../utils/espelhoContornoDaTorre';

const L = [{ x: 0, y: 0 }, { x: 26000, y: 0 }, { x: 26000, y: 12000 }, { x: 14000, y: 12000 }, { x: 14000, y: 22000 }, { x: 0, y: 22000 }];
const RET = [{ x: 40000, y: 0 }, { x: 51000, y: 0 }, { x: 51000, y: 16000 }, { x: 40000, y: 16000 }];
const papel = (torre: string, torreId: string | undefined, tipo: 'TORRE' | 'GARAGEM' = 'TORRE') => ({ torre, torreId, tipo });

describe('contornosDasTorres', () => {
  const blocos = [
    { id: 'b1', pontos: L },
    { id: 'b1g', pontos: L },
    { id: 'b2', pontos: RET },
    { id: 'solto', pontos: RET },
  ];
  const papeis = new Map([['b1', papel('Torre A', 'tA')], ['b1g', papel('Torre A', 'tA', 'GARAGEM')], ['b2', papel('Torre B', 'tB')]]);
  const refs = new Map([['b1', { frenteParaFora: { x: 0, y: -1 }, rotacaoNorteDeg: 12 }], ['b2', { frenteParaFora: null, rotacaoNorteDeg: null }]]);

  it('um contorno por torre: o do bloco de TORRE casado com ela — garagem e bloco sem torre ficam fora', () => {
    const r = contornosDasTorres(blocos, papeis, refs);
    expect(r.map((c) => [c.torreId, c.torre])).toEqual([['tA', 'Torre A'], ['tB', 'Torre B']]);
    expect(r[0].contorno).toEqual({ anel: L, frenteParaFora: { x: 0, y: -1 }, rotacaoNorteDeg: 12 });
    expect(r[1].contorno).toEqual({ anel: RET, frenteParaFora: null, rotacaoNorteDeg: null });
  });

  it('bloco sem id de torre, ou com menos de 3 pontos, não gera contorno', () => {
    expect(contornosDasTorres([{ id: 'x', pontos: L }], new Map([['x', papel('Torre A', undefined)]]), new Map())).toEqual([]);
    expect(contornosDasTorres([{ id: 'x', pontos: L.slice(0, 2) }], new Map([['x', papel('Torre A', 'tA')]]), new Map())).toEqual([]);
  });

  it('dois blocos de torre na mesma torre: vale o primeiro (uma torre, um contorno)', () => {
    const r = contornosDasTorres([{ id: 'a', pontos: L }, { id: 'b', pontos: RET }], new Map([['a', papel('Torre A', 'tA')], ['b', papel('Torre A', 'tA')]]), new Map());
    expect(r).toHaveLength(1);
    expect(r[0].contorno.anel).toEqual(L);
  });

  it('os pontos saem em mm inteiros', () => {
    const r = contornosDasTorres([{ id: 'a', pontos: [{ x: 0.4, y: 0 }, { x: 10.6, y: 0 }, { x: 10, y: 10 }] }], new Map([['a', papel('T', 't')]]), new Map());
    expect(r[0].contorno.anel).toEqual([{ x: 0, y: 0 }, { x: 11, y: 0 }, { x: 10, y: 10 }]);
  });
});

describe('contornoDaLinha — o que o banco devolve', () => {
  it('a linha gravada vira o contorno da cena (o norte `numeric` pode chegar como texto)', () => {
    expect(contornoDaLinha({ contorno_na_planta: L, contorno_frente: { x: 0, y: -1 }, contorno_norte_deg: 12 })).toEqual({ anel: L, frenteParaFora: { x: 0, y: -1 }, rotacaoNorteDeg: 12 });
    expect(contornoDaLinha({ contorno_na_planta: L, contorno_norte_deg: '12.5' })!.rotacaoNorteDeg).toBe(12.5);
  });

  it('sem contorno gravado (ou coluna que ainda não existe): null — a torre sai esquemática', () => {
    expect(contornoDaLinha({})).toBeNull();
    expect(contornoDaLinha({ contorno_na_planta: null })).toBeNull();
    expect(contornoDaLinha(null)).toBeNull();
  });

  it('jsonb estragado não derruba a cena: menos de 3 pontos ou ponto sem número = null; frente inválida = sem frente', () => {
    expect(contornoDaLinha({ contorno_na_planta: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBeNull();
    expect(contornoDaLinha({ contorno_na_planta: [{ x: 0, y: 0 }, { x: 'a', y: 1 }, { x: 2, y: 2 }] })).toBeNull();
    expect(contornoDaLinha({ contorno_na_planta: 'x' })).toBeNull();
    expect(contornoDaLinha({ contorno_na_planta: L, contorno_frente: 'norte', contorno_norte_deg: 'x' })).toEqual({ anel: L, frenteParaFora: null, rotacaoNorteDeg: null });
  });
});

describe('mesmoContorno — o desenho mudou desde o último envio?', () => {
  const a = { anel: L, frenteParaFora: { x: 0, y: -1 }, rotacaoNorteDeg: 12 };

  it('igual ponto a ponto, na frente e no norte', () => {
    expect(mesmoContorno(a, { ...a, anel: L.map((p) => ({ ...p })) })).toBe(true);
  });

  it('um ponto movido, a frente virada ou o norte girado: diferente', () => {
    expect(mesmoContorno(a, { ...a, anel: [...L.slice(0, 5), { x: 0, y: 22001 }] })).toBe(false);
    expect(mesmoContorno(a, { ...a, frenteParaFora: { x: 0, y: 1 } })).toBe(false);
    expect(mesmoContorno(a, { ...a, rotacaoNorteDeg: null })).toBe(false);
  });

  it('nunca enviado: diferente', () => {
    expect(mesmoContorno(a, null)).toBe(false);
  });
});
