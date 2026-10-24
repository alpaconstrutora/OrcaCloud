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
 *
 * E5.5 (29/09/2026): com `obstaculos` (pegadas de pilares), a aresta que entra
 * num pilar custa 10 m a mais — ver `blueprintObstaculosEstruturais.ts`.
 *
 * F8b da casa automática (15/10/2026): com `contornoDoPilarMm`, o pilar vira um ANEL no grafo — o que
 * está dentro dele sai, e o perímetro (a essa distância da face) liga as paredes que chegavam ali. Sem
 * isso, na planta com pilar em todo encontro, todo ramal que dobra uma esquina atravessa um pilar.
 */
import type { Point, Wall } from './blueprintKernel';
import { pointInPolygon } from './blueprintKernel';
import { PENALIDADE_DO_ANEL_MM, anelDoPilar, custoComPilares, foraDoPilar, grafoEmVoltaDosAneis } from './blueprintObstaculosEstruturais';

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
/**
 * Os trechos das `paredes` (de um pavimento) que têm parede EM CIMA/EMBAIXO em todos os outros pavimentos dados — a
 * parede sobre parede, por onde uma prumada atravessa os pavimentos sem passar pelo meio de um cômodo (F12c, sobrado:
 * a coluna do lavabo do térreo, encaixada na parede de baixo, subia pelo meio do dormitório de cima). Cada trecho é a
 * parede original aparada (o mesmo `id`); abaixo de `minimoMm`, não conta.
 */
export function paredesEmComum(paredes: readonly Wall[], outros: readonly (readonly Wall[])[], passoMm = 50, minimoMm = 200): Wall[] {
  const coberto = (p: P2, ws: readonly Wall[]) =>
    ws.some((w) => {
      const r = projetar(p, w.a, w.b);
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      return L >= 1 && r.t >= -1 / L && r.t <= 1 + 1 / L && r.d <= w.thicknessMm / 2 + 5;
    });
  const saida: Wall[] = [];
  for (const w of paredes) {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const n = Math.max(1, Math.round(L / passoMm));
    const em = (t: number) => ({ x: Math.round(w.a.x + (w.b.x - w.a.x) * t), y: Math.round(w.a.y + (w.b.y - w.a.y) * t) });
    let ini: number | null = null;
    for (let k = 0; k <= n; k++) {
      const ok = k < n && outros.every((ws) => coberto({ x: w.a.x + ((w.b.x - w.a.x) * (k + 0.5)) / n, y: w.a.y + ((w.b.y - w.a.y) * (k + 0.5)) / n }, ws));
      if (ok && ini === null) ini = k;
      if (!ok && ini !== null) {
        if (((k - ini) * L) / n >= minimoMm) saida.push({ ...w, a: em(ini / n), b: em(k / n) });
        ini = null;
      }
    }
  }
  return saida;
}

export function encaixarNaParede(p: P2, paredes: readonly Wall[], raio: number, preferirNoComprimento = false): { parede: Wall; q: P2; d: number } | null {
  // F20 da casa automática (17/10/2026): com `preferirNoComprimento`, a parede em que `p` cai DENTRO do comprimento vale
  // antes da que só alcança pela PONTA (a projeção presa nela) — a bancada que passava do fim de uma parede encostava na
  // quina dela, e a fria e a quente da pia iam para o canto, a 1,5 cm uma da outra (sobrado). Só para a FACE da louça
  // (`faceDaParede`): no anel do forro, que contorna o pilar, o segmento "no comprimento" fica longe e a descida voltava
  // por dentro do pilar (R1-A).
  let melhor: { parede: Wall; q: P2; d: number; dentro: boolean } | null = null;
  for (const w of paredes) {
    const r = projetar(p, w.a, w.b);
    if (r.d > raio) continue;
    const L2 = (w.b.x - w.a.x) ** 2 + (w.b.y - w.a.y) ** 2;
    const t = L2 < 1 ? -1 : ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / L2;
    const dentro = preferirNoComprimento && t >= 0 && t <= 1;
    const melhorQue = !melhor || (dentro && !melhor.dentro) || (dentro === melhor.dentro && (r.d < melhor.d || (r.d === melhor.d && w.id < melhor.parede.id)));
    if (melhorQue) melhor = { parede: w, q: r.q, d: r.d, dentro };
  }
  return melhor ? { parede: melhor.parede, q: melhor.q, d: melhor.d } : null;
}

