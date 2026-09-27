/**
 * A REDE PELAS PAREDES (27/09/2026, pedido com print: *"tubulacao de agua fria
 * e quente deve passar pelas paredes"*).
 *
 * A água automática ligava a coluna a cada ponto em LINHA RETA na cota do
 * ramal — o tubo atravessava o cômodo pelo ar. Aqui o ramal corre pelo EIXO
 * das paredes do pavimento, como se embute na obra:
 *
 *   1. o GRAFO: cada parede é uma aresta do seu eixo, partida nos encontros (a
 *      ponta de outra parede que cai sobre ela — L, T, cruz) e na PROJEÇÃO de
 *      cada ponto a ligar (a raiz e os pendentes) na parede mais próxima,
 *      desde que a menos de `raioDeEncaixeMm`;
 *   2. a ÁRVORE: do nó da raiz, entra de cada vez o pendente mais perto da
 *      árvore pelo grafo (Dijkstra a partir de todos os nós já na árvore), com
 *      o caminho inteiro — a heurística clássica de Steiner em grafo;
 *   3. as EMENDAS: nó de passagem (grau 2, colinear, que não é ponto) some —
 *      dois trechos seguidos na mesma parede são UM tubo, e não uma luva que a
 *      obra não compra.
 *
 * Quem não tem parede perto (a pia numa ilha) sai em `foraDaParede`, e quem
 * chama decide (a água liga em reta, com aviso). Parede em arco é tratada pela
 * corda a→b. Determinístico: nós e empates em ordem fixa.
 */
import type { Wall } from './blueprintKernel';

export type P2 = { x: number; y: number };

export interface ArestaEmPlanta {
  /** A ponta do lado da RAIZ. */
  de: P2;
  para: P2;
}

export interface ArvorePelasParedes {
  arestas: ArestaEmPlanta[];
  /** Onde cada pendente (pela chave "x,y" da posição dele) encosta no eixo da parede. */
  encaixe: Map<string, P2>;
  /** Pendentes sem parede a menos de `raioDeEncaixeMm`. */
  foraDaParede: P2[];
  /** O nó da raiz no grafo (a projeção dela), ou `null` se ela também está longe de parede. */
  raiz: P2 | null;
}

export const chaveP = (p: P2) => `${p.x},${p.y}`;

/** A projeção de `p` no segmento a→b (parâmetro t em [0,1]) e a distância até ela. */
function projetar(p: P2, a: P2, b: P2): { q: P2; t: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  const q = { x: Math.round(a.x + t * dx), y: Math.round(a.y + t * dy) };
  return { q, t, d: Math.hypot(p.x - q.x, p.y - q.y) };
}

/** A parede mais próxima de `p` (e a projeção nela), se a menos de `raio`. */
export function encaixarNaParede(p: P2, paredes: readonly Wall[], raio: number): { parede: Wall; q: P2; d: number } | null {
  let melhor: { parede: Wall; q: P2; d: number } | null = null;
  for (const w of paredes) {
    const r = projetar(p, w.a, w.b);
    if (r.d <= raio && (!melhor || r.d < melhor.d || (r.d === melhor.d && w.id < melhor.parede.id))) melhor = { parede: w, q: r.q, d: r.d };
  }
  return melhor;
}

