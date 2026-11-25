/**
 * Decodificador mínimo de ladrilho vetorial (MVT 2.1), 25/11/2026 — os prédios da Maquete.
 *
 * Oráculo: um CODIFICADOR protobuf mínimo aqui, escrito pela especificação (campos, varint,
 * zigue-zague, comandos MoveTo/LineTo/ClosePath). A prova com ladrilho real do OpenFreeMap ficou no
 * plano (170 prédios em 14 feições no centro de Campinas).
 */
import { describe, expect, it } from 'vitest';
import { decodificarGeometria, lerLadrilho } from '../utils/geo/mvt';

const varint = (n: number): number[] => {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
};
const chave = (campo: number, fio: number) => varint(campo * 8 + fio);
const bytes = (s: string) => [...new TextEncoder().encode(s)];
const delimitado = (campo: number, corpo: number[]) => [...chave(campo, 2), ...varint(corpo.length), ...corpo];
const empacotado = (campo: number, ns: number[]) => delimitado(campo, ns.flatMap(varint));
const zz = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n);
const cmd = (id: number, n: number) => (n << 3) | id;

/** Um quadrado como geometria MVT: MoveTo(1) + LineTo(3) + ClosePath. */
function quadrado(x: number, y: number, l: number): number[] {
  return [cmd(1, 1), zz(x), zz(y), cmd(2, 3), zz(l), zz(0), zz(0), zz(l), zz(-l), zz(0), cmd(7, 1)];
}

function camada(nome: string, feicoes: number[][], chaves: string[], valores: number[][], extent = 4096): number[] {
  return delimitado(3, [
    ...chave(15, 0), ...varint(2),
    ...delimitado(1, bytes(nome)),
    ...feicoes.flatMap((f) => delimitado(2, f)),
    ...chaves.flatMap((k) => delimitado(3, bytes(k))),
    ...valores.flatMap((v) => delimitado(4, v)),
    ...chave(5, 0), ...varint(extent),
  ]);
}

describe('decodificarGeometria', () => {
  it('MoveTo/LineTo com deltas em zigue-zague; ClosePath repete o 1º ponto', () => {
    expect(decodificarGeometria(quadrado(10, 20, 5))).toEqual([[{ x: 10, y: 20 }, { x: 15, y: 20 }, { x: 15, y: 25 }, { x: 10, y: 25 }, { x: 10, y: 20 }]]);
  });
  it('dois anéis: o cursor continua do último ponto (deltas relativos)', () => {
    const [a, b] = decodificarGeometria([...quadrado(0, 0, 4), cmd(1, 1), zz(10), zz(10), cmd(2, 1), zz(1), zz(0), cmd(7, 1)]);
    expect(a[0]).toEqual({ x: 0, y: 0 });
    // O 2º MoveTo parte do último ponto desenhado do 1º anel: (0, 4) + (10, 10) = (10, 14).
    expect(b[0]).toEqual({ x: 10, y: 14 });
  });
});

describe('lerLadrilho', () => {
  // Valores: 0 = double 60 (campo 3, 64 bits), 1 = uint 5 (campo 5), 2 = bool true (campo 7), 3 = string "yes".
  const f64 = (v: number) => {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    return [...chave(3, 1), ...b];
  };
  const valores = [f64(60), [...chave(5, 0), ...varint(5)], [...chave(7, 0), 1], delimitado(1, bytes('yes'))];
  const chaves = ['render_height', 'hide_3d', 'building'];
  const feicao = (tags: number[], geom: number[], id?: number) => [...(id !== undefined ? [...chave(1, 0), ...varint(id)] : []), ...empacotado(2, tags), ...chave(3, 0), ...varint(3), ...empacotado(4, geom)];
  const ladrilho = new Uint8Array([
    ...camada('water', [feicao([], quadrado(0, 0, 9))], [], []),
    ...camada('building', [feicao([0, 0], quadrado(100, 200, 30), 7), feicao([0, 1, 1, 2, 2, 3], quadrado(500, 500, 10))], chaves, valores),
  ]);

  it('camadas, extent, id, tipo, propriedades (double, uint, bool, string) e geometria', () => {
    const cs = lerLadrilho(ladrilho);
    expect(cs.map((c) => c.nome)).toEqual(['water', 'building']);
    const b = cs[1];
    expect(b.extent).toBe(4096);
    expect(b.feicoes[0]).toMatchObject({ id: 7, tipo: 3, propriedades: { render_height: 60 } });
    expect(b.feicoes[1].propriedades).toEqual({ render_height: 5, hide_3d: true, building: 'yes' });
    expect(b.feicoes[0].geometria[0][0]).toEqual({ x: 100, y: 200 });
  });

  it('`so` decodifica só as camadas pedidas', () => {
    expect(lerLadrilho(ladrilho, ['building']).map((c) => c.nome)).toEqual(['building']);
    expect(lerLadrilho(ladrilho, ['transportation'])).toEqual([]);
  });

  it('ladrilho cortado no meio: RangeError, não um laço infinito', () => {
    expect(() => lerLadrilho(ladrilho.subarray(0, ladrilho.length - 3))).toThrow(RangeError);
  });
});
