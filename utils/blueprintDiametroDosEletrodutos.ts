/**
 * QUAIS eletrodutos escrevem o diâmetro (22/10/2026).
 *
 * Com os textos da planta sem colisão (`blueprintAnotacaoSemColisao`), cada "Ø 25" ganhou lugar
 * próprio — e na planta Garden, com 309 pedaços de eletroduto, eles viraram o novo ruído: antes
 * se empilhavam em borrões e pareciam poucos. A convenção de prancha resolve sem perder informação:
 * o diâmetro PREDOMINANTE (o de maior comprimento somado) não se escreve — a legenda diz
 * "eletroduto sem indicação: Ø 25" —, e o diferente se escreve UMA vez por trecho contínuo
 * (pedaços encadeados com o mesmo diâmetro), no pedaço mais longo.
 *
 * Puro; o canvas e a prancha leem o mesmo resultado.
 */
import type { ObjectId, Trecho } from './blueprintKernel';

export interface DiametrosAnotados {
  /** O diâmetro que não se escreve (o de maior comprimento somado); null sem eletroduto. */
  padraoMm: number | null;
  /** Os pedaços que escrevem o diâmetro. */
  escrever: ReadonlySet<ObjectId>;
}

const comprimento = (t: Pick<Trecho, 'a' | 'b'>) => Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);

export function diametrosAnotados(trechos: readonly Pick<Trecho, 'id' | 'levelId' | 'disciplina' | 'a' | 'b' | 'bitolaMm'>[]): DiametrosAnotados {
  const eletricos = trechos.filter((t) => t.disciplina === 'ELETRICA');
  const porBitola = new Map<number, number>();
  for (const t of eletricos) porBitola.set(t.bitolaMm, (porBitola.get(t.bitolaMm) ?? 0) + comprimento(t));
  // Empate: o MENOR diâmetro é o padrão (o caso comum de uma casa).
  const padraoMm = [...porBitola.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? null;

  const outros = eletricos.filter((t) => t.bitolaMm !== padraoMm);
  const pai = outros.map((_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  const porPonta = new Map<string, number[]>();
  outros.forEach((t, i) => {
    for (const p of [t.a, t.b]) {
      const k = `${t.levelId}|${Math.round(p.x)}|${Math.round(p.y)}`;
      const lista = porPonta.get(k) ?? [];
      for (const j of lista) if (outros[j].bitolaMm === t.bitolaMm) pai[raiz(j)] = raiz(i);
      if (!lista.includes(i)) lista.push(i);
      porPonta.set(k, lista);
    }
  });
  const melhor = new Map<number, number>();
  outros.forEach((t, i) => {
    const r = raiz(i);
    const atual = melhor.get(r);
    if (atual == null || comprimento(t) > comprimento(outros[atual])) melhor.set(r, i);
  });
  return { padraoMm, escrever: new Set([...melhor.values()].map((i) => outros[i].id)) };
}
