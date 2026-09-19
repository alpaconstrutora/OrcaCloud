/**
 * O GRAFO DE REDE que os lançamentos automáticos compartilham (18/09/2026, F4
 * da hidráulica). Nasceu dentro de `blueprintEletrodutos.ts` e saiu de lá
 * porque a água fria, a água quente e o esgoto usam exatamente as mesmas
 * peças: a chave do nó com a LAJE como encontro, o menor caminho (Dijkstra),
 * o caminho de um nó até a raiz (BFS) e a ÁRVORE COM ROTA LIMITADA — o Prim
 * que só pendura um ponto num nó cujo caminho até a raiz fique dentro de
 * `limite` × a linha reta. Uma cópia por disciplina divergiria na primeira
 * correção; o teste dos eletrodutos protege este arquivo.
 */
import type { Level, ObjectId } from './blueprintKernel';

export type No = string;

export interface Aresta {
  /** O trecho existente, ou o índice do trecho novo na lista de quem planeja. */
  ref: { existente: ObjectId } | { novo: number };
  de: No;
  para: No;
  /** Comprimento do trecho, em mm. */
  mm: number;
}

export interface Ponto2 {
  x: number;
  y: number;
}

/**
 * Chave de um ponto físico da rede. A LAJE é o encontro: a cota 0 de um
 * pavimento é o mesmo lugar que o teto do pavimento imediatamente abaixo —
 * sem isto, a prumada que sobe pela laje terminaria num nó que ninguém
 * alcança.
 */
export function fazerChave(niveis: readonly Level[]) {
  const ordenados = [...niveis].sort((a, b) => a.elevationMm - b.elevationMm);
  const abaixoDe = new Map<ObjectId, Level | null>();
  ordenados.forEach((l, i) => abaixoDe.set(l.id, i > 0 ? ordenados[i - 1] : null));
  return (levelId: ObjectId, x: number, y: number, cota: number): No => {
    // Cota ≤ 0 num pavimento que tem outro embaixo é o MESMO lugar visto do
    // pavimento de baixo: 0 é o teto dele, e −150 (o esgoto sob o piso) é o
    // teto dele menos 150. Sem isto o ramal do andar de cima e o tubo de
    // queda que o recebe no térreo seriam dois nós que ninguém liga.
    if (cota <= 0) {
      const abaixo = abaixoDe.get(levelId);
      if (abaixo) return `${abaixo.id}|${x},${y}|${abaixo.defaultHeightMm + cota}`;
    }
    return `${levelId}|${x},${y}|${cota}`;
  };
}

export const comprimentoMm = (t: { a: Ponto2; b: Ponto2; cotaAMm: number; cotaBMm: number }) =>
  Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm);

/** Menor caminho (em mm) de `origem` a cada nó, pelas arestas dadas — Dijkstra simples. */
export function distanciasDesde(origem: No, arestas: readonly Aresta[]): Map<No, number> {
  const viz = new Map<No, { para: No; mm: number }[]>();
  for (const a of arestas) {
    viz.set(a.de, [...(viz.get(a.de) ?? []), { para: a.para, mm: a.mm }]);
    viz.set(a.para, [...(viz.get(a.para) ?? []), { para: a.de, mm: a.mm }]);
  }
  const dist = new Map<No, number>([[origem, 0]]);
  const abertos = new Set<No>([origem]);
  while (abertos.size > 0) {
    let atual: No | null = null;
    for (const n of abertos) if (atual == null || (dist.get(n) ?? Infinity) < (dist.get(atual) ?? Infinity)) atual = n;
    if (atual == null) break;
    abertos.delete(atual);
    const dAtual = dist.get(atual) ?? Infinity;
    for (const v of viz.get(atual) ?? []) {
      const nova = dAtual + v.mm;
      if (nova < (dist.get(v.para) ?? Infinity)) {
        dist.set(v.para, nova);
        abertos.add(v.para);
      }
    }
  }
  return dist;
}

/**
 * MENOR CAMINHO (Dijkstra com predecessor) de `origem` a `destino`: o
 * comprimento em mm, os nós na ordem e os índices das arestas percorridas —
 * `null` quando a rede não os liga. `caminhoEntre` (abaixo) é BFS em saltos e
 * serve a quem quer saber POR ONDE passa; este serve a quem quer saber QUANTO
 * anda (o grafo espacial, E4.2: percurso entre ambientes pelos centros das
 * portas).
 */