export function arvorePelasParedes(opts: {
  paredes: readonly Wall[];
  raiz: P2;
  pendentes: readonly P2[];
  raioDeEncaixeMm: number;
  /** E5.5: pegadas de pilares — a aresta que entra numa custa 10 m a mais (desvia quando há outro caminho). */
  obstaculos?: readonly Point[][];
  /** F8b: contornar cada pilar por um anel a esta distância da face (mm). Ausente ou 0 = só a penalidade. */
  contornoDoPilarMm?: number;
  /**
   * F14b: as paredes em que a raiz e os pendentes PODEM encaixar (as outras só servem de caminho). No forro, a
   * TRAVESSIA de um cômodo ao outro é passagem: o ponto que caía nela descia no meio da parede, no mesmo lugar para
   * a fria e a quente (a travessia de todas fica no meio do mesmo trecho). Ausente = todas.
   */
  encaixarEm?: (w: Wall) => boolean;
  /**
   * F14b: o custo a mais de cada lado do anel de contorno, mm. Ausente = `PENALIDADE_DO_ANEL_MM` (a volta pelas
   * paredes ganha do contorno). No forro, o contorno de um shaft ou de uma prumada é o caminho certo — com a
   * penalidade cheia, a água quente do sobrado dava 7 m de volta pelo outro lado do cômodo.
   */
  penalidadeDoAnelMm?: number;
  /**
   * 24/10/2026 (forro, luz × luz pelas travessias): pontos que JÁ estão na rede — a árvore também cresce a partir deles
   * (os que são nó do grafo, como a ponta de uma travessia que a luz já usou) e não os emenda. Sem isto, a árvore
   * nascia só da raiz e chegava de novo à mesma travessia: anel, e um trecho sem circuito. Ausente = só a raiz.
   */
  alcancados?: readonly P2[];
}): ArvorePelasParedes {
  const { paredes, raioDeEncaixeMm } = opts;
  const obstaculos = opts.obstaculos ?? [];
  const aneis = (opts.contornoDoPilarMm ?? 0) > 0 ? obstaculos.map((g) => anelDoPilar(g, opts.contornoDoPilarMm!) as Point[]) : [];
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
  const ligar = (a: P2, b: P2, noAnel = false) => {
    const ka = chaveP(a);
    const kb = chaveP(b);
    if (ka === kb) return;
    posicao.set(ka, a);
    posicao.set(kb, b);
    const mm = custoComPilares(a, b, obstaculos) + (noAnel ? (opts.penalidadeDoAnelMm ?? PENALIDADE_DO_ANEL_MM) : 0);
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
    const elegiveis = opts.encaixarEm ? ordenadas.filter(opts.encaixarEm) : ordenadas;
    const e = encaixarNaParede(p, elegiveis, raioDeEncaixeMm);
    if (!e) return null;
    // E5.5: a descida até o ponto não fica dentro de pilar — escorrega pela parede.
    // F8b: com anel, escorrega para fora do ANEL (o grafo não tem nó dentro dele).
    const pegadas = aneis.length > 0 ? aneis : obstaculos;
    let q = obstaculos.length > 0 ? foraDoPilar(e.q, e.parede, pegadas) : e.q;
    let parede = e.parede;
    // F14c: a parede inteira dentro do obstáculo (o lado do anel do forro todo sob a laje rebaixada do banheiro de
    // cima) — o ponto ficava preso nele, sem aresta, e a árvore ligava em reta: as outras paredes ao alcance, da mais
    // perto à mais longe, até uma em que ele saia.
    const dentro = (x: P2) => pegadas.some((g) => pointInPolygon(g, x as Point));
    if (obstaculos.length > 0 && dentro(q)) {
      const outras = elegiveis
        .filter((w) => w.id !== e.parede.id)
        .map((w) => ({ w, r: projetar(p, w.a, w.b) }))
        .filter((x) => x.r.d <= raioDeEncaixeMm)
        .sort((a, b) => a.r.d - b.r.d);
      for (const { w, r } of outras) {
        const q2 = foraDoPilar(r.q, w, pegadas);
        if (dentro(q2)) continue;
        q = q2;
        parede = w;
        break;
      }
    }
    pendurar(parede, q);
    return q;
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
  // F8b: o grafo refeito em volta dos anéis dos pilares.
  if (aneis.length > 0) {
    const brutas: [P2, P2][] = [];
    for (const [k, vs] of vizinhos) for (const v of vs) if (k < v.k) brutas.push([posicao.get(k)!, posicao.get(v.k)!]);
    vizinhos.clear();
    for (const [a, b, noAnel] of grafoEmVoltaDosAneis(brutas, aneis)) ligar(a, b, noAnel);
  }

  if (!raiz) return { arestas: [], encaixe, foraDaParede: [...opts.pendentes], raiz: null };

  // ── Steiner por caminhos mínimos ─────────────────────────────────────────
  const naArvore = new Set<string>([chaveP(raiz)]);
  const jaNaRede = (opts.alcancados ?? []).map(chaveP).filter((k) => vizinhos.has(k));
  for (const k of jaNaRede) naArvore.add(k);
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
  const protegidos = new Set<string>([chaveP(raiz), ...[...encaixe.values()].map(chaveP), ...jaNaRede]);
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
export function faceDaParede(p: P2, paredes: readonly Wall[], raio: number): { q: P2; face: P2; mover: boolean; parede: Wall } | null {
  const e = encaixarNaParede(p, paredes, raio, true);
  if (!e) return null;
  const meia = e.parede.thicknessMm / 2;
  if (e.d <= meia + 1) return { q: e.q, face: { x: p.x, y: p.y }, mover: false, parede: e.parede };
  const ux = (p.x - e.q.x) / e.d;
  const uy = (p.y - e.q.y) / e.d;
  return { q: e.q, face: { x: Math.round(e.q.x + ux * meia), y: Math.round(e.q.y + uy * meia) }, mover: true, parede: e.parede };
}

