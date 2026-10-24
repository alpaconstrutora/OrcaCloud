/**
 * No forro, luz × luz de cômodos diferentes pelas travessias (24/10/2026) — a árvore pura. Plano:
 * `docs/planos/2026-10-24-forro-luz-pelas-travessias.md`.
 */
import { describe, expect, it } from 'vitest';
import { arvorePelasTravessias, type TravessiaDoForro } from '../utils/blueprintForroEntreComodos';
import { arvoreComRotaLimitada, type No, type Ponto2 } from '../utils/blueprintGrafoDeRede';

type XY = Ponto2;
const k = (p: XY): No => `${p.x},${p.y}`;
/** Dois cômodos: A (x < 3000) e B (x > 3000); a parede comum em x = 3000. */
const doisComodos = (p: XY) => (p.x < 3000 ? 'A' : p.x > 3000 ? 'B' : null);

function rodar(raiz: XY, luzes: XY[], travessias: TravessiaDoForro[], regiao = doisComodos) {
  const alcancados = new Map<No, XY>([[k(raiz), raiz]]);
  const rota = new Map<No, number>([[k(raiz), 0]]);
  const ligados: [XY, XY][] = [];
  arvorePelasTravessias({
    alcancados,
    rota,
    pendentes: new Map(luzes.map((l) => [k(l), l])),
    travessias,
    regiao,
    chave: k,
    ligar: (de, para) => ligados.push([de.pos, para.pos]),
  });
  return { ligados, alcancados };
}
const cruzaAParede = ([a, b]: [XY, XY]) => Math.min(a.x, b.x) < 3000 && Math.max(a.x, b.x) > 3000;

describe('arvorePelasTravessias', () => {
  const Q = { x: 100, y: 1000 };
  const LA = { x: 1500, y: 1000 };
  const LB = { x: 4500, y: 1000 };
  const T = { a: { x: 2875, y: 3000 }, b: { x: 3125, y: 3000 } };

  it('luz A → luz B pelas pontas da travessia: nenhum trecho cruza a parede fora dela', () => {
    const { ligados } = rodar(Q, [LA, LB], [T]);
    expect(ligados).toEqual([
      [Q, LA],
      [LA, T.a],
      [T.a, T.b],
      [T.b, LB],
    ]);
    expect(ligados.filter(cruzaAParede)).toEqual([[T.a, T.b]]);
  });

  it('a segunda luz de B reaproveita a travessia (a ponta em B é nó alcançado): a travessia é ligada uma vez só', () => {
    const LB2 = { x: 5000, y: 3500 };
    const { ligados, alcancados } = rodar(Q, [LA, LB, LB2], [T]);
    expect(ligados.filter(cruzaAParede)).toEqual([[T.a, T.b]]);
    expect(alcancados.has(k(T.a)) && alcancados.has(k(T.b))).toBe(true);
    // LB2 entra antes de LB (4.617 × 5.104 mm pelo grafo); LB pendura na ponta em B (2.427 mm), não em LB2 (2.550).
    expect(ligados).toContainEqual([T.b, LB2]);
    expect(ligados).toContainEqual([T.b, LB]);
  });

  it('entre duas travessias, a do menor caminho', () => {
    const T2 = { a: { x: 2875, y: 900 }, b: { x: 3125, y: 900 } };
    const { ligados } = rodar(Q, [LA, LB], [T, T2]);
    expect(ligados.filter(cruzaAParede)).toEqual([[T2.a, T2.b]]);
  });

  it('sem travessia: a reta até o alcançado mais perto (a luz nunca fica sem ligar)', () => {
    const { ligados } = rodar(Q, [LA, LB], []);
    expect(ligados).toEqual([
      [Q, LA],
      [LA, LB],
    ]);
  });

  it('ponto fora de todo cômodo (região null): a reta', () => {
    const fora = { x: 3000, y: 2000 };
    const { ligados } = rodar(Q, [LA, fora], [T]);
    expect(ligados).toEqual([
      [Q, LA],
      [LA, fora],
    ]);
  });

  it('num cômodo só: as mesmas ligações de arvoreComRotaLimitada com limite null (mesma ordem, mesmo desempate)', () => {
    const luzes = [{ x: 500, y: 500 }, { x: 2500, y: 500 }, { x: 1500, y: 2500 }, { x: 500, y: 2500 }, { x: 2500, y: 2500 }, { x: 1500, y: 1500 }];
    const antigo: [XY, XY][] = [];
    arvoreComRotaLimitada({
      alcancados: new Map([[k(Q), Q]]),
      rota: new Map([[k(Q), 0]]),
      pendentes: new Map(luzes.map((l) => [k(l), l])),
      retaAteRaiz: () => 0,
      limite: null,
      ligar: (de, para) => antigo.push([de.pos, para.pos]),
    });
    // Uma travessia para o cômodo vizinho, no meio do caminho, não muda nada: sair e voltar nunca é mais curto.
    expect(rodar(Q, luzes, [T]).ligados).toEqual(antigo);
  });
});