export function arvorePelasParedes(opts: {
  paredes: readonly Wall[];
  raiz: P2;
  pendentes: readonly P2[];
  raioDeEncaixeMm: number;
}): ArvorePelasParedes {
  const { paredes, raioDeEncaixeMm } = opts;
  const encaixe = new Map<string, P2>();
  const foraDaParede: P2[] = [];
  // Pontos a pôr sobre cada parede: pontas, encontros e projeções.
  const sobre = new Map<string, { t: number; q: P2 }[]>();
  const pendurar = (w: Wall, q: P2) => {
    const L2 = (w.b.x - w.a.x) ** 2 + (w.b.y - w.a.y) ** 2;
    const t = L2 === 0 ? 0 : ((q.x - w.a.x) * (w.b.x - w.a.x) + (q.y - w.a.y) * (w.b.y - w.a.y)) / L2;
    const lista = sobre.get(w.id) ?? [];
    lista.push({ t, q });
    sobre.set(w.id, lista);
  };
  const vizinhos = new Map<string, { k: string; mm: number }[]>();
  const posicao = new Map<string, P2>();
  const ligar = (a: P2, b: P2) => {
    const ka = chaveP(a);
    const kb = chaveP(b);
    if (ka === kb) return;
    posicao.set(ka, a);
    posicao.set(kb, b);
    const mm = Math.hypot(a.x - b.x, a.y - b.y);
    const va = vizinhos.get(ka) ?? [];
    if (!va.some((v) => v.k === kb)) va.push({ k: kb, mm });
    vizinhos.set(ka, va);
    const vb = vizinhos.get(kb) ?? [];
    if (!vb.some((v) => v.k === ka)) vb.push({ k: ka, mm });
    vizinhos.set(kb, vb);
  };

  const ordenadas = [...paredes].sort((x, y) => x.id.localeCompare(y.id));
  for (const w of ordenadas) {
    pendurar(w, { x: w.a.x, y: w.a.y });
    pendurar(w, { x: w.b.x, y: w.b.y });
  }
  // Encontros: a ponta de uma parede sobre o eixo de outra (tolerância: meia espessura).
  for (const w of ordenadas) {
    for (const o of ordenadas) {
      if (o.id === w.id) continue;
      for (const ponta of [o.a, o.b]) {
        const r = projetar(ponta, w.a, w.b);
        if (r.d <= Math.max(w.thicknessMm, o.thicknessMm) / 2 + 5) {
          pendurar(w, r.q);
          // A ponta que parou na FACE (e não no eixo) liga-se ao eixo por um toco.
          if (r.d > 0) ligar({ x: ponta.x, y: ponta.y }, r.q);
        }
      }
    }
  }
  // Raiz e pendentes: a projeção na parede mais próxima.
  const encaixar = (p: P2): P2 | null => {
    const e = encaixarNaParede(p, ordenadas, raioDeEncaixeMm);
    if (!e) return null;
    pendurar(e.parede, e.q);
    return e.q;
  };
  const raiz = encaixar(opts.raiz);
  for (const p of opts.pendentes) {
    const q = encaixar(p);
    if (q) encaixe.set(chaveP(p), q);
    else foraDaParede.push(p);
  }
  // As arestas do grafo: pontos consecutivos ao longo de cada parede.
  for (const w of ordenadas) {
    const lista = [...(sobre.get(w.id) ?? [])].sort((x, y) => x.t - y.t || x.q.x - y.q.x || x.q.y - y.q.y);
    for (let i = 1; i < lista.length; i++) ligar(lista[i - 1].q, lista[i].q);
  }

  if (!raiz) return { arestas: [], encaixe, foraDaParede: [...opts.pendentes], raiz: null };

  // ── Steiner por caminhos mínimos ─────────────────────────────────────────
  const naArvore = new Set<string>([chaveP(raiz)]);
  const arestasK: { de: string; para: string }[] = [];
  const alvos = [...new Set([...encaixe.values()].map(chaveP))].filter((k) => k !== chaveP(raiz)).sort();
  const restantes = new Set(alvos);
  while (restantes.size > 0) {
    // Dijkstra multi-fonte a partir da árvore.
    const dist = new Map<string, number>();
    const anterior = new Map<string, string>();
    const fila: string[] = [];
    for (const k of naArvore) {
      dist.set(k, 0);
      fila.push(k);
    }
    const feitos = new Set<string>();
    while (fila.length > 0) {
      fila.sort((x, y) => (dist.get(x)! - dist.get(y)!) || x.localeCompare(y));
      const k = fila.shift()!;
      if (feitos.has(k)) continue;
      feitos.add(k);
      for (const v of vizinhos.get(k) ?? []) {
        const nd = dist.get(k)! + v.mm;
        if (nd < (dist.get(v.k) ?? Infinity) - 1e-9) {
          dist.set(v.k, nd);
          anterior.set(v.k, k);
          fila.push(v.k);
        }
      }
    }
    let alvo: string | null = null;
    for (const k of restantes) {
      const d = dist.get(k);
      if (d == null) continue;
      if (alvo == null || d < dist.get(alvo)! || (d === dist.get(alvo)! && k < alvo)) alvo = k;
    }
    if (alvo == null) {
      // Parede isolada, sem caminho até a árvore: ficam de fora, com a posição original.
      for (const k of restantes) {
        for (const [pk, q] of encaixe) if (chaveP(q) === k) {
          encaixe.delete(pk);
          const [x, y] = pk.split(',').map(Number);
          foraDaParede.push({ x, y });
        }
      }
      break;
    }
    // O caminho, da árvore até o alvo.
    const caminho: string[] = [alvo];
    while (!naArvore.has(caminho[caminho.length - 1])) caminho.push(anterior.get(caminho[caminho.length - 1])!);
    caminho.reverse();
    for (let i = 1; i < caminho.length; i++) {
      arestasK.push({ de: caminho[i - 1], para: caminho[i] });
      naArvore.add(caminho[i]);
    }
    for (const k of caminho) restantes.delete(k);
  }

  // ── Emendas: nó de passagem colinear, grau 2, que não é ponto ────────────
  const protegidos = new Set<string>([chaveP(raiz), ...[...encaixe.values()].map(chaveP)]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    const grau = new Map<string, number[]>();
    arestasK.forEach((a, i) => {
      grau.set(a.de, [...(grau.get(a.de) ?? []), i]);
      grau.set(a.para, [...(grau.get(a.para) ?? []), i]);
    });
    for (const [k, idx] of [...grau.entries()].sort(([x], [y]) => x.localeCompare(y))) {
      if (idx.length !== 2 || protegidos.has(k)) continue;
      const [i, j] = idx;
      const entra = arestasK[i].para === k ? arestasK[i] : arestasK[j];
      const sai = entra === arestasK[i] ? arestasK[j] : arestasK[i];
      if (entra.para !== k || sai.de !== k) continue;
      const a = posicao.get(entra.de)!;
      const m = posicao.get(k)!;
      const b = posicao.get(sai.para)!;
      const cruz = (m.x - a.x) * (b.y - m.y) - (m.y - a.y) * (b.x - m.x);
      if (Math.abs(cruz) > 1e-6 * Math.hypot(m.x - a.x, m.y - a.y) * Math.hypot(b.x - m.x, b.y - m.y) + 1) continue;
      const novo = { de: entra.de, para: sai.para };
      arestasK.splice(Math.max(i, j), 1);
      arestasK.splice(Math.min(i, j), 1, novo);
      mudou = true;
      break;
    }
  }

  return {
    arestas: arestasK.map((a) => ({ de: posicao.get(a.de)!, para: posicao.get(a.para)! })),
    encaixe,
    foraDaParede,
    raiz,
  };
}

/**
 * A FACE da parede diante de `p` (27/09/2026, "agua fria e quente passam
 * embutidas nas paredes"): o ponto de água é instalado NA FACE — a saída, o
 * registro —, e a rede chega a ele por dentro da parede. `q` é a projeção no
 * eixo; `face`, o ponto da face do lado de `p` (meia espessura a partir do eixo);
 * `mover` diz se `p` está solto no cômodo (além da face). `null`: sem parede a
 * menos de `raio`.
 */
export function faceDaParede(p: P2, paredes: readonly Wall[], raio: number): { q: P2; face: P2; mover: boolean } | null {
  const e = encaixarNaParede(p, paredes, raio);
  if (!e) return null;
  const meia = e.parede.thicknessMm / 2;
  if (e.d <= meia + 1) return { q: e.q, face: { x: p.x, y: p.y }, mover: false };
  const ux = (p.x - e.q.x) / e.d;
  const uy = (p.y - e.q.y) / e.d;
  return { q: e.q, face: { x: Math.round(e.q.x + ux * meia), y: Math.round(e.q.y + uy * meia) }, mover: true };
}