export function menorCaminhoEntre(origem: No, destino: No, arestas: readonly Aresta[]): { mm: number; nos: No[]; arestas: number[] } | null {
  const viz = new Map<No, { para: No; mm: number; aresta: number }[]>();
  arestas.forEach((a, i) => {
    viz.set(a.de, [...(viz.get(a.de) ?? []), { para: a.para, mm: a.mm, aresta: i }]);
    viz.set(a.para, [...(viz.get(a.para) ?? []), { para: a.de, mm: a.mm, aresta: i }]);
  });
  const dist = new Map<No, number>([[origem, 0]]);
  const anterior = new Map<No, { de: No; aresta: number }>();
  const abertos = new Set<No>([origem]);
  while (abertos.size > 0) {
    let atual: No | null = null;
    for (const n of abertos) if (atual == null || (dist.get(n) ?? Infinity) < (dist.get(atual) ?? Infinity)) atual = n;
    if (atual == null) break;
    if (atual === destino) break;
    abertos.delete(atual);
    const dAtual = dist.get(atual) ?? Infinity;
    for (const v of viz.get(atual) ?? []) {
      const nova = dAtual + v.mm;
      if (nova < (dist.get(v.para) ?? Infinity)) {
        dist.set(v.para, nova);
        anterior.set(v.para, { de: atual, aresta: v.aresta });
        abertos.add(v.para);
      }
    }
  }
  if (!dist.has(destino)) return null;
  const nos: No[] = [destino];
  const idx: number[] = [];
  for (let n = destino; n !== origem; ) {
    const p = anterior.get(n)!;
    idx.push(p.aresta);
    n = p.de;
    nos.push(n);
  }
  return { mm: dist.get(destino)!, nos: nos.reverse(), arestas: idx.reverse() };
}

/**
 * O caminho (índices de arestas) de `origem` até `destino`, por BFS — `null`
 * quando a rede não os liga. É por ele que cada trecho fica sabendo quem passa
 * por ali (os circuitos no eletroduto, os pesos na água, as UHC no esgoto).
 */
export function caminhoEntre(origem: No, destino: No, arestas: readonly Aresta[]): number[] | null {
  const vizinhos = new Map<No, { para: No; aresta: number }[]>();
  arestas.forEach((ar, i) => {
    vizinhos.set(ar.de, [...(vizinhos.get(ar.de) ?? []), { para: ar.para, aresta: i }]);
    vizinhos.set(ar.para, [...(vizinhos.get(ar.para) ?? []), { para: ar.de, aresta: i }]);
  });
  const anterior = new Map<No, { de: No; aresta: number } | null>([[origem, null]]);
  const fila = [origem];
  while (fila.length > 0) {
    const n = fila.shift()!;
    if (n === destino) {
      const caminho: number[] = [];
      let atual: No = n;
      for (let passo = anterior.get(atual); passo; passo = anterior.get(atual)) {
        caminho.push(passo.aresta);
        atual = passo.de;
      }
      return caminho;
    }
    for (const v of vizinhos.get(n) ?? []) {
      if (anterior.has(v.para)) continue;
      anterior.set(v.para, { de: n, aresta: v.aresta });
      fila.push(v.para);
    }
  }
  return null;
}

/**
 * PRIM COM ROTA LIMITADA (15/09/2026, pedido com print: *"o encaminhamento do
 * eletroduto faz um percurso muito maior do que poderia"*): a cada passo entra
 * o pendente que exige o menor trecho novo — mas só se pendurando num nó cujo
 * caminho até a raiz (rota do nó + trecho novo) fique dentro de `limite` × a
 * linha reta do pendente à raiz. Se nenhum nó cabe, vale o mais próximo
 * (reserva). Desempate determinístico (distância, x, y).
 *
 * `alcancados` e `rota` são MUTADOS: quem chama vê a árvore crescer e pode
 * reaproveitar os mapas para o pavimento seguinte. `ligar` recebe cada aresta
 * escolhida, na ordem.
 */
export function arvoreComRotaLimitada(opts: {
  alcancados: Map<No, Ponto2>;
  rota: Map<No, number>;
  pendentes: Map<No, Ponto2>;
  retaAteRaiz: (p: Ponto2) => number;
  limite: number | null;
  ligar: (de: { no: No; pos: Ponto2 }, para: { no: No; pos: Ponto2 }) => void;
}): void {
  const { alcancados, rota, retaAteRaiz, limite, ligar } = opts;
  const restantes = [...opts.pendentes.entries()].sort(([, p], [, q]) => p.x - q.x || p.y - q.y);
  while (restantes.length > 0) {
    let melhor: { i: number; de: No; d: number; rota: number } | null = null;
    let reserva: { i: number; de: No; d: number; rota: number } | null = null;
    for (let i = 0; i < restantes.length; i++) {
      const alvo = restantes[i][1];
      const reta = retaAteRaiz(alvo);
      for (const [kDe, de] of alcancados) {
        const d = Math.hypot(alvo.x - de.x, alvo.y - de.y);
        const rotaNova = (rota.get(kDe) ?? Infinity) + d;
        const candidato = { i, de: kDe, d, rota: rotaNova };
        if (!reserva || d < reserva.d) reserva = candidato;
        const cabe = limite == null || !Number.isFinite(rotaNova) ? limite == null : rotaNova <= limite * reta + 1;
        if (cabe && (!melhor || d < melhor.d)) melhor = candidato;
      }
    }
    const escolha = melhor ?? reserva;
    if (!escolha) break;
    const [[k, para]] = restantes.splice(escolha.i, 1);
    const de = alcancados.get(escolha.de)!;
    ligar({ no: escolha.de, pos: de }, { no: k, pos: para });
    alcancados.set(k, para);
    rota.set(k, escolha.rota);
  }
}
